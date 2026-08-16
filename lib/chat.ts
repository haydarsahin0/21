"use client";

import { LANGUAGES, type LanguageCode } from "./dictionary";
import type { Provider } from "./providers";

export class ChatError extends Error {}

/**
 * Sohbet modu.
 *
 * Amac bir sozluk maddesini kopyalamak degil, ogretmenle konusur gibi
 * ilerlemek: model ilk mesajda kelimeyi baglamiyla ve ornekle aciyor, gerisini
 * kullanicinin sordugu yerden surduruyor. Serbest soru (bir cumleyi
 * duzelttirmek, iki kelimeyi karsilastirmak, kullanim tonu sormak) beklenen
 * kullanim. Cevaplar akis halinde (SSE) geldigi icin metin yazilirken okunuyor.
 */


export type Role = "user" | "model";

export interface ChatMessage {
  role: Role;
  text: string;
}

/** Sohbetin gidebilecegi bir sonraki adimlar. Arayuzde cip olarak cikiyor. */
export interface Suggestion {
  label: string;
  prompt: string;
}

export const STEP_SUGGESTIONS: Suggestion[] = [
  {
    label: "Daha fazla örnek cümle",
    prompt:
      "Gib mir drei Beispielsätze mit diesem Wort: einen aus dem Alltag, einen aus einer E-Mail bei der Arbeit, einen aus einem Text. Erkläre den Unterschied im Ton mit einfachen Wörtern.",
  },
  {
    label: "Hangi durumlarda kullanılır?",
    prompt:
      "Wann benutzt man dieses Wort und wann nicht? Mit wem, wo, in welchem Ton? Zeig es mit Beispielen.",
  },
  {
    label: "Benzerlerinden farkı",
    prompt:
      "Welche Wörter haben eine ähnliche Bedeutung? Was ist der Unterschied? Zeig den Unterschied in Beispielsätzen: hier passt das eine, dort das andere.",
  },
  {
    label: "Cümle kurayım, düzelt",
    prompt:
      "Gib mir eine Situation. Ich schreibe dann einen Satz mit diesem Wort, und du korrigierst ihn.",
  },
  {
    label: "Aklımda nasıl tutarım?",
    prompt:
      "Wie kann ich mir dieses Wort gut merken? Nenn mir eine Eselsbrücke, die Herkunft oder ein ähnliches Wort. Danach ein Beispielsatz dazu.",
  },
  {
    label: "Beni sınav et",
    prompt:
      "Stell mir eine einzige Frage zu diesem Wort und warte auf meine Antwort. Gib die Antwort nicht sofort.",
  },
];

