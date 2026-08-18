"use client";

/**
 * Banka kelimelerinin Turkce karsiligi.
 *
 * Kaynak veride Ingilizce karsilik hazir geliyor, Turkce yok. Turkcesini
 * modelden toplu halde aliyoruz (tek istekte ~15 kelime) ve IndexedDB'ye
 * yaziyoruz: bir kelimenin karsiligi bir kez alinir, sonra bedavadir.
 *
 * Model erisilemezse ekran cokmuyor — kartin arkasinda Ingilizce karsilik
 * kaliyor, C1 seviyesindeki biri icin zaten yeterli bir ipucu.
 */

import { streamChat } from "./chat";
import type { LanguageCode } from "./dictionary";
import { getGlosses, saveGlosses } from "./memory";
import type { StudyCall } from "./study";
import type { BankWord } from "./wordbank";

/** Tek istekte kac kelime. Cok buyuk olursa model bazilarini atliyor. */
export const BATCH = 15;

function parseArray(raw: string): { word: string; tr: string }[] {
  const match = /\[[\s\S]*\]/.exec(raw);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const row = item as { word?: unknown; tr?: unknown };
        return {
          word: typeof row.word === "string" ? row.word : "",
          tr: typeof row.tr === "string" ? row.tr : "",
        };
      })
      .filter((row) => row.word && row.tr);
  } catch {
    return [];
  }
}

/**
 * Verilen kelimelerin Turkce karsiligini dondurur. Onbellekte olanlar
 * dogrudan, olmayanlar tek bir model cagrisiyla gelir ve saklanir.
 */
export async function ensureGlosses(
  call: StudyCall,
  entries: BankWord[],
  language: LanguageCode,
): Promise<Map<string, string>> {
  const cached = await getGlosses(
    entries.map((entry) => entry.word),
    language,
  );
  const missing = entries.filter((entry) => !cached.has(entry.word));
  if (!missing.length || !call.apiKey) return cached;

  // Artikel ve tur bilgisini de veriyoruz: es sesli kelimelerde ("der Band" /
  // "das Band") model dogru anlami secsin.
  const list = missing
    .slice(0, BATCH)
    .map((entry) => {
      const head = entry.article ? `${entry.article} ${entry.word}` : entry.word;
      return `${entry.word} — ${head} (${entry.category})`;
    })
    .join("\n");

  const prompt = `Gib für jedes Wort die türkische Bedeutung.

${list}

Antworte NUR mit JSON, ohne Erklärung:
[{"word":"...","tr":"..."}]

Regeln:
- "word" ist genau das Wort vor dem Gedankenstrich.
- "tr" ist kurz: ein bis drei türkische Wörter, keine Sätze.
- Bei Nomen den türkischen Begriff ohne Artikel schreiben.
- Nimm die Bedeutung, die zum angegebenen Artikel und zur Wortart passt.`;

  try {
    let output = "";
    await streamChat({
      messages: [{ role: "user", text: prompt }],
      language,
      provider: call.provider,
      baseUrl: call.baseUrl,
      apiKey: call.apiKey,
      model: call.model,
      level: call.level,
      maxTokens: 1200,
      signal: call.signal,
      onDelta: (chunk) => {
        output += chunk;
      },
    });

    const rows = parseArray(output);
    if (rows.length) {
      await saveGlosses(rows, language);
      for (const row of rows) cached.set(row.word, row.tr);
    }
  } catch {
    // Sessiz gec: Ingilizce karsilikla devam edilir.
  }

  return cached;
}
