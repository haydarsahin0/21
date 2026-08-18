/** `locale` telaffuz icin: tarayicinin ses motoruna verilen dil etiketi. */
export const LANGUAGES = {
  de: { name: "Almanca", native: "Deutsch", locale: "de-DE" },
  en: { name: "İngilizce", native: "English", locale: "en-US" },
  fr: { name: "Fransızca", native: "Français", locale: "fr-FR" },
  es: { name: "İspanyolca", native: "Español", locale: "es-ES" },
  it: { name: "İtalyanca", native: "Italiano", locale: "it-IT" },
  ru: { name: "Rusça", native: "Русский", locale: "ru-RU" },
  ar: { name: "Arapça", native: "العربية", locale: "ar-SA" },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export const DEFAULT_LANGUAGE: LanguageCode = "de";

export function isLanguageCode(value: string): value is LanguageCode {
  return value in LANGUAGES;
}

export function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
}

