"use client";

import { useCallback, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { GraduationCap, Loader2, Plus, Send, Target } from "lucide-react";

import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ColorOrb } from "@/components/ui/ai-input";
import { Input } from "@/components/ui/input";
import { LANGUAGES, type LanguageCode } from "@/lib/dictionary";
import {
  addWord,
  dueWords,
  getDb,
  gradeWord,
  knownWords,
  learnedToday,
  type WordStat,
} from "@/lib/memory";
import { getProvider } from "@/lib/providers";
import { dueLabel } from "@/lib/srs";
import * as storage from "@/lib/storage";
import {
  gradeAnswer,
  makeQuestion,
  scoreToGrade,
  suggestNewWords,
  type StudyCall,
} from "@/lib/study";

const ORB_TONES = { base: "oklch(19% 0.025 252)" };

type Phase = "idle" | "teaching" | "asking" | "answered";

export function StudyPanel({
  language,
  settings,
}: {
  language: LanguageCode;
  settings: storage.Settings;
}) {
  const goal = storage.getGoal();

  const stats = useLiveQuery(
    async () => {
      if (!getDb()) return null;
      const [due, today, known] = await Promise.all([
        dueWords(language),
        learnedToday(language),
        knownWords(language),
      ]);
      return { due, today, total: known.length };
    },
    [language],
    undefined,
  );

  // Optional-chain bir bagimlilik olarak yazilamiyor; sayiyi once cikariyoruz.
  const todayCount = stats?.today ?? 0;

  const [phase, setPhase] = useState<Phase>("idle");
  const [card, setCard] = useState<WordStat | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

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

  const startCard = useCallback(
    async (word: WordStat) => {
      const controller = new AbortController();
      abortRef.current = controller;

      setCard(word);
      setQuestion("");
      setAnswer("");
      setFeedback("");
      setNextDue("");
      setError("");
      setBusy(true);
      setPhase(word.reps === 0 ? "teaching" : "asking");

      try {
        const text = await makeQuestion(
          { ...buildCall(controller.signal), onDelta: (c) => setQuestion((p) => p + c) },
          word,
        );
        if (!controller.signal.aborted) setQuestion(text);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("idle");
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [buildCall],
  );

  const nextCard = useCallback(async () => {
    const list = await dueWords(language, 1);
    if (!list.length) {
      setPhase("idle");
      setCard(null);
      return;
    }
    await startCard(list[0]);
  }, [language, startCard]);

  const submitAnswer = useCallback(async () => {
    if (!card || !answer.trim() || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");

    try {
      const verdict = await gradeAnswer(
        buildCall(controller.signal),
        card,
        question,
        answer.trim(),
      );
      if (controller.signal.aborted) return;

      const updated = await gradeWord(card.key, scoreToGrade(verdict.score));
      setFeedback(verdict.feedback);
      setNextDue(updated ? dueLabel(updated.due) : "");
      setPhase("answered");
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [answer, busy, buildCall, card, question]);

  /** Ogretme kartinda cevap yok; "anladim" deyip tekrara sokuyoruz. */
  const markTaught = useCallback(async () => {
    if (!card) return;
    const updated = await gradeWord(card.key, "good");
    setNextDue(updated ? dueLabel(updated.due) : "");
    setFeedback("");
    setPhase("answered");
  }, [card]);

  const fetchNewWords = useCallback(async () => {
    if (busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");

    try {
      const known = await knownWords(language);
      const remaining = Math.max(0, goal - todayCount);
      const words = await suggestNewWords(
        buildCall(controller.signal),
        known,
        Math.min(remaining || goal, 8),
      );
      if (controller.signal.aborted) return;

      if (!words.length) {
        setError("Yeni kelime önerisi alınamadı, tekrar dene.");
        return;
      }
      for (const item of words) {
        await addWord(item.word, language, item.gloss);
      }
      await nextCard();
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [busy, buildCall, goal, language, nextCard, todayCount]);

  if (stats === undefined) {
    return <p className="text-muted-foreground text-sm">Hazırlanıyor…</p>;
  }
  if (stats === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Bu tarayıcıda kalıcı depolama kapalı, çalışma sistemi çalışamıyor.
      </p>
    );
  }

  const progress = Math.min(100, Math.round((stats.today / goal) * 100));
  const languageName = LANGUAGES[language].name;

  return (
    <div className="space-y-5">
      {/* Gunluk hedef */}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <Target className="size-4" />
              Bugünkü hedef
            </h2>
            <span className="text-muted-foreground text-sm tabular-nums">
              {stats.today} / {goal} yeni kelime
            </span>
          </div>

          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>Tekrar zamanı gelen: {stats.due.length}</span>
            <span>
              Toplam {languageName} kelime: {stats.total}
            </span>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="border-destructive/60 text-destructive rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {/* Kart */}
      {phase === "idle" ? (
        <Card>
          <CardContent className="space-y-4 text-center">
            <div className="flex justify-center">
              <ColorOrb dimension="56px" tones={ORB_TONES} />
            </div>
            {stats.due.length > 0 ? (
              <>
                <p className="text-muted-foreground text-sm text-balance">
                  {stats.due.length} kelimenin tekrar zamanı geldi. Hazırsan
                  başlayalım — her kelimeyi tam unutmadan önce göstereceğim.
                </p>
                <Button onClick={() => void nextCard()} disabled={busy}>
                  <GraduationCap />
                  Çalışmaya başla
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm text-balance">
                  Tekrar bekleyen kelime yok. Bugünkü hedefe{" "}
                  {Math.max(0, goal - stats.today)} kelime kaldı.
                </p>
                <Button onClick={() => void fetchNewWords()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                  Yeni kelime getir
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {card && phase !== "idle" ? (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-semibold">{card.word}</span>
              {card.gloss ? (
                <span className="text-muted-foreground text-sm">
                  {card.gloss}
                </span>
              ) : null}
              <Badge variant="secondary" className="ml-auto">
                {card.status === "new"
                  ? "yeni"
                  : card.status === "learning"
                    ? "öğreniliyor"
                    : `${card.reps}. tekrar`}
              </Badge>
            </div>

            <div className="bg-muted/40 rounded-lg border px-4 py-3 leading-relaxed">
              {question ? (
                <Markdown>{question}</Markdown>
              ) : (
                <span className="text-muted-foreground text-sm">
                  hazırlanıyor…
                </span>
              )}
            </div>

            {phase === "teaching" ? (
              <Button onClick={() => void markTaught()} disabled={busy}>
                Anladım, sırada ne var
              </Button>
            ) : null}

            {phase === "asking" ? (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitAnswer();
                }}
              >
                <Input
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Cevabını yaz…"
                  autoComplete="off"
                  className="h-11"
                  disabled={busy || !question}
                />
                <Button
                  type="submit"
                  className="h-11"
                  disabled={busy || !answer.trim()}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
              </form>
            ) : null}

            {phase === "answered" ? (
              <div className="space-y-3">
                {feedback ? (
                  <div className="border-primary/50 bg-primary/5 rounded-lg border px-4 py-3 leading-relaxed">
                    <Markdown>{feedback}</Markdown>
                  </div>
                ) : null}
                {nextDue ? (
                  <p className="text-muted-foreground text-xs">
                    Bu kelimeyi tekrar {nextDue} soracağım.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void nextCard()} disabled={busy}>
                    Sıradaki kelime
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      abortRef.current?.abort();
                      setPhase("idle");
                      setCard(null);
                    }}
                  >
                    Bitir
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
