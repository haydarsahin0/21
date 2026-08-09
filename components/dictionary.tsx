"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Download, Loader2, Search, Settings2, Trash2 } from "lucide-react";

import { ResultCard } from "@/components/result-card";
import { SettingsPanel } from "@/components/settings-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LANGUAGES,
  isLanguageCode,
  type LanguageCode,
  type LookupResult,
} from "@/lib/dictionary";
import { lookupWithGemini } from "@/lib/gemini";
import * as storage from "@/lib/storage";

export function Dictionary() {
  const language = useSyncExternalStore(
    storage.subscribe,
    storage.getLanguageSnapshot,
    storage.getLanguageServerSnapshot,
  );
  const history = useSyncExternalStore(
    storage.subscribe,
    storage.getHistorySnapshot,
    storage.getHistoryServerSnapshot,
  );
  const savedWords = useSyncExternalStore(
    storage.subscribe,
    storage.getSavedSnapshot,
    storage.getSavedServerSnapshot,
  );
  const settings = useSyncExternalStore(
    storage.subscribe,
    storage.getSettingsSnapshot,
    storage.getSettingsServerSnapshot,
  );

  const [showSettings, setShowSettings] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  // Hizli ard arda aramalarda gec donen bir cevabin yenisini ezmesini engeller.
  const requestId = useRef(0);

  const search = useCallback(
    async (rawWord: string, lang: LanguageCode, refresh = false) => {
      const word = rawWord.trim();
      if (!word) return;

      setQuery(word);
      setError("");
      storage.addHistory(word, lang);

      if (!refresh) {
        const hit = storage.getCached(word, lang);
        if (hit) {
          setResult(hit);
          setCached(true);
          return;
        }
      }

      const { apiKey, model } = storage.getSettingsSnapshot();
      if (!apiKey) {
        setShowSettings(true);
        return;
      }

      const id = ++requestId.current;
      setLoading(true);

      try {
        const data = await lookupWithGemini({ word, language: lang, apiKey, model });
        if (id !== requestId.current) return;

        if (data.found) storage.putCached(word, lang, data);
        setResult(data);
        setCached(false);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setResult(null);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  const handleLanguageChange = (value: string) => {
    if (!isLanguageCode(value)) return;
    storage.setLanguage(value);
    inputRef.current?.focus();
  };

  const resultWord = result ? result.lemma || result.word : "";
  const saved = result ? storage.isSaved(resultWord, result.language) : false;

  const toggleSave = () => {
    if (!result) return;
    if (saved) {
      storage.unsaveWord(resultWord, result.language);
    } else {
      storage.saveWord(
        resultWord,
        result.language,
        result.turkishMeanings.join(", "),
      );
    }
  };

  const visibleSaved = savedWords.filter(
    (entry) => entry.language === language,
  );

  const downloadTsv = () => {
    const blob = new Blob([storage.toTsv(visibleSaved)], {
      type: "text/tab-separated-values",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kelimeler-${language}.tsv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Anahtar yoksa yapilacak tek is anahtari almak; arama arayuzunu gostermek
  // kullaniciyi calismayacak bir kutuya yonlendirmek olurdu.
  if (!settings.apiKey || showSettings) {
    return (
      <SettingsPanel
        settings={settings}
        firstRun={!settings.apiKey}
        onDone={() => setShowSettings(false)}
      />
    );
  }

  return (
    <Tabs defaultValue="search" className="gap-6">
      <div className="flex items-center justify-center gap-2">
        <TabsList>
          <TabsTrigger value="search">Ara</TabsTrigger>
          <TabsTrigger value="saved">
            Kelime Defteri
            {visibleSaved.length > 0 ? ` (${visibleSaved.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ayarlar"
          onClick={() => setShowSettings(true)}
        >
          <Settings2 />
        </Button>
      </div>

      <TabsContent value="search" className="space-y-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search(query, language);
          }}
          className="flex flex-wrap gap-2"
        >
          <Select value={language} onValueChange={handleLanguageChange}>
            <SelectTrigger className="h-11 w-[150px]" aria-label="Hedef dil">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LANGUAGES).map(([code, meta]) => (
                <SelectItem key={code} value={code}>
                  {meta.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Kelimeyi yaz, örn. ${
              language === "de" ? "verstehen" : "understand"
            }`}
            autoComplete="off"
            autoFocus
            className="h-11 flex-1 basis-56 text-base"
          />

          <Button type="submit" size="lg" disabled={loading} className="h-11">
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
            Ara
          </Button>
        </form>

        {error ? (
          <Card className="border-destructive/60">
            <CardContent className="text-destructive text-sm">
              {error}
            </CardContent>
          </Card>
        ) : null}

        {result ? (
          <ResultCard
            result={result}
            cached={cached}
            saved={saved}
            onLookup={(word) => void search(word, language)}
            onToggleSave={toggleSave}
            onRefresh={() => void search(resultWord, language, true)}
          />
        ) : null}

        {!result && !error ? (
          <p className="text-muted-foreground text-center text-sm text-balance">
            Hedef dilde bir kelime ara: Türkçe karşılığı, o dildeki tanımı ve eş
            anlamlıları birlikte gelsin.
          </p>
        ) : null}

        {history.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
              Son aramalar
            </h2>
            <div className="flex flex-wrap gap-2">
              {history.slice(0, 15).map((entry) => (
                <button
                  key={`${entry.language}:${entry.word}`}
                  type="button"
                  onClick={() => {
                    storage.setLanguage(entry.language);
                    void search(entry.word, entry.language);
                  }}
                  className="bg-background/40 hover:border-primary hover:text-primary cursor-pointer rounded-full border px-3 py-1 text-sm backdrop-blur-sm"
                >
                  {entry.word}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="saved" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {LANGUAGES[language].name} kelimeleri
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadTsv}
            disabled={visibleSaved.length === 0}
          >
            <Download />
            Anki için TSV indir
          </Button>
        </div>

        {visibleSaved.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Henüz kelime eklemedin. Bir kelime arayıp “Deftere ekle” de.
          </p>
        ) : (
          <div className="grid gap-2">
            {visibleSaved.map((entry) => (
              <Card key={entry.word} className="py-0">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => void search(entry.word, entry.language)}
                    className="cursor-pointer text-left"
                  >
                    <span className="font-semibold">{entry.word}</span>
                    {entry.turkish ? (
                      <span className="text-muted-foreground block text-sm">
                        {entry.turkish}
                      </span>
                    ) : null}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${entry.word} kelimesini sil`}
                    onClick={() =>
                      storage.unsaveWord(entry.word, entry.language)
                    }
                  >
                    <Trash2 />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
