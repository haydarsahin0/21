export const LANGUAGES = {
  de: { name: "Almanca", native: "Deutsch" },
  en: { name: "İngilizce", native: "English" },
  fr: { name: "Fransızca", native: "Français" },
  es: { name: "İspanyolca", native: "Español" },
  it: { name: "İtalyanca", native: "Italiano" },
  ru: { name: "Rusça", native: "Русский" },
  ar: { name: "Arapça", native: "العربية" },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export const DEFAULT_LANGUAGE: LanguageCode = "de";

export function isLanguageCode(value: string): value is LanguageCode {
  return value in LANGUAGES;
}

export function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
}

export const GEMINI_MODELS = [
  { id: "gemini-2.5-flash-lite", label: "Flash-Lite — günde 1.000 mesaj" },
  { id: "gemini-2.5-flash", label: "Flash — günde 250, daha isabetli" },
  { id: "gemini-2.5-pro", label: "Pro — günde 100, en isabetli" },
] as const;

export const DEFAULT_MODEL = GEMINI_MODELS[0].id;
