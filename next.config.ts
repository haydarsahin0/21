import type { NextConfig } from "next";

/**
 * Site tamamen statik: sunucu tarafi kod yok, model cagrisi tarayicidan
 * yapiliyor. Bu sayede GitHub Pages gibi ucretsiz statik barindiricilarda
 * calisabiliyor.
 *
 * GitHub Pages projeyi <kullanici>.github.io/<depo>/ altinda servis ettigi
 * icin basePath gerekiyor. Yerel gelistirmede bos kalir.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Pages'te dosya sistemi tabanli yonlendirme icin /yol/index.html sekli gerekli.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