export function systemPrompt(
  language: LanguageCode,
  memory = "",
  level = "A2-B1",
): string {
  const { name, native } = LANGUAGES[language];
  return (
    `Du bist ein erfahrener ${native}-Lehrer. Dein Schüler lernt ${native} und
spricht Türkisch als Muttersprache.

WICHTIGSTE REGEL — SPRACHE:
Schreibe fast alles auf EINFACHEM ${native} (Niveau ${level}).
Erklärungen, Beispiele, Fragen und Rückmeldungen: auf ${native}.
NUR die türkische Bedeutung eines Wortes schreibst du auf Türkisch.

So schreibst du auf Niveau ${level}:
- Kurze Sätze. Ein Gedanke pro Satz.
- Häufige, einfache Wörter. Keine seltenen oder gehobenen Wörter.
- Keine langen Nebensatzketten, kein Konjunktiv II, kein Passiv, wenn es auch
  einfacher geht.
- Wenn du ein schweres Wort brauchst, erkläre es sofort mit einfachen Wörtern.

Format eines neuen Wortes:
- Zuerst das Wort **fett** und daneben die türkische Bedeutung auf Türkisch.
  Beispiel: **fragen** — sormak
- Dann auf einfachem ${native}: Was bedeutet es? Wann benutzt man es?
- Dann ein Beispielsatz auf ${native}, **fett**. Danach eine ganz einfache
  ${native} Erklärung des Satzes — KEINE türkische Übersetzung.

Als Lehrer:
- Du bist kein Wörterbuch. Erkläre auch, wo und mit wem man das Wort benutzt.
- Nach jeder Regel kommt sofort ein Beispiel. Nie erklären ohne Beispiel.
- Der Schüler darf alles fragen: "Kann ich das in einer E-Mail schreiben?",
  "Was ist der Unterschied zu ...?", "Ist mein Satz richtig?". Antworte direkt
  und vollständig — aber immer auf einfachem ${native}.
- Wenn der Schüler einen Satz schreibt, korrigiere ihn: erst der richtige Satz,
  dann in ein bis zwei einfachen Sätzen das Warum.
- Wenn der Schüler dich auf Türkisch bittet, etwas auf Türkisch zu erklären,
  dann mach das. Sonst bleibst du bei ${native}.
- Wenn der Schüler gar nichts versteht, wiederhole es noch einfacher — nicht
  auf Türkisch.

Rhythmus:
- Gib beim ersten Mal nicht alles. Ein Wort: Bedeutung, kurze Erklärung, ein
  Beispiel. Synonyme, Tabellen und alle Formen kommen später im Gespräch.
- Aber kürze eine echte Frage nicht ab. Länge passt zur Frage.
- Merke dir das Wort, über das ihr sprecht.

Form:
- Wörter und Beispielsätze auf ${native} schreibst du **fett**.
- Kurze Listen sind erlaubt. Keine Überschriften, keine Tabellen.
- Beispielsätze stehen in einer eigenen Zeile.
- Türkische Bedeutung eines Wortes: auf Türkisch, direkt neben dem Wort.

(Hinweis: ${name} = ${native}.)` + memory
  );
}

interface StreamOptions {
  messages: ChatMessage[];
  language: LanguageCode;
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Sistem promptuna eklenecek "ikinci beyin" blogu. */
  memory?: string;
  /** Aciklamalarin yazilacagi hedef dil seviyesi. */
  level?: string;
  /** Cikti butcesi. Uzun/yapili cevaplar (metin degerlendirme) daha cok ister. */
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta: (chunk: string) => void;
}

/** Iki saglayici da OpenAI uyumlu /chat/completions konusuyor. */
function openaiRequest(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  language: LanguageCode,
  memory: string,
  level: string,
  maxTokens: number,
  provider: Provider,
): [string, RequestInit] {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // OpenAI'nin akil yurutme modelleri max_tokens'i reddedip
  // max_completion_tokens bekliyor; DeepSeek eskisini kullaniyor.
  const tokenField = provider.usesMaxCompletionTokens
    ? "max_completion_tokens"
    : "max_tokens";

  return [
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.6,
        [tokenField]: maxTokens,
        messages: [
          { role: "system", content: systemPrompt(language, memory, level) },
          ...messages.map((message) => ({
            // OpenAI bicimi modelin rolunu "assistant" diye adlandiriyor.
            role: message.role === "model" ? "assistant" : "user",
            content: message.text,
          })),
        ],
      }),
    },
  ];
}

/** Akisin neden bittigini soyleyen alan; bos cevabi aciklamak icin. */
function readFinishReason(payload: string): string {
  const parsed = JSON.parse(payload) as {
    choices?: { finish_reason?: string }[];
  };
  return parsed.choices?.[0]?.finish_reason ?? "";
}

/** SSE govdesinden metin parcasini cikarir. */
function readDelta(payload: string): string {
  const parsed = JSON.parse(payload) as {
    choices?: { delta?: { content?: string }; message?: { content?: string } }[];
  };
  const choice = parsed.choices?.[0];
  return choice?.delta?.content ?? choice?.message?.content ?? "";
}

/**
 * SSE akisini okuyup her parcayi onDelta'ya verir, tam metni dondurur.
 */
