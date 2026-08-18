"use client";

import { streamChat } from "./chat";
import { LANGUAGES } from "./dictionary";
import { buildMemoryBlock } from "./memory";
import type { StudyCall } from "./study";

/**
 * Cift yonlu ceviri.
 *
 * Amac sozluk cevirisi degil: "bir anadili konusani bunu nasil soylerdi".
 * Kelimesi kelimesine karsilik cogu zaman dogru ama yapay oluyor; asil ise
 * yarayan sey, ayni anlami tasiyan alternatifler ve aralarindaki ton farki.
 *
 * Bu yuzden cevap uc katmanli:
 *  - main:     en dogal karsilik
 *  - variants: ayni anlamin baska soylenisleri (gunluk / resmi / yazi dili)
 *  - words:    tek tek kelime secenekleri ve nuanslari
 */

export type Direction = "to-target" | "to-turkish";

export interface WordChoice {
  /** Cevirideki kelime ya da kalip. */
  source: string;
  /** Yerine kullanilabilecekler. */
  options: { word: string; note: string }[];
}

export interface Variant {
  text: string;
  /** "günlük konuşma", "resmî", "yazı dili" gibi. */
  label: string;
  note: string;
}

export interface Translation {
  /** Modelin algiladigi yon. */
  direction: Direction;
  /** En dogal karsilik. */
  main: string;
  /** Kelimesi kelimesine cevirisi — dogal halinden farkliysa. */
  literal: string;
  /** Neden boyle soyleniyor; hedef dilde, sade. */
  note: string;
  variants: Variant[];
  words: WordChoice[];
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * Yon ipucu. Turkce'ye ozgu harfler (ı, ğ, ş) ve Almanca'ya ozgu ß guclu
 * isaretler; hicbiri yoksa sik kullanilan kelimelere bakiyoruz. Model son
 * karari kendisi veriyor, bu yalniz ipucu.
 */
export function guessDirection(text: string): Direction {
  const sample = text.toLowerCase();
  let turkish = (sample.match(/[ığşİĞŞ]/g) ?? []).length * 3;
  let target = (sample.match(/[ß]/g) ?? []).length * 3;

  const turkishWords =
    /\b(bir|ve|için|ama|çok|daha|bu|şu|değil|olarak|gibi|kadar|mi|mı|mu|mü)\b/g;
  const germanWords =
    /\b(der|die|das|und|ist|nicht|ein|eine|mit|auf|für|aber|sehr|wird|dass|ich|sie)\b/g;

  turkish += (sample.match(turkishWords) ?? []).length;
  target += (sample.match(germanWords) ?? []).length;

  return turkish >= target ? "to-target" : "to-turkish";
}

export async function translateText(
  call: StudyCall,
  text: string,
  /** Kullanici yonu elle secmisse modelin tahminini eziyor. */
  forced?: Direction,
): Promise<Translation> {
  const native = LANGUAGES[call.language].native;
  const hint = forced ?? guessDirection(text);

  const task =
    hint === "to-target"
      ? `Der Text ist auf Türkisch. Schreib ihn auf ${native}, so wie ihn ein Muttersprachler wirklich sagen oder schreiben würde.`
      : `Der Text ist auf ${native}. Schreib ihn auf Türkisch, so wie ihn ein türkischer Muttersprachler wirklich sagen oder schreiben würde.`;

  const prompt = `${task}

--- MEIN TEXT ---
${text}
--- ENDE ---

Antworte NUR mit JSON, sonst nichts. Format:
{
  "direction": "${hint}",
  "main": "die natürlichste Fassung",
  "literal": "Wort-für-Wort-Übersetzung, falls sie anders klingt — sonst leer",
  "note": "warum man es so sagt (ein bis zwei Sätze)",
  "variants": [
    {"text":"eine andere Fassung mit gleicher Bedeutung",
     "label":"günlük konuşma | resmî | yazı dili | kısa | kibar",
     "note":"wann man diese Fassung nimmt"}
  ],
  "words": [
    {"source":"ein Wort aus \\"main\\"",
     "options":[{"word":"anderes Wort","note":"kurzer Unterschied"}]}
  ]
}

Regeln:
- "direction" prüf selbst nach: wenn ich mich geirrt habe, korrigier es auf
  "to-target" (Türkisch → ${native}) oder "to-turkish" (${native} → Türkisch).
- "main" ist die Fassung, die ein Muttersprachler wirklich benutzt — nicht die
  wörtliche. Behalt meinen Ton: wenn ich locker schreibe, bleib locker.
- "literal" nur ausfüllen, wenn die wörtliche Übersetzung merklich anders oder
  unnatürlich klingt. Sonst leerer String.
- "variants": zwei bis drei Fassungen, jede mit einem anderen Ton.
- "words": drei bis sechs wichtige Wörter aus "main", jeweils ein bis drei
  Alternativen. Nimm Wörter, bei denen die Wahl wirklich etwas ändert — keine
  Artikel, keine Hilfsverben.
- "note" und alle "note"-Felder auf einfachem ${native}, Niveau ${call.level}.
- Die Labels in "label" auf Türkisch, genau aus der Liste oben.
- Wenn ins Türkische übersetzt wird, sind "main", "variants" und die
  "word"-Felder natürlich auf Türkisch.`;

  const memory = await buildMemoryBlock(call.language, null);

  let raw = "";
  await streamChat({
    messages: [{ role: "user", text: prompt }],
    language: call.language,
    provider: call.provider,
    baseUrl: call.baseUrl,
    apiKey: call.apiKey,
    model: call.model,
    memory,
    level: call.level,
    // Yapili ve uzun cikti: ana ceviri, varyantlar ve kelime secenekleri.
    maxTokens: 3072,
    signal: call.signal,
    onDelta: (chunk) => {
      raw += chunk;
      call.onDelta?.(chunk);
    },
  });

  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) throw new Error("Çeviri okunamadı. Tekrar dener misin?");

  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const variantsRaw = Array.isArray(parsed.variants) ? parsed.variants : [];
  const variants = variantsRaw.flatMap((item): Variant[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const value = asString(record.text);
    if (!value) return [];
    return [
      {
        text: value,
        label: asString(record.label) || "başka bir söyleyiş",
        note: asString(record.note),
      },
    ];
  });

  const wordsRaw = Array.isArray(parsed.words) ? parsed.words : [];
  const words = wordsRaw.flatMap((item): WordChoice[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const source = asString(record.source);
    const optionsRaw = Array.isArray(record.options) ? record.options : [];
    const options = optionsRaw.flatMap((option) => {
      if (!option || typeof option !== "object") return [];
      const entry = option as Record<string, unknown>;
      const word = asString(entry.word);
      return word ? [{ word, note: asString(entry.note) }] : [];
    });
    return source && options.length ? [{ source, options }] : [];
  });

  const main = asString(parsed.main);
  if (!main) throw new Error("Çeviri boş geldi. Tekrar dener misin?");

  const direction: Direction =
    parsed.direction === "to-turkish" || parsed.direction === "to-target"
      ? parsed.direction
      : hint;

  return {
    direction,
    main,
    literal: asString(parsed.literal),
    note: asString(parsed.note),
    variants,
    words,
  };
}
