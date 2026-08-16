"use client";

import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  normalizeWord,
  type LanguageCode,
} from "./dictionary";
import { DEFAULT_PROVIDER, defaultModel, isKnownProvider } from "./providers";

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
const SETTINGS_KEY = "sozluk:settings:v2";
const GOAL_KEY = "sozluk:goal:v1";
// v1 anahtarlari: yalniz tek saglayici varken kullaniliyordu, temizlik icin.
const LEGACY_API_KEY = "sozluk:apikey:v1";
const LEGACY_MODEL_KEY = "sozluk:model:v1";

export interface SavedWord {
  word: string;
  language: LanguageCode;
  turkish: string;
  createdAt: number;
}

/** Aciklamalarin yazilacagi hedef dil seviyesi. */
export const EXPLAIN_LEVELS = ["A1", "A2", "A2-B1", "B1", "B2", "C1"] as const;
export type ExplainLevel = (typeof EXPLAIN_LEVELS)[number];

export interface Settings {
  provider: string;
  model: string;
  /** Aciklamalarin sadelik duzeyi. */
  explainLevel: ExplainLevel;
  /** Saglayici basina anahtar: saglayici degistirince oncekini kaybetme. */
  keys: Record<string, string>;
}

/** Secili saglayicinin anahtari. */
export function currentKey(settings: Settings): string {
  return settings.keys[settings.provider] ?? "";
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
const EMPTY_SETTINGS: Settings = {
  provider: DEFAULT_PROVIDER,
  model: defaultModel(DEFAULT_PROVIDER),
  explainLevel: "A2-B1",
  keys: {},
};

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

  // Anahtarlar duz metin olarak saklaniyor: sifrelemek guvenlik kazandirmaz,
  // cunku cozme anahtari da ayni sayfada olurdu. Onemli olan anahtarin bu
  // cihazdan disari cikmamasi.
  const stored = read<Partial<Settings> | null>(SETTINGS_KEY, null);
  if (stored) {
    // Kaldirilmis bir saglayici kayitliysa (Gemini/OpenRouter) varsayilana don;
    // yoksa anahtar o saglayicinin altinda kalip yanlis adrese gonderilirdi.
    const provider =
      stored.provider && isKnownProvider(stored.provider)
        ? stored.provider
        : DEFAULT_PROVIDER;
    settingsSnapshot = {
      provider,
      model:
        stored.provider === provider && stored.model
          ? stored.model
          : defaultModel(provider),
      explainLevel: stored.explainLevel ?? "A2-B1",
      keys: stored.keys ?? {},
    };
    return;
  }

  // Tek saglayicili surumden goc: v1 anahtari Gemini'ye aitti ve Gemini artik
  // desteklenmiyor. Anahtari tasimanin anlami yok — eski kaydi silip
  // varsayilanla basliyoruz ki kullanici dogrudan yeni anahtari girsin.
  if (window.localStorage.getItem(LEGACY_API_KEY)) {
    window.localStorage.removeItem(LEGACY_API_KEY);
    window.localStorage.removeItem(LEGACY_MODEL_KEY);
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
  write(SETTINGS_KEY, next);
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

/** Gunluk yeni kelime hedefi. */
export function getGoal(): number {
  if (typeof window === "undefined") return 20;
  const raw = Number(window.localStorage.getItem(GOAL_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

export function setGoal(value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GOAL_KEY, String(Math.max(1, Math.round(value))));
  emit();
}

/** Kelime defterini Anki'ye dogrudan alinabilen TSV'ye cevirir. */
export function toTsv(words: SavedWord[]): string {
  return words.map((entry) => `${entry.word}\t${entry.turkish}`).join("\n");
}
