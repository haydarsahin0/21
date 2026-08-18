/**
 * C1 kelime bankasini uretir.
 *
 * Amac: C1 seviyesindeki birine gercekten yeni olan kelimeleri, ise yararlilik
 * sirasiyla vermek. Hazir bir "C1 listesi" yok — CEFR'in C1 icin kapali bir
 * kelime listesi yayimlanmiyor. Bu yuzden liste dort kaynaktan insa ediliyor:
 *
 *  1. Universal Dependencies Almanca derlemleri (HDT gazete metni + GSD).
 *     Lemma ve sozcuk turu insan eliyle etiketlenmis; cekimli bicimleri
 *     kok haline getiren guvenilir kaynak burasi.        (CC BY-SA 4.0)
 *  2. wordfreq: Wikipedia, altyazi, haber, kitap ve web derlemlerini
 *     birlestiren genel siklik. Siralama buna gore — tek bir derlemin
 *     konusuna (HDT'de bilisim haberleri) kaymasin diye.  (MIT)
 *  3. german-nouns: WiktionaryDE'den ~100.000 isim; cinsiyet, cogul ve
 *     "bu gercekten ortak isim mi" bilgisi.               (MIT)
 *  4. igerman98 (hunspell de_DE): modern yazim denetimi; eski ("bewußt") ve
 *     Isvicre ("ausserdem") yazimlarini eliyor.           (GPL/LGPL/MPL)
 *
 * Temel bant disarida: Goethe 5000 listesindeki her sey ve ondan turemis
 * bicimler ("klein" biliniyorsa "Kleine" de biliniyor sayiliyor) atiliyor.
 * Geriye kalan, "en sik kullanilan ama temel bandin disindaki" kelimeler.
 *
 * Cikti: lib/wordbank-de.json
 * Calistirmak icin: npm run wordbank   (birkac yuz MB indirir, birkac dakika)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "lib", "wordbank-de.json");

const UD = "https://raw.githubusercontent.com/UniversalDependencies";
const SOURCES = {
  corpora: [
    `${UD}/UD_German-HDT/master/de_hdt-ud-train-a-1.conllu`,
    `${UD}/UD_German-HDT/master/de_hdt-ud-train-a-2.conllu`,
    `${UD}/UD_German-HDT/master/de_hdt-ud-train-b-1.conllu`,
    `${UD}/UD_German-HDT/master/de_hdt-ud-train-b-2.conllu`,
    `${UD}/UD_German-GSD/master/de_gsd-ud-train.conllu`,
  ],
  nouns:
    "https://raw.githubusercontent.com/gambolputty/german-nouns/main/german_nouns/nouns.csv",
  spelling:
    "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/de/index.dic",
  basic:
    "https://raw.githubusercontent.com/voothi/20260716201616-german-5000/main/20260716202200-goethe-german-5000-freq.de.tsv",
};

/** Kac kelime uretilsin. */
const TARGET = 4000;

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

// --- Kaynaklari oku ---------------------------------------------------------

console.log("yazim sozlugu…");
const spelling = new Set(
  (await fetchText(SOURCES.spelling))
    .split("\n")
    .slice(1)
    .map((line) => line.split("/")[0].trim())
    .filter(Boolean),
);

console.log("temel bant (Goethe 5000)…");
const basic = new Set(
  (await fetchText(SOURCES.basic))
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t")[0]?.split(",")[0]?.trim().toLowerCase())
    .filter(Boolean),
);

/** Temel bandin turemis hallerini de bilinmis say: klein -> Kleine, Kleinheit. */
const SUFFIXES = ["e", "en", "er", "es", "ung", "heit", "keit", "in", "lich"];
function isBasic(lower) {
  if (basic.has(lower)) return true;
  return SUFFIXES.some(
    (suffix) =>
      lower.endsWith(suffix) && basic.has(lower.slice(0, -suffix.length)),
  );
}

