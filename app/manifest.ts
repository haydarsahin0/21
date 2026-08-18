import type { MetadataRoute } from "next";

/**
 * Ana ekrana kurulabilmesi icin gereken tanim.
 *
 * GitHub Pages siteyi /<depo>/ altinda servis ettigi icin butun yollarin
 * basePath ile baslamasi gerekiyor; Next bu dosyadaki yollara onek eklemiyor,
 * biz ekliyoruz.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kelime Sözlüğü",
    short_name: "Kelime",
    description:
      "Almanca kelimeleri konuşarak öğren: anlam, bağlam, aralıklı tekrar ve B1–C1 taraması.",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    lang: "tr",
    icons: [
      {
        src: `${basePath}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
