"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Flame,
  HelpCircle,
  Loader2,
  Play,
  Volume2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LANGUAGES, type LanguageCode } from "@/lib/dictionary";
import { ensureGlosses } from "@/lib/gloss";
import {
  addWord,
  getDb,
  listScreened,
  markScreened,
  screeningCounts,
} from "@/lib/memory";
import { getProvider } from "@/lib/providers";
import { canSpeak, speak } from "@/lib/speak";
import * as storage from "@/lib/storage";
import type { StudyCall } from "@/lib/study";
import {
  displayWord,
  levelLabel,
  loadBank,
  type BankWord,
} from "@/lib/wordbank";

/** Kac "biliyorum"da bir kontrol sorusu gelsin (aralik). */
const CHECK_EVERY = [4, 8] as const;
/** Onbellege kac kart ilerisinin Turkce karsiligi cekilsin. */
const PREFETCH = 15;

type Phase = "idle" | "card" | "check" | "reveal" | "done";

const CARD_SPRING = {
  type: "spring",
  stiffness: 380,
  damping: 32,
  mass: 0.7,
} as const;

function randomBetween([min, max]: readonly [number, number]): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function ScreeningPanel({
  language,
  settings,
}: {
  language: LanguageCode;
  settings: storage.Settings;
}) {
  const [bank, setBank] = useState<BankWord[] | null>(null);
  const [deck, setDeck] = useState<BankWord[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  // Turkce karsilik onbellegi (kelime -> anlam). Modelden toplu geliyor.
  const [glosses, setGlosses] = useState<Map<string, string>>(new Map());
  const [loadingGloss, setLoadingGloss] = useState(false);

  // Oyun durumu
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [seen, setSeen] = useState(0);
  const [checkIn, setCheckIn] = useState(() => randomBetween(CHECK_EVERY));
  const [options, setOptions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const counts = useLiveQuery(
    async () => (getDb() ? screeningCounts(language) : null),
    [language],
    undefined,
  );

  const buildCall = useCallback(
    (signal?: AbortSignal): StudyCall => {
      const provider = getProvider(settings.provider);
      return {
        language,
        level: settings.explainLevel,
        provider,
        baseUrl: provider.baseUrl,
        apiKey: storage.currentKey(settings),
        model: settings.model,
        signal,
      };
    },
    [language, settings],
  );

  useEffect(() => {
    let alive = true;
    void loadBank(language).then((rows) => {
      if (alive) setBank(rows);
    });
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [language]);

  const current = deck[index] ?? null;
  const meaning = current
    ? (glosses.get(current.word) ?? current.english)
    : "";
  const isTurkish = current ? glosses.has(current.word) : false;

  /**
   * Onumuzdeki kartlarin Turkce karsiligini arka planda doldur. Kart
   * gosterilmeden once hazir olsun ki "bilmiyorum" deyince beklemeyesin.
   */
  const prefetch = useCallback(
    async (from: number, rows: BankWord[]) => {
      const slice = rows.slice(from, from + PREFETCH);
      if (!slice.length) return;
      const missing = slice.filter((entry) => !glosses.has(entry.word));
      if (!missing.length) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingGloss(true);
      try {
        const found = await ensureGlosses(
          buildCall(controller.signal),
          missing,
          language,
        );
        if (controller.signal.aborted) return;
        setGlosses((prev) => new Map([...prev, ...found]));
      } finally {
        if (!controller.signal.aborted) setLoadingGloss(false);
      }
    },
    [buildCall, glosses, language],
  );

  const start = useCallback(async () => {
    if (!bank?.length) return;
    const done = new Set(
      (await listScreened(language)).map((row) => row.word),
    );
    // Siklik sirasi korunuyor: en cok ise yarayan kelimeler once.
    const fresh = bank.filter((entry) => !done.has(entry.word));
    setDeck(fresh);
    setIndex(0);
    setSeen(0);
    setScore(0);
    setStreak(0);
    setBest(0);
    setCheckIn(randomBetween(CHECK_EVERY));
    setPhase(fresh.length ? "card" : "done");
    void prefetch(0, fresh);
  }, [bank, language, prefetch]);

  const advance = useCallback(() => {
    const next = index + 1;
    setPicked(null);
    setOptions([]);
    if (next >= deck.length) {
      setPhase("done");
      return;
    }
    setIndex(next);
    setPhase("card");
    // Tampon yariya inince bir sonraki grubu getir.
    if (next % Math.floor(PREFETCH / 2) === 0) void prefetch(next, deck);
  }, [deck, index, prefetch]);

  const bump = useCallback((points: number, keepStreak: boolean) => {
    setScore((value) => value + points);
    setSeen((value) => value + 1);
    setStreak((value) => {
      const next = keepStreak ? value + 1 : 0;
      setBest((top) => Math.max(top, next));
      return next;
    });
    setFlash(keepStreak ? "good" : "bad");
    window.setTimeout(() => setFlash(null), 400);
  }, []);

  /** Kontrol sorusu: dogru anlam + ayni turden uc celdirici. */
  const askCheck = useCallback(() => {
    if (!current) return;
    // Celdiriciler dogru cevapla ayni dilde olmali. Karisirsa (dogru cevap
    // Turkce, celdiriciler Ingilizce) cevap bakar bakmaz belli olur ve soru
    // hicbir sey olcmez.
    const pool = deck
      .filter(
        (entry) =>
          entry.word !== current.word && entry.category === current.category,
      )
      .map((entry) =>
        isTurkish ? glosses.get(entry.word) : entry.english,
      )
      .filter((text): text is string => Boolean(text) && text !== meaning);

    const distractors = shuffle([...new Set(pool)]).slice(0, 3);
    // Yeterli celdirici yoksa soruyu sorma; yanlis kolay bulunur, olcmez.
    if (distractors.length < 3) {
      void markScreened(current.word, language, "known");
      bump(1, true);
      advance();
      return;
    }
    setOptions(shuffle([meaning, ...distractors]));
    setPhase("check");
  }, [advance, bump, current, deck, glosses, isTurkish, language, meaning]);

  const onKnown = useCallback(() => {
    if (!current) return;
    if (checkIn <= 1) {
      setCheckIn(randomBetween(CHECK_EVERY));
      askCheck();
      return;
    }
    setCheckIn((value) => value - 1);
    void markScreened(current.word, language, "known");
    bump(1, true);
    advance();
  }, [advance, askCheck, bump, checkIn, current, language]);

  const onUnknown = useCallback(
    (verdict: "unsure" | "unknown") => {
      if (!current) return;
      void markScreened(current.word, language, verdict);
      // Bilmedigini soylemek de ilerleme: kelime calisma destesine giriyor.
      void addWord(current.word, language, glosses.get(current.word) ?? "");
      bump(2, true);
      setPhase("reveal");
    },
    [bump, current, glosses, language],
  );

  const onPick = useCallback(
    (choice: string) => {
      if (!current || picked) return;
      setPicked(choice);
      const correct = choice === meaning;
      if (correct) {
        void markScreened(current.word, language, "known");
        bump(5, true);
      } else {
        // "Biliyorum" demistin ama bilmiyormussun: kelime destene giriyor.
        void markScreened(current.word, language, "unknown", true);
        void addWord(current.word, language, glosses.get(current.word) ?? "");
        bump(0, false);
      }
    },
    [bump, current, glosses, language, meaning, picked],
  );

  const remaining = deck.length - index;
  const bankTotal = bank?.length ?? 0;
  const screenedTotal = counts?.total ?? 0;
  const coverage = bankTotal
    ? Math.round((screenedTotal / bankTotal) * 100)
    : 0;

  const levelBadge = useMemo(
    () => (current ? levelLabel(current.level) : ""),
    [current],
  );

  if (language !== "de") {
    return (
      <p className="text-muted-foreground text-sm">
        Kelime bankası şimdilik yalnızca Almanca için var.{" "}
        {LANGUAGES[language].name} seçiliyken bu ekran boş kalıyor.
      </p>
    );
  }

  if (bank === null) {
    return <p className="text-muted-foreground text-sm">Banka yükleniyor…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Ilerleme */}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">B1–C1 taraması</h2>
            <span className="text-muted-foreground text-sm tabular-nums">
              {screenedTotal} / {bankTotal}
            </span>
          </div>

          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-500"
              style={{ width: `${coverage}%` }}
            />
          </div>

          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>Bildiğin: {counts?.known ?? 0}</span>
            <span>
              Desteye giren: {(counts?.unknown ?? 0) + (counts?.unsure ?? 0)}
            </span>
            {phase !== "idle" && phase !== "done" ? (
              <span>Bu turda kalan: {remaining}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Skor seridi */}
      {phase === "card" || phase === "check" || phase === "reveal" ? (
        <div className="flex items-center justify-center gap-3">
          <Badge variant="secondary" className="tabular-nums">
            {score} puan
          </Badge>
          <motion.span
            key={streak}
            initial={{ scale: streak > 0 ? 1.25 : 1 }}
            animate={{ scale: 1 }}
            transition={CARD_SPRING}
            className={`inline-flex items-center gap-1 text-sm tabular-nums ${
              streak >= 5 ? "text-primary font-semibold" : "text-muted-foreground"
            }`}
          >
            <Flame className="size-3.5" />
            {streak} seri
          </motion.span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {seen} kart
          </span>
        </div>
      ) : null}

      {phase === "idle" ? (
        <Card>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground text-sm text-balance">
              {bankTotal} kelimelik B1–B2/C1 listesi, kullanım sıklığına göre
              sıralı. Bildiklerini tek dokunuşla geç; bilmediklerin çalışma
              destene düşsün. Arada seni yoklarım — “biliyorum” dediğin bir
              kelimeyi gerçekten biliyor musun diye.
            </p>
            <Button onClick={() => void start()}>
              <Play />
              {screenedTotal ? "Taramaya devam et" : "Taramaya başla"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AnimatePresence mode="wait">
        {current && (phase === "card" || phase === "check" || phase === "reveal") ? (
          <motion.div
            key={current.word}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={CARD_SPRING}
          >
            <Card
              className={
                flash === "good"
                  ? "border-primary/60"
                  : flash === "bad"
                    ? "border-destructive/60"
                    : ""
              }
            >
              <CardContent className="space-y-5">
                <div className="flex items-start gap-2">
                  <Badge variant="outline">{levelBadge}</Badge>
                  <Badge variant="secondary">{current.category}</Badge>
                  {canSpeak() ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Telaffuzu dinle"
                      className="ml-auto"
                      onClick={() => speak(displayWord(current), language)}
                    >
                      <Volume2 />
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-1 text-center">
                  <p className="text-3xl font-semibold tracking-tight">
                    {displayWord(current)}
                  </p>
                  {current.plural ? (
                    <p className="text-muted-foreground text-xs">
                      çoğul: {current.plural}
                    </p>
                  ) : null}
                </div>

                {phase === "card" ? (
                  <div className="grid gap-2">
                    <Button onClick={onKnown} className="h-12">
                      <Check />
                      Biliyorum
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        className="h-11"
                        onClick={() => onUnknown("unsure")}
                      >
                        <HelpCircle />
                        Emin değilim
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11"
                        onClick={() => onUnknown("unknown")}
                      >
                        <X />
                        Bilmiyorum
                      </Button>
                    </div>
                  </div>
                ) : null}

                {phase === "check" ? (
                  <div className="space-y-3">
                    <p className="text-muted-foreground text-center text-sm">
                      Hangisi doğru?
                    </p>
                    <div className="grid gap-2">
                      {options.map((option) => {
                        const isCorrect = option === meaning;
                        const state = !picked
                          ? "idle"
                          : isCorrect
                            ? "correct"
                            : option === picked
                              ? "wrong"
                              : "idle";
                        return (
                          <Button
                            key={option}
                            variant="outline"
                            disabled={Boolean(picked)}
                            onClick={() => onPick(option)}
                            className={`h-auto min-h-11 justify-start py-2 text-left whitespace-normal ${
                              state === "correct"
                                ? "border-primary text-primary disabled:opacity-100"
                                : state === "wrong"
                                  ? "border-destructive text-destructive disabled:opacity-100"
                                  : ""
                            }`}
                          >
                            {option}
                          </Button>
                        );
                      })}
                    </div>
                    {picked ? (
                      <div className="space-y-2">
                        <p className="text-muted-foreground text-sm">
                          {picked === meaning
                            ? "Doğru — bu kelimeyi biliyorsun. +5 puan."
                            : "Bu kelime desteye eklendi; Çalış sekmesinde birlikte açacağız."}
                        </p>
                        <Button onClick={advance} className="w-full">
                          Devam
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {phase === "reveal" ? (
                  <div className="space-y-3">
                    <div className="bg-muted/40 rounded-lg border px-4 py-3 text-center">
                      <p className="text-lg">{meaning || "…"}</p>
                      {!isTurkish && meaning ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                          {loadingGloss
                            ? "Türkçesi getiriliyor…"
                            : "Türkçesi gelmedi, İngilizce karşılığı gösteriliyor."}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Çalışma destene eklendi. Aralıklı tekrarla karşına
                      çıkacak.
                    </p>
                    <Button onClick={advance} className="w-full">
                      Devam
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {phase === "done" ? (
        <Card>
          <CardContent className="space-y-4 text-center">
            <p className="font-semibold">
              {deck.length ? "Tur bitti." : "Tarayacak kelime kalmadı."}
            </p>
            <div className="text-muted-foreground flex flex-wrap justify-center gap-x-4 text-sm">
              <span>{score} puan</span>
              <span>{seen} kart</span>
              <span>en uzun seri: {best}</span>
            </div>
            <Button onClick={() => void start()}>
              <Play />
              Yeni tur
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase !== "idle" && phase !== "done" ? (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setPhase("done")}>
            Turu bitir
          </Button>
        </div>
      ) : null}

      {loadingGloss && phase === "card" ? (
        <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
          <Loader2 className="size-3 animate-spin" />
          anlamlar hazırlanıyor
        </p>
      ) : null}
    </div>
  );
}
