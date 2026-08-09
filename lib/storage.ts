"use client";

import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  normalizeWord,
  type LanguageCode,
  type LookupResult,
} from "./dictionary";

/**
 * Onbellek, gecmis, kelime defteri ve dil tercihi tarayicida duruyor.
 *
 * Bunun iki nedeni var: sunucusuz bir dagitimda (Vercel) disk kalici degil, ve
 * ayni kelimeyi ikinci kez aradiginda modele hic gidilmedigi icin ucretsiz
 * gunluk kota cok daha uzun yetiyor.
 *
 * localStorage React'in disinda bir kaynak oldugu icin burasi bir "external
 * store" olarak kuruldu: bilesenler useSyncExternalStore ile abone oluyor.
 * Boylece sunucu ciktisiyla ilk istemci render'i ayni kaliyor (hidrasyon
 * uyusmazligi yok) ve degisiklikler tek bir yerden yayiliyor.
 */

const CACHE_KEY = "sozluk:cache:v1";
const SAVED_KEY = "sozluk:saved:v1";
const HISTORY_KEY = "sozluk:history:v1";
const LANGUAGE_KEY = "sozluk:lang:v1";

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 gun
const CACHE_LIMIT = 500;
const HISTORY_LIMIT = 30;

export interface SavedWord {
  word: string;
  language: LanguageCode;
  turkish: string;
  createdAt: number;
}

export interface HistoryEntry {
  word: string;
  language: LanguageCode;
  createdAt: number;
}

interface CacheEntry {
  result: LookupResult;
  createdAt: number;
}

// --- localStorage erisimi ---------------------------------------------------

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Kota dolmus ya da depolama kapali olabilir; uygulama yine calismali.
  }
}

// --- Abonelik ---------------------------------------------------------------

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

// Sunucu anlik goruntusu sabit olmali: her cagrida ayni referans donmezse
// useSyncExternalStore sonsuz donguye girer.
const EMPTY_SAVED: SavedWord[] = [];
const EMPTY_HISTORY: HistoryEntry[] = [];

let savedSnapshot: SavedWord[] = EMPTY_SAVED;
let historySnapshot: HistoryEntry[] = EMPTY_HISTORY;
let languageSnapshot: LanguageCode = DEFAULT_LANGUAGE;
let hydrated = false;

/** Ilk istemci okumasinda localStorage'dan bir kez doldurulur. */
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  savedSnapshot = read<SavedWord[]>(SAVED_KEY, EMPTY_SAVED);
  historySnapshot = read<HistoryEntry[]>(HISTORY_KEY, EMPTY_HISTORY);
  const storedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
  if (storedLanguage && isLanguageCode(storedLanguage)) {
    languageSnapshot = storedLanguage;
  }
}

export function getSavedSnapshot(): SavedWord[] {
  hydrate();
  return savedSnapshot;
}

export function getHistorySnapshot(): HistoryEntry[] {
  hydrate();
  return historySnapshot;
}

export function getLanguageSnapshot(): LanguageCode {
  hydrate();
  return languageSnapshot;
}

export const getSavedServerSnapshot = (): SavedWord[] => EMPTY_SAVED;
export const getHistoryServerSnapshot = (): HistoryEntry[] => EMPTY_HISTORY;
export const getLanguageServerSnapshot = (): LanguageCode => DEFAULT_LANGUAGE;

// --- Sorgu onbellegi --------------------------------------------------------

const cacheKey = (word: string, language: LanguageCode) =>
  `${language}:${normalizeWord(word)}`;

export function getCached(
  word: string,
  language: LanguageCode,
): LookupResult | null {
  const cache = read<Record<string, CacheEntry>>(CACHE_KEY, {});
  const entry = cache[cacheKey(word, language)];
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) return null;
  return entry.result;
}

export function putCached(
  word: string,
  language: LanguageCode,
  result: LookupResult,
): void {
  const cache = read<Record<string, CacheEntry>>(CACHE_KEY, {});
  cache[cacheKey(word, language)] = { result, createdAt: Date.now() };

  // Sinira gelince en eski kayitlari dus; localStorage kotasi kucuk.
  const keys = Object.keys(cache);
  if (keys.length > CACHE_LIMIT) {
    keys
      .sort((a, b) => cache[a].createdAt - cache[b].createdAt)
      .slice(0, keys.length - CACHE_LIMIT)
      .forEach((key) => delete cache[key]);
  }

  write(CACHE_KEY, cache);
}

// --- Mutasyonlar ------------------------------------------------------------

export function setLanguage(language: LanguageCode): void {
  hydrate();
  if (languageSnapshot === language) return;
  languageSnapshot = language;
  write(LANGUAGE_KEY, language);
  emit();
}

export function addHistory(word: string, language: LanguageCode): void {
  hydrate();
  const normalized = normalizeWord(word);
  historySnapshot = [
    { word: normalized, language, createdAt: Date.now() },
    ...historySnapshot.filter(
      (entry) => !(entry.word === normalized && entry.language === language),
    ),
  ].slice(0, HISTORY_LIMIT);
  write(HISTORY_KEY, historySnapshot);
  emit();
}

export function isSaved(word: string, language: LanguageCode): boolean {
  const normalized = normalizeWord(word);
  return getSavedSnapshot().some(
    (entry) => entry.word === normalized && entry.language === language,
  );
}

export function saveWord(
  word: string,
  language: LanguageCode,
  turkish: string,
): void {
  hydrate();
  const normalized = normalizeWord(word);
  savedSnapshot = [
    { word: normalized, language, turkish, createdAt: Date.now() },
    ...savedSnapshot.filter(
      (entry) => !(entry.word === normalized && entry.language === language),
    ),
  ];
  write(SAVED_KEY, savedSnapshot);
  emit();
}

export function unsaveWord(word: string, language: LanguageCode): void {
  hydrate();
  const normalized = normalizeWord(word);
  savedSnapshot = savedSnapshot.filter(
    (entry) => !(entry.word === normalized && entry.language === language),
  );
  write(SAVED_KEY, savedSnapshot);
  emit();
}

/** Kelime defterini Anki'ye dogrudan alinabilen TSV'ye cevirir. */
export function toTsv(words: SavedWord[]): string {
  return words.map((entry) => `${entry.word}\t${entry.turkish}`).join("\n");
}
