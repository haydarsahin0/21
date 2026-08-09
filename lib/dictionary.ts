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

export interface Term {
  word: string;
  note: string;
}

export interface Example {
  sentence: string;
  translation: string;
}

export interface Morphology {
  article: string;
  plural: string;
  verbForms: string;
  other: string;
}

export interface LookupResult {
  word: string;
  language: LanguageCode;
  found: boolean;
  lemma: string;
  correctionNote: string;
  ipa: string;
  partOfSpeech: string;
  cefr: string;
  morphology: Morphology;
  turkishMeanings: string[];
  turkishExplanation: string;
  /** Hedef dilin kendi içindeki tanımı — Almanca kelime için Almanca açıklama. */
  nativeDefinition: string;
  synonyms: Term[];
  antonyms: Term[];
  collocations: string[];
  examples: Example[];
}

export const EMPTY_MORPHOLOGY: Morphology = {
  article: "",
  plural: "",
  verbForms: "",
  other: "",
};

export function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
}
