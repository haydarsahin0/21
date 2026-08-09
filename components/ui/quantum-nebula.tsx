"use client";

import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// --- CONFIGURATION OBJECT V3.0 ---
// This version focuses on a dynamic, interactive particle system.
const config = {
  // Particle system properties
  particles: {
    count: 50000, // Number of particles in the simulation
    size: 0.02, // Base size of each particle
    boxSize: 5, // The cubic volume where particles are generated
  },
  // Colors for the scene
  colors: {
    // Using HSL for easier color manipulation and vibrant results
    baseHue: 200, // Base hue for particles (200 is a cyan/blue)
    hueVariance: 20, // How much the hue can vary between particles
  },
  // Animation and simulation properties
  simulation: {
    // Curl noise parameters for organic, swirling motion
    noiseSpeed: 0.1,
    noiseScale: 1.2,
    // How strongly the particles are pushed away from the mouse
    mouseRepulsion: 0.005,
    // How quickly particles return to their original path
    friction: 0.95,
  },
  // Post-processing bloom effect for the glow
  bloom: {
    strength: 0.6, // Intensity of the glow
    radius: 0.4, // How far the glow spreads
    threshold: 0.1, // Brightness threshold to trigger the bloom
  },
  // Camera settings
  camera: {
    initialDistance: 5,
    // Not: 0.005 orijinal degeri; kamera bu kadar az kaydigi icin parallax
    // gozle secilmez. Belirgin bir parallax istersen 0.3 civari kullan.
    parallaxIntensity: 0.005,
  },
  // Devices that report a high pixel ratio would otherwise render 4-9x the
  // pixels; bloom is the most expensive pass and scales with that directly.
  maxPixelRatio: 2,
};

export interface QuantumNebulaProps {
  /** Uses `config.particles.count` when omitted. Lower it on weak devices. */
  particleCount?: number;
  className?: string;
}

