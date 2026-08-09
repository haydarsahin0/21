"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/**
 * Three.js yalniz tarayicida calistigi icin bileseni SSR disi yukluyoruz.
 * `ssr: false` bir Server Component icinden verilemedigi icin bu ince istemci
 * sarmalayicisi gerekiyor.
 */
const QuantumNebula = dynamic(() => import("@/components/ui/quantum-nebula"), {
  ssr: false,
});

/**
 * Parcacik simulasyonu ana is parcaciginda donuyor ve maliyeti parcacik
 * sayisiyla dogru orantili: 50.000 parcacik olculen ~7,5 ms/kare demek, yani
 * 60 fps butcesinin yarisi. Arka plan susu ugruna telefonda arayuzu
 * yavaslatmamak icin sayiyi cihaza gore kisiyoruz.
 */
function pickParticleCount(): number {
  if (typeof window === "undefined") return 20000;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (window.innerWidth < 768) return 8000;
  if (cores <= 4) return 20000;
  return 50000;
}

export function NebulaBackground() {
  // Bilesen yalniz istemcide yuklendigi icin (ssr: false) bunu dogrudan
  // baslangic degeri olarak hesaplayabiliyoruz; hidrasyon uyusmazligi olmuyor.
  const [particleCount] = useState(pickParticleCount);

  return (
    <div className="pointer-events-none fixed inset-0">
      <QuantumNebula particleCount={particleCount} />
      <div className="nebula-scrim absolute inset-0" />
    </div>
  );
}
