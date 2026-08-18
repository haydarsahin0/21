"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Gauge, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LanguageCode } from "@/lib/dictionary";
import { getDb, listReviews } from "@/lib/memory";
import {
  MIN_REVIEWS,
  currentTuning,
  report,
  serverTuning,
  subscribeTuning,
  toOptimizerCsv,
  tune,
} from "@/lib/optimizer";

const percent = (value: number) => `%${Math.round(value * 100)}`;

/**
 * Zamanlamanin kendini olctugu kart.
 *
 * Iki sayiyi yan yana koyuyor: sistemin ongordugu hatirlama orani ve gercekte
 * olan. Aralarindaki fark, araliklarin sana gore sik mi seyrek mi oldugunu
 * soyluyor — ve "Zamanlamayi ayarla" dugmesi bunu duzeltiyor.
 */
export function TuningCard({ language }: { language: LanguageCode }) {
  // Ayar localStorage'da; okunurken FSRS'e de uygulaniyor (bkz. currentTuning).
  const tuning = useSyncExternalStore(
    subscribeTuning,
    currentTuning,
    serverTuning,
  );

  const rows = useLiveQuery(
    async () => (getDb() ? listReviews(language) : null),
    [language],
    undefined,
  );

  const stats = rows ? report(rows) : null;

  const onTune = useCallback(() => {
    if (stats) tune(stats);
  }, [stats]);

  const onExport = useCallback(() => {
    if (!rows?.length) return;
    const blob = new Blob([toOptimizerCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tekrar-gunlugu-${language}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [language, rows]);

  if (!stats || stats.total === 0) return null;

  const enough = stats.sample >= MIN_REVIEWS;
  const gap = stats.actual - (tuning?.requestRetention ?? 0.9);

  return (
    <Card>
      <CardContent className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Gauge className="size-4" />
          Zamanlama kendini ölçüyor
        </h3>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-muted/40 rounded-lg border px-3 py-2">
            <p className="text-2xl font-semibold tabular-nums">
              {percent(stats.actual)}
            </p>
            <p className="text-muted-foreground text-xs">gerçekte hatırladın</p>
          </div>
          <div className="bg-muted/40 rounded-lg border px-3 py-2">
            <p className="text-2xl font-semibold tabular-nums">
              {percent(tuning?.requestRetention ?? 0.9)}
            </p>
            <p className="text-muted-foreground text-xs">hedef</p>
          </div>
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed">
          {!enough ? (
            <>
              Ölçüm için {MIN_REVIEWS} tekrar gerekiyor; şu an {stats.sample}{" "}
              tanesi sayılabilir durumda. Biraz daha çalışınca zamanlamayı sana
              göre ayarlayabilirim.
            </>
          ) : gap > 0.05 ? (
            <>
              Hedeften iyisin: kelimeleri unutmadan çok önce tekrar ediyorsun.
              Aralıkları açarsam aynı işi daha az tekrarla yaparsın.
            </>
          ) : gap < -0.05 ? (
            <>
              Aralıklar sana uzun geliyor — tekrar sırası geldiğinde bir kısmını
              unutmuş oluyorsun. Sıklaştırayım.
            </>
          ) : (
            <>Zamanlama sana oturmuş görünüyor; şimdilik dokunmaya gerek yok.</>
          )}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onTune}
            disabled={!enough || Math.abs(gap) <= 0.05}
          >
            <Wand2 />
            Zamanlamayı ayarla
          </Button>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download />
            Tekrar günlüğü (CSV)
          </Button>
        </div>

        <p className="text-muted-foreground text-xs leading-relaxed">
          {stats.total} tekrar kayıtlı, {stats.sample} tanesi ölçüme giriyor
          (dakikalık öğrenme adımları sayılmıyor).
          {tuning
            ? ` Son ayar: ${new Date(tuning.ts).toLocaleDateString("tr")}.`
            : ""}{" "}
          CSV, FSRS&rsquo;in resmî optimizer&rsquo;ının okuduğu biçimde — verin
          burada kilitli değil.
        </p>
      </CardContent>
    </Card>
  );
}
