"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Brain, Download, Trash2 } from "lucide-react";

import { TuningCard } from "@/components/tuning-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LANGUAGES, type LanguageCode } from "@/lib/dictionary";
import {
  countMessages,
  deleteFact,
  exportMemory,
  forgetAll,
  getDb,
  listFacts,
  listTopWords,
} from "@/lib/memory";

const KIND_LABEL: Record<string, string> = {
  seviye: "Seviye",
  ilgi: "İlgi",
  zorlandigi: "Zorlandığın",
  tarz: "Tarz",
  hedef: "Hedef",
  diger: "Diğer",
};

export function MemoryPanel({ language }: { language: LanguageCode }) {
  // useLiveQuery, Dexie yazdikca kendini yeniliyor: profil cikarimi arka
  // planda bittiginde panel elle tetiklemeye gerek kalmadan guncelleniyor.
  const data = useLiveQuery(
    async () => {
      if (!getDb()) return null;
      const [facts, words, messages] = await Promise.all([
        listFacts(language),
        listTopWords(language, 15),
        countMessages(language),
      ]);
      return { facts, words, messages };
    },
    [language],
    undefined,
  );

  const languageName = LANGUAGES[language].name;

  if (data === undefined) {
    return <p className="text-muted-foreground text-sm">Hafıza okunuyor…</p>;
  }

  if (data === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Bu tarayıcıda kalıcı depolama kapalı (gizli sekme olabilir), o yüzden
        hafıza tutulamıyor. Sohbet yine çalışır.
      </p>
    );
  }

  const download = async () => {
    const dump = await exportMemory(language);
    if (!dump) return;
    const blob = new Blob([JSON.stringify(dump, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hafiza-${language}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const wipe = async () => {
    const ok = window.confirm(
      `${languageName} için tuttuğum her şey silinecek: notlar, kelime sayaçları ve konuşma geçmişi. Emin misin?`,
    );
    if (ok) await forgetAll(language);
  };

  const empty =
    data.facts.length === 0 && data.words.length === 0 && data.messages === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Brain className="size-4" />
          Seni tanıdıkça
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={download} disabled={empty}>
            <Download />
            İndir
          </Button>
          <Button variant="ghost" size="sm" onClick={wipe} disabled={empty}>
            <Trash2 />
            Hepsini unut
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">
        Konuştukça senin hakkında not tutuyorum ve bu notları sonraki
        sohbetlerde kullanıyorum. Hepsi bu cihazda kalıyor — hiçbir yere
        gönderilmiyor. İstemediğin notu silebilirsin.
      </p>

      {empty ? (
        <p className="text-muted-foreground text-sm">
          Henüz bir şey öğrenmedim. Birkaç kelime konuşalım, sonra buraya bak.
        </p>
      ) : null}

      <TuningCard language={language} />

      {data.facts.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            Senin hakkında notlarım
          </h3>
          <div className="grid gap-2">
            {data.facts.map((fact) => (
              <Card key={fact.id} className="py-0">
                <CardContent className="flex items-start justify-between gap-3 py-3">
                  <div className="space-y-1">
                    <Badge variant="secondary">
                      {KIND_LABEL[fact.kind] ?? fact.kind}
                    </Badge>
                    <p className="text-sm leading-relaxed">{fact.text}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Bu notu sil"
                    onClick={() => fact.id && void deleteFact(fact.id)}
                  >
                    <Trash2 />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {data.words.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            En çok sorduğun kelimeler
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.words.map((entry) => (
              <span
                key={entry.key}
                className="bg-background/40 rounded-full border px-3 py-1 text-sm"
                title={`${entry.count} kez soruldu`}
              >
                {entry.word}
                {entry.count > 1 ? (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    {entry.count}×
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Birden fazla kez sorduğun kelimeleri &ldquo;tam oturmamış&rdquo;
            sayıp sohbette dikkate alıyorum.
          </p>
        </section>
      ) : null}

      {data.messages > 0 ? (
        <p className="text-muted-foreground text-xs">
          {languageName} için {data.messages} mesaj saklanıyor.
        </p>
      ) : null}
    </div>
  );
}
