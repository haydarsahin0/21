"use client";

import Dexie, { type Table } from "dexie";

import type { LanguageCode } from "./dictionary";
import {
  INITIAL_SRS,
  retrievability,
  schedule,
  type Grade,
  type SrsState,
} from "./srs";

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

export interface WordStat extends SrsState {
  key: string; // `${language}:${word}`
  word: string;
  language: LanguageCode;
  count: number;
  firstSeen: number;
  lastSeen: number;
  /** Kelimenin kisa Turkce karsiligi — tekrar kartinda gosteriliyor. */
  gloss: string;
  /** Ilk kez ogrenilen gun (YYYY-MM-DD) — gunluk hedefi saymak icin. */
  learnedOn: string;
}

/** Yerel gune gore YYYY-MM-DD. Gunluk hedef bu anahtarla sayiliyor. */
export function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface Fact {
  id?: number;
  kind: FactKind;
  text: string;
  language: LanguageCode;
  ts: number;
}

/**
 * Tek bir tekrarin kaydi. Kelimenin son durumu `words` tablosunda duruyor ama
 * zamanlamanin kendini duzeltebilmesi icin gecmisin tamami gerekiyor: hangi
 * kelimeyi, ne zaman, aradan kac gun gectikten sonra, nasil bildin.
 */
export interface ReviewLog {
  id?: number;
  /** `${language}:${word}` — words tablosundaki anahtar. */
  key: string;
  language: LanguageCode;
  ts: number;
  grade: Grade;
  /** Tekrar anindaki durum (bu tekrardan once). */
  status: SrsState["status"];
  /** Onceki tekrardan bu yana gecen gun; ilk tekrarda 0. */
  elapsedDays: number;
  /** Sistemin o an ongordugu hatirlama olasiligi (0-1); olcum icin. */
  predicted: number;
}

/**
 * Tarama karari: banka kelimesini biliyor musun?
 *
 * "known" verilen kelimeler bir daha karsina cikmiyor; sistem bunlari senin
 * bildigin kabul ediyor. Kontrol sorusunu kacirirsan karar "unknown"a donuyor.
 */
export interface Screened {
  /** `${language}:${word}` */
  key: string;
  word: string;
  language: LanguageCode;
  verdict: "known" | "unsure" | "unknown";
  ts: number;
  /** Kontrol sorusunda yanildiysa: "biliyorum" demesine ragmen bilmiyormus. */
  failedCheck?: boolean;
}

/** Banka kelimelerinin Turkce karsiligi — modelden bir kez alinip saklaniyor. */
export interface Gloss {
  key: string; // `${language}:${word}`
  word: string;
  language: LanguageCode;
  tr: string;
  ts: number;
}

class BrainDb extends Dexie {
  messages!: Table<StoredMessage, number>;
  words!: Table<WordStat, string>;
  facts!: Table<Fact, number>;
  reviews!: Table<ReviewLog, number>;
  screened!: Table<Screened, string>;
  glosses!: Table<Gloss, string>;

