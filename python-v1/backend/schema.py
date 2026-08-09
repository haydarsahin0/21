"""Sozluk sonucunun veri modeli.

Modelden donen JSON bu sekle zorlanir; eksik alanlar bos degerle doldurulur ki
arayuz her zaman ayni yapiyi gorsun.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class Term(BaseModel):
    """Es/zit anlamli bir kelime ve aradaki nuansin Turkce aciklamasi."""

    word: str
    note: str = ""


class Example(BaseModel):
    sentence: str
    translation: str = ""


class Morphology(BaseModel):
    """Dile ozgu bicim bilgisi. Almanca isimde artikel + cogul, fiilde cekim."""

    article: str = ""
    plural: str = ""
    verb_forms: str = ""
    other: str = ""


class LookupResult(BaseModel):
    word: str
    language: str
    found: bool = True

    # Kullanici cekimli hali yazdiysa ("verstanden") sozluk hali buraya gelir.
    lemma: str = ""
    correction_note: str = ""

    ipa: str = ""
    part_of_speech: str = ""
    cefr: str = ""

    morphology: Morphology = Field(default_factory=Morphology)

    turkish_meanings: List[str] = Field(default_factory=list)
    turkish_explanation: str = ""

    # Hedef dilin kendi icindeki tanimi (Almanca kelime -> Almanca aciklama).
    native_definition: str = ""

    synonyms: List[Term] = Field(default_factory=list)
    antonyms: List[Term] = Field(default_factory=list)
    collocations: List[str] = Field(default_factory=list)
    examples: List[Example] = Field(default_factory=list)

    # Sonuc onbellekten mi geldi? Arayuzde rozet olarak gosteriliyor.
    cached: bool = False


class SavedWord(BaseModel):
    word: str
    language: str
    turkish: str = ""
    created_at: Optional[str] = None
