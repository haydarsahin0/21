"use client";

import { streamChat, type ChatMessage } from "./chat";
import { LANGUAGES, type LanguageCode } from "./dictionary";
import { buildMemoryBlock, type WordStat } from "./memory";
import type { Provider } from "./providers";

/**
 * Calisma oturumu.
 *
 * Iki is yapiyor:
 *  1. Zamani gelmis bir kelime icin soru uretmek (tanimi degil, kullanimi
 *     yoklayan bir soru — ezber degil kavrayis olcsun).
 *  2. Cevabi degerlendirip araliklio tekrar notunu vermek.
 *
 * Hepsi ayni sohbet altyapisini kullaniyor; ekstra bir bagimlilik yok.
 */

export interface StudyCall {
  language: LanguageCode;
  /** Aciklamalarin sadelik duzeyi (A2-B1 gibi). */
  level: string;
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
  onDelta?: (chunk: string) => void;
  signal?: AbortSignal;
}

async function ask(
  call: StudyCall,
  messages: ChatMessage[],
  memory: string,
): Promise<string> {
  let output = "";
  await streamChat({
    messages,
    language: call.language,
    provider: call.provider,
    baseUrl: call.baseUrl,
    apiKey: call.apiKey,
    model: call.model,
    memory,
    level: call.level,
    signal: call.signal,
    onDelta: (chunk) => {
      output += chunk;
      call.onDelta?.(chunk);
    },
  });
  return output;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// --- Soru uretme ------------------------------------------------------------

export async function makeQuestion(
  call: StudyCall,
  word: WordStat,
): Promise<string> {
  const native = LANGUAGES[call.language].native;
  const firstTime = word.reps === 0;

  const prompt = firstTime
    ? `Erklär mir das Wort **${word.word}**.

- Zuerst das Wort **fett** und daneben die türkische Bedeutung auf Türkisch.
- Dann auf einfachem ${native}: Was bedeutet es? Wann benutzt man es?
- Dann ein Beispielsatz, **fett**.
- Stell KEINE Frage. Erklär nur. Hör auf, wenn du fertig bist.`
    : `Prüf mich zum Wort **${word.word}**.

Regeln:
- Stell NUR EINE Frage und hör dann auf. Gib die Antwort nicht.
- Die Frage prüft den Gebrauch, nicht das Auswendiglernen. Zum Beispiel: ein
  ${native} Satz mit einer Lücke, oder eine Situation und "Wie sagst du das?",
  oder ein Vergleich mit einem ähnlichen Wort.
- Stell jedes Mal einen anderen Fragetyp. Wiederhole nicht dasselbe Muster.
- Höchstens drei kurze Sätze. Einfaches ${native} (Niveau ${call.level}).`;

  const memory = await buildMemoryBlock(call.language, word.word);
  return ask(call, [{ role: "user", text: prompt }], memory);
}

// --- Cevap degerlendirme ----------------------------------------------------

export interface Verdict {
  /** 0-100 arasi dogruluk. */
  score: number;
  /** Kullaniciya gosterilecek kisa geri bildirim (markdown). */
  feedback: string;
}

export async function gradeAnswer(
  call: StudyCall,
  word: WordStat,
  question: string,
  answer: string,
): Promise<Verdict> {
  const native = LANGUAGES[call.language].native;

  const prompt = `Deine Frage war:
${question}

Die Antwort des Schülers:
${answer}

Bewerte diese Antwort. Schreib NUR JSON, sonst nichts. Format:
{"score": Zahl von 0 bis 100, "feedback": "Rückmeldung auf einfachem ${native}"}

Die Rückmeldung (kurz, höchstens vier Sätze, Niveau ${call.level}):
- Sag klar: richtig, teilweise richtig oder falsch.
- Wenn etwas falsch ist, schreib die richtige Form **fett** und erklär in einem
  einfachen Satz, warum.
- Gib einen kurzen Beispielsatz mit dem Wort, damit es im Kopf bleibt.
- Schreib auf ${native}, nicht auf Türkisch. Nur die Bedeutung eines Wortes
  darf auf Türkisch stehen.
- Mach dem Schüler Mut.`;

  const raw = await ask(
    call,
    [
      { role: "user", text: `Prüf mich zum Wort **${word.word}**.` },
      { role: "model", text: question },
      { role: "user", text: prompt },
    ],
    "",
  );

  const parsed = extractJson(raw);
  const score = Number(parsed?.score);
  const feedback = typeof parsed?.feedback === "string" ? parsed.feedback : "";

  if (!Number.isFinite(score) || !feedback) {
    // Model bicimi tutturamadiysa ham metni geri bildirim say, notu ortada
    // birak — kullanicinin emegi bosa gitmesin.
    return { score: 60, feedback: raw.trim() || "Cevabını değerlendiremedim." };
  }

  return { score: Math.max(0, Math.min(100, score)), feedback };
}

// --- Yeni kelime onerme -----------------------------------------------------

export interface NewWord {
  word: string;
  gloss: string;
}

/**
 * Gunluk hedefi doldurmak icin, kullanicinin daha once gormedigi kelimeler.
 * Hafiza blogu prompta girdigi icin oneriler seviyeye ve ilgi alanina gore
 * geliyor.
 */
export async function suggestNewWords(
  call: StudyCall,
  known: string[],
  count: number,
): Promise<NewWord[]> {
  const native = LANGUAGES[call.language].native;
  const avoid = known.slice(-200).join(", ");

  const prompt = `Schlag mir ${count} neue ${native} Wörter vor.

- Passend zu meinem Niveau (${call.level}) und meinen Interessen. Wörter, die
  ich wirklich brauche — im Alltag oder beim Schreiben.
- Schlag diese Wörter NICHT vor, die kenne ich schon: ${avoid || "(noch keine)"}
- Keine seltenen oder gehobenen Wörter.

Antworte NUR mit einem JSON-Array, sonst nichts.
"gloss" ist die türkische Bedeutung, auf Türkisch:
[{"word":"Wort","gloss":"türkçe karşılığı"}]`;

  const memory = await buildMemoryBlock(call.language, null);
  const raw = await ask(call, [{ role: "user", text: prompt }], memory);

  const match = /\[[\s\S]*\]/.exec(raw);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    const knownSet = new Set(known.map((w) => w.toLowerCase()));
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const word = typeof record.word === "string" ? record.word.trim() : "";
      const gloss = typeof record.gloss === "string" ? record.gloss.trim() : "";
      if (!word || word.length > 40 || knownSet.has(word.toLowerCase())) return [];
      return [{ word, gloss }];
    });
  } catch {
    return [];
  }
}

/** Puani araliklio tekrar notuna cevirir. */
export function scoreToGrade(score: number) {
  if (score < 50) return "again" as const;
  if (score < 75) return "hard" as const;
  if (score < 92) return "good" as const;
  return "easy" as const;
}