console.log("Wiktionary isimleri…");
const OK_TAGS = new Set(["Substantiv", "Wortverbindung"]);
/** @type {Map<string, {genus: string, plural: string}>} */
const nouns = new Map();
{
  const csv = await fetchText(SOURCES.nouns);
  const lines = csv.split("\n");
  const header = splitCsv(lines[0]);
  const col = (name) => header.indexOf(name);
  const iLemma = col("lemma");
  const iPos = col("pos");
  const iGenus = col("genus");
  const iGenus1 = col("genus 1");
  const iPlural = col("nominativ plural");
  const iPlural1 = col("nominativ plural 1");

  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]) continue;
    const row = splitCsv(lines[i]);
    const lemma = row[iLemma];
    if (!lemma || lemma[0] !== lemma[0].toUpperCase()) continue;

    // Ozel adlar, kisaltmalar ve sifattan turemis isimler ("Kleine") disari.
    const tags = (row[iPos] ?? "").split(",").map((tag) => tag.trim());
    if (!tags.every((tag) => OK_TAGS.has(tag))) continue;

    const genus = (row[iGenus] || row[iGenus1] || "").trim();
    if (!["m", "f", "n"].includes(genus)) continue;
    if (nouns.has(lemma)) continue;
    nouns.set(lemma, {
      genus,
      plural: (row[iPlural] || row[iPlural1] || "").trim(),
    });
  }
}
console.log(`  ${nouns.size} ortak isim`);

console.log("derlemler taraniyor…");

/**
 * Bir kelimeyi yalniz **sozluk bicimiyle** metinde gectigi zaman sayiyoruz:
 * yuzey bicimi lemmaya esit olacak ve morfoloji sutunu o turun citation
 * bicimini gosterecek.
 *
 * Bu kural, listeyi bozan en buyuk kaynagi kuruttu: cekimli bicimler lemma
 * sanildiginda "verbunden" (verbinden'in sifat-fiili) ya da "länger" (lang'in
 * karsilastirmasi) kart olarak cikiyordu. Sifat-fiil hicbir zaman VVINF
 * olarak, karsilastirma hicbir zaman Degree=Pos olarak gecmiyor; boylece
 * ikisi de kendiliginden eleniyor.
 *
 * Sutunlar: 0 sira, 1 yuzey, 2 lemma, 3 UPOS, 4 XPOS (STTS), 5 morfoloji.
 */
function citationForm(surface, lemma, upos, xpos, feats) {
  if (surface !== lemma) return false;
  if (upos === "NOUN") {
    return (
      xpos === "NN" && feats.includes("Case=Nom") && feats.includes("Number=Sing")
    );
  }
  if (upos === "VERB") return xpos === "VVINF";
  if (upos === "ADJ") {
    return (
      (xpos === "ADJA" || xpos === "ADJD") &&
      !feats.includes("VerbForm=Part") &&
      !feats.includes("Degree=Cmp") &&
      !feats.includes("Degree=Sup")
    );
  }
  return upos === "ADV" && xpos === "ADV";
}

/** @type {Map<string, number>} lemma+tur -> sozluk biciminde gecis sayisi */
const counts = new Map();

