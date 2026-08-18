"use client";

import { useCallback, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Search, Trash2, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LanguageCode } from "@/lib/dictionary";
import { getDb, listDeck, removeWord, removeWords } from "@/lib/memory";
import { canSpeak, speak } from "@/lib/speak";
import { dueLabel, retrievability } from "@/lib/srs";

const STATUS_LABEL: Record<string, string> = {
  new: "yeni",
  learning: "öğreniliyor",
  review: "tekrarda",
};

/**
 * Calisma destesinin icerigi ve kelime cikarma.
 *
 * Deste zamanla siseriyor: yanlis yazilmis, artik gerekmeyen ya da zaten
 * bilinen kelimeler tekrar sirasini isgal ediyor. Burasi onlari gorup
 * atabilecegin yer.
 */
export function DeckManager({ language }: { language: LanguageCode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const deck = useLiveQuery(
    async () => (getDb() ? listDeck(language) : null),
    [language],
    undefined,
  );

  const filtered = useMemo(() => {
    if (!deck) return [];
    const needle = query.trim().toLocaleLowerCase("tr");
    if (!needle) return deck;
    return deck.filter(
      (entry) =>
        entry.word.toLocaleLowerCase("tr").includes(needle) ||
        entry.gloss.toLocaleLowerCase("tr").includes(needle),
    );
  }, [deck, query]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const removeSelected = useCallback(async () => {
    const keys = [...selected];
    if (!keys.length) return;
    const ok = window.confirm(
      `${keys.length} kelime çalışma destesinden çıkarılacak. Tekrar sırasına bir daha girmeyecekler.`,
    );
    if (!ok) return;
    await removeWords(keys);
    setSelected(new Set());
  }, [selected]);

  if (!deck || deck.length === 0) return null;

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium">Destendeki kelimeler</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {deck.length}
        </span>
        <ChevronDown
          className={`text-muted-foreground ml-auto size-4 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-5 pb-5">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Kelime ara…"
                  aria-label="Destede ara"
                  className="h-10 pl-9"
                />
              </div>

              {selected.size > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-muted-foreground text-xs">
                    {selected.size} seçili
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground ml-auto text-xs"
                    onClick={() => setSelected(new Set())}
                  >
                    Vazgeç
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10 text-xs"
                    onClick={() => void removeSelected()}
                  >
                    <Trash2 />
                    Çıkar
                  </Button>
                </motion.div>
              ) : null}

              <div className="max-h-[320px] space-y-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    Eşleşen kelime yok.
                  </p>
                ) : null}

                {filtered.map((entry) => {
                  const picked = selected.has(entry.key);
                  const strength = Math.round(retrievability(entry) * 100);
                  return (
                    <div
                      key={entry.key}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                        picked
                          ? "border-destructive/50 bg-destructive/5"
                          : "border-transparent hover:border-border/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(entry.key)}
                        className="min-w-0 flex-1 text-left"
                        aria-pressed={picked}
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{entry.word}</span>
                          {entry.gloss ? (
                            <span className="text-muted-foreground truncate text-sm">
                              {entry.gloss}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-[11px]">
                          <span>{STATUS_LABEL[entry.status] ?? entry.status}</span>
                          <span>tekrar {dueLabel(entry.due)}</span>
                          {entry.status === "review" ? (
                            <span>hafızanda %{strength}</span>
                          ) : null}
                        </span>
                      </button>

                      {canSpeak() ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${entry.word} telaffuzu`}
                          onClick={() => speak(entry.word, language)}
                        >
                          <Volume2 />
                        </Button>
                      ) : null}

                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${entry.word} kelimesini desteden çıkar`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (
                            window.confirm(
                              `“${entry.word}” çalışma destesinden çıkarılsın mı?`,
                            )
                          ) {
                            void removeWord(entry.key);
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Çıkardığın kelime tekrar sırasına bir daha girmez ve Tarama’da da
                karşına çıkmaz. Tekrar geçmişin silinmiyor — zamanlama ölçümü
                ona dayanıyor.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
