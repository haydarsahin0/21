"use client";

/**
 * Zamanlamanin kendini olcmesi ve ayarlamasi.
 *
 * FSRS her tekrarda bir tahmin yapiyor: "bu kelimeyi %X ihtimalle
 * hatirlayacaksin". Tekrar gunlugu bu tahminlerin yanina gercekte ne oldugunu
 * da yaziyor. Ikisini karsilastirinca zamanlamanin sana gore fazla sik mi yoksa
 * fazla seyrek mi oldugu olculebiliyor:
 *
 *   gercek hatirlama > hedef  ->  araliklar kisa, bosuna tekrar ediyorsun
 *   gercek hatirlama < hedef  ->  araliklar uzun, unutmadan yetisemiyorsun
 *
 * Duzeltme `request_retention` uzerinden yapiliyor — FSRS'in "araligi hangi
 * hatirlama olasiliginda kes" esigi. Bu, agirlik dizisini (w) yeniden egitmek
 * kadar guclu degil ama tamamen tarayicida, ek indirme olmadan calisiyor.
 *
 * Tam parametre egitimi (fsrs-browser / fsrs-rs) SharedArrayBuffer istiyor, o
 * da sayfanin COOP/COEP basliklariyla servis edilmesini gerektiriyor. GitHub
 * Pages bu basliklari gondermiyor. Bu yuzden gunlugu resmi optimizer'in
 * okudugu bicimde disari aktarabiliyoruz: veri burada kilitli kalmiyor.
 */

import { listReviews, type ReviewLog } from "./memory";
import type { LanguageCode } from "./dictionary";
import { setSrsWeights } from "./srs";

const TUNING_KEY = "sozluk:srs-tuning:v1";

/** Bu sayidan az tekrarla olcum guvenilir degil. */
export const MIN_REVIEWS = 60;

export interface Tuning {
  /** FSRS hedef hatirlama esigi. */
  requestRetention: number;
  /** Olcum sirasindaki tekrar sayisi. */
  reviews: number;
  /** Olculen gercek hatirlama orani. */
  measured: number;
  /** Son ayarlama zamani. */
  ts: number;
}

export interface RetentionReport {
  /** Olcume giren tekrar sayisi (yalniz gercek tekrar asamasindakiler). */
  sample: number;
  /** Gercekte hatirlanma orani (0-1). */
  actual: number;
  /** Sistemin ongordugu ortalama olasilik (0-1). */
  predicted: number;
  /** Gunluk toplam tekrar sayisi. */
  total: number;
}

/**
 * localStorage React'in disinda bir kaynak; ayar da uygulamanin geri kalani
 * gibi "external store" olarak okunuyor. Boylece sunucu ciktisiyla ilk istemci
 * render'i ayni kaliyor ve efekt icinde setState'e gerek kalmiyor.
 */
let snapshot: Tuning | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): Tuning | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TUNING_KEY);
    return raw ? (JSON.parse(raw) as Tuning) : null;
  } catch {
    return null;
  }
}

export function subscribeTuning(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentTuning(): Tuning | null {
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    snapshot = read();
    // Kayitli ayar okunur okunmaz FSRS'e veriliyor: zamanlama daha ilk
    // tekrardan itibaren senin olculmus esiginle calissin.
    applyTuning(snapshot);
  }
  return snapshot;
}

export const serverTuning = (): Tuning | null => null;

/**
 * Olcume yalniz "review" asamasindaki tekrarlar giriyor. Ogrenme adimlarindaki
 * dakikalik tekrarlar hatirlama olcusu degil — hepsi bilinir, orani sisirir.
 */
function measurable(rows: ReviewLog[]): ReviewLog[] {
  return rows.filter((row) => row.status === "review" && row.elapsedDays >= 1);
}

export function report(rows: ReviewLog[]): RetentionReport {
  const sample = measurable(rows);
  const recalled = sample.filter((row) => row.grade !== "again").length;
  const predicted =
    sample.reduce((sum, row) => sum + row.predicted, 0) / (sample.length || 1);
  return {
    sample: sample.length,
    actual: sample.length ? recalled / sample.length : 0,
    predicted,
    total: rows.length,
  };
}

export async function retentionReport(
  language: LanguageCode,
): Promise<RetentionReport> {
  return report(await listReviews(language));
}

/**
 * Olcume gore hedef esigi kaydirir ve saklar. Adim kucuk (0.02) ve sinirli
 * (0.80-0.97): tek bir kotu haftanin zamanlamayi ucurmasini istemiyoruz.
 */
export function tune(current: RetentionReport): Tuning | null {
  if (current.sample < MIN_REVIEWS) return null;

  const previous = read();
  const base = previous?.requestRetention ?? 0.9;
  const gap = current.actual - base;

  // Hedefe yakinsa dokunma; her olcumde oynamak gurultuye tepki vermek olur.
  let next = base;
  if (gap > 0.05) next = base - 0.02;
  else if (gap < -0.05) next = base + 0.02;

  next = Math.min(0.97, Math.max(0.8, Number(next.toFixed(2))));

  const tuning: Tuning = {
    requestRetention: next,
    reviews: current.sample,
    measured: current.actual,
    ts: Date.now(),
  };

  try {
    window.localStorage.setItem(TUNING_KEY, JSON.stringify(tuning));
  } catch {
    // Depolama kapaliysa ayar bu oturumda gecerli olur, kalici olmaz.
  }
  snapshot = tuning;
  applyTuning(tuning);
  for (const listener of listeners) listener();
  return tuning;
}

/** Ayari FSRS'e uygular. */
export function applyTuning(tuning: Tuning | null): void {
  setSrsWeights(null, tuning?.requestRetention);
}

/**
 * Tekrar gunlugunu resmi FSRS optimizer'inin okudugu CSV'ye cevirir
 * (card_id, review_time, review_rating). Boylece parametreleri istersen
 * disarida egitip geri getirebilirsin.
 */
export function toOptimizerCsv(rows: ReviewLog[]): string {
  const RATING: Record<ReviewLog["grade"], number> = {
    again: 1,
    hard: 2,
    good: 3,
    easy: 4,
  };
  const ids = new Map<string, number>();
  const lines = ["card_id,review_time,review_rating"];
  for (const row of rows) {
    if (!ids.has(row.key)) ids.set(row.key, ids.size + 1);
    lines.push(`${ids.get(row.key)},${row.ts},${RATING[row.grade]}`);
  }
  return lines.join("\n");
}
