/**
 * B1-C1 kelime bankasini uretir.
 *
 * Kaynak: voothi/20260716201616-german-5000 (MIT) — Goethe Institut'un 5000
 * kelimelik listesi, sikliga gore sirali ve CEFR seviyesi etiketli. Liste
 * A1/A2/B1/B2+ diye bolunuyor; C1 icin kapali bir resmi liste yok, bu yuzden
 * "B2+" bandi pratikte tavan oluyor.
 *
 * Cikti: lib/wordbank-de.json — uygulama bunu yalniz Tarama sayfasinda,
 * dinamik import ile yukluyor; ana paketi buyutmuyor.
 *
 * Calistirmak icin:  node scripts/build-wordbank.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE =
  "https://raw.githubusercontent.com/voothi/20260716201616-german-5000/main/20260716202200-goethe-german-5000-freq.de.tsv";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "wordbank-de.json",
);

/** Istedigimiz bant: kullanicimiz C1, A1/A2 zaten biliniyor sayiliyor. */
const LEVELS = new Set(["B1", "B2+"]);

/** Fiil satirlari cekimleriyle geliyor: "gelten, gilt, galt, hat gegolten". */
function lemmaOf(word) {
  return word.split(",")[0].trim();
}

/**
 * Isim satirlarinda tur "der/die/das" olarak geliyor; birden fazlaysa
 * ("der, die") ilkini aliyoruz. Cogul eki aciklamada: "der Weber, -".
 */
function nounInfo(pos, annotation) {
  const article = pos.split(",")[0].trim();
  if (!["der", "die", "das"].includes(article)) return null;
  const comma = annotation.indexOf(",");
  const plural = comma === -1 ? "" : annotation.slice(comma + 1).trim();
  return { article, plural };
}

function categoryOf(pos) {
  const first = pos.split(",")[0].trim();
  if (["der", "die", "das"].includes(first)) return "isim";
  if (first === "verb") return "fiil";
  if (first === "adj") return "sıfat";
  if (first === "adv") return "zarf";
  return "diğer";
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Kaynak indirilemedi: ${res.status}`);
const tsv = await res.text();

const rows = tsv.split("\n").slice(1);
const seen = new Set();
const words = [];

for (const line of rows) {
  if (!line.trim()) continue;
  const [word, annotation = "", , pos = "", level = "", english = ""] =
    line.split("\t");
  if (!LEVELS.has(level.trim())) continue;

  const lemma = lemmaOf(word);
  // Tek harfli ya da bosluklu artiklar liste disi; kart olarak anlamsizlar.
  if (lemma.length < 3 || /\s/.test(lemma)) continue;
  const dedupeKey = lemma.toLowerCase();
  if (seen.has(dedupeKey)) continue;
  seen.add(dedupeKey);

  const noun = nounInfo(pos, annotation);
  words.push({
    w: lemma,
    // Isimlerde artikel ve cogul: Almanca'da kelimenin yarisi bu.
    ...(noun?.article ? { a: noun.article } : {}),
    ...(noun?.plural ? { p: noun.plural } : {}),
    c: categoryOf(pos),
    // "B2+" gorselde "B2/C1" diye gosteriliyor; ham veriyi bozmuyoruz.
    l: level.trim(),
    // Ingilizce karsilik kaynakta hazir: Turkce cevirisi gelene kadar
    // kartin arkasinda ipucu olarak duruyor, model cagrisi gerektirmiyor.
    e: english.trim(),
  });
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(words), "utf8");

const byLevel = words.reduce((acc, entry) => {
  acc[entry.l] = (acc[entry.l] ?? 0) + 1;
  return acc;
}, {});
console.log(`${words.length} kelime yazildi -> ${OUT}`);
console.log("seviye:", byLevel);
console.log(
  "tur:",
  words.reduce((acc, entry) => {
    acc[entry.c] = (acc[entry.c] ?? 0) + 1;
    return acc;
  }, {}),
);
