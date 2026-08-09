"use client";

import {
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL,
  isLanguageCode,
  normalizeWord,
  type LanguageCode,
} from "./dictionary";

/**
 * Anahtar, dil tercihi ve kelime defteri tarayicida duruyor.
 *
 * Site statik olarak dagitildigi icin (GitHub Pages) arkada sunucu ve
 * veritabani yok. localStorage React'in disinda bir kaynak oldugu icin burasi
 * bir "external store" olarak kuruldu: bilesenler useSyncExternalStore ile
 * abone oluyor. Boylece sunucu ciktisiyla ilk istemci render'i ayni kaliyor
 * (hidrasyon uyusmazligi yok) ve degisiklikler tek yerden yayiliyor.
 */

const SAVED_KEY = "sozluk:saved:v1";
const LANGUAGE_KEY = "sozluk:lang:v1";
const API_KEY_KEY = "sozluk:apikey:v1";
const MODEL_KEY = "sozluk:model:v1";

export interface SavedWord {
  word: string;
  language: LanguageCode;
  turkish: string;
  createdAt: number;
}

export interface Settings {
  apiKey: string;
  model: string;
}

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

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

// Sunucu anlik goruntuleri sabit referans olmali; aksi halde
// useSyncExternalStore sonsuz donguye girer.
const EMPTY_SAVED: SavedWord[] = [];
const EMPTY_SETTINGS: Settings = { apiKey: "", model: DEFAULT_MODEL };

let savedSnapshot: SavedWord[] = EMPTY_SAVED;
let languageSnapshot: LanguageCode = DEFAULT_LANGUAGE;
let settingsSnapshot: Settings = EMPTY_SETTINGS;
let hydrated = false;

/** Ilk istemci okumasinda localStorage'dan bir kez doldurulur. */
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  savedSnapshot = read<SavedWord[]>(SAVED_KEY, EMPTY_SAVED);

  const storedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
  if (storedLanguage && isLanguageCode(storedLanguage)) {
    languageSnapshot = storedLanguage;
  }

  // Anahtar duz metin olarak saklaniyor: sifrelemek guvenlik kazandirmaz,
  // cunku cozme anahtari da ayni sayfada olurdu. Onemli olan anahtarin bu
  // cihazdan disari cikmamasi.
  const storedKey = window.localStorage.getItem(API_KEY_KEY) ?? "";
  const storedModel = window.localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL;
  if (storedKey || storedModel !== DEFAULT_MODEL) {
    settingsSnapshot = { apiKey: storedKey, model: storedModel };
  }
}

export function getSavedSnapshot(): SavedWord[] {
  hydrate();
  return savedSnapshot;
}

export function getLanguageSnapshot(): LanguageCode {
  hydrate();
  return languageSnapshot;
}

export function getSettingsSnapshot(): Settings {
  hydrate();
  return settingsSnapshot;
}

export const getSavedServerSnapshot = (): SavedWord[] => EMPTY_SAVED;
export const getLanguageServerSnapshot = (): LanguageCode => DEFAULT_LANGUAGE;
export const getSettingsServerSnapshot = (): Settings => EMPTY_SETTINGS;

export function setLanguage(language: LanguageCode): void {
  hydrate();
  if (languageSnapshot === language) return;
  languageSnapshot = language;
  write(LANGUAGE_KEY, language);
  emit();
}

export function setSettings(next: Settings): void {
  hydrate();
  settingsSnapshot = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(API_KEY_KEY, next.apiKey);
      window.localStorage.setItem(MODEL_KEY, next.model);
    } catch {
      // Depolama kapali olabilir; ayarlar en azindan bu oturumda gecerli olur.
    }
  }
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
