"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, PenLine, Sparkles } from "lucide-react";

import { InlineMarkdown, Markdown } from "@/components/markdown";
import { TranslatePanel } from "@/components/translate-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LanguageCode } from "@/lib/dictionary";
import { saveFacts } from "@/lib/memory";
import { getProvider } from "@/lib/providers";
import * as storage from "@/lib/storage";
import type { StudyCall } from "@/lib/study";
import {
  errorPatternNotes,
  reviewWriting,
  type WritingReview,
} from "@/lib/writing";

function scoreTone(score: number): string {
  if (score >= 90) return "text-primary";
  if (score >= 70) return "text-foreground";
  if (score >= 50) return "text-muted-foreground";
  return "text-destructive";
}

type Mode = "review" | "translate";

/** Yazma sekmesinin iki isi: yazdigini duzeltmek ve nasil soylendigini sormak. */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
}) {
  return (
    <div className="bg-muted/60 inline-flex rounded-lg p-[3px] text-sm">
      {(
        [
          { value: "review" as const, label: "Yazdığımı düzelt" },
          { value: "translate" as const, label: "Nasıl söylenir?" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1.5 transition-colors ${
            mode === option.value
              ? "bg-background/80 text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function WritingPanel({
  language,
  settings,
}: {
  language: LanguageCode;
  settings: storage.Settings;
}) {
  const [mode, setMode] = useState<Mode>("review");
  const [text, setText] = useState("");
  const [review, setReview] = useState<WritingReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (trimmed.length < 15 || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setReview(null);

    const provider = getProvider(settings.provider);
    const call: StudyCall = {
      language,
      level: settings.explainLevel,
      provider,
      baseUrl: provider.baseUrl,
      apiKey: storage.currentKey(settings),
      model: settings.model,
      signal: controller.signal,
    };

    try {
      const result = await reviewWriting(call, trimmed);
      if (controller.signal.aborted) return;
      setReview(result);

      // Tekrar eden hata tipleri hafizaya dussun: sonraki sohbetler ve tekrar
      // sorulari bu noktalara dokunsun.
      const notes = errorPatternNotes(result.errors);
      if (notes.length) {
        void saveFacts(
          notes.map((note) => ({ kind: "zorlandigi" as const, text: note })),
          language,
        );
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [busy, language, settings, text]);

  if (mode === "translate") {
    return (
      <div className="space-y-5">
        <ModeSwitch mode={mode} onChange={setMode} />
        <TranslatePanel language={language} settings={settings} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ModeSwitch mode={mode} onChange={setMode} />

      <Card>
        <CardContent className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <PenLine className="size-4" />
            Yazdığını değerlendir
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Kendi yazdığın bir metni yapıştır. Puanlarım, hatalarını tek tek
            gösteririm ve daha doğal bir hâlini yazarım. Tekrar eden hata
            tiplerini hafızama not alırım.
          </p>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Yazdığın metni buraya yapıştır…"
            rows={8}
            className="border-input bg-background/40 focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-lg border p-3 text-base leading-relaxed outline-none focus-visible:ring-[3px]"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void submit()} disabled={busy || text.trim().length < 15}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Puanla ve düzelt
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              {text.trim().split(/\s+/).filter(Boolean).length} kelime
            </span>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="border-destructive/60 text-destructive rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {review ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-3">
                <span className={`text-4xl font-semibold ${scoreTone(review.score)}`}>
                  {review.score}
                </span>
                <span className="text-muted-foreground text-sm">/ 100</span>
                <Badge variant="secondary" className="ml-auto">
                  {review.errors.length} düzeltme
                </Badge>
              </div>
              {review.good ? (
                <div className="leading-relaxed">
                  <Markdown>{review.good}</Markdown>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {review.errors.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                Düzeltmeler
              </h3>
              <div className="grid gap-2">
                {review.errors.map((item, index) => (
                  <Card key={index} className="py-0">
                    <CardContent className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-destructive line-through decoration-destructive/60">
                          {item.original}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-primary font-semibold">
                          {item.correct}
                        </span>
                        <Badge variant="outline" className="ml-auto">
                          {item.kind}
                        </Badge>
                      </div>
                      {item.why ? (
                        <div className="text-muted-foreground text-sm leading-relaxed">
                          <InlineMarkdown>{item.why}</InlineMarkdown>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {review.improved ? (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                Daha iyi hâli
              </h3>
              <Card>
                <CardContent className="leading-relaxed whitespace-pre-wrap">
                  {review.improved}
                </CardContent>
              </Card>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard?.writeText(review.improved)}
              >
                Kopyala
              </Button>
            </section>
          ) : null}

          {review.tip ? (
            <Card className="border-primary/40">
              <CardContent className="leading-relaxed">
                <Markdown>{review.tip}</Markdown>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
