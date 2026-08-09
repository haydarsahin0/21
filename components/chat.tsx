"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BookmarkCheck, BookmarkPlus, RotateCcw, Square } from "lucide-react";

import { ColorOrb, MorphPanel } from "@/components/ui/ai-input";
import { Button } from "@/components/ui/button";
import {
  STEP_SUGGESTIONS,
  extractWord,
  streamChat,
  type ChatMessage,
} from "@/lib/chat";
import {
  LANGUAGES,
  normalizeWord,
  type LanguageCode,
} from "@/lib/dictionary";
import { getProvider } from "@/lib/providers";
import * as storage from "@/lib/storage";

const ORB_TONES = { base: "oklch(19% 0.025 252)" };

function greeting(language: LanguageCode): string {
  return `Merhaba. ${LANGUAGES[language].name} bir kelime yaz, birlikte adım adım açalım. Her şeyi bir anda vermeyeceğim — sen istedikçe derinleşeceğiz.`;
}

export function Chat({
  language,
  settings,
}: {
  language: LanguageCode;
  settings: storage.Settings;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [word, setWord] = useState<string | null>(null);

  const savedWords = useSyncExternalStore(
    storage.subscribe,
    storage.getSavedSnapshot,
    storage.getSavedServerSnapshot,
  );
  const normalized = word ? normalizeWord(word) : "";
  const isSaved = savedWords.some(
    (entry) => entry.word === normalized && entry.language === language,
  );

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Kullanici yukari kaydirdiysa otomatik takip etmeyi birak.
  const stickRef = useRef(true);

  useEffect(() => {
    if (stickRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [messages, streaming]);

  // Dil degisince sohbet sifirlanir; bu bilesen ust tarafta `key={language}`
  // ile render edildigi icin React bileseni bastan kuruyor. Burada yalniz
  // sokulurken acik kalan akisi kapatmak kaliyor.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const maybeWord = extractWord(trimmed);
      if (maybeWord) setWord(maybeWord);

      const next: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
      setMessages(next);
      setStreaming("");
      setError("");
      setBusy(true);
      stickRef.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const provider = getProvider(settings.provider);
        const full = await streamChat({
          messages: next,
          language,
          provider,
          baseUrl: provider.editableBaseUrl
            ? settings.customBaseUrl
            : provider.baseUrl,
          apiKey: storage.currentKey(settings),
          model: settings.model,
          signal: controller.signal,
          onDelta: (chunk) => setStreaming((prev) => prev + chunk),
        });
        if (controller.signal.aborted) return;
        setMessages([...next, { role: "model", text: full }]);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) {
          setStreaming("");
          setBusy(false);
        }
        abortRef.current = null;
      }
    },
    [busy, language, messages, settings],
  );

  const stop = () => {
    const partial = streaming;
    abortRef.current?.abort();
    abortRef.current = null;
    // Yarida kesilen metni atmak yerine sakla: kullanici zaten okuyordu.
    if (partial.trim()) {
      setMessages((prev) => [...prev, { role: "model", text: partial }]);
    }
    setStreaming("");
    setBusy(false);
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setStreaming("");
    setBusy(false);
    setError("");
    setWord(null);
  };

  const toggleSave = () => {
    if (!word) return;
    if (isSaved) storage.unsaveWord(word, language);
    else storage.saveWord(word, language, "");
  };

  const started = messages.length > 0;

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-4 overflow-y-auto pb-4"
      >
        {!started ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <ColorOrb dimension="72px" tones={ORB_TONES} />
            <p className="text-muted-foreground max-w-sm text-balance">
              {greeting(language)}
            </p>
          </div>
        ) : null}

        {messages.map((message, index) =>
          message.role === "user" ? (
            <div key={index} className="flex justify-end">
              <p className="bg-primary/15 text-foreground max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap">
                {message.text}
              </p>
            </div>
          ) : (
            <div key={index} className="flex gap-3">
              <div className="mt-1 shrink-0">
                <ColorOrb dimension="24px" tones={ORB_TONES} />
              </div>
              <p className="bg-card/70 max-w-[85%] rounded-2xl rounded-tl-md border px-4 py-2.5 leading-relaxed whitespace-pre-wrap backdrop-blur-xl">
                {message.text}
              </p>
            </div>
          ),
        )}

        {busy ? (
          <div className="flex gap-3">
            <div className="mt-1 shrink-0">
              <ColorOrb dimension="24px" tones={ORB_TONES} spinDuration={3} />
            </div>
            <p className="bg-card/70 max-w-[85%] rounded-2xl rounded-tl-md border px-4 py-2.5 leading-relaxed whitespace-pre-wrap backdrop-blur-xl">
              {streaming || (
                <span className="text-muted-foreground">düşünüyor…</span>
              )}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="border-destructive/60 text-destructive rounded-xl border px-4 py-3 text-sm">
            {error}
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {started && !busy ? (
        <div className="flex flex-wrap gap-2 pt-2">
          {STEP_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => void send(suggestion.prompt)}
              className="bg-background/40 hover:border-primary hover:text-primary cursor-pointer rounded-full border px-3 py-1.5 text-sm backdrop-blur-sm"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {word ? (
          <Button variant={isSaved ? "default" : "outline"} size="sm" onClick={toggleSave}>
            {isSaved ? <BookmarkCheck /> : <BookmarkPlus />}
            {isSaved ? `“${word}” defterde` : `“${word}” kelimesini kaydet`}
          </Button>
        ) : null}

        {busy ? (
          <Button variant="outline" size="sm" onClick={stop}>
            <Square />
            Durdur
          </Button>
        ) : null}

        {started && !busy ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw />
            Yeni sohbet
          </Button>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex justify-center pt-2">
        <MorphPanel
          onSubmit={(message) => void send(message)}
          busy={busy}
          triggerLabel={started ? "Devam et" : "Kelime sor"}
          label={LANGUAGES[language].name}
          placeholder={
            started ? "Bir şey sor…" : `Bir kelime yaz, örn. ${language === "de" ? "verstehen" : "understand"}`
          }
        />
      </div>
    </div>
  );
}
