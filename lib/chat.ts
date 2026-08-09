"use client";

import { LANGUAGES, type LanguageCode } from "./dictionary";
import type { Provider, ProviderKind } from "./providers";

export class ChatError extends Error {}

/**
 * Sohbet modu.
 *
 * Onceki surum bir kelimenin butun bilgisini tek kartta veriyordu. Burada aksi
 * hedefleniyor: model her seferinde tek bir yonu aciklyor ve sirayi kullaniciya
 * birakiyor. Cevaplar akis halinde (SSE) geldigi icin metin kelime kelime
 * yaziliyor — bilgi "toptan" degil, adim adim geliyor.
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
    label: "Bu dilde nasıl tanımlanır?",
    prompt:
      "Bu kelimeyi hedef dilin kendi içinde, tek dilli bir sözlükteki gibi tanımla. Türkçe çeviri verme, sadece tanımı ve ardından kısaca ne anlama geldiğini söyle.",
  },
  {
    label: "Eş anlamlıları",
    prompt:
      "Bu kelimenin eş anlamlılarını ver. Her biri için asıl kelimeden hangi nüansla ayrıldığını tek cümleyle açıkla. En fazla üç tane.",
  },
  {
    label: "Örnek cümle",
    prompt:
      "Bu kelimeyle günlük hayatta geçebilecek iki örnek cümle kur ve Türkçe çevirilerini ver.",
  },
  {
    label: "Sık kullanılan kalıplar",
    prompt:
      "Bu kelimenin gerçekten sık geçtiği kalıpları ve birliktelikleri ver, her birinin Türkçe karşılığıyla.",
  },
  {
    label: "Çekimleri / biçim bilgisi",
    prompt:
      "Bu kelimenin biçim bilgisini ver: isimse artikel ve çoğulu, fiilse temel çekimleri, sıfatsa karşılaştırma biçimleri.",
  },
  {
    label: "Beni sınav et",
    prompt:
      "Bana bu kelimeyle ilgili tek bir soru sor ve cevabımı bekle. Cevabı hemen verme.",
  },
];

export function systemPrompt(language: LanguageCode): string {
  const { name, native } = LANGUAGES[language];
  return `Sen Türkçe konuşan, ${name} (${native}) öğreten deneyimli bir dil öğretmenisin.
Karşındaki kişi ${name} öğreniyor ve seninle sohbet ederek ilerliyor.

EN ÖNEMLİ KURAL: Bir kelimenin bütün bilgisini tek seferde verme.
Her mesajında SADECE TEK bir yönü ele al. Kullanıcı istemeden eş anlamlılara,
örnek cümlelere veya çekimlere geçme.

Nasıl konuşacaksın:
- Kullanıcı yalnızca bir kelime yazdığında: önce o kelimenin Türkçe karşılığını
  ver ve bir cümleyle nerede kullanıldığını söyle. Sonra dur.
- Cevapların kısa olsun: en fazla 3-4 cümle. Uzun listeler, tablolar, markdown
  başlıkları kullanma. Sohbet eder gibi, sade metin yaz.
- Her cevabın sonunda kullanıcının seçebileceği bir sonraki adımı kısa bir
  soruyla öner. Örnek: "Almanca tanımını da ister misin?"
- Kullanıcı bir soru sorarsa yalnızca o soruya cevap ver.
- Kullanıcı çekimli ya da yanlış yazılmış bir biçim yazarsa önce sözlük
  biçimini söyle, sonra devam et.
- Kelime o dilde yoksa bunu açıkça söyle ve en yakın olasılığı öner.
- Konuştuğunuz kelimeyi hatırla; "bu kelime" dediğinde en son ele alınan
  kelimeyi kastediyor.
- Kullanıcıyı sıkma, ders anlatır gibi değil, sohbet eder gibi yaz.`;
}

interface StreamOptions {
  messages: ChatMessage[];
  language: LanguageCode;
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  onDelta: (chunk: string) => void;
}

/** Gemini'nin kendi bicimi. Sistem yonergesi ayri bir alanda gider. */
function geminiRequest(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  language: LanguageCode,
): [string, RequestInit] {
  return [
    `${baseUrl}/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(language) }] },
        contents: messages.map((message) => ({
          role: message.role,
          parts: [{ text: message.text }],
        })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
      }),
    },
  ];
}

/** DeepSeek, OpenRouter, Ollama ve digerlerinin konustugu OpenAI bicimi. */
function openaiRequest(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  language: LanguageCode,
): [string, RequestInit] {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // OpenRouter cagriyi yapan siteyi bu basliklarla etiketliyor; zorunlu degil
  // ama gonderilmesi bekleniyor.
  if (baseUrl.includes("openrouter.ai") && typeof window !== "undefined") {
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "Kelime Sozlugu";
  }

  return [
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.4,
        max_tokens: 600,
        messages: [
          { role: "system", content: systemPrompt(language) },
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

/** Iki bicimin SSE govdesinden metin parcasini cikarir. */
function readDelta(kind: ProviderKind, payload: string): string {
  const parsed = JSON.parse(payload) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    choices?: { delta?: { content?: string }; message?: { content?: string } }[];
  };

  if (kind === "gemini") {
    return (
      parsed.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? ""
    );
  }

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
  signal,
  onDelta,
}: StreamOptions): Promise<string> {
  if (!apiKey) throw new ChatError("Önce API anahtarını gir.");
  if (!baseUrl) throw new ChatError("Sağlayıcı adresi boş.");
  if (!model) throw new ChatError("Model seçilmedi.");

  const trimmedBase = baseUrl.replace(/\/$/, "");
  const [url, init] =
    provider.kind === "gemini"
      ? geminiRequest(trimmedBase, model, apiKey, messages, language)
      : openaiRequest(trimmedBase, model, apiKey, messages, language);

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
        "çağrılmasına izin vermemesi (CORS). İkincisiyse ayarlardan başka bir " +
        "sağlayıcı seç — OpenRouter üzerinden aynı modellere erişebilirsin. " +
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE olaylari bos satirla ayrilir; yarim kalan son parcayi tamponda tut.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const text = readDelta(provider.kind, payload);
          if (text) {
            full += text;
            onDelta(text);
          }
        } catch {
          // Bolunmus bir JSON parcasi olabilir; bir sonraki turda tamamlanir.
        }
      }
    }
  }

  if (!full.trim()) {
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
