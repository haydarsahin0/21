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
  const name = LANGUAGES[call.language].name;
  const firstTime = word.reps === 0;

  const prompt = firstTime
    ? `Bana **${word.word}** kelimesini öğret. Kısa tut: anlamı, nerede
kullanıldığı ve bir örnek cümle (Türkçesiyle). Sonunda "Hazırsan seni
yoklayacağım" gibi bir cümleyle bitir. Soru sorma, sadece öğret.`
    : `**${word.word}** kelimesi için beni yokla.

Kurallar:
- TEK bir soru sor ve dur. Cevabı sakın verme.
- Soru ezber değil kullanım ölçsün. Örneğin: içinde boşluk olan bir ${name}
  cümle verip doğru kelimeyi sor, ya da bir durum anlatıp "bunu nasıl
  söylersin" diye sor, ya da yakın bir kelimeyle karıştırmayı test et.
- Soruyu her seferinde farklı tipte sor, aynı kalıbı tekrarlama.
- En fazla 3 cümle.`;

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
  const prompt = `Sorduğun soru şuydu:
${question}

Öğrencinin cevabı:
${answer}

Bu cevabı değerlendir. Önce JSON, sonra hiçbir şey yazma. Biçim:
{"score": 0-100 arası sayı, "feedback": "Türkçe geri bildirim"}

feedback şunları içersin (kısa, en fazla 4 cümle):
- Cevap doğru mu, kısmen mi doğru, yanlış mı — açıkça söyle.
- Yanlış ya da eksikse doğrusunu **kalın** yaz ve neden öyle olduğunu bir
  cümleyle açıkla.
- Aklında kalması için kelimenin geçtiği kısa bir örnek cümle + Türkçesi ekle.
- Cesaret kırma.`;

  const raw = await ask(
    call,
    [
      { role: "user", text: `**${word.word}** kelimesi için beni yokla.` },
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
  const name = LANGUAGES[call.language].name;
  const avoid = known.slice(-200).join(", ");

  const prompt = `Bana ${count} tane yeni ${name} kelime öner.

- Benim seviyeme ve ilgi alanlarıma uysun; gerçekten işime yarayacak,
  günlük hayatta ya da yazışmada geçen kelimeler olsun.
- Şu kelimeleri ÖNERME, onları zaten biliyorum: ${avoid || "(henüz yok)"}
- Nadir, süslü kelimeler seçme.

Sadece JSON dizisi döndür, başka hiçbir şey yazma:
[{"word":"kelime","gloss":"kısa Türkçe karşılığı"}]`;

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
