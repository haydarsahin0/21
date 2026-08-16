# Kelime Sözlüğü

**Canlı: <https://haydarsahin0.github.io/21/>**

Hedef dilde bir kelime yaz, **öğretmenle konuşur gibi aç**.

Uygulama sözlük maddesi kopyalamıyor. `verstehen` yazdığında anlamını, nerede
ve hangi tonda kullanıldığını anlatır, örnek cümleyle gösterir — sonra sohbet
devam eder. Buradan istediğin yere gidebilirsin:

> “bunu resmi bir mailde kullanabilir miyim?”
> “begreifen'den farkı ne?”
> “kurduğum cümle doğru mu?”
> “bunu aklımda nasıl tutarım?”

Serbest soru sorman beklenen kullanım; hazır bir menüye sıkışmıyorsun. Model
konuştuğunuz kelimeyi hatırlıyor, cümlelerini düzeltiyor ve her açıklamasını
örnekle gösteriyor.

Cevaplar yazılırken ölçülü bir tempoda akıyor: hedef dildeki kelimeler kalın,
nüanslar eğik, örnekler ayrı satırda. Akış hızı kare sayısına değil geçen
zamana bağlı, yani yavaş bir telefonda metin sürünmüyor.

Konuştukça seni tanıyor: seviyeni, ilgi alanlarını, takıldığın noktaları not
alıyor ve sonraki sohbetlerde bunlara göre konuşuyor. Notların tamamı senin
cihazında kalıyor.

