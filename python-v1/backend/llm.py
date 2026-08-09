"""OpenAI-uyumlu bir endpoint'e sozluk sorgusu atan katman.

Gemini, Groq, OpenRouter ve Ollama'nin hepsi ayni /chat/completions sozlesmesini
konustugu icin tek kod yolu yeterli; saglayici degistirmek .env'de uc satir.
"""

import json
import re

import httpx

from . import config
from .schema import LookupResult

SYSTEM_PROMPT = """Sen deneyimli bir sozlukbilimci ve dil ogretmenisin.
Kullanici sana {lang_name} ({lang_native}) dilinde tek bir kelime verecek.
Turkce konusan bir ogrenci icin o kelimenin tam kaydini hazirlayacaksin.

Kurallar:
- SADECE gecerli JSON dondur. Markdown kod bloklari, aciklama, on soz yazma.
- "turkish_meanings", "turkish_explanation" ve butun "note" alanlari TURKCE olacak.
- "native_definition" alani {lang_native} dilinde, o dilin tek dilli sozlugundeki
  gibi yazilacak. Turkce ceviri degil, hedef dilde gercek bir tanim olacak.
- "synonyms" icindeki her kelimenin "note" alaninda, o es anlamlinin asil
  kelimeden hangi nuansla ayrildigini Turkce olarak tek cumleyle acikla.
  Ayni anlama gelen iki kelimeyi farksizmis gibi gosterme.
- Kullanici cekimli/turemis bir bicim yazarsa ("verstanden", "Haeuser"), "lemma"
  alanina sozluk bicimini koy ve "correction_note" ile Turkce olarak durumu belirt.
- Yazim hatasi varsa en olasi dogru kelimeyi "lemma" yap ve yine not dus.
- Kelime o dilde gercekten yoksa {{"found": false, "word": "...", "correction_note":
  "Turkce aciklama"}} dondur.
- "morphology" alanini dile gore doldur: isimlerde artikel ve cogul, fiillerde
  temel cekimler, sifatlarda karsilastirma bicimleri. Ilgisiz alanlari bos birak.
- "cefr" alanina A1/A2/B1/B2/C1/C2 seviyelerinden birini yaz.
- "collocations" alanina kelimenin gercekten sik gectigi kalip ve birliktelikleri
  yaz (ornegin fiil + edat). Ezber icin en degerli kisim burasidir.
- 2-3 ornek cumle ver, her birinin Turkce cevirisiyle.

Doner JSON semasi:
{{
  "word": "kullanicinin yazdigi kelime",
  "found": true,
  "lemma": "sozluk bicimi",
  "correction_note": "",
  "ipa": "/.../",
  "part_of_speech": "hedef dilde tur + parantez icinde Turkcesi",
  "cefr": "B1",
  "morphology": {{"article": "", "plural": "", "verb_forms": "", "other": ""}},
  "turkish_meanings": ["anlam 1", "anlam 2"],
  "turkish_explanation": "kelimenin nerede, nasil kullanildigina dair Turkce not",
  "native_definition": "hedef dilde tanim",
  "synonyms": [{{"word": "...", "note": "Turkce nuans aciklamasi"}}],
  "antonyms": [{{"word": "...", "note": "Turkce not"}}],
  "collocations": ["kalip 1", "kalip 2"],
  "examples": [{{"sentence": "hedef dilde cumle", "translation": "Turkce ceviri"}}]
}}"""


class LLMError(RuntimeError):
    """Saglayiciya ulasilamadi ya da cevap ayristirilamadi."""


def _normalize(data: dict) -> dict:
    """Modelin serbestce urettigi JSON'u semanin bekledigi bicime cekiyor.

    Iki yaygin sapmayi tolere ediyoruz: null gonderilen alanlar (pydantic'te
    varsayilan degil hata olurdu) ve nesne yerine duz metin listesi olarak gelen
    es/zit anlamlilar.
    """
    data = {k: v for k, v in data.items() if v is not None}

    for key in ("synonyms", "antonyms"):
        items = data.get(key)
        if isinstance(items, list):
            data[key] = [
                {"word": item, "note": ""} if isinstance(item, str) else item
                for item in items
                if item
            ]

    examples = data.get("examples")
    if isinstance(examples, list):
        data["examples"] = [
            {"sentence": item, "translation": ""} if isinstance(item, str) else item
            for item in examples
            if item
        ]

    morphology = data.get("morphology")
    if isinstance(morphology, dict):
        data["morphology"] = {k: v for k, v in morphology.items() if v is not None}
    elif morphology is not None and not isinstance(morphology, dict):
        data.pop("morphology", None)

    meanings = data.get("turkish_meanings")
    if isinstance(meanings, str):
        data["turkish_meanings"] = [meanings]

    return data


def _extract_json(text: str) -> dict:
    """Modelin cevabindan JSON govdesini cikarir.

    Bazi modeller istenmese de ```json citleri ekliyor ya da tanimin onune bir
    cumle yaziyor; ikisini de tolere ediyoruz.
    """
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise LLMError(f"Model gecerli JSON dondurmedi: {exc}") from exc

    raise LLMError("Model cevabinda JSON bulunamadi.")


async def lookup(word: str, language: str) -> LookupResult:
    if not config.LLM_API_KEY:
        raise LLMError(
            "LLM_API_KEY tanimli degil. .env.example dosyasini .env olarak "
            "kopyalayip anahtarini yaz."
        )

    lang = config.LANGUAGES[language]
    system = SYSTEM_PROMPT.format(lang_name=lang["name"], lang_native=lang["native"])

    payload = {
        "model": config.LLM_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": word},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {config.LLM_API_KEY}",
        "Content-Type": "application/json",
    }

    url = f"{config.LLM_BASE_URL}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise LLMError(f"Saglayiciya ulasilamadi: {exc}") from exc

    if response.status_code == 429:
        raise LLMError(
            "Gunluk ucretsiz kota doldu (429). Yarin tekrar dene ya da .env'den "
            "baska bir saglayiciya gec."
        )
    if response.status_code >= 400:
        raise LLMError(f"Saglayici {response.status_code} dondu: {response.text[:300]}")

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise LLMError(f"Beklenmeyen cevap bicimi: {exc}") from exc

    data = _normalize(_extract_json(content))
    data["word"] = data.get("word") or word
    data["language"] = language

    # Modelin uydurdugu fazladan alanlar sessizce dusuyor, eksikler varsayilana
    # donuyor; arayuz her zaman ayni sekli goruyor.
    return LookupResult.model_validate(data)