// v3.0: Interactive Particle Nebula Scene
export default function GenerativeArtSceneV3({
  particleCount = config.particles.count,
  className = "absolute inset-0 w-full h-full z-0",
}: QuantumNebulaProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef(new THREE.Vector2(0, 0)); // Using a Vector2 for mouse position

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const width = currentMount.clientWidth || 1;
    const height = currentMount.clientHeight || 1;

    // --- CORE THREE.JS & POST-PROCESSING SETUP ---

    // 1. Scene and Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = config.camera.initialDistance;

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, config.maxPixelRatio),
    );
    currentMount.appendChild(renderer.domElement);

    // 3. Post-Processing Composer for Bloom Effect
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      config.bloom.strength,
      config.bloom.radius,
      config.bloom.threshold,
    );
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    // --- PARTICLE SYSTEM CREATION ---
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3).fill(0); // For physics simulation
    const baseColor = new THREE.Color();

    for (let i = 0; i < particleCount; i++) {
      // Position particles randomly within a box
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * config.particles.boxSize;
      positions[i3 + 1] = (Math.random() - 0.5) * config.particles.boxSize;
      positions[i3 + 2] = (Math.random() - 0.5) * config.particles.boxSize;

      // Assign a unique, vibrant color to each particle
      const hue =
        (config.colors.baseHue +
          (Math.random() - 0.5) * config.colors.hueVariance) /
        360;
      baseColor.setHSL(hue, 1.0, 0.6);
      colors[i3] = baseColor.r;
      colors[i3 + 1] = baseColor.g;
      colors[i3 + 2] = baseColor.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // --- SHADER MATERIAL FOR PARTICLES ---
    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_pointSize: {
          value: config.particles.size * renderer.getPixelRatio(),
        },
      },
      vertexShader: `
                attribute vec3 color;
                varying vec3 vColor;
                uniform float u_pointSize;

                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = u_pointSize * (10.0 / -mvPosition.z); // Make particles appear smaller further away
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
      fragmentShader: `
                varying vec3 vColor;
                void main() {
                    // Create a soft, circular shape for each particle
                    float strength = distance(gl_PointCoord, vec2(0.5));
                    strength = 1.0 - step(0.5, strength);
                    if (strength < 0.01) discard; // Discard transparent fragments for performance

                    gl_FragColor = vec4(vColor, strength);
                }
            `,
      transparent: true,
      blending: THREE.AdditiveBlending, // Brightens where particles overlap
      depthWrite: false, // Important for correct blending
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    // --- ANIMATION & SIMULATION LOOP ---
    //
    // Simulasyon CPU'da donuyor. Orijinal surumde dongu her parcacik icin yeni
    // THREE.Vector3 nesneleri yaratiyordu; 50.000 parcacik x 60 kare = saniyede
    // milyonlarca kisa omurlu nesne, yani surekli cop toplama ve takilan
    // animasyon. Matematik ayni kaldi, sadece tahsisler dongunun disina alindi
    // ve vektor islemleri duz sayi islemlerine acildi.
    let frameId = 0;
    const clock = new THREE.Clock();
    const positionAttribute = particleGeometry.attributes
      .position as THREE.BufferAttribute;
    const positionArray = positionAttribute.array as Float32Array;
    const halfBox = config.particles.boxSize / 2;

    const step = () => {
      const elapsedTime = clock.getElapsedTime();
      const noiseTime = elapsedTime * config.simulation.noiseSpeed;
      const noiseScale = config.simulation.noiseScale;
      const friction = config.simulation.friction;
      const repulsion = config.simulation.mouseRepulsion;

      const mouseX = mouseRef.current.x * halfBox;
      const mouseY = mouseRef.current.y * halfBox;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const px = positionArray[i3];
        const py = positionArray[i3 + 1];
        const pz = positionArray[i3 + 2];

        // 1. Curl Noise Force for swirling
        //    (sin/cos alanindan turetilen, normalize edilmis yon vektoru)
        let cx = Math.sin(py * noiseScale + noiseTime);
        let cy = Math.cos(pz * noiseScale + noiseTime);
        let cz = Math.sin(px * noiseScale + noiseTime);
        const curlLength = Math.hypot(cx, cy, cz) || 1;
        cx /= curlLength;
        cy /= curlLength;
        cz /= curlLength;

        // 2. Mouse Repulsion Force
        let mx = 0;
        let my = 0;
        let mz = 0;
        const dx = px - mouseX;
        const dy = py - mouseY;
        const dz = pz;
        const distanceToMouse = Math.hypot(dx, dy, dz);
        if (distanceToMouse < 2) {
          // Only react if close to the mouse
          const falloff =
            1 / (distanceToMouse + 0.1) / (distanceToMouse || 1e-6);
          mx = dx * falloff;
          my = dy * falloff;
          mz = dz * falloff;
        }

        // Update velocity, then apply friction
        velocities[i3] = (velocities[i3] + cx * 0.001 + mx * repulsion) * friction;
        velocities[i3 + 1] =
          (velocities[i3 + 1] + cy * 0.001 + my * repulsion) * friction;
        velocities[i3 + 2] =
          (velocities[i3 + 2] + cz * 0.001 + mz * repulsion) * friction;

        // Update position
        const nx = px + velocities[i3];
        const ny = py + velocities[i3 + 1];
        const nz = pz + velocities[i3 + 2];

        // Boundary check: wrap particles around the box
        positionArray[i3] = Math.abs(nx) > halfBox ? -nx : nx;
        positionArray[i3 + 1] = Math.abs(ny) > halfBox ? -ny : ny;
        positionArray[i3 + 2] = Math.abs(nz) > halfBox ? -nz : nz;
      }

      positionAttribute.needsUpdate = true; // Crucial!

      // Camera Parallax
      camera.position.x +=
        (mouseRef.current.x * config.camera.parallaxIntensity -
          camera.position.x) *
        0.02;
      camera.position.y +=
        (-mouseRef.current.y * config.camera.parallaxIntensity -
          camera.position.y) *
        0.02;
      camera.lookAt(scene.position);

      // Use the composer to render the scene with post-processing
      composer.render();
    };

    // Hareket azaltma tercihi acikken tek kare cizip duruyoruz: gorsel duruyor
    // ama animasyon vestibuler rahatsizlik yaratmiyor.
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const animate = () => {
      step();
      frameId = requestAnimationFrame(animate);
    };

    if (reduceMotion) {
      step();
    } else {
      animate();
    }

    // --- EVENT HANDLERS & CLEANUP ---
    const handleResize = () => {
      const w = currentMount.clientWidth || 1;
      const h = currentMount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      if (renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      particleGeometry.dispose();
      particleMaterial.dispose();
      // Orijinal surumde eksikti: bunlar cagrilmazsa her yeniden baglanmada
      // WebGL baglami ve bloom pass'in render hedefleri sizdiriyor.
      bloomPass.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, [particleCount]);

  return <div ref={mountRef} className={className} />;
}
