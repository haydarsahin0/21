# Kelime Sözlüğü

Hedef dilde bir kelime yaz, ara — karşısında hem **Türkçe anlamı** hem de o
dilin kendi içindeki **tek dilli açıklaması** ve **eş anlamlıları** çıksın.

Örnek: `verstanden` yazdığında sözlük biçimini (`verstehen`) bulur, Almanca
tanımını (`den Sinn von etwas erfassen`), Türkçe karşılığını (`anlamak,
kavramak`) ve `begreifen` / `kapieren` gibi eş anlamlıları — her birinin
nüansı Türkçe açıklanmış halde — bir arada gösterir.

Arka planda [three.js](https://threejs.org) ile çalışan, fareye tepki veren
bir parçacık bulutsusu var.

## Ne veriyor

| Alan | Örnek |
|---|---|
| Sözlük biçimi (lemma) | `verstanden` yazdın → `verstehen` |
| Türkçe karşılıklar | anlamak, kavramak |
| Türkçe kullanım notu | nerede, nasıl kullanılır |
| **Hedef dilde tanım** | `den Sinn von etwas geistig erfassen` |
| Eş anlamlılar + nüans | `begreifen` — daha çok zihinsel kavrayışı vurgular |
| Zıt anlamlılar | `missverstehen` |
| Sık kullanılan kalıplar | `sich gut verstehen mit` |
| Örnek cümleler + çeviri | — |
| Biçim bilgisi | artikel, çoğul, fiil çekimleri |
| CEFR seviyesi | A2 |

Eş/zıt anlamlı kelimelere tıklayınca doğrudan o kelime aranır — kelime ağında
gezinerek öğrenmek için.

Desteklenen diller: Almanca, İngilizce, Fransızca, İspanyolca, İtalyanca,
Rusça, Arapça. Yenisini eklemek için `lib/dictionary.ts` içindeki `LANGUAGES`
nesnesine bir satır yazman yeterli.

## Maliyet: sıfır

Uygulama OpenAI-uyumlu herhangi bir endpoint'le konuşur, yani ücretsiz
sağlayıcıların hepsi çalışır:

| Sağlayıcı | Ücretsiz limit | Not |
|---|---|---|
| **Google Gemini** (varsayılan) | Flash-Lite ile 1.000 istek/gün | Kredi kartı istemiyor |
| **Groq** | 1.000 istek/gün | Çok hızlı |
| **OpenRouter** | 50/gün (10 $ kredi yatırılmışsa 1.000/gün) | `:free` modeller |
| **Ollama** | Sınırsız | Tamamen lokal, internetsiz çalışır |

Her sonuç tarayıcıda `localStorage`'a yazılır. Aynı kelimeyi ikinci kez
aradığında modele hiç gidilmez ("önbellekten" rozeti bunu gösterir), yani
günlük kota pratikte çok daha uzun yeter. Kelime defteri de aynı yerde durur —
sunucuda veritabanı yok, dolayısıyla Vercel'in ücretsiz katmanı yeterli.

## Kurulum

```bash
git clone https://github.com/haydarsahin0/21.git
cd 21
npm install

cp .env.example .env.local     # LLM_API_KEY satırına anahtarını yaz
npm run dev
```

<http://localhost:3000> aç. Anahtarı <https://aistudio.google.com/apikey>
adresinden ücretsiz alabilirsin.

### Canlıya alma (Vercel, ücretsiz)

1. Depoyu GitHub'a push et.
2. <https://vercel.com/new> → depoyu seç.
3. Environment Variables bölümüne `LLM_API_KEY` (ve istersen `LLM_BASE_URL`,
   `LLM_MODEL`) ekle.
4. Deploy. Ayar gerekmiyor; Next.js otomatik algılanır.

### Sağlayıcı değiştirme

`.env.local` içindeki üç satırı değiştir, kodda hiçbir şeye dokunma:

```bash
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
LLM_API_KEY=gsk_...
```

## Yapı

```
app/
  page.tsx              ana sayfa (bulutsu arka planı + sözlük)
  demo/page.tsx         yalnız parçacık sahnesi
  api/lookup/route.ts   sunucu tarafı model çağrısı (anahtar burada kalır)
  globals.css           tema değişkenleri (shadcn)
components/
  dictionary.tsx        arama, sekmeler, kelime defteri
  result-card.tsx       sonuç kartı
  nebula-background.tsx cihaza göre parçacık sayısı seçer, SSR dışı yükler
  ui/                   shadcn bileşenleri + quantum-nebula.tsx
lib/
  dictionary.ts         tipler, diller
  llm.ts                OpenAI-uyumlu çağrı + sözlük promptu
  storage.ts            localStorage: önbellek, geçmiş, kelime defteri
python-v1/              ilk sürüm (FastAPI + düz HTML). Artık gerekli değil.
```

`components/ui/` yolu şart: `components.json` içindeki `aliases.ui` oraya
işaret ediyor, `npx shadcn@latest add <bileşen>` komutu dosyaları oraya yazıyor
ve bileşenler birbirini `@/components/ui/...` olarak import ediyor. Klasörü
taşırsan bu üçünü birlikte güncellemen gerekir.

## Parçacık arka planı hakkında

`components/ui/quantum-nebula.tsx` içindeki simülasyon **CPU'da** dönüyor.
Maliyeti parçacık sayısıyla doğru orantılı — ölçüm: 50.000 parçacık için
kare başına ~7,5 ms, yani 60 fps bütçesinin yaklaşık yarısı.

`components/nebula-background.tsx` bu yüzden sayıyı cihaza göre seçiyor:
telefonda 8.000, az çekirdekli makinede 20.000, geri kalanda 50.000. Sabit bir
değer istiyorsan bileşene `particleCount` prop'u ver.

`prefers-reduced-motion: reduce` açıkken tek kare çizilip animasyon durur.

## Testler

```bash
npm run lint      # ESLint + React derleyici kuralları
npx tsc --noEmit  # tip kontrolü
npm run build     # üretim derlemesi
```
