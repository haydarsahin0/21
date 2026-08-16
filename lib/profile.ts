"use client";

import { streamChat, type ChatMessage } from "./chat";
import type { LanguageCode } from "./dictionary";
import { listFacts, saveFacts, type FactKind } from "./memory";
import type { Provider } from "./providers";

/**
 * Profil cikarimi.
 *
 * Sohbet ilerledikce modelden, konusmadan ogrenci hakkinda cikarim yapmasini
 * istiyoruz. Sonuc IndexedDB'ye yaziliyor ve sonraki sohbetlerde sistem
 * promptuna geri veriliyor — sistemin "seni tanimasi" bu donguden geliyor.
 *
 * Ek bir model cagrisi oldugu icin her mesajda degil, birkac turda bir
 * calisiyor; kota bosa harcanmasin.
 */

const VALID_KINDS: FactKind[] = [
  "seviye",
  "ilgi",
  "zorlandigi",
  "tarz",
  "hedef",
  "diger",
];

/** Kac asistan cevabinda bir profil guncellensin. */
export const EXTRACT_EVERY = 3;

const EXTRACT_PROMPT = `Yukarıdaki konuşmayı okudun. Şimdi öğretmen olarak
kenara not al: bu öğrenci hakkında konuşmadan ÇIKARDIĞIN yeni bilgiler neler?

Sadece konuşmada gerçekten görünen şeyleri yaz. Uydurma, tahmin yürütme.
Zaten bildiğin ve aşağıda listelenen bir şeyi tekrar yazma.

Şu türlerden birini kullan:
- seviye: dil seviyesine dair işaretler (hangi yapıları biliyor/bilmiyor)
- ilgi: ilgi alanları, mesleği, konuştuğu bağlamlar
- zorlandigi: tekrar tekrar takıldığı nokta, yaptığı hata tipi
- tarz: nasıl öğrenmeyi sevdiği (kısa mı ister, örnek mi ister, soru mu sever)
- hedef: ne için öğreniyor (sınav, iş, seyahat...)
- diger

SADECE JSON dizisi döndür, başka hiçbir şey yazma. Yeni bir şey yoksa []
döndür. En fazla 4 not. Biçim:
[{"kind":"ilgi","text":"Yazılım alanında çalışıyor, teknik yazışma örnekleri istiyor"}]`;

interface ExtractOptions {
  messages: ChatMessage[];
  language: LanguageCode;
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

function parseFacts(raw: string): { kind: FactKind; text: string }[] {
  const match = /\[[\s\S]*\]/.exec(raw);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text || text.length > 200) return [];
      const kindRaw = typeof record.kind === "string" ? record.kind : "diger";
      const kind = (VALID_KINDS as string[]).includes(kindRaw)
        ? (kindRaw as FactKind)
        : "diger";
      return [{ kind, text }];
    });
  } catch {
    return [];
  }
}

/**
 * Konusmadan profil notu cikarir ve saklar. Hata durumunda sessizce vazgecer:
 * bu arka plan isi, sohbeti bozmamali.
 */
export async function extractProfile({
  messages,
  language,
  provider,
  baseUrl,
  apiKey,
  model,
}: ExtractOptions): Promise<number> {
  if (!apiKey) return 0;

  try {
    const known = await listFacts(language);
    const knownBlock = known.length
      ? `\n\nZaten bildiklerin:\n${known.map((f) => `- ${f.text}`).join("\n")}`
      : "";

    // Son birkac tur yeterli; butun gecmisi gondermek kotayi bosa harcar.
    const recent = messages.slice(-8);

    let output = "";
    await streamChat({
      messages: [...recent, { role: "user", text: EXTRACT_PROMPT + knownBlock }],
      language,
      provider,
      baseUrl,
      apiKey,
      model,
      onDelta: (chunk) => {
        output += chunk;
      },
    });

    const facts = parseFacts(output);
    if (!facts.length) return 0;

    await saveFacts(facts, language);
    return facts.length;
  } catch {
    return 0;
  }
}