for (const url of SOURCES.corpora) {
  const text = await fetchText(url);
  for (const line of text.split("\n")) {
    if (!line || line[0] === "#") continue;
    const parts = line.split("\t");
    if (parts.length < 6 || parts[0].includes("-")) continue;
    const [, surface, lemma, upos, xpos, feats] = parts;
    if (!["NOUN", "VERB", "ADJ", "ADV"].includes(upos)) continue;
    if (!citationForm(surface, lemma, upos, xpos, feats)) continue;
    const key = `${lemma}\t${upos}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log(`  ${url.split("/").pop()} bitti`);
}

// --- Siklik ----------------------------------------------------------------

const WORD = /^[A-ZÄÖÜ]?[a-zäöüß]+$/;

// Elemeden once adaylarin genel sikligini al. wordfreq bir Python paketi;
// scripts/wordfreq-zipf.py aradaki koprü.
const candidates = [
  ...new Set(
    [...counts.keys()]
      .map((key) => key.split("\t")[0])
      .filter((lemma) => WORD.test(lemma) && lemma.length >= 5),
  ),
];
console.log(`siklik sorulacak aday: ${candidates.length}`);

const { spawn } = await import("node:child_process");
/** @type {Record<string, number>} */
const zipf = await new Promise((resolve, reject) => {
  const child = spawn("python3", [join(here, "wordfreq-zipf.py")]);
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (err += chunk));
  child.on("error", () =>
    reject(new Error("python3 bulunamadi. Once: pip install wordfreq")),
  );
  child.on("close", (code) => {
    if (code !== 0) reject(new Error(err.trim() || `python3 ${code} dondu`));
    else resolve(JSON.parse(out));
  });
  child.stdin.end(candidates.join("\n"));
});

// --- Ele ------------------------------------------------------------------
const CATEGORY = { NOUN: "isim", VERB: "fiil", ADJ: "sıfat", ADV: "zarf" };
const ARTICLE = { m: "der", f: "die", n: "das" };

/** Ayni yazim birden fazla turde gecebiliyor; derlemde daha sik olani kalir. */
const best = new Map();

for (const [key, corpusCount] of counts) {
  const [lemma, upos] = key.split("\t");
  if (!WORD.test(lemma) || lemma.length < 5) continue;

  const lower = lemma.toLowerCase();
  if (isBasic(lower)) continue;

  const de = zipf[lemma] ?? 0;
  // Cok nadir kelimeler kart olarak zaman kaybi.
  if (de < 2.9) continue;
  // Cok yaygin olanlar da: Goethe 5000'de gecmese bile "Glaube", "fertig",
  // "nachts" gibi kelimeler C1'deki birine yeni gelmez.
  if (de >= 4.4) continue;
  // Ingilizce alintilari ele ("Content", "College"): gercek Almanca kelimenin
  // Ingilizce derlemdeki sikligi cok dusuk olur.
  if (de - (zipf[`en:${lemma}`] ?? 0) < 1) continue;

  let article = "";
  let plural = "";

  if (upos === "NOUN") {
    const info = nouns.get(lemma);
    if (!info) continue;
    article = ARTICLE[info.genus];
    plural = info.plural;
  } else {
    // Isimler Wiktionary'den dogrulandi; digerleri yazim sozlugunden.
    if (!spelling.has(lemma)) continue;
    if (lemma[0] !== lower[0]) continue;

    if (upos === "VERB") {
      // Bildigi bir isimden turemis fiil ("Schule" -> "schulen") kart olmasin.
      if (basic.has(lower.slice(0, -1))) continue;
    } else if (upos === "ADJ") {
      if (corpusCount < 5) continue;
    } else if (corpusCount < 15) {
      continue;
    }
  }

  const prior = best.get(lower);
  if (!prior || corpusCount > prior.corpusCount) {
    best.set(lower, {
      word: lemma,
      category: CATEGORY[upos],
      article,
      plural,
      zipf: de,
      corpusCount,
    });
  }
}

const ranked = [...best.values()]
  .sort((a, b) => b.zipf - a.zipf)
  .slice(0, TARGET);

const words = ranked.map((entry) => ({
  w: entry.word,
  ...(entry.article ? { a: entry.article } : {}),
  ...(entry.plural ? { p: entry.plural } : {}),
  c: entry.category,
  // Siklik bandi seviye yerine geciyor: liste zaten temel bandin ustunde,
  // ustteki dilim "yaygin ileri", alttaki "seyrek ileri".
  z: Math.round(entry.zipf * 10) / 10,
}));

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(words), "utf8");

const byCategory = words.reduce((acc, entry) => {
  acc[entry.c] = (acc[entry.c] ?? 0) + 1;
  return acc;
}, {});
console.log(`\n${words.length} kelime yazildi -> ${OUT}`);
console.log("tur:", byCategory);
console.log("ilk 15:", words.slice(0, 15).map((entry) => entry.w).join(", "));
console.log("son 15:", words.slice(-15).map((entry) => entry.w).join(", "));

/** Tirnakli alanlari koruyan basit CSV satir ayirici. */
function splitCsv(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}