Arka planda [three.js](https://threejs.org) ile çalışan, fareye tepki veren
bir parçacık bulutsusu var.

## Kullanmak için

Kurulum yok. Siteyi aç, ilk açılışta bir sağlayıcı seçip kendi API anahtarını
yapıştır, bitti. Telefondan da olur.

**Anahtar nerede duruyor:** yalnızca kendi tarayıcının `localStorage`'ında.
Sitenin arkasında sunucu yok; istek doğrudan tarayıcından sağlayıcıya gidiyor,
başka hiçbir yere uğramıyor. Anahtarlar sağlayıcı başına ayrı tutuluyor, yani
aralarında geçiş yaparken tekrar girmen gerekmiyor. Ortak kullanılan bir
bilgisayardaysan Ayarlar'dan alanı boşaltıp kaydederek silebilirsin.

## Sağlayıcılar

İki sağlayıcı var, ikisi de OpenAI uyumlu `/chat/completions` konuşuyor:

| Sağlayıcı | Varsayılan model | Ücret |
|---|---|---|
| **DeepSeek** (varsayılan) | `deepseek-v4-flash` | Yeni hesaba 30 gün geçerli 5M token, sonrası kullandıkça öde — çok ucuz |
| **OpenAI (ChatGPT)** | `gpt-5.6-terra` | Kullandıkça öde; hesaba önceden bakiye yüklemek gerekiyor |

Anahtarlar sağlayıcı başına ayrı tutuluyor, yani aralarında geçiş yaparken
tekrar girmen gerekmiyor.

**Model alanı elle yazılabilir.** Kutuya dokununca öneriler çıkıyor ama
sağlayıcı yeni bir model çıkardığında uygulamanın güncellenmesini beklemeden
adını doğrudan yazabilirsin.

OpenAI'nin akıl yürütme modelleri `max_tokens` yerine `max_completion_tokens`
bekliyor; istek gövdesi sağlayıcıya göre bu alanı değiştiriyor
(`providers.ts` → `usesMaxCompletionTokens`).

DeepSeek model kimlikleri 24 Temmuz 2026'da değişti: `deepseek-chat` ve
`deepseek-reasoner` emekli oldu, yerlerine `deepseek-v4-flash` ve
`deepseek-v4-pro` geldi. Uygulama yenilerini kullanıyor.

### CORS uyarısı

Site statik olduğu için istek doğrudan tarayıcıdan gidiyor; bu yüzden bir
sağlayıcının çalışması **CORS izni vermesine** bağlı. DeepSeek'in tarayıcıdan
çalıştığı kullanımda doğrulandı. OpenAI'yi geliştirme ortamından ölçemedik
(ağ katmanı `api.openai.com`'a çıkışı engelliyor), yani tarayıcıdan doğrudan
çağrılabildiği **doğrulanmadı**.

Denediğinde “ulaşılamadı (CORS)” hatası alırsan o sağlayıcı tarayıcı
çağrılarına kapalı demektir; ayarlardan diğerine geç.

## Ne veriyor

Aklına bir şey gelmiyorsa altta hazır düğmeler var; birine basmak sohbeti o
yöne götürür:

| Düğme | Ne gelir |
|---|---|
| Daha fazla örnek cümle | Günlük / resmî / yazı dili — üç bağlam, ton farkıyla |
| Hangi durumlarda kullanılır? | Kiminle, nerede, hangi tonda doğal durur |
| Benzerlerinden farkı | Yakın kelimelerle fark, aynı cümlede karşılaştırmalı |
| Cümle kurayım, düzelt | Sana durum verir, cümleni düzeltir |
| Aklımda nasıl tutarım? | Köken ya da çağrışım + pekiştiren örnek |
| Beni sınav et | Soru sorar ve cevabını bekler |

Düğmeler sadece kolaylık — asıl kullanım kendi soruna yazmak.
Konuştuğun kelimeyi tek tuşla kelime defterine ekleyebilir, defteri Anki'ye
alınabilen TSV olarak indirebilirsin.

Desteklenen diller: Almanca, İngilizce, Fransızca, İspanyolca, İtalyanca,
Rusça, Arapça. Yenisini eklemek için `lib/dictionary.ts` içindeki `LANGUAGES`
nesnesine bir satır yazman yeterli.

## Çalış — aralıklı tekrar

Günlük hedef: **20 yeni kelime** (Ayarlar'dan değiştirilebilir).

1. **Yeni kelime getir** — model, hafızandaki seviyene ve ilgi alanına göre
   daha önce görmediğin kelimeler önerir, tek tek öğretir.
2. Öğrenilen kelime tekrar sırasına girer: 1 dk → 10 dk → 1 gün → giderek
   uzayan aralıklar (SM-2).
3. Tekrar zamanı gelince model **soru sorar** — ezber değil kullanım ölçen,
   her seferinde farklı tipte bir soru. Cevabını yazarsın, model puanlar ve
   düzeltir.
4. Puan bir sonraki aralığı belirler: bilemedin → başa döner, kolay geldi →
   aralık uzar.

Amaç kelimeyi tam unutmadan hemen önce tekrar getirmek.

## Yazma — serbest metin değerlendirme

Kendi yazdığın bir metni yapıştır, **Puanla ve düzelt** de:

- 0-100 puan + neyi iyi yaptığın
- Her hata ayrı satırda: **yanlış → doğru**, nedeni ve tipi (Kasus, Artikel,
  Verbstellung, Wortwahl, Rechtschreibung, Zeitform)
- Metnin daha doğru ve daha doğal hâli (senin fikrini koruyarak)
- Bir sonraki sefer için tek bir tavsiye

Aynı hata tipi bir metinde iki kez geçerse hafızaya not düşülür, sonraki
sohbetler ve tekrar soruları o noktaya dokunur.

## Hafıza — "ikinci beyin"

**Hafıza** sekmesi sistemin senin hakkında ne bildiğini gösterir. Üç şey
tutuluyor, hepsi tarayıcının IndexedDB'sinde:

| Ne | Nasıl kullanılıyor |
|---|---|
| **Notlar** | Model birkaç turda bir konuşmadan çıkarım yapar: seviyen, ilgi alanın, zorlandığın nokta, öğrenme tarzın, hedefin. Sonraki sohbetlerde sistem promptuna eklenir. |
| **Kelime sayaçları** | Aynı kelimeyi tekrar sorduğunda "tam oturmamış" sayılır ve model bunu bilir. |
| **Konuşma geçmişi** | Aynı kelimeye döndüğünde model daha önce ne anlattığını görür ve tekrarlamak yerine bir adım ileri götürür. |

Her notu tek tek silebilir, hepsini birden unutturabilir ya da JSON olarak
indirebilirsin. Hiçbiri sunucuya gitmiyor — zaten sunucu yok.

Depolama katmanı [Dexie.js](https://github.com/dexie/Dexie.js) (IndexedDB
sarmalayıcısı). Sunucu tarafı hafıza servisleri (mem0, MemMachine) bu mimariye
uymuyor: hepsi sunucu + vektör veritabanı istiyor, bu site ise statik.

Profil çıkarımı fazladan bir model çağrısı olduğu için her mesajda değil, üç
turda bir çalışır ve arka planda kalır — sohbeti bekletmez.

## Kota

Her iki sağlayıcı da kullandıkça öde çalışıyor: sabit bir günlük mesaj sınırı
yok, harcama token başına. Ucuz kalmak istiyorsan `deepseek-v4-flash` ile
devam et; Ayarlar'dan istediğin an model değiştirebilirsin.

Cevap uzunluğu sınırlı tutuluyor — sohbette 1600, yazma değerlendirmesinde
4096 token. Model cevabı bitiremeden sınıra takılırsa uygulama bunu ayrıca
söylüyor, sessizce boş cevap göstermiyor.

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
  markdown.tsx          model çıktısının markdown olarak çizimi
  chat.tsx              sohbet akışı, adım düğmeleri, durdurma
  study-panel.tsx       günlük hedef ve tekrar oturumu
  writing-panel.tsx     yazdığın metnin puanlanması ve düzeltilmesi
  memory-panel.tsx      sistemin senin hakkında bildikleri
  settings-panel.tsx    anahtar girişi ve model seçimi
  nebula-background.tsx cihaza göre parçacık sayısı seçer, SSR dışı yükler
  ui/                   shadcn bileşenleri + quantum-nebula.tsx + ai-input.tsx
lib/
  srs.ts                aralıklı tekrar zamanlaması (SM-2)
  study.ts              soru üretme, cevap değerlendirme, yeni kelime önerme
  writing.ts            metin puanlama, hata çıkarma, hata tipi notları
  typewriter.ts         akan metnin zamana bağlı ortaya çıkışı
  dictionary.ts         diller
  providers.ts          sağlayıcı tanımları (adres, modeller, protokol)
  chat.ts               sohbet promptu + SSE akışı (OpenAI biçimi)
  memory.ts             Dexie/IndexedDB: notlar, kelime sayaçları, geçmiş
  profile.ts            konuşmadan profil çıkarımı
  storage.ts            localStorage: anahtarlar, dil, kelime defteri
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
