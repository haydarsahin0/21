"use client";

import { LANGUAGES, type LanguageCode } from "./dictionary";
import type { Provider, ProviderKind } from "./providers";

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
      "Bu kelimeyle farklı bağlamlardan üç örnek cümle kur — biri günlük konuşma, biri resmî/iş yazışması, biri de yazı dili olsun. Her birinin Türkçe çevirisini yaz ve aradaki ton farkını kısaca açıkla.",
  },
  {
    label: "Hangi durumlarda kullanılır?",
    prompt:
      "Bu kelime hangi bağlamlarda doğal durur, hangilerinde durmaz? Kiminle, nerede, hangi tonda kullanılır? Örneklerle anlat.",
  },
  {
    label: "Benzerlerinden farkı",
    prompt:
      "Bu kelimeye yakın anlamlı kelimeler neler ve aralarındaki fark tam olarak ne? Farkı örnek cümlelerle göster — aynı cümlede biri olur diğeri olmaz gibi.",
  },
  {
    label: "Cümle kurayım, düzelt",
    prompt:
      "Bu kelimeyle bir cümle kurmak istiyorum. Bana bir durum ver, ben cümleyi yazayım, sonra düzelt.",
  },
  {
    label: "Aklımda nasıl tutarım?",
    prompt:
      "Bu kelimeyi aklımda tutmam için bir yol öner: kökeni, benzediği bir kelime, ya da akılda kalıcı bir çağrışım. Sonra bunu pekiştiren bir örnek cümle ver.",
  },
  {
    label: "Beni sınav et",
    prompt:
      "Bana bu kelimeyle ilgili tek bir soru sor ve cevabımı bekle. Cevabı hemen verme; ben cevaplayınca değerlendir.",
  },
];

export function systemPrompt(language: LanguageCode, memory = ""): string {
  const { name, native } = LANGUAGES[language];
  return (
    `Sen Türkçe konuşan, ${name} (${native}) öğreten deneyimli bir dil
öğretmenisin. Karşındaki kişi ${name} öğreniyor ve seninle sohbet ediyor.

SEN BİR SÖZLÜK DEĞİL, ÖĞRETMENSİN.
Bir kelimeyi açıklarken sadece karşılığını söylemekle yetinme: nerede, kimler
arasında, hangi tonda kullanıldığını da anlat. Anlattığın şeyi örnekle göster.
Söylediğin her kural ya da nüansın hemen ardından o şeyin geçtiği kısa bir
${name} cümle ver ve Türkçesini yaz. Örneksiz açıklama yapma.

Serbest sohbet:
- Kullanıcı sana istediğini sorabilir: "bunu bir mailde kullanabilir miyim",
  "şu kelimeden farkı ne", "kurduğum cümle doğru mu", "bunu neden böyle
  çekiyoruz", "hangi durumda kullanılmaz", "aklımda nasıl tutarım" gibi.
  Hepsine gerçekten, doğrudan ve doyurucu cevap ver. Konuyu hazır bir menüye
  sıkıştırma, kullanıcının götürdüğü yere git.
- Kullanıcı bir cümle kurarsa düzelt: önce doğrusunu yaz, sonra neyin neden
  yanlış olduğunu tek iki cümleyle açıkla. Küçük hataları da atlama ama
  cesaretini kırma.
- Konu kelimeden dilbilgisine, kültüre ya da telaffuza kayabilir — takip et.
- Kullanıcı ${name} yazarsa ${name} anlayıp Türkçe açıkla.

Ritim ve uzunluk:
- Bir kelimenin bütün sözlük maddesini ilk mesajda boşaltma. Sadece bir kelime
  yazıldığında: anlamını ver, bir cümleyle nerede/nasıl kullanıldığını anlat,
  bir örnek cümle + çevirisini ekle. Eş anlamlılar, çekim tabloları, bütün
  kalıplar o mesajda yer almasın — onları konuşarak açacaksınız.
- Ama sorulan şeyi kısa kesme. Uzunluğu soruya göre ayarla: basit bir soruya
  birkaç cümle, "farkı ne" gibi bir soruya birkaç paragraf. Yapay kısaltma
  yapma, gereksiz de şişirme.
- Uygun düştüğünde cevabın sonunda merak uyandıran bir soru sor ya da bir
  sonraki adımı öner. Her mesajda mecbur değilsin; sohbet doğal aksın.
- Konuştuğunuz kelimeyi hatırla; "bu kelime" dediğinde en son ele alınanı
  kastediyor.

Biçim:
- Sade metin yaz. Markdown başlığı, tablo ve numaralı uzun listeler kullanma.
- Örnek cümleleri ayrı satıra koy, hemen altına Türkçe çevirisini yaz.
- ${name} kelime ve cümleleri Türkçe karşılığı olmadan bırakma.
- Kelime o dilde yoksa açıkça söyle ve en yakın olasılığı öner. Çekimli ya da
  yanlış yazılmış bir biçim gelirse önce sözlük biçimini söyle.` + memory
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
  memory: string,
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
        systemInstruction: { parts: [{ text: systemPrompt(language, memory) }] },
        contents: messages.map((message) => ({
          role: message.role,
          parts: [{ text: message.text }],
        })),
        generationConfig: { temperature: 0.6, maxOutputTokens: 1600 },
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
  memory: string,
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
        temperature: 0.6,
        max_tokens: 1600,
        messages: [
          { role: "system", content: systemPrompt(language, memory) },
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
  memory = "",
  signal,
  onDelta,
}: StreamOptions): Promise<string> {
  if (!apiKey) throw new ChatError("Önce API anahtarını gir.");
  if (!baseUrl) throw new ChatError("Sağlayıcı adresi boş.");
  if (!model) throw new ChatError("Model seçilmedi.");

  const trimmedBase = baseUrl.replace(/\/$/, "");
  const [url, init] =
    provider.kind === "gemini"
      ? geminiRequest(trimmedBase, model, apiKey, messages, language, memory)
      : openaiRequest(trimmedBase, model, apiKey, messages, language, memory);

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
