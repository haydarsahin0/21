"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "motion/react";
import {
  BookOpen,
  Check,
  Flame,
  HelpCircle,
  Play,
  RotateCcw,
  Volume2,
  X,
} from "lucide-react";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
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
import { explainWord, type StudyCall } from "@/lib/study";
import { Typewriter } from "@/lib/typewriter";
import {
  bandLabel,
  displayWord,
  loadBank,
  type BankWord,
} from "@/lib/wordbank";

/** Kac "biliyorum"da bir kontrol sorusu gelsin (aralik). */
const CHECK_EVERY = [4, 8] as const;
/** Onbellege kac kart ilerisinin Turkce karsiligi cekilsin. */
const PREFETCH = 15;
/** Karti kabul etmek icin gereken surukleme mesafesi (px). */
const SWIPE = 90;

type Phase = "idle" | "card" | "check" | "reveal" | "done";

const SPRING = { type: "spring", stiffness: 360, damping: 30 } as const;

/** Tur basina renk: kart yiginini bir bakista okunur yapiyor. */
const CATEGORY_TONE: Record<string, string> = {
  isim: "text-sky-300 border-sky-400/30 bg-sky-400/10",
  fiil: "text-violet-300 border-violet-400/30 bg-violet-400/10",
  sıfat: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  zarf: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
};

/**
 * Kelimenin acilmis hali. Metin akarken yaziliyor; hata olursa tekrar deneme
 * dugmesi cikiyor — kart yine de gecilebiliyor, aciklama zorunlu degil.
 */
