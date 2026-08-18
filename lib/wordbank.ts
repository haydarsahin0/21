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
  l: string;
  e: string;
}

export interface BankWord {
  word: string;
  /** Isimlerde artikel — Almanca'da kelimenin yarisi bu. */
  article?: string;
  /** Cogul eki, orn. "-en". */
  plural?: string;
  /** isim / fiil / sıfat / zarf / diğer */
  category: string;
  /** Ham seviye etiketi: "B1" ya da "B2+". */
  level: string;
  /** Ingilizce karsilik — Turkcesi gelene kadar ipucu olarak duruyor. */
  english: string;
  /** Siklik sirasi (0 = en sik). */
  rank: number;
}

/** Ekranda gosterilen seviye adi; kaynaktaki "B2+" bandi B2 ve ustunu kapsiyor. */
export function levelLabel(level: string): string {
  return level === "B2+" ? "B2/C1" : level;
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
    level: entry.l,
    english: entry.e,
    rank: index,
  }));
  return cache;
}

export const BANK_LEVELS = ["B1", "B2+"] as const;
export type BankLevel = (typeof BANK_LEVELS)[number];
