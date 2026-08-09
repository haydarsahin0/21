# Kelime Sözlüğü

**Canlı: <https://haydarsahin0.github.io/21/>**

Hedef dilde bir kelime yaz, **sohbet ederek adım adım aç**.

Uygulama bilgiyi toptan vermiyor. `verstehen` yazdığında önce yalnızca Türkçe
karşılığını ve nerede kullanıldığını söyler, sonra durur ve sana sorar. Almanca
tanımını, eş anlamlıları ve nüanslarını, örnek cümleleri, çekimleri ancak sen
istedikçe getirir — her adım ayrı bir mesaj olarak, yazılırken akarak gelir.
Aradan sonra kendi sorunu da sorabilirsin; model konuştuğunuz kelimeyi
hatırlıyor.

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

İlk cevaptan sonra altta hazır adım düğmeleri çıkar; birine basmak sohbeti o
yöne götürür:

| Adım | Ne gelir |
|---|---|
| Bu dilde nasıl tanımlanır? | Hedef dilin kendi içinde, tek dilli tanım |
| Eş anlamlıları | En fazla üç tane, her birinin nüansı Türkçe açıklanmış |
| Örnek cümle | İki cümle + Türkçe çevirileri |
| Sık kullanılan kalıplar | `sich gut verstehen mit` gibi birliktelikler |
| Çekimleri / biçim bilgisi | Artikel, çoğul, fiil çekimleri |
| Beni sınav et | Tek soru sorar ve cevabını bekler |

Düğmeleri kullanmak zorunda değilsin — kendi sorunu da yazabilirsin.
Konuştuğun kelimeyi tek tuşla kelime defterine ekleyebilir, defteri Anki'ye
alınabilen TSV olarak indirebilirsin.

Desteklenen diller: Almanca, İngilizce, Fransızca, İspanyolca, İtalyanca,
Rusça, Arapça. Yenisini eklemek için `lib/dictionary.ts` içindeki `LANGUAGES`
nesnesine bir satır yazman yeterli.

## Kota

Ücretsiz katmanda günlük sınır **mesaj başına** işler; sohbetin her adımı bir
mesaj sayılır. Ayarlar'dan model değiştirebilirsin:

| Model | Günlük ücretsiz | Ne zaman |
|---|---|---|
| Flash-Lite | 1.000 | Varsayılan, günlük kullanım |
| Flash | 250 | Nadir kelimelerde daha isabetli |
| Pro | 100 | En zor kelimeler |

Cevaplar akış halinde geldiği için uzun bir cevabı beklemek zorunda değilsin;
istediğin an **Durdur**'a basabilirsin, o ana kadar gelen metin sohbette kalır.

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # statik çıktı -> out/
npm run lint
npx tsc --noEmit
```

Site statik export ediliyor (`output: "export"`), sunucu tarafı kod yok.
Varsayılan branch'e her push'ta `.github/workflows/deploy.yml` çalışır, çıktıyı
`gh-pages` branch'ine yazar ve GitHub Pages oradan yayınlar.

Not: `actions/configure-pages` ile Pages'i otomatik açmak denendi ama
`GITHUB_TOKEN` "create pages site" çağrısını yapamıyor (*Resource not
accessible by integration*). `gh-pages` branch'ine push etmek hem bu yetkiyi
gerektirmiyor hem de ilk push'ta Pages'i kendiliğinden açıyor.

## Yapı

```
app/
  page.tsx              ana sayfa (bulutsu arka planı + sohbet)
  demo/page.tsx         yalnız parçacık sahnesi
  globals.css           tema değişkenleri (shadcn)
  ai-input/page.tsx     yalnız MorphPanel (Ask AI) bileşeni
components/
  dictionary.tsx        sekmeler, dil seçimi, kelime defteri
  chat.tsx              sohbet akışı, adım düğmeleri, durdurma
  settings-panel.tsx    anahtar girişi ve model seçimi
  nebula-background.tsx cihaza göre parçacık sayısı seçer, SSR dışı yükler
  ui/                   shadcn bileşenleri + quantum-nebula.tsx + ai-input.tsx
lib/
  dictionary.ts         diller, model listesi
  chat.ts               sohbet promptu + Gemini SSE akışı
  storage.ts            localStorage: anahtar, dil, kelime defteri
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
