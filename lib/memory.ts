"use client";

import Dexie, { type Table } from "dexie";

import type { LanguageCode } from "./dictionary";

/**
 * "Ikinci beyin" katmani.
 *
 * Site statik oldugu icin sunucu tarafinda bir hafiza servisi (mem0, MemMachine
 * gibi) calistiramiyoruz — hepsi sunucu + vektor veritabani istiyor. Bunun
 * yerine hafiza tamamen cihazda, IndexedDB uzerinde duruyor. Dexie IndexedDB'ye
 * indeksli sorgu ve tip guvenligi getiriyor; localStorage bu is icin kucuk
 * (5 MB) ve sorgulanamaz.
 *
 * Uc sey saklaniyor:
 *  - messages: butun konusma gecmisi (ayni kelimeye donunce hatirlamak icin)
 *  - words:    hangi kelimeyi kac kez sordugun
 *  - facts:    modelin senin hakkinda cikardigi notlar (seviye, ilgi, zorluk)
 */

export type FactKind =
  | "seviye"
  | "ilgi"
  | "zorlandigi"
  | "tarz"
  | "hedef"
  | "diger";

export interface StoredMessage {
  id?: number;
  ts: number;
  role: "user" | "model";
  text: string;
  language: LanguageCode;
  /** O sirada konusulan kelime — sonra ayni kelimeye donunce getirmek icin. */
  word: string | null;
}

export interface WordStat {
  key: string; // `${language}:${word}`
  word: string;
  language: LanguageCode;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

export interface Fact {
  id?: number;
  kind: FactKind;
  text: string;
  language: LanguageCode;
  ts: number;
}

class BrainDb extends Dexie {
  messages!: Table<StoredMessage, number>;
  words!: Table<WordStat, string>;
  facts!: Table<Fact, number>;

  constructor() {
    super("kelime-sozlugu-brain");
    this.version(1).stores({
      messages: "++id, ts, language, word",
      words: "key, language, count, lastSeen",
      facts: "++id, kind, language, ts",
    });
  }
}

let db: BrainDb | null = null;

/**
 * Dexie'yi tembel kur: statik export sirasinda sayfa sunucuda on-render
 * ediliyor ve orada indexedDB yok.
 */
function getDb(): BrainDb | null {
  if (typeof window === "undefined") return null;
  if (!db) db = new BrainDb();
  return db;
}

export function memoryAvailable(): boolean {
  return getDb() !== null;
}

const MAX_FACTS = 40;

// --- Yazma ------------------------------------------------------------------

export async function rememberMessage(
  message: Omit<StoredMessage, "id" | "ts">,
): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await database.messages.add({ ...message, ts: Date.now() });
  } catch {
    // Gizli sekmede IndexedDB kapali olabilir; hafiza olmadan da calismali.
  }
}

export async function bumpWord(
  word: string,
  language: LanguageCode,
): Promise<void> {
  const database = getDb();
  if (!database) return;
  const key = `${language}:${word}`;
  try {
    await database.transaction("rw", database.words, async () => {
      const existing = await database.words.get(key);
      const now = Date.now();
      if (existing) {
        await database.words.put({
          ...existing,
          count: existing.count + 1,
          lastSeen: now,
        });
      } else {
        await database.words.put({
          key,
          word,
          language,
          count: 1,
          firstSeen: now,
          lastSeen: now,
        });
      }
    });
  } catch {
    // yoksay
  }
}

/** Modelin cikardigi notlari yazar; ayni metni tekrar eklemez. */
export async function saveFacts(
  facts: { kind: FactKind; text: string }[],
  language: LanguageCode,
): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    const existing = await database.facts.where({ language }).toArray();
    const seen = new Set(existing.map((fact) => fact.text.toLowerCase()));

    const fresh = facts
      .filter((fact) => fact.text.trim() && !seen.has(fact.text.toLowerCase()))
      .map((fact) => ({ ...fact, language, ts: Date.now() }));

    if (fresh.length) await database.facts.bulkAdd(fresh);

    // Notlar sinirsiz birikmesin: en eskiler dussun.
    const all = await database.facts.where({ language }).sortBy("ts");
    if (all.length > MAX_FACTS) {
      const drop = all.slice(0, all.length - MAX_FACTS).map((f) => f.id!);
      await database.facts.bulkDelete(drop);
    }
  } catch {
    // yoksay
  }
}