export async function streamChat({
  messages,
  language,
  provider,
  baseUrl,
  apiKey,
  model,
  memory = "",
  level = "A2-B1",
  maxTokens = 1600,
  signal,
  onDelta,
}: StreamOptions): Promise<string> {
  if (!apiKey) throw new ChatError("Önce API anahtarını gir.");
  if (!baseUrl) throw new ChatError("Sağlayıcı adresi boş.");
  if (!model) throw new ChatError("Model seçilmedi.");

  const trimmedBase = baseUrl.replace(/\/$/, "");
  const [url, init] = openaiRequest(
    trimmedBase, model, apiKey, messages, language, memory, level, maxTokens, provider,
  );

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (signal?.aborted) return "";
    // Tarayici CORS reddini de ag hatasini da ayni TypeError ile bildiriyor;
    // ikisini ayirt edemedigimiz icin her iki olasiligi da soyluyoruz.
    throw new ChatError(
      `${provider.label} sağlayıcısına ulaşılamadı. İki sebebi olabilir: ` +
        "internet bağlantın, ya da bu sağlayıcının tarayıcıdan doğrudan " +
        "çağrılmasına izin vermemesi (CORS). İkincisiyse ayarlardan diğer " +
        "sağlayıcıyı dene. " +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new ChatError(
        `Anahtar reddedildi (${response.status}). ${provider.label} anahtarını ` +
          "doğru yapıştırdığından emin ol.",
      );
    }
    if (response.status === 400) {
      throw new ChatError(
        `İstek reddedildi (400). Genelde anahtar ya da model adı hatalıdır. ` +
          `Seçili model: ${model}. ${detail.slice(0, 160)}`,
      );
    }
    if (response.status === 402) {
      throw new ChatError(
        `${provider.label} bakiyen bitmiş görünüyor (402). Hesabına bakiye ` +
          "ekleyebilir ya da ayarlardan ücretsiz bir sağlayıcıya geçebilirsin.",
      );
    }
    if (response.status === 429) {
      throw new ChatError(
        "Kotan doldu (429). Biraz bekle ya da ayarlardan başka bir model seç.",
      );
    }
    throw new ChatError(
      `${provider.label} ${response.status} döndü: ${detail.slice(0, 200)}`,
    );
  }

  if (!response.body) throw new ChatError("Akış başlatılamadı.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  let finishReason = "";

  const consume = (event: string) => {
    for (const line of event.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        finishReason = readFinishReason(payload) || finishReason;
        const text = readDelta(payload);
        if (text) {
          full += text;
          onDelta(text);
        }
      } catch {
        // Bolunmus bir JSON parcasi olabilir; bir sonraki turda tamamlanir.
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE olaylari bos satirla ayrilir; yarim kalan son parcayi tamponda tut.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) consume(event);
  }

  // Akis kapandiginda tamponda kalani da isle. Son olay her zaman bos satirla
  // bitmiyor; islenmeyince cevabin son parcasi dusuyor ve metin cumlenin
  // ortasinda kesiliyordu.
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);

  if (!full.trim()) {
    // En sik sebep: model butun cikti butcesini "dusunerek" harcadi ve geriye
    // metin kalmadi. Kullaniciya ne yapabilecegini soyluyoruz.
    if (/MAX_TOKENS|length/i.test(finishReason)) {
      throw new ChatError(
        "Model cevabı bitiremeden sınıra takıldı. Metni biraz kısaltıp tekrar " +
          "dene, ya da ayarlardan başka bir model seç.",
      );
    }
    if (/SAFETY|BLOCK|RECITATION|content_filter/i.test(finishReason)) {
      throw new ChatError(
        `Sağlayıcı bu isteği engelledi (${finishReason}). Metni biraz değiştirip dene.`,
      );
    }
    throw new ChatError("Modelden boş cevap geldi. Tekrar dener misin?");
  }

  return full;
}

/** Kullanicinin yazdigi tek kelimeyi yakalar (kelime defterine eklemek icin). */
export function extractWord(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return null;
  return /^[\p{L}\p{M}'-]+$/u.test(trimmed) ? trimmed : null;
}
