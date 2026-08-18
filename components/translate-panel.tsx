"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeftRight,
  Copy,
  Languages,
  Loader2,
  Volume2,
} from "lucide-react";

import { InlineMarkdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LANGUAGES, type LanguageCode } from "@/lib/dictionary";
import { getProvider } from "@/lib/providers";
import { canSpeak, speak } from "@/lib/speak";
import * as storage from "@/lib/storage";
import type { StudyCall } from "@/lib/study";
import {
  guessDirection,
  translateText,
  type Direction,
  type Translation,
} from "@/lib/translate";

const SPRING = { type: "spring", stiffness: 340, damping: 30 } as const;

/**
 * Cift yonlu ceviri ekrani.
 *
 * Puanlama/duzeltme modundan ayri duruyor: orada kendi yazdigin metni
 * duzeltiyoruz, burada bir anadili konusaninin nasil soyleyecegini gosteriyoruz
 * ve ayni anlamin baska soyleyislerini yan yana koyuyoruz.
 */
export function TranslatePanel({
  language,
  settings,
}: {
  language: LanguageCode;
  settings: storage.Settings;
}) {
  const [text, setText] = useState("");
  /** null = otomatik algila. */
  const [forced, setForced] = useState<Direction | null>(null);
  const [result, setResult] = useState<Translation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const targetName = LANGUAGES[language].name;
  const direction = forced ?? guessDirection(text);

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (trimmed.length < 2 || busy) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setResult(null);

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
      const translation = await translateText(
        call,
        trimmed,
        forced ?? undefined,
      );
      if (!controller.signal.aborted) setResult(translation);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [busy, forced, language, settings, text]);

  const copy = useCallback((value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(""), 1400);
  }, []);

  /** Ciktinin dili: hedef dile mi Turkce'ye mi cevirdik? */
  const outputIsTarget = (result?.direction ?? direction) === "to-target";

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Languages className="size-4" />
            Nasıl söylenir?
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Türkçe yaz, bir Alman’ın gerçekten söyleyeceği hâlini göstereyim.{" "}
            {targetName} yazarsan Türkçesini veririm. Alternatifleriyle
            birlikte: aynı anlamın başka söyleyişleri ve kelime seçenekleri.
          </p>

          {/* Yon secici. Varsayilan otomatik; yanlis tahmin edilirse elle
              sabitlenebiliyor. */}
          <div className="bg-muted/60 inline-flex rounded-lg p-[3px] text-sm">
            {(
              [
                { value: null, label: "Otomatik" },
                { value: "to-target" as const, label: `TR → ${targetName}` },
                { value: "to-turkish" as const, label: `${targetName} → TR` },
              ] as const
            ).map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setForced(option.value)}
                className={`rounded-md px-3 py-1 transition-colors ${
                  forced === option.value
                    ? "bg-background/80 text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Söylemek istediğin cümleyi yaz…"
            rows={4}
            className="border-input bg-background/40 focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-lg border p-3 text-base leading-relaxed outline-none focus-visible:ring-[3px]"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void submit()}
              disabled={busy || text.trim().length < 2}
            >
              {busy ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />}
              Nasıl söylenir
            </Button>
            {text.trim() ? (
              <span className="text-muted-foreground text-xs">
                {forced === null ? "algılanan: " : "seçili: "}
                {direction === "to-target"
                  ? `Türkçe → ${targetName}`
                  : `${targetName} → Türkçe`}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="border-destructive/60 text-destructive rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {result ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="space-y-4"
        >
          {/* Ana karsilik */}
          <Card className="border-primary/40">
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                Bir anadili konuşanı böyle der
              </p>
              <p className="text-xl leading-relaxed font-medium">
                {result.main}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copy(result.main)}
                >
                  <Copy />
                  {copied === result.main ? "Kopyalandı" : "Kopyala"}
                </Button>
                {outputIsTarget && canSpeak() ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => speak(result.main, language)}
                  >
                    <Volume2 />
                    Dinle
                  </Button>
                ) : null}
              </div>

              {result.note ? (
                <div className="text-muted-foreground border-t pt-3 text-sm leading-relaxed">
                  <InlineMarkdown>{result.note}</InlineMarkdown>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Kelimesi kelimesine — dogal halinden farkliysa */}
          {result.literal ? (
            <Card className="py-0">
              <CardContent className="space-y-1 py-3">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                  Kelimesi kelimesine
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed line-through decoration-1">
                  {result.literal}
                </p>
                <p className="text-muted-foreground text-xs">
                  Anlaşılır ama doğal değil — bunu kullanma.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Ayni anlamin baska soyleyisleri */}
          {result.variants.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                Başka türlü de söyleyebilirsin
              </h3>
              <div className="grid gap-2">
                {result.variants.map((variant, index) => (
                  <motion.div
                    key={variant.text}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="py-0">
                      <CardContent className="space-y-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-2.5 py-0.5 text-[11px]">
                            {variant.label}
                          </span>
                          <div className="ml-auto flex gap-1">
                            {outputIsTarget && canSpeak() ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Dinle"
                                onClick={() => speak(variant.text, language)}
                              >
                                <Volume2 />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Kopyala"
                              onClick={() => copy(variant.text)}
                            >
                              <Copy />
                            </Button>
                          </div>
                        </div>
                        <p className="leading-relaxed">{variant.text}</p>
                        {variant.note ? (
                          <div className="text-muted-foreground text-sm leading-relaxed">
                            <InlineMarkdown>{variant.note}</InlineMarkdown>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Kelime secenekleri */}
          {result.words.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                Kelime yerine ne kullanabilirsin
              </h3>
              <div className="grid gap-2">
                {result.words.map((choice) => (
                  <Card key={choice.source} className="py-0">
                    <CardContent className="space-y-2 py-3">
                      <p className="font-medium">
                        {choice.source}
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          yerine
                        </span>
                      </p>
                      <ul className="space-y-1.5">
                        {choice.options.map((option) => (
                          <li
                            key={option.word}
                            className="flex flex-wrap items-baseline gap-x-2 text-sm"
                          >
                            <span className="text-primary font-medium">
                              {option.word}
                            </span>
                            {option.note ? (
                              <span className="text-muted-foreground">
                                <InlineMarkdown>{option.note}</InlineMarkdown>
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  );
}
