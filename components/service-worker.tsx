"use client";

import { useEffect } from "react";

/**
 * Servis calisanini kaydeder — uygulama ana ekrana kurulabilir ve cevrimdisi
 * acilabilir olsun diye.
 *
 * Yol basePath'e gore kuruluyor: GitHub Pages'te site /<depo>/ altinda duruyor
 * ve servis calisaninin kapsami da orasi olmali.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    // Kayit hatasi uygulamayi etkilemesin: cevrimdisi destegi bir ek, sart degil.
    void navigator.serviceWorker
      .register(`${base}/sw.js`, { scope: `${base}/` })
      .catch(() => undefined);
  }, []);

  return null;
}
