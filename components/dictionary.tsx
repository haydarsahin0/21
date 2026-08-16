"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, Settings2, Trash2 } from "lucide-react";

import { Chat } from "@/components/chat";
import { MemoryPanel } from "@/components/memory-panel";
import { StudyPanel } from "@/components/study-panel";
import { WritingPanel } from "@/components/writing-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LANGUAGES, isLanguageCode } from "@/lib/dictionary";
import * as storage from "@/lib/storage";

export function Dictionary() {
  const language = useSyncExternalStore(
    storage.subscribe,
    storage.getLanguageSnapshot,
    storage.getLanguageServerSnapshot,
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

  // Anahtar yoksa yapilacak tek is anahtari almak; sohbeti gostermek
  // kullaniciyi calismayacak bir kutuya yonlendirmek olurdu.
  const hasKey = Boolean(storage.currentKey(settings));
  if (!hasKey || showSettings) {
    return (
      // Form alanlari useState ile kuruluyor; ilk render hidrasyon oncesi
      // varsayilanlarla geldigi icin kayitli ayarlar (ornegin seviye) forma
      // yansimiyordu. Anahtar degisince bilesen bastan kuruluyor ve alanlar
      // localStorage'daki gercek degerlerle doluyor.
      <SettingsPanel
        key={`${settings.provider}:${settings.model}:${settings.explainLevel}`}
        settings={settings}
        firstRun={!hasKey}
        onDone={() => setShowSettings(false)}
      />
    );
  }

  return (
    <Tabs defaultValue="study" className="gap-6">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <TabsList>
          <TabsTrigger value="study">Çalış</TabsTrigger>
          <TabsTrigger value="chat">Sohbet</TabsTrigger>
          <TabsTrigger value="writing">Yazma</TabsTrigger>
          <TabsTrigger value="saved">
            Defter
            {visibleSaved.length > 0 ? ` (${visibleSaved.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="memory">Hafıza</TabsTrigger>
        </TabsList>

        <Select
          value={language}
          onValueChange={(value) => {
            if (isLanguageCode(value)) storage.setLanguage(value);
          }}
        >
          <SelectTrigger className="h-9 w-[130px]" aria-label="Hedef dil">
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

        <Button
          variant="ghost"
          size="icon"
          aria-label="Ayarlar"
          onClick={() => setShowSettings(true)}
        >
          <Settings2 />
        </Button>
      </div>

      {/* forceMount: Radix sekme icerigini varsayilan olarak sokup atiyor.
          Onsuz kelime defterine gecip donunce sohbet silinirdi; pasifken
          Radix zaten hidden isaretliyor. */}
      <TabsContent value="chat" forceMount>
        {/* key: dil degisince sohbet bastan baslasin — yarim kalan bir
            konusma yeni dilde anlamsiz olurdu. */}
        <Chat key={language} language={language} settings={settings} />
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
            Henüz kelime eklemedin. Sohbette bir kelime konuşup “kaydet” de.
          </p>
        ) : (
          <div className="grid gap-2">
            {visibleSaved.map((entry) => (
              <Card key={entry.word} className="py-0">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <span className="font-semibold">{entry.word}</span>
                    {entry.turkish ? (
                      <span className="text-muted-foreground block text-sm">
                        {entry.turkish}
                      </span>
                    ) : null}
                  </div>
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

      <TabsContent value="study">
        <StudyPanel language={language} settings={settings} />
      </TabsContent>

      <TabsContent value="writing">
        <WritingPanel language={language} settings={settings} />
      </TabsContent>

      <TabsContent value="memory">
        <MemoryPanel language={language} />
      </TabsContent>
    </Tabs>
  );
}
