"""Duman testi: `python -m tests.smoke`

Gercek model saglayicisina gitmeden butun akisi dolasir. LLM cagrisi sahte bir
cevapla degistirilir, geri kalan her sey (JSON ayristirma, sema dogrulama,
onbellek, kelime defteri, disari aktarma) gercek kodla calisir.
"""

import asyncio
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import config  # noqa: E402

# Gecici veritabani: testin gercek verini kirletmemesi icin app'ten once ayarlanir.
_tmp = tempfile.TemporaryDirectory()
config.DB_PATH = Path(_tmp.name) / "test.db"
config.LLM_API_KEY = "test-key"

from fastapi.testclient import TestClient  # noqa: E402

from backend import llm, main  # noqa: E402
from backend.schema import LookupResult  # noqa: E402

MODEL_REPLY = """```json
{
  "word": "verstanden",
  "found": true,
  "lemma": "verstehen",
  "correction_note": "Yazdigin bicim 'verstehen' fiilinin Partizip II hali.",
  "ipa": "/fɛɐ̯ˈʃteːən/",
  "part_of_speech": "Verb (fiil)",
  "cefr": "A2",
  "morphology": {"article": null, "plural": null,
                 "verb_forms": "verstehen - verstand - hat verstanden", "other": null},
  "turkish_meanings": ["anlamak", "kavramak"],
  "turkish_explanation": "Hem duyarak anlamak hem de zihnen kavramak icin kullanilir.",
  "native_definition": "den Sinn von etwas erfassen; geistig begreifen",
  "synonyms": [{"word": "begreifen", "note": "Daha cok zihinsel kavrayis vurgular."},
               {"word": "kapieren", "note": "Gunluk konusma dili, samimi."}],
  "antonyms": ["missverstehen"],
  "collocations": ["etwas falsch verstehen", "sich gut verstehen mit"],
  "examples": [
    {"sentence": "Ich habe die Frage nicht verstanden.", "translation": "Soruyu anlamadim."}
  ]
}
```"""

calls = {"count": 0}


async def fake_lookup(word: str, language: str) -> LookupResult:
    """llm.lookup'in ag cagrisi disindaki tum govdesini taklit eder."""
    calls["count"] += 1
    data = llm._normalize(llm._extract_json(MODEL_REPLY))
    data["word"] = word
    data["language"] = language
    return LookupResult.model_validate(data)


llm.lookup = fake_lookup
main.llm.lookup = fake_lookup


def check(label: str, condition: bool) -> None:
    print(f"{'PASS' if condition else 'FAIL'}  {label}")
    if not condition:
        sys.exit(1)


def run() -> None:
    with TestClient(main.app) as client:
        langs = client.get("/api/languages").json()
        check("diller listeleniyor", "de" in langs["languages"])

        res = client.get("/api/lookup", params={"word": "verstanden", "lang": "de"})
        check("arama 200 donuyor", res.status_code == 200)

        body = res.json()
        check("lemma cikarildi", body["lemma"] == "verstehen")
        check("Turkce karsilik geldi", "anlamak" in body["turkish_meanings"])
        check("hedef dilde tanim geldi", body["native_definition"].startswith("den Sinn"))
        check("es anlamli nuansi geldi", body["synonyms"][0]["note"].startswith("Daha cok"))
        check(
            "duz metin zit anlamli nesneye cevrildi",
            body["antonyms"][0] == {"word": "missverstehen", "note": ""},
        )
        check("null morfoloji alanlari bosaldi", body["morphology"]["article"] == "")
        check("ilk arama onbellekten gelmedi", body["cached"] is False)

        again = client.get("/api/lookup", params={"word": "VERSTANDEN ", "lang": "de"}).json()
        check("ikinci arama onbellekten geldi", again["cached"] is True)
        check("modele tekrar gidilmedi", calls["count"] == 1)

        client.get("/api/lookup", params={"word": "verstanden", "lang": "de", "refresh": "true"})
        check("refresh onbellegi atladi", calls["count"] == 2)

        bad = client.get("/api/lookup", params={"word": "test", "lang": "xx"})
        check("desteklenmeyen dil reddedildi", bad.status_code == 400)

        client.post(
            "/api/saved",
            json={"word": "verstehen", "language": "de", "turkish": "anlamak"},
        )
        saved = client.get("/api/saved", params={"lang": "de"}).json()
        check("kelime deftere eklendi", saved[0]["word"] == "verstehen")

        export = client.get("/api/saved/export", params={"lang": "de"})
        check("TSV disari aktarildi", export.text.strip() == "verstehen\tanlamak")

        client.delete("/api/saved", params={"word": "verstehen", "lang": "de"})
        check("kelime defterden silindi", client.get("/api/saved").json() == [])

        recent = client.get("/api/recent").json()
        check("gecmis kaydedildi", recent[0]["word"] == "verstanden")

        page = client.get("/")
        check("arayuz servis ediliyor", "Kelime Sözlüğü" in page.text)

    print("\nHepsi gecti.")


def check_json_parsing() -> None:
    """Saglayicilarin sik yaptigi bicim sapmalari tolere ediliyor mu?"""
    check("citli JSON ayrisiyor", llm._extract_json('```json\n{"a": 1}\n```') == {"a": 1})
    check("ciplak JSON ayrisiyor", llm._extract_json('{"a": 1}') == {"a": 1})
    check(
        "on sozlu cevaptan JSON cikariliyor",
        llm._extract_json('Iste sonuc: {"a": 1} umarim yardimci olur') == {"a": 1},
    )
    check(
        "metin listesi nesneye cevriliyor",
        llm._normalize({"synonyms": ["x"]})["synonyms"] == [{"word": "x", "note": ""}],
    )
    check(
        "tek metin anlam listeye cevriliyor",
        llm._normalize({"turkish_meanings": "anlamak"})["turkish_meanings"] == ["anlamak"],
    )

    try:
        llm._extract_json("burada hic JSON yok")
        check("JSON yoksa hata veriyor", False)
    except llm.LLMError:
        check("JSON yoksa hata veriyor", True)


if __name__ == "__main__":
    check_json_parsing()
    run()
