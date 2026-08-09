# Kelime Sözlüğü

Hedef dilde bir kelime yaz, ara — karşısında hem **Türkçe anlamı** hem de o
dilin kendi içindeki **tek dilli açıklaması** ve **eş anlamlıları** çıksın.

Örnek: `verstehen` yazdığında Almanca açıklaması (`den Sinn von etwas
erfassen`), Türkçe karşılığı (`anlamak, kavramak`) ve `begreifen` / `kapieren`
gibi eş anlamlıları — her birinin aradaki nüansı Türkçe açıklanmış halde — bir
arada gelir.

<!-- Ekran görüntüsü için: uygulamayı çalıştırıp bir kelime ara. -->

## Ne veriyor

Her arama şu alanları döndürür:

| Alan | Örnek |
|---|---|
| Sözlük biçimi (lemma) | `verstanden` yazdın → `verstehen` |
| Türkçe karşılıklar | anlamak, kavramak |
| Türkçe kullanım notu | nerede, nasıl kullanılır |
| **Hedef dilde tanım** | `den Sinn von etwas erfassen; geistig begreifen` |
| Eş anlamlılar + nüans | `begreifen` — daha çok zihinsel kavrayışı vurgular |
| Zıt anlamlılar | `missverstehen` |
| Sık kullanılan kalıplar | `sich gut verstehen mit` |
| Örnek cümleler + çeviri | — |
| Biçim bilgisi | artikel, çoğul, fiil çekimleri |
| CEFR seviyesi | A2 |

Eş/zıt anlamlı kelimelere tıklayınca doğrudan o kelime aranır — kelime ağında
gezinerek öğrenmek için.

Desteklenen diller: Almanca, İngilizce, Fransızca, İspanyolca, İtalyanca,
Rusça, Arapça. Yenisini eklemek için `backend/config.py` içindeki `LANGUAGES`
sözlüğüne bir satır yazman yeterli.

## Maliyet: sıfır

Uygulama OpenAI-uyumlu herhangi bir endpoint'le konuşur, yani ücretsiz
sağlayıcıların hepsi çalışır:

| Sağlayıcı | Ücretsiz limit | Not |
|---|---|---|
| **Google Gemini** (varsayılan) | Flash-Lite ile 1.000 istek/gün | Kredi kartı istemiyor |
| **Groq** | 1.000 istek/gün | Çok hızlı |
| **OpenRouter** | 50/gün (10 $ kredi yatırılmışsa 1.000/gün) | `:free` modeller |
| **Ollama** | Sınırsız | Tamamen lokal, internetsiz çalışır |

Ayrıca her sonuç SQLite'a yazılır. Aynı kelimeyi ikinci kez aradığında API'ye
hiç gidilmez, yani günlük kota pratikte çok daha uzun yeter.

## Kurulum

```bash
git clone https://github.com/haydarsahin0/21.git
cd 21

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
```

`.env` dosyasını aç, `LLM_API_KEY` satırına anahtarını yaz. Gemini anahtarını
<https://aistudio.google.com/apikey> adresinden ücretsiz alabilirsin.

Çalıştır:

```bash
uvicorn backend.main:app --reload
```

Tarayıcıda <http://127.0.0.1:8000> aç.

### Sağlayıcı değiştirme

`.env` içindeki üç satırı değiştirmen yeterli — kodda hiçbir şeye dokunma:

```bash
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
LLM_API_KEY=gsk_...
```

`.env.example` dosyasında Gemini, Groq, OpenRouter ve Ollama için hazır
bloklar var.

## Testler

Gerçek model sağlayıcısına gitmeden bütün akışı dolaşır:

```bash
python -m tests.smoke
```

## Yapı

```
backend/
  config.py   ayarlar + desteklenen diller
  schema.py   sonucun veri modeli
  llm.py      OpenAI-uyumlu çağrı + sözlük promptu
  store.py    SQLite: önbellek, geçmiş, kelime defteri
  main.py     FastAPI uçları + statik arayüz
frontend/
  index.html  arama ekranı + kelime defteri sekmesi
  style.css   açık/koyu tema
  app.js      arama, kaydetme, zincirleme arama
tests/
  smoke.py    uçtan uca duman testi
```

## API

| Uç | Açıklama |
|---|---|
| `GET /api/lookup?word=&lang=&refresh=` | Kelime araması |
| `GET /api/languages` | Desteklenen diller |
| `GET /api/recent?limit=` | Son aramalar |
| `GET /api/saved?lang=` | Kelime defteri |
| `POST /api/saved` | Deftere ekle |
| `DELETE /api/saved?word=&lang=` | Defterden sil |
| `GET /api/saved/export?lang=` | Anki'ye alınabilir TSV |

## Sıradaki adımlar

Bu iskeletin üzerine eklenmesi doğal olan şeyler:

- **Aralıklı tekrar (SM-2/FSRS)** — kelime defterine `next_review` ve `ease`
  kolonları ekleyip günlük tekrar listesi çıkarmak
- **Quiz modu** — defterdeki kelimelerden çoktan seçmeli soru üretmek
- **Telaffuz** — tarayıcının `speechSynthesis` API'siyle kelimeyi seslendirmek
- **Toplu içe aktarma** — bir metin yapıştır, bilmediğin kelimeleri toplu ara
