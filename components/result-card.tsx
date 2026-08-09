"use client";

import { BookmarkCheck, BookmarkPlus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LANGUAGES, type LookupResult } from "@/lib/dictionary";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ResultCard({
  result,
  cached,
  saved,
  onLookup,
  onToggleSave,
  onRefresh,
}: {
  result: LookupResult;
  cached: boolean;
  saved: boolean;
  onLookup: (word: string) => void;
  onToggleSave: () => void;
  onRefresh: () => void;
}) {
  if (!result.found) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            {result.word}
          </h2>
          <p className="text-muted-foreground">
            {result.correctionNote || "Bu kelime sözlükte bulunamadı."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const morphology = [
    ["Artikel", result.morphology.article],
    ["Çoğul", result.morphology.plural],
    ["Çekimler", result.morphology.verbForms],
    ["Diğer", result.morphology.other],
  ].filter(([, value]) => value);

  const languageName = LANGUAGES[result.language].name;

  return (
    <Card>
      <CardContent className="space-y-7">
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-3xl font-semibold tracking-tight">
              {result.lemma || result.word}
            </h2>
            {result.ipa ? (
              <span className="text-muted-foreground text-sm">{result.ipa}</span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {result.partOfSpeech ? (
              <Badge variant="secondary">{result.partOfSpeech}</Badge>
            ) : null}
            {result.cefr ? <Badge>{result.cefr}</Badge> : null}
            {cached ? <Badge variant="outline">önbellekten</Badge> : null}
          </div>

          {result.correctionNote ? (
            <p className="border-primary/40 bg-primary/10 rounded-lg border px-3 py-2 text-sm">
              {result.correctionNote}
            </p>
          ) : null}
        </div>

        <Separator />

        {result.turkishMeanings.length > 0 ? (
          <Section title="Türkçe karşılığı">
            <div className="flex flex-wrap gap-2">
              {result.turkishMeanings.map((meaning) => (
                <span
                  key={meaning}
                  className="bg-primary/15 text-primary rounded-lg px-3 py-1.5 font-semibold"
                >
                  {meaning}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {result.turkishExplanation ? (
          <Section title="Kullanım notu">
            <p className="text-sm leading-relaxed">
              {result.turkishExplanation}
            </p>
          </Section>
        ) : null}

        {result.nativeDefinition ? (
          <Section title={`${languageName} açıklaması`}>
            <p className="border-primary bg-muted/40 rounded-r-lg border-l-2 px-4 py-3 leading-relaxed">
              {result.nativeDefinition}
            </p>
          </Section>
        ) : null}

        {result.synonyms.length > 0 ? (
          <Section title="Eş anlamlılar">
            <div className="grid gap-2">
              {result.synonyms.map((term) => (
                <div
                  key={term.word}
                  className="bg-muted/40 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-lg border px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => onLookup(term.word)}
                    className="text-primary cursor-pointer font-semibold hover:underline"
                  >
                    {term.word}
                  </button>
                  {term.note ? (
                    <span className="text-muted-foreground text-sm">
                      {term.note}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {result.antonyms.length > 0 ? (
          <Section title="Zıt anlamlılar">
            <div className="flex flex-wrap gap-2">
              {result.antonyms.map((term) => (
                <button
                  key={term.word}
                  type="button"
                  onClick={() => onLookup(term.word)}
                  className="hover:border-primary hover:text-primary cursor-pointer rounded-full border px-3 py-1 text-sm"
                  title={term.note}
                >
                  {term.word}
                </button>
              ))}
            </div>
          </Section>
        ) : null}

        {result.collocations.length > 0 ? (
          <Section title="Sık kullanılan kalıplar">
            <div className="flex flex-wrap gap-2">
              {result.collocations.map((item) => (
                <span
                  key={item}
                  className="bg-background/40 rounded-full border px-3 py-1 text-sm"
                >
                  {item}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {result.examples.length > 0 ? (
          <Section title="Örnek cümleler">
            <ul className="grid gap-3">
              {result.examples.map((example) => (
                <li key={example.sentence} className="border-l-2 pl-3">
                  <p className="font-medium">{example.sentence}</p>
                  {example.translation ? (
                    <p className="text-muted-foreground text-sm">
                      {example.translation}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {morphology.length > 0 ? (
          <Section title="Biçim bilgisi">
            <dl className="grid gap-1.5 text-sm">
              {morphology.map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <dt className="text-muted-foreground w-24 shrink-0">
                    {label}
                  </dt>
                  <dd className="m-0">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant={saved ? "default" : "outline"}
            size="sm"
            onClick={onToggleSave}
          >
            {saved ? <BookmarkCheck /> : <BookmarkPlus />}
            {saved ? "Defterde" : "Deftere ekle"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw />
            Yeniden sorgula
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
