"use client";

import { streamChat } from "./chat";
import { LANGUAGES } from "./dictionary";
import { buildMemoryBlock } from "./memory";
import type { StudyCall } from "./study";

/**
 * Serbest yazma modu.
 *
 * Kullanici kendi yazdigi metni veriyor; model puanliyor, hatalari tek tek
 * gosteriyor ve metnin daha iyi bir halini yaziyor. Hata tipleri hafizaya
 * "zorlandigi" notu olarak dusuyor, boylece sonraki sohbetler ve tekrar
 * sorulari bu noktalara dokunuyor.
 */

export interface WritingError {
  /** Metinden alinan yanlis parca. */
  original: string;
  /** Duzeltilmis hali. */
  correct: string;
  /** Neden — hedef dilde, sade. */
  why: string;
  /** Hata tipi: Artikel, Verbstellung, Kasus, Wortwahl, Rechtschreibung... */
  kind: string;
}

export interface WritingReview {
  score: number;
  /** Neyi iyi yapmis — hedef dilde. */
  good: string;
  errors: WritingError[];
  /** Metnin daha iyi, daha dogal hali. */
  improved: string;
  /** Bir sonraki sefere tek bir tavsiye. */
  tip: string;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export async function reviewWriting(
  call: StudyCall,
  text: string,
): Promise<WritingReview> {
  const native = LANGUAGES[call.language].native;

  const prompt = `Ich habe diesen Text selbst geschrieben. Korrigier ihn.

--- MEIN TEXT ---
${text}
--- ENDE ---

Antworte NUR mit JSON, sonst nichts. Format:
{
  "score": Zahl von 0 bis 100,
  "good": "Was ich gut gemacht habe (ein bis zwei Sätze)",
  "errors": [
    {"original":"falsches Stück aus meinem Text",
     "correct":"richtige Form",
     "why":"kurz, warum",
     "kind":"Artikel | Kasus | Verbstellung | Wortwahl | Rechtschreibung | Zeitform | Sonstiges"}
  ],
  "improved": "mein Text, korrigiert und natürlicher geschrieben",
  "tip": "ein einziger Tipp für das nächste Mal"
}

Regeln:
- Schreib alles auf einfachem ${native}, Niveau ${call.level}. Nicht auf Türkisch.
- "original" muss genau so in meinem Text stehen. Erfinde nichts.
- Nimm jeden echten Fehler auf, auch kleine (Artikel, Groß- und
  Kleinschreibung, Kommas). Aber erfinde keine Fehler.
- "improved" behält meine Idee und meinen Inhalt. Mach es nur richtig und
  natürlicher — schreib keinen neuen Text.
- Die Bewertung: 90+ fast fehlerfrei, 70-89 gut mit einigen Fehlern,
  50-69 verständlich aber viele Fehler, unter 50 schwer zu verstehen.`;

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
    // Metin degerlendirmesi yapili ve uzun bir cikti: puan, hata listesi ve
    // metnin duzeltilmis hali. Varsayilan butce yetmiyordu.
    maxTokens: 4096,
    signal: call.signal,
    onDelta: (chunk) => {
      raw += chunk;
      call.onDelta?.(chunk);
    },
  });

  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) {
    throw new Error("Değerlendirme okunamadı. Tekrar dener misin?");
  }

  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  const score = Number(parsed.score);

  const errorsRaw = Array.isArray(parsed.errors) ? parsed.errors : [];
  const errors = errorsRaw.flatMap((item): WritingError[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const original = asString(record.original);
    const correct = asString(record.correct);
    if (!original || !correct) return [];
    return [
      {
        original,
        correct,
        why: asString(record.why),
        kind: asString(record.kind) || "Sonstiges",
      },
    ];
  });

  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 70,
    good: asString(parsed.good),
    errors,
    improved: asString(parsed.improved),
    tip: asString(parsed.tip),
  };
}

/** Tekrar eden hata tiplerini hafiza notuna cevirir. */
export function errorPatternNotes(errors: WritingError[]): string[] {
  const counts = new Map<string, number>();
  for (const error of errors) {
    counts.set(error.kind, (counts.get(error.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([kind, count]) => `Yazarken ${kind} hatası yapıyor (bir metinde ${count} kez)`);
}
