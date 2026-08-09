import {
  EMPTY_MORPHOLOGY,
  LANGUAGES,
  type LanguageCode,
  type LookupResult,
  type Term,
} from "./dictionary";

/**
 * Sunucu tarafi model cagrisi.
 *
 * Gemini, Groq, OpenRouter ve Ollama'nin hepsi ayni OpenAI /chat/completions
 * sozlesmesini konusuyor, bu yuzden saglayici degistirmek uc ortam degiskeni.
 * Anahtar yalniz sunucuda okunuyor; tarayiciya hicbir zaman gitmiyor.
 */
const BASE_URL = (
  process.env.LLM_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta/openai"
).replace(/\/$/, "");
const MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash-lite";
const API_KEY = process.env.LLM_API_KEY ?? "";

export class LLMError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function systemPrompt(language: LanguageCode): string {
  const { name, native } = LANGUAGES[language];
  return `Sen deneyimli bir sözlükbilimci ve dil öğretmenisin.
Kullanıcı sana ${name} (${native}) dilinde tek bir kelime verecek.
Türkçe konuşan bir öğrenci için o kelimenin tam kaydını hazırlayacaksın.

Kurallar:
- SADECE geçerli JSON döndür. Markdown kod blokları, açıklama, ön söz yazma.
- "turkishMeanings", "turkishExplanation" ve bütün "note" alanları TÜRKÇE olacak.
- "nativeDefinition" alanı ${native} dilinde, o dilin tek dilli sözlüğündeki gibi
  yazılacak. Türkçe çeviri değil, hedef dilde gerçek bir tanım olacak.
- "synonyms" içindeki her kelimenin "note" alanında, o eş anlamlının asıl
  kelimeden hangi nüansla ayrıldığını Türkçe olarak tek cümleyle açıkla.
  Aynı anlama gelen iki kelimeyi farksızmış gibi gösterme.
- Kullanıcı çekimli/türemiş bir biçim yazarsa, "lemma" alanına sözlük biçimini
  koy ve "correctionNote" ile Türkçe olarak durumu belirt.
- Yazım hatası varsa en olası doğru kelimeyi "lemma" yap ve yine not düş.
- Kelime o dilde gerçekten yoksa {"found": false, "word": "...", "correctionNote":
  "Türkçe açıklama"} döndür.
- "morphology" alanını dile göre doldur: isimlerde artikel ve çoğul, fiillerde
  temel çekimler, sıfatlarda karşılaştırma biçimleri. İlgisiz alanları boş bırak.
- "cefr" alanına A1/A2/B1/B2/C1/C2 seviyelerinden birini yaz.
- "collocations" alanına kelimenin gerçekten sık geçtiği kalıpları yaz.
- 2-3 örnek cümle ver, her birinin Türkçe çevirisiyle.

Dönen JSON şeması:
{
  "word": "kullanıcının yazdığı kelime",
  "found": true,
  "lemma": "sözlük biçimi",
  "correctionNote": "",
  "ipa": "/.../",
  "partOfSpeech": "hedef dilde tür + parantez içinde Türkçesi",
  "cefr": "B1",
  "morphology": {"article": "", "plural": "", "verbForms": "", "other": ""},
  "turkishMeanings": ["anlam 1", "anlam 2"],
  "turkishExplanation": "kelimenin nerede, nasıl kullanıldığına dair Türkçe not",
  "nativeDefinition": "hedef dilde tanım",
  "synonyms": [{"word": "...", "note": "Türkçe nüans açıklaması"}],
  "antonyms": [{"word": "...", "note": "Türkçe not"}],
  "collocations": ["kalıp 1", "kalıp 2"],
  "examples": [{"sentence": "hedef dilde cümle", "translation": "Türkçe çeviri"}]
}`;
}

/**
 * Modelin cevabindan JSON govdesini cikarir. Bazi modeller istenmese de ```json
 * citleri ekliyor ya da tanimin onune bir cumle yaziyor; ikisini de tolere ediyoruz.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]+?)\s*```/.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // devam: gomulu nesneyi aramaya calis
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch (error) {
      throw new LLMError(`Model geçerli JSON döndürmedi: ${String(error)}`);
    }
  }

  throw new LLMError("Model cevabında JSON bulunamadı.");
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asStringArray = (value: unknown): string[] => {
  if (typeof value === "string") return value ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

/** Model bazen nesne yerine duz metin listesi donduruyor; ikisini de kabul et. */
const asTerms = (value: unknown): Term[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Term[] => {
    if (typeof item === "string") return item ? [{ word: item, note: "" }] : [];
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const word = asString(record.word);
      return word ? [{ word, note: asString(record.note) }] : [];
    }
    return [];
  });
};

export function normalizeResult(
  raw: unknown,
  word: string,
  language: LanguageCode,
): LookupResult {
  const data = (raw ?? {}) as Record<string, unknown>;
  const morphologyRaw = (
    data.morphology && typeof data.morphology === "object"
      ? data.morphology
      : {}
  ) as Record<string, unknown>;

  const examplesRaw = Array.isArray(data.examples) ? data.examples : [];

  return {
    word: asString(data.word) || word,
    language,
    found: data.found !== false,
    lemma: asString(data.lemma),
    correctionNote: asString(data.correctionNote),
    ipa: asString(data.ipa),
    partOfSpeech: asString(data.partOfSpeech),
    cefr: asString(data.cefr),
    morphology: {
      ...EMPTY_MORPHOLOGY,
      article: asString(morphologyRaw.article),
      plural: asString(morphologyRaw.plural),
      verbForms: asString(morphologyRaw.verbForms),
      other: asString(morphologyRaw.other),
    },
    turkishMeanings: asStringArray(data.turkishMeanings),
    turkishExplanation: asString(data.turkishExplanation),
    nativeDefinition: asString(data.nativeDefinition),
    synonyms: asTerms(data.synonyms),
    antonyms: asTerms(data.antonyms),
    collocations: asStringArray(data.collocations),
    examples: examplesRaw.flatMap((item) => {
      if (typeof item === "string") return [{ sentence: item, translation: "" }];
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const sentence = asString(record.sentence);
        return sentence
          ? [{ sentence, translation: asString(record.translation) }]
          : [];
      }
      return [];
    }),
  };
}

export async function lookupWord(
  word: string,
  language: LanguageCode,
): Promise<LookupResult> {
  if (!API_KEY) {
    throw new LLMError(
      "LLM_API_KEY tanımlı değil. .env.local dosyasına anahtarını ekle.",
      500,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt(language) },
          { role: "user", content: word },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    throw new LLMError(`Sağlayıcıya ulaşılamadı: ${String(error)}`);
  }

  if (response.status === 429) {
    throw new LLMError(
      "Günlük ücretsiz kota doldu (429). Yarın tekrar dene ya da başka bir sağlayıcıya geç.",
      429,
    );
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new LLMError(`Sağlayıcı ${response.status} döndü: ${detail}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMError("Sağlayıcıdan boş cevap geldi.");
  }

  return normalizeResult(extractJson(content), word, language);
}