function WordDetail({
  text,
  busy,
  error,
  onRetry,
}: {
  text: string;
  busy: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="border-destructive/40 space-y-2 rounded-xl border px-4 py-3">
        <p className="text-destructive text-xs leading-relaxed">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onRetry}
        >
          <RotateCcw className="size-3.5" />
          Tekrar dene
        </Button>
      </div>
    );
  }

  if (!text && !busy) return null;

  return (
    <div className="border-border/60 bg-background/30 rounded-xl border px-4 py-3 text-sm leading-relaxed">
      {text ? (
        <div className={busy ? "chat-stream" : undefined}>
          <Markdown>{text}</Markdown>
        </div>
      ) : (
        <span className="thinking-dots text-muted-foreground text-xs">
          kelime açılıyor
        </span>
      )}
    </div>
  );
}

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

  const [glosses, setGlosses] = useState<Map<string, string>>(new Map());
  const [loadingGloss, setLoadingGloss] = useState(false);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [seen, setSeen] = useState(0);
  const [checkIn, setCheckIn] = useState(() => randomBetween(CHECK_EVERY));
  const [options, setOptions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  /** Ekrana yukselip kaybolan "+5" balonu. */
  const [pop, setPop] = useState<{ id: number; points: number } | null>(null);
  /** Kelimenin acilmis hali: anlam, kullanim, ornek cumleler. */
  const [detail, setDetail] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const typewriterRef = useRef<Typewriter | null>(null);
  const popId = useRef(0);

  // Surukleme: karti yatayda cekiyorsun, egilme ve renk ipucu buna bagli.
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-14, 14]);
  const yesGlow = useTransform(x, [20, SWIPE], [0, 1]);
  const noGlow = useTransform(x, [-SWIPE, -20], [1, 0]);

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
      detailAbortRef.current?.abort();
      typewriterRef.current?.cancel();
    };
  }, [language]);

  const current = deck[index] ?? null;
  const upcoming = deck.slice(index + 1, index + 3);
  const meaning = current ? (glosses.get(current.word) ?? "") : "";

  const fetchGlosses = useCallback(
    async (entries: BankWord[]) => {
      const missing = entries.filter((entry) => !glosses.has(entry.word));
      if (!missing.length) return new Map(glosses);

      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingGloss(true);
      try {
        const found = await ensureGlosses(
          buildCall(controller.signal),
          missing,
          language,
        );
        if (controller.signal.aborted) return new Map(glosses);
        const merged = new Map([...glosses, ...found]);
        setGlosses(merged);
        return merged;
      } finally {
        if (!controller.signal.aborted) setLoadingGloss(false);
      }
    },
    [buildCall, glosses, language],
  );

  const prefetch = useCallback(
    (from: number, rows: BankWord[]) => {
      void fetchGlosses(rows.slice(from, from + PREFETCH));
    },
    [fetchGlosses],
  );

  /**
   * Kelimeyi acar: anlam, ne zaman kullanildigi, ornek cumleler. Cevap akarken
   * yaziliyor — Sohbet ve Calis ekranlarindaki ile ayni his.
   */
  const explain = useCallback(
    async (entry: BankWord) => {
      detailAbortRef.current?.abort();
      typewriterRef.current?.cancel();

      const controller = new AbortController();
      detailAbortRef.current = controller;
      const typewriter = new Typewriter(setDetail);
      typewriterRef.current = typewriter;

      setDetail("");
      setDetailError("");
      setDetailBusy(true);

      try {
        const text = await explainWord(
          { ...buildCall(controller.signal), onDelta: (c) => typewriter.push(c) },
          entry.word,
          {
            article: entry.article,
            plural: entry.plural,
            category: entry.category,
          },
        );
        if (controller.signal.aborted) return;
        await typewriter.finish();
        if (!controller.signal.aborted) setDetail(text);
      } catch (err) {
        if (!controller.signal.aborted) {
          setDetailError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!controller.signal.aborted) setDetailBusy(false);
        typewriterRef.current = null;
      }
    },
    [buildCall],
  );

  const start = useCallback(async () => {
    if (!bank?.length) return;
    const done = new Set((await listScreened(language)).map((row) => row.word));
    const fresh = bank.filter((entry) => !done.has(entry.word));
    setDeck(fresh);
    setIndex(0);
    setSeen(0);
    setScore(0);
    setStreak(0);
    setBest(0);
    setCheckIn(randomBetween(CHECK_EVERY));
    setPhase(fresh.length ? "card" : "done");
    prefetch(0, fresh);
  }, [bank, language, prefetch]);

  const advance = useCallback(() => {
    const next = index + 1;
    setPicked(null);
    setOptions([]);
    detailAbortRef.current?.abort();
    typewriterRef.current?.cancel();
    setDetail("");
    setDetailError("");
    setDetailBusy(false);
    x.set(0);
    if (next >= deck.length) {
      setPhase("done");
      return;
    }
    setIndex(next);
    setPhase("card");
    if (next % Math.floor(PREFETCH / 2) === 0) prefetch(next, deck);
  }, [deck, index, prefetch, x]);

  const bump = useCallback((points: number, keepStreak: boolean) => {
    setScore((value) => value + points);
    setSeen((value) => value + 1);
    setStreak((value) => {
      const next = keepStreak ? value + 1 : 0;
      setBest((top) => Math.max(top, next));
      return next;
    });
    popId.current += 1;
    setPop({ id: popId.current, points });
  }, []);

  const askCheck = useCallback(() => {
    if (!current) return;
    const pool = deck
      .filter(
        (entry) =>
          entry.word !== current.word && entry.category === current.category,
      )
      .map((entry) => glosses.get(entry.word))
      .filter((text): text is string => Boolean(text) && text !== meaning);

    const distractors = shuffle([...new Set(pool)]).slice(0, 3);
    // Yeterli celdirici ya da anlam yoksa soruyu sorma; olcmeyen soru sormaktansa
    // karti gecmek daha durust.
    if (!meaning || distractors.length < 3) {
      void markScreened(current.word, language, "known");
      bump(1, true);
      advance();
      return;
    }
    setOptions(shuffle([meaning, ...distractors]));
    setPhase("check");
  }, [advance, bump, current, deck, glosses, language, meaning]);

  const onKnown = useCallback(() => {
    if (!current || phase !== "card") return;
    if (checkIn <= 1) {
      setCheckIn(randomBetween(CHECK_EVERY));
      askCheck();
      return;
    }
    setCheckIn((value) => value - 1);
    void markScreened(current.word, language, "known");
    bump(1, true);
    advance();
  }, [advance, askCheck, bump, checkIn, current, language, phase]);

  const onUnknown = useCallback(
    (verdict: "unsure" | "unknown") => {
      if (!current || phase !== "card") return;
      void markScreened(current.word, language, verdict);
      void addWord(current.word, language, glosses.get(current.word) ?? "");
      bump(2, true);
      setPhase("reveal");
      // Anlami henuz gelmediyse simdi getir: kart acikken bekletmek yerine.
      if (!glosses.has(current.word)) void fetchGlosses([current]);
      // Bilmedigin kelime kisa bir karsilikla gecistirilmesin: aciklamasi,
      // kullanimi ve ornek cumleleri de gelsin.
      void explain(current);
    },
    [bump, current, explain, fetchGlosses, glosses, language, phase],
  );

  const onPick = useCallback(
    (choice: string) => {
      if (!current || picked) return;
      setPicked(choice);
      if (choice === meaning) {
        void markScreened(current.word, language, "known");
        bump(5, true);
      } else {
        void markScreened(current.word, language, "unknown", true);
        void addWord(current.word, language, glosses.get(current.word) ?? "");
        bump(0, false);
        // Yanildigin kelime aciklamasiz gecmesin.
        void explain(current);
      }
    },
    [bump, current, explain, glosses, language, meaning, picked],
  );

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const offset = info.offset.x;
      if (offset > SWIPE) onKnown();
      else if (offset < -SWIPE) onUnknown("unknown");
      else x.set(0);
    },
    [onKnown, onUnknown, x],
  );

  const bankTotal = bank?.length ?? 0;
  const screenedTotal = counts?.total ?? 0;
  const coverage = bankTotal ? (screenedTotal / bankTotal) * 100 : 0;
  const remaining = deck.length - index;

  const tone = useMemo(
    () =>
      current
        ? (CATEGORY_TONE[current.category] ??
          "text-muted-foreground border-border bg-muted/30")
        : "",
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
    return (
      <div className="flex items-center justify-center py-16">
        <div className="bg-primary/60 size-2 animate-ping rounded-full" />
      </div>
    );
  }

  const playing = phase === "card" || phase === "check" || phase === "reveal";

  return (
    <div className="space-y-6">
      {/* Ilerleme seridi */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Kelime avı</h2>
          <span className="text-muted-foreground text-xs tabular-nums">
            {screenedTotal.toLocaleString("tr")} /{" "}
            {bankTotal.toLocaleString("tr")} · %{coverage.toFixed(1)}
          </span>
        </div>
        <div className="bg-muted/60 h-1.5 overflow-hidden rounded-full">
          <motion.div
            className="from-primary h-full rounded-full bg-gradient-to-r to-sky-300"
            initial={false}
            animate={{ width: `${coverage}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 24 }}
          />
        </div>
        <div className="text-muted-foreground flex gap-4 text-[11px]">
          <span>Bildiğin: {counts?.known ?? 0}</span>
          <span>
            Desteye giren: {(counts?.unknown ?? 0) + (counts?.unsure ?? 0)}
          </span>
          {playing ? <span>Kalan: {remaining}</span> : null}
        </div>
      </div>

      {/* Skor seridi */}
      {playing ? (
        <div className="relative flex items-center justify-center gap-5">
          <span className="text-sm tabular-nums">
            <span className="font-semibold">{score}</span>
            <span className="text-muted-foreground"> puan</span>
          </span>

          <motion.span
            key={`streak-${streak}`}
            initial={{ scale: streak > 0 ? 1.3 : 1 }}
            animate={{ scale: 1 }}
            transition={SPRING}
            className={`inline-flex items-center gap-1 text-sm tabular-nums ${
              streak >= 5 ? "text-primary font-semibold" : "text-muted-foreground"
            }`}
          >
            <Flame
              className="size-3.5"
              style={
                streak >= 5
                  ? { filter: "drop-shadow(0 0 6px currentColor)" }
                  : undefined
              }
            />
            {streak}
          </motion.span>

          <span className="text-muted-foreground text-sm tabular-nums">
            {seen} kart
          </span>

          {/* Puan balonu */}
          <AnimatePresence>
            {pop ? (
              <motion.span
                key={pop.id}
                initial={{ opacity: 0, y: 6, scale: 0.8 }}
                animate={{ opacity: 1, y: -22, scale: 1 }}
                exit={{ opacity: 0, y: -34 }}
                transition={{ duration: 0.5 }}
                onAnimationComplete={() => setPop(null)}
                className={`pointer-events-none absolute text-sm font-semibold ${
                  pop.points > 0 ? "text-primary" : "text-destructive"
                }`}
              >
                {pop.points > 0 ? `+${pop.points}` : "kaçtı"}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {phase === "idle" ? (
        <div className="glass-card space-y-5 px-6 py-10 text-center">
          <p className="text-muted-foreground text-sm leading-relaxed text-balance">
            Temel {(4970).toLocaleString("tr")} kelimenin ötesindeki{" "}
            {bankTotal.toLocaleString("tr")} kelime, kullanım sıklığına göre
            sıralı. Bildiklerini sağa savur, bilmediklerini sola — bilmediklerin
            çalışma destene düşer.
          </p>
          <p className="text-muted-foreground text-xs">
            Arada seni yoklarım: “biliyorum” dediğin bir kelimeyi gerçekten
            biliyor musun diye.
          </p>
          <Button onClick={() => void start()} size="lg" className="rounded-full px-8">
            <Play />
            {screenedTotal ? "Devam et" : "Başla"}
          </Button>
        </div>
      ) : null}

      {/* Kart yigini */}
      {playing && current ? (
        <div className="relative">
          {/* Arkadaki kartlar: desteye derinlik veriyor. Yukseklikleri ondeki
              kartla ayni degil — sadece altindan gorunen bir seritler. */}
          {upcoming.map((entry, depth) => (
            <div
              key={entry.word}
              aria-hidden
              className="glass-card absolute inset-x-0 top-0 h-full"
              style={{
                transform: `translateY(${(depth + 1) * 8}px) scale(${1 - (depth + 1) * 0.035})`,
                opacity: 0.55 - depth * 0.25,
                zIndex: -depth - 1,
              }}
            />
          ))}

          {/* mode="wait": cikan kart bitmeden yenisi girmiyor. Ayni anda iki
              kart olunca hem hizli dokunuslar yanlis karta gidiyor hem de
              motion'in layout izdusumu surukleme donusumunu eziyordu. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.word}
              drag={phase === "card" ? "x" : false}
              dragSnapToOrigin
              dragElastic={0.5}
              onDragEnd={onDragEnd}
              style={{ x, rotate }}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              // Cikan kart tiklanabilir kalmasin: gecis sirasinda iki kart
              // birden ekranda oluyor ve hizli dokunuslar yanlis karta gidiyordu.
              exit={{
                opacity: 0,
                scale: 0.9,
                pointerEvents: "none",
                transition: { duration: 0.15 },
              }}
              transition={SPRING}
              className="glass-card relative touch-pan-y px-5 py-5 select-none"
            >
              {/* Surukleme ipuclari */}
              <motion.div
                aria-hidden
                style={{ opacity: yesGlow }}
                className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-emerald-400/70 bg-emerald-400/10"
              />
              <motion.div
                aria-hidden
                style={{ opacity: noGlow }}
                className="border-destructive/70 bg-destructive/10 pointer-events-none absolute inset-0 rounded-[inherit] border-2"
              />

              <div className="relative flex items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone}`}
                >
                  {current.category}
                </span>
                <span className="text-muted-foreground border-border/60 rounded-full border px-2.5 py-0.5 text-[11px]">
                  {bandLabel(current.zipf)}
                </span>
                {canSpeak() ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Telaffuzu dinle"
                    className="ml-auto rounded-full"
                    onClick={() => speak(displayWord(current), language)}
                  >
                    <Volume2 />
                  </Button>
                ) : null}
              </div>

              <div className="relative flex min-h-[104px] flex-col items-center justify-center gap-0.5 py-3">
                {current.article ? (
                  <span className="text-muted-foreground text-sm tracking-wide">
                    {current.article}
                  </span>
                ) : null}
                <p className="text-center text-4xl font-semibold tracking-tight text-balance">
                  {current.word}
                </p>
                {current.plural ? (
                  <span className="text-muted-foreground text-xs">
                    çoğul: {current.plural}
                  </span>
                ) : null}
              </div>

              {phase === "card" ? (
                <div className="relative space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 h-12 rounded-xl"
                      onClick={() => onUnknown("unknown")}
                    >
                      <X />
                      Bilmiyorum
                    </Button>
                    <Button
                      className="h-12 rounded-xl bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                      onClick={onKnown}
                    >
                      <Check />
                      Biliyorum
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-muted-foreground h-9 w-full rounded-xl text-xs"
                    onClick={() => onUnknown("unsure")}
                  >
                    <HelpCircle className="size-3.5" />
                    Emin değilim
                  </Button>
                </div>
              ) : null}

              {phase === "check" ? (
                <div className="relative space-y-2">
                  <p className="text-muted-foreground text-center text-xs">
                    Hangisi doğru?
                  </p>
                  {options.map((option, i) => {
                    const isCorrect = option === meaning;
                    const state = !picked
                      ? "idle"
                      : isCorrect
                        ? "correct"
                        : option === picked
                          ? "wrong"
                          : "idle";
                    return (
                      <motion.button
                        key={option}
                        type="button"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        disabled={Boolean(picked)}
                        onClick={() => onPick(option)}
                        className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${
                          state === "correct"
                            ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                            : state === "wrong"
                              ? "border-destructive bg-destructive/10 text-destructive"
                              : "border-border/70 hover:border-primary/60 bg-background/30"
                        }`}
                      >
                        {option}
                      </motion.button>
                    );
                  })}
                  {picked ? (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2 pt-1"
                    >
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {picked === meaning
                          ? "Doğru — bu kelimeyi biliyorsun."
                          : "Bu kelime desteye eklendi."}
                      </p>

                      {/* Yanildiysan kelimeyi burada aciyoruz; dogruysan
                          istersen sen actiriyorsun. */}
                      {picked !== meaning || detail || detailBusy ? (
                        <WordDetail
                          text={detail}
                          busy={detailBusy}
                          error={detailError}
                          onRetry={() => void explain(current)}
                        />
                      ) : (
                        <Button
                          variant="outline"
                          className="h-10 w-full rounded-xl text-xs"
                          onClick={() => void explain(current)}
                        >
                          <BookOpen className="size-3.5" />
                          Yine de aç
                        </Button>
                      )}

                      <Button onClick={advance} className="h-11 w-full rounded-xl">
                        Devam
                      </Button>
                    </motion.div>
                  ) : null}
                </div>
              ) : null}

              {phase === "reveal" ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING}
                  className="relative space-y-3"
                >
                  <div className="border-primary/30 bg-primary/5 rounded-xl border px-4 py-3 text-center">
                    {meaning ? (
                      <p className="text-lg">{meaning}</p>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {loadingGloss ? "anlamı getiriliyor…" : "anlam gelmedi"}
                      </p>
                    )}
                  </div>

                  <WordDetail
                    text={detail}
                    busy={detailBusy}
                    error={detailError}
                    onRetry={() => void explain(current)}
                  />

                  <p className="text-muted-foreground text-xs">
                    Çalışma destene eklendi. Aralıklı tekrarla karşına çıkacak.
                  </p>
                  <Button onClick={advance} className="h-11 w-full rounded-xl">
                    Devam
                  </Button>
                </motion.div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}

      {phase === "done" ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING}
          className="glass-card space-y-5 px-6 py-10 text-center"
        >
          <p className="font-semibold">
            {deck.length ? "Tur bitti." : "Tarayacak kelime kalmadı."}
          </p>
          <div className="flex justify-center gap-6">
            {[
              { label: "puan", value: score },
              { label: "kart", value: seen },
              { label: "en uzun seri", value: best },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-semibold tabular-nums">
                  {stat.value}
                </p>
                <p className="text-muted-foreground text-[11px]">{stat.label}</p>
              </div>
            ))}
          </div>
          <Button onClick={() => void start()} className="rounded-full px-8">
            <Play />
            Yeni tur
          </Button>
        </motion.div>
      ) : null}

      {playing ? (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            onClick={() => setPhase("done")}
          >
            Turu bitir
          </Button>
        </div>
      ) : null}
    </div>
  );
}
