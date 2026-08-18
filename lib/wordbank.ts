"use client";

/**
 * B1-C1 kelime bankasi.
 *
 * Veri `lib/wordbank-de.json` icinde ve sikliga gore sirali; ilk siradakiler en
 * cok karsina cikacak kelimeler. Dosya ~250 KB oldugu icin statik degil dinamik
 * import ediliyor: yalniz Tarama ekranini acinca iniyor, ana paketi buyutmuyor.
 *
 * Uretimi: `node scripts/build-wordbank.mjs` (kaynak ve lisans o dosyada).
 */

import type { LanguageCode } from "./dictionary";

/** JSON'daki kisa alan adlari; dosya boyutunu kucuk tutmak icin. */
interface RawEntry {
  w: string;
  a?: string;
  p?: string;
  c: string;
  z: number;
}

export interface BankWord {
  word: string;
  /** Isimlerde artikel — Almanca'da kelimenin yarisi bu. */
  article?: string;
  /** Cogul bicimi. */
  plural?: string;
  /** isim / fiil / sıfat / zarf */
  category: string;
  /** Genel kullanim sikligi (zipf, ~2.9-4.4). */
  zipf: number;
  /** Siklik sirasi (0 = en sik). */
  rank: number;
}

/**
 * Seviye yerine siklik bandi gosteriyoruz. Sebep: liste zaten temel bandin
 * (Goethe 5000) ustunde duruyor ve C1 icin kapali bir resmi kelime listesi
 * yok — "C1" etiketi uydurma olurdu. Kelimenin ne siklikta karsina cikacagi
 * ise olculebilir bir sey.
 */
export function bandLabel(zipf: number): string {
  if (zipf >= 4) return "çok yaygın";
  if (zipf >= 3.5) return "yaygın";
  if (zipf >= 3.2) return "orta";
  return "seyrek";
}

/** Isimler artikelleriyle birlikte ogrenilmeli. */
export function displayWord(entry: BankWord): string {
  return entry.article ? `${entry.article} ${entry.word}` : entry.word;
}

let cache: BankWord[] | null = null;

/** Bankayi bir kez yukler; sonraki cagrilar aynisini dondurur. */
export async function loadBank(language: LanguageCode): Promise<BankWord[]> {
  // Su an yalniz Almanca icin banka var; digerlerinde ekran bos kaliyor ve
  // kullaniciya bu soyleniyor.
  if (language !== "de") return [];
  if (cache) return cache;

  const data = (await import("./wordbank-de.json")).default as RawEntry[];
  cache = data.map((entry, index) => ({
    word: entry.w,
    ...(entry.a ? { article: entry.a } : {}),
    ...(entry.p ? { plural: entry.p } : {}),
    category: entry.c,
    zipf: entry.z,
    rank: index,
  }));
  return cache;
}