  constructor() {
    super("kelime-sozlugu-brain");
    this.version(1).stores({
      messages: "++id, ts, language, word",
      words: "key, language, count, lastSeen",
      facts: "++id, kind, language, ts",
    });

    // v2: araliklio tekrar alanlari. Once eklenmis kelimeler "yeni" sayilip
    // hemen tekrara giriyor, boylece eski kayitlar da sisteme dahil oluyor.
    this.version(2)
      .stores({
        messages: "++id, ts, language, word",
        words: "key, language, count, lastSeen, due, status",
        facts: "++id, kind, language, ts",
      })
      .upgrade((tx) =>
        tx
          .table<WordStat>("words")
          .toCollection()
          .modify((entry) => {
            Object.assign(entry, INITIAL_SRS);
            entry.due = Date.now();
            entry.gloss = entry.gloss ?? "";
            entry.learnedOn = entry.learnedOn ?? dayKey(entry.firstSeen);
          }),
      );

    // v3: tekrar gunlugu + FSRS alanlari. Eski kayitlarda stability/difficulty
    // yok; sifir birakiyoruz, FSRS ilk tekrarda bos karttan baslatiyor.
    this.version(3)
      .stores({
        messages: "++id, ts, language, word",
        words: "key, language, count, lastSeen, due, status",
        facts: "++id, kind, language, ts",
        reviews: "++id, key, language, ts",
      })
      .upgrade((tx) =>
        tx
          .table<WordStat>("words")
          .toCollection()
          .modify((entry) => {
            entry.stability = entry.stability ?? 0;
            entry.difficulty = entry.difficulty ?? 0;
            entry.learningSteps = entry.learningSteps ?? 0;
            entry.lastReview = entry.lastReview ?? null;
          }),
      );

    // v4: kelime bankasi taramasi. Yeni tablolar; mevcut veriye dokunmuyor.
    this.version(4).stores({
      messages: "++id, ts, language, word",
      words: "key, language, count, lastSeen, due, status",
      facts: "++id, kind, language, ts",
      reviews: "++id, key, language, ts",
      screened: "key, language, verdict, ts",
      glosses: "key, language",
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
          gloss: "",
          learnedOn: dayKey(now),
          ...INITIAL_SRS,
          due: now,
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

/** Zamani gelmis kelimeler, en cok gecikmis once. */
export async function dueWords(
  language: LanguageCode,
  limit = 30,
): Promise<WordStat[]> {
  const database = getDb();
  if (!database) return [];
  const now = Date.now();
  const rows = await database.words.where({ language }).toArray();
  return rows
    .filter((entry) => entry.due <= now)
    .sort((a, b) => a.due - b.due)
    .slice(0, limit);
}

/** Bugun ilk kez ogrenilen kelime sayisi — gunluk hedef icin. */
export async function learnedToday(language: LanguageCode): Promise<number> {
  const database = getDb();
  if (!database) return 0;
  const today = dayKey();
  const rows = await database.words.where({ language }).toArray();
  return rows.filter((entry) => entry.learnedOn === today).length;
}

/** Sistemin daha once gordugu butun kelimeler — yeni kelime onerirken tekrar
 *  onermemek icin modele veriliyor. */
export async function knownWords(language: LanguageCode): Promise<string[]> {
  const database = getDb();
  if (!database) return [];
  const rows = await database.words.where({ language }).toArray();
  return rows.map((entry) => entry.word);
}

/** Bir kelimeyi hafizaya ekler (yeni ogrenilenler icin). */
export async function addWord(
  word: string,
  language: LanguageCode,
  gloss: string,
): Promise<void> {
  const database = getDb();
  if (!database) return;
  const key = `${language}:${word}`;
  const existing = await database.words.get(key);
  if (existing) {
    if (gloss && !existing.gloss) {
      await database.words.put({ ...existing, gloss });
    }
    return;
  }
  const now = Date.now();
  await database.words.put({
    key,
    word,
    language,
    count: 1,
    firstSeen: now,
    lastSeen: now,
    gloss,
    learnedOn: dayKey(now),
    ...INITIAL_SRS,
    due: now,
  });
}

/**
 * Tekrar sonucunu isle, bir sonraki tarihi hesapla ve olayi gunluge yaz.
 *
 * Gunluk yalniz gecmis kaydi degil: zamanlamanin kendini olcebilmesinin tek
 * yolu "ne ongordum / ne oldu" ciftlerini saklamak (bkz. lib/optimizer.ts).
 */
export async function gradeWord(
  key: string,
  grade: Grade,
): Promise<WordStat | null> {
  const database = getDb();
  if (!database) return null;
  const entry = await database.words.get(key);
  if (!entry) return null;

  const now = Date.now();
  const elapsedDays = entry.lastReview
    ? (now - entry.lastReview) / (24 * 60 * 60 * 1000)
    : 0;
  const predicted = retrievability(entry, now);

  const next = { ...entry, ...schedule(entry, grade, now), lastSeen: now };
  await database.words.put(next);

  try {
    await database.reviews.add({
      key,
      language: entry.language,
      ts: now,
      grade,
      status: entry.status,
      elapsedDays,
      predicted,
    });
  } catch {
    // Gunluk yazilamazsa tekrar yine de islensin.
  }

  return next;
}

/** Tekrar gunlugu — olcum ve disari aktarma icin. */
export async function listReviews(
  language: LanguageCode,
): Promise<ReviewLog[]> {
  const database = getDb();
  if (!database) return [];
  return database.reviews.where({ language }).sortBy("ts");
}

export async function countReviews(language: LanguageCode): Promise<number> {
  const database = getDb();
  if (!database) return 0;
  return database.reviews.where({ language }).count();
}

// --- Kelime bankasi taramasi ------------------------------------------------

/** Tarama karari yaz. Ayni kelime tekrar taranirsa karar guncellenir. */
export async function markScreened(
  word: string,
  language: LanguageCode,
  verdict: Screened["verdict"],
  failedCheck = false,
): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await database.screened.put({
      key: `${language}:${word}`,
      word,
      language,
      verdict,
      ts: Date.now(),
      ...(failedCheck ? { failedCheck: true } : {}),
    });
  } catch {
    // yoksay
  }
}

export async function listScreened(
  language: LanguageCode,
): Promise<Screened[]> {
  const database = getDb();
  if (!database) return [];
  return database.screened.where({ language }).toArray();
}

/** Taranmis kelimelerin karar dagilimi — ilerleme cubugu icin. */
export async function screeningCounts(
  language: LanguageCode,
): Promise<{ known: number; unsure: number; unknown: number; total: number }> {
  const rows = await listScreened(language);
  return {
    known: rows.filter((r) => r.verdict === "known").length,
    unsure: rows.filter((r) => r.verdict === "unsure").length,
    unknown: rows.filter((r) => r.verdict === "unknown").length,
    total: rows.length,
  };
}

/** "Biliyorum" deyip kontrol sorusunda yanildigin kelimeler. */
export async function bluffedWords(
  language: LanguageCode,
): Promise<Screened[]> {
  const rows = await listScreened(language);
  return rows.filter((row) => row.failedCheck).sort((a, b) => b.ts - a.ts);
}

export async function getGlosses(
  words: string[],
  language: LanguageCode,
): Promise<Map<string, string>> {
  const database = getDb();
  const found = new Map<string, string>();
  if (!database) return found;
  const rows = await database.glosses.bulkGet(
    words.map((word) => `${language}:${word}`),
  );
  for (const row of rows) {
    if (row?.tr) found.set(row.word, row.tr);
  }
  return found;
}

export async function saveGlosses(
  entries: { word: string; tr: string }[],
  language: LanguageCode,
): Promise<void> {
  const database = getDb();
  if (!database || !entries.length) return;
  try {
    await database.glosses.bulkPut(
      entries.map((entry) => ({
        key: `${language}:${entry.word}`,
        word: entry.word,
        language,
        tr: entry.tr,
        ts: Date.now(),
      })),
    );
  } catch {
    // yoksay
  }
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
    database.reviews,
    database.screened,
    async () => {
      await database.messages.where({ language }).delete();
      await database.words.where({ language }).delete();
      await database.facts.where({ language }).delete();
      await database.reviews.where({ language }).delete();
      await database.screened.where({ language }).delete();
    },
  );
  // Turkce karsilik onbellegi kisisel veri degil, modelden gelen sozluk
  // bilgisi; silmiyoruz ki sifirdan tekrar token harcanmasin.
}

/** Hafizayi disari aktar — kullanici verisinin cihazda kilitli kalmamasi icin. */
export async function exportMemory(language: LanguageCode) {
  const database = getDb();
  if (!database) return null;
  const [messages, words, facts, reviews, screened] = await Promise.all([
    database.messages.where({ language }).toArray(),
    database.words.where({ language }).toArray(),
    database.facts.where({ language }).toArray(),
    database.reviews.where({ language }).toArray(),
    database.screened.where({ language }).toArray(),
  ]);
  return {
    language,
    exportedAt: new Date().toISOString(),
    facts,
    words,
    messages,
    reviews,
    screened,
  };
}

export { getDb };
