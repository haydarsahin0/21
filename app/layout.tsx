import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ServiceWorker } from "@/components/service-worker";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kelime Sözlüğü",
  description:
    "Hedef dilde kelime ara: Türkçe karşılığı, o dildeki tanımı ve eş anlamlıları bir arada.",
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  // Telefonda ana ekrandan acilinca tam ekran otursun.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
