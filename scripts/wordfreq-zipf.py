"""
Verilen kelimelerin Almanca ve Ingilizce siklik degerlerini (zipf) yazar.

build-wordbank.mjs bunu cagiriyor: derlemlerden cikan aday lemmalar stdin'den
satir satir geliyor, cikti stdout'a JSON olarak gidiyor.

Neden ayri bir adim: wordfreq bir Python paketi ve JavaScript karsiligi yok.
Siralamayi ona birakiyoruz cunku tek bir derlemin konusuna kaymayan, Wikipedia
+ altyazi + haber + kitap + web karisimi bir siklik veriyor.

Kurulum:  pip install wordfreq
"""

import json
import sys

try:
    from wordfreq import zipf_frequency
except ImportError:  # pragma: no cover
    sys.exit("wordfreq kurulu degil. Once: pip install wordfreq")

words = [line.strip() for line in sys.stdin if line.strip()]

out = {}
for word in words:
    de = zipf_frequency(word, "de")
    if de <= 0:
        continue
    out[word] = round(de, 2)
    # Ingilizce alintilari ayirt etmek icin ("Content", "Power", "College").
    en = zipf_frequency(word, "en")
    if en > 0:
        out[f"en:{word}"] = round(en, 2)

json.dump(out, sys.stdout, ensure_ascii=False)