// --- Okuma ------------------------------------------------------------------

export async function listFacts(language: LanguageCode): Promise<Fact[]> {
  const database = getDb();
  if (!database) return [];
  const rows = await database.facts.where({ language }).sortBy("ts");
  return rows.reverse();
}

export async function listTopWords(
  language: LanguageCode,
  limit = 12,
): Promise<WordStat[]> {
  const database = getDb();
  if (!database) return [];
  const rows = await database.words.where({ language }).toArray();
  return rows
    .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
    .slice(0, limit);
}

export async function countMessages(language: LanguageCode): Promise<number> {
  const database = getDb();
  if (!database) return 0;
  return database.messages.where({ language }).count();
}

/** Daha once bu kelimeyi konustuk mu? Konustuysak son notlari getir. */
async function pastNotesForWord(
  word: string,
  language: LanguageCode,
): Promise<string[]> {
  const database = getDb();
  if (!database) return [];
  const rows = await database.messages
    .where({ language, word })
    .reverse()
    .limit(4)
    .toArray();
  return rows
    .filter((row) => row.role === "model")
    .map((row) => row.text.slice(0, 220));
}

/**
 * Sistem promptuna eklenecek hafiza blogu. Bos donerse hicbir sey eklenmez.
 */
export async function buildMemoryBlock(
  language: LanguageCode,
  currentWord: string | null,
): Promise<string> {
  const database = getDb();
  if (!database) return "";

  try {
    const [facts, words] = await Promise.all([
      listFacts(language),
      listTopWords(language, 8),
    ]);

    const parts: string[] = [];

    if (facts.length) {
      parts.push(
        "Bu öğrenci hakkında daha önce çıkardığın notlar:\n" +
          facts.map((fact) => `- (${fact.kind}) ${fact.text}`).join("\n"),
      );
    }

    const repeated = words.filter((entry) => entry.count > 1);
    if (repeated.length) {
      parts.push(
        "Tekrar tekrar sorduğu kelimeler (demek ki tam oturmamış): " +
          repeated.map((e) => `${e.word} (${e.count}x)`).join(", "),
      );
    }

    if (currentWord) {
      const notes = await pastNotesForWord(currentWord, language);
      if (notes.length) {
        parts.push(
          `"${currentWord}" kelimesini daha önce de konuşmuştunuz. O zaman şunları anlatmıştın:\n` +
            notes.map((note) => `- ${note}`).join("\n") +
            "\nAynı şeyleri tekrarlama; bu sefer bir adım ileri götür.",
        );
      }
    }

    if (!parts.length) return "";

    return (
      "\n\n--- HAFIZAN ---\n" +
      parts.join("\n\n") +
      "\n\nBu notları doğal biçimde kullan: öğrencinin seviyesine ve ilgisine " +
      "göre konuş, örnekleri onun ilgi alanından seç, daha önce zorlandığı " +
      "noktalara dikkat et. Sakın “notlarımda şöyle yazıyor” gibi konuşma."
    );
  } catch {
    return "";
  }
}

// --- Silme ------------------------------------------------------------------

export async function deleteFact(id: number): Promise<void> {
  await getDb()?.facts.delete(id);
}

export async function forgetAll(language: LanguageCode): Promise<void> {
  const database = getDb();
  if (!database) return;
  await database.transaction(
    "rw",
    database.messages,
    database.words,
    database.facts,
    async () => {
      await database.messages.where({ language }).delete();
      await database.words.where({ language }).delete();
      await database.facts.where({ language }).delete();
    },
  );
}

/** Hafizayi disari aktar — kullanici verisinin cihazda kilitli kalmamasi icin. */
export async function exportMemory(language: LanguageCode) {
  const database = getDb();
  if (!database) return null;
  const [messages, words, facts] = await Promise.all([
    database.messages.where({ language }).toArray(),
    database.words.where({ language }).toArray(),
    database.facts.where({ language }).toArray(),
  ]);
  return { language, exportedAt: new Date().toISOString(), facts, words, messages };
}

export { getDb };
