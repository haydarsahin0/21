"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookmarkCheck, BookmarkPlus, RotateCcw, Square } from "lucide-react";

import { Markdown } from "@/components/markdown";

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
import {
  bumpWord,
  buildMemoryBlock,
  rememberMessage,
} from "@/lib/memory";
import { EXTRACT_EVERY, extractProfile } from "@/lib/profile";
import { getProvider } from "@/lib/providers";
import { Typewriter } from "@/lib/typewriter";
import * as storage from "@/lib/storage";

const ORB_TONES = { base: "oklch(19% 0.025 252)" };

// Balonlar yerine otururken hafif bir yay: ani "pop" degil, akan bir his.
const BUBBLE_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.6,
} as const;

function greeting(language: LanguageCode): string {
  const name = LANGUAGES[language].name;
  return `Merhaba. ${name} bir kelime yaz, birlikte açalım — anlamı, nerede kullanıldığı, örnek cümleler. Sonra istediğini sor: “şu kelimeden farkı ne”, “cümlemi düzeltir misin”, “bunu bir mailde kullanabilir miyim”… Sohbet ederek ilerleyelim.`;
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
  const typewriterRef = useRef<Typewriter | null>(null);
  // Kacinci asistan cevabindayiz — profil cikarimini seyreltmek icin.
  const turnRef = useRef(0);
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

      const activeWord = maybeWord ?? word;
      const next: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
      setMessages(next);
      setStreaming("");
      setError("");
      setBusy(true);
      stickRef.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      const provider = getProvider(settings.provider);
      const baseUrl = provider.editableBaseUrl
        ? settings.customBaseUrl
        : provider.baseUrl;
      const apiKey = storage.currentKey(settings);

      try {
        void rememberMessage({
          role: "user",
          text: trimmed,
          language,
          word: activeWord,
        });
        if (maybeWord) void bumpWord(maybeWord, language);

        const memory = await buildMemoryBlock(language, activeWord);

        const typewriter = new Typewriter(setStreaming);
        typewriterRef.current = typewriter;

        const full = await streamChat({
          messages: next,
          language,
          provider,
          baseUrl,
          apiKey,
          model: settings.model,
          memory,
          level: settings.explainLevel,
          signal: controller.signal,
          onDelta: (chunk) => typewriter.push(chunk),
        });
        if (controller.signal.aborted) return;

        // Akis bitti ama ekrandaki metin geride olabilir; yetismesini bekle ki
        // kalan kisim bir anda patlamasin.
        await typewriter.finish();
        if (controller.signal.aborted) return;

        typewriterRef.current = null;
        setMessages([...next, { role: "model", text: full }]);

        void rememberMessage({
          role: "model",
          text: full,
          language,
          word: activeWord,
        });

        // Profil cikarimi ek bir model cagrisi; her turda degil, birkac turda
        // bir calisiyor ve arka planda kaliyor — sohbeti bekletmiyor.
        turnRef.current += 1;
        if (turnRef.current % EXTRACT_EVERY === 0) {
          void extractProfile({
            messages: [...next, { role: "model", text: full }],
            language,
            provider,
            baseUrl,
            apiKey,
            model: settings.model,
          });
        }
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
    [busy, language, messages, settings, word],
  );

  const stop = () => {
    const partial = typewriterRef.current?.cancel() ?? streaming;
    typewriterRef.current = null;
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
    typewriterRef.current?.cancel();
    typewriterRef.current = null;
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
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={BUBBLE_SPRING}
              className="flex justify-end"
            >
              <p className="bg-primary/15 text-foreground max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap">
                {message.text}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={BUBBLE_SPRING}
              className="flex gap-3"
            >
              <div className="mt-1 shrink-0">
                <ColorOrb dimension="24px" tones={ORB_TONES} />
              </div>
              <div className="bg-card/70 max-w-[85%] rounded-2xl rounded-tl-md border px-4 py-2.5 leading-relaxed backdrop-blur-xl">
                <Markdown>{message.text}</Markdown>
              </div>
            </motion.div>
          ),
        )}

        <AnimatePresence>
          {busy ? (
            <motion.div
              key="streaming"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={BUBBLE_SPRING}
              className="flex gap-3"
            >
              <div className="mt-1 shrink-0">
                <ColorOrb dimension="24px" tones={ORB_TONES} spinDuration={3} />
              </div>
              <div className="bg-card/70 max-w-[85%] rounded-2xl rounded-tl-md border px-4 py-2.5 leading-relaxed backdrop-blur-xl">
                {streaming ? (
                  <div className="chat-stream">
                    <Markdown>{streaming}</Markdown>
                  </div>
                ) : (
                  <span className="thinking-dots text-muted-foreground">
                    düşünüyor
                  </span>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error ? (
          <p className="border-destructive/60 text-destructive rounded-xl border px-4 py-3 text-sm">
            {error}
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {started && !busy ? (
        <div className="flex flex-wrap gap-2 pt-2">
          {STEP_SUGGESTIONS.map((suggestion, index) => (
            <motion.button
              key={suggestion.label}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.25 }}
              onClick={() => void send(suggestion.prompt)}
              className="bg-background/40 hover:border-primary hover:text-primary cursor-pointer rounded-full border px-3 py-1.5 text-sm backdrop-blur-sm"
            >
              {suggestion.label}
            </motion.button>
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
          triggerLabel={started ? "Devam et" : "Sor"}
          label={LANGUAGES[language].name}
          placeholder={
            started
              ? "İstediğini sor ya da bir cümle yaz…"
              : `Bir kelime yaz ya da soru sor, örn. ${language === "de" ? "verstehen" : "understand"}`
          }
        />
      </div>
    </div>
  );
}
