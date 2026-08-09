# Kelime Sözlüğü

**Canlı: <https://haydarsahin0.github.io/21/>**

Hedef dilde bir kelime yaz, ara — karşısında hem **Türkçe anlamı** hem de o
dilin kendi içindeki **tek dilli açıklaması** ve **eş anlamlıları** çıksın.

Örnek: `verstanden` yazdığında sözlük biçimini (`verstehen`) bulur, Almanca
tanımını (`den Sinn von etwas erfassen`), Türkçe karşılığını (`anlamak,
kavramak`) ve `begreifen` / `kapieren` gibi eş anlamlıları — her birinin
nüansı Türkçe açıklanmış halde — bir arada gösterir.

Arka planda [three.js](https://threejs.org) ile çalışan, fareye tepki veren
bir parçacık bulutsusu var.

## Kullanmak için

Kurulum yok. Siteyi aç, ilk açılışta kendi ücretsiz Gemini anahtarını yapıştır,
bitti. Telefondan da olur.

1. <https://aistudio.google.com/apikey> → Google hesabınla gir → “Create API key”.
2. Anahtarı kopyala, sitedeki kutuya yapıştır.

Kredi kartı istemiyor, günde 1.000 aramaya kadar ücretsiz.

**Anahtar nerede duruyor:** yalnızca kendi tarayıcının `localStorage`'ında.
Sitenin arkasında sunucu yok; istek doğrudan tarayıcından Google'a gidiyor,
başka hiçbir yere uğramıyor. Ortak kullanılan bir bilgisayardaysan Ayarlar'dan
alanı boşaltıp kaydederek anahtarı silebilirsin.

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
gezinerek öğrenmek için. Kelime defterine eklediklerini Anki'ye alınabilen TSV
olarak indirebilirsin.

Desteklenen diller: Almanca, İngilizce, Fransızca, İspanyolca, İtalyanca,
Rusça, Arapça. Yenisini eklemek için `lib/dictionary.ts` içindeki `LANGUAGES`
nesnesine bir satır yazman yeterli.

## Kotanı nasıl uzatır

Her sonuç tarayıcıda saklanır. Aynı kelimeyi ikinci kez aradığında Google'a
hiç gidilmez — sonuç kartında “önbellekten” rozeti bunu gösterir. Tekrar
ederek çalıştığın için günlük 1.000 arama pratikte çok daha uzun yeter.

Ayarlar'dan model de değiştirebilirsin:

| Model | Günlük ücretsiz | Ne zaman |
|---|---|---|
| Flash-Lite | 1.000 | Varsayılan, günlük kullanım |
| Flash | 250 | Nadir kelimelerde daha isabetli |
| Pro | 100 | En zor kelimeler |

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # statik çıktı -> out/
npm run lint
npx tsc --noEmit
```

Site statik export ediliyor (`output: "export"`), sunucu tarafı kod yok.
Varsayılan branch'e her push'ta `.github/workflows/deploy.yml` çalışıp GitHub
Pages'e dağıtıyor.

## Yapı

```
app/
  page.tsx              ana sayfa (bulutsu arka planı + sözlük)
  demo/page.tsx         yalnız parçacık sahnesi
  globals.css           tema değişkenleri (shadcn)
components/
  dictionary.tsx        arama, sekmeler, kelime defteri
  result-card.tsx       sonuç kartı
  settings-panel.tsx    anahtar girişi ve model seçimi
  nebula-background.tsx cihaza göre parçacık sayısı seçer, SSR dışı yükler
  ui/                   shadcn bileşenleri + quantum-nebula.tsx
lib/
  dictionary.ts         tipler, diller
  llm.ts                sözlük promptu + cevap ayrıştırma (saf, ağ çağrısı yok)
  gemini.ts             tarayıcıdan Gemini çağrısı
  storage.ts            localStorage: anahtar, önbellek, geçmiş, kelime defteri
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

## Sunucu tarafında anahtar tutmak istersen

Bu sürüm bilerek statik: her kullanıcı kendi anahtarını getiriyor. Anahtarı
sunucuda tutan (ve kullanıcıdan hiç anahtar istemeyen) bir sürüm istersen
`python-v1/` altındaki FastAPI uygulaması tam olarak bunu yapıyor; Vercel'de
Next.js API rotasıyla aynısını kuran hâli de git geçmişinde duruyor.
