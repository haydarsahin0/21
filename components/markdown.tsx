"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

/**
 * Model cevabini markdown olarak cizer.
 *
 * Onceden duz metin basiliyordu, bu yuzden modelin kalin yazmak icin koydugu
 * ** isaretleri ekranda oldugu gibi gorunuyordu. react-markdown ham HTML'i
 * varsayilan olarak yok sayiyor (rehype-raw eklenmedi), yani model cikisindan
 * gelen bir etiket calistirilamaz.
 *
 * Baslik etiketleri de kalin paragrafa indirgeniyor: sohbet balonu icinde
 * devasa basliklar tasarimi bozuyor, ama model yine de yazarsa metin kaybolmasin.
 */

const components: Components = {
  p: ({ children }) => <p className="[&:not(:first-child)]:mt-3">{children}</p>,

  strong: ({ children }) => (
    <strong className="text-foreground font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,

  code: ({ children }) => (
    <code className="bg-muted/70 rounded px-1.5 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-muted/60 mt-3 overflow-x-auto rounded-lg border p-3 text-sm">
      {children}
    </pre>
  ),

  ul: ({ children }) => (
    <ul className="mt-2 ml-1 list-inside list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-2 ml-1 list-inside list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  blockquote: ({ children }) => (
    <blockquote className="border-primary/60 text-muted-foreground mt-3 border-l-2 pl-3 italic">
      {children}
    </blockquote>
  ),

  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),

  hr: () => <hr className="border-border my-3" />,

  h1: ({ children }) => <p className="mt-3 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mt-3 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mt-3 font-semibold">{children}</p>,
  h4: ({ children }) => <p className="mt-3 font-semibold">{children}</p>,
  h5: ({ children }) => <p className="mt-3 font-semibold">{children}</p>,
  h6: ({ children }) => <p className="mt-3 font-semibold">{children}</p>,
};

/**
 * Satir ici surum: paragraf sarmalayicisi yok.
 *
 * Kisa notlar (bir liste ogesinin yaninda, bir alt yazida) markdown olarak
 * cizilmeli — yoksa modelin kalinlastirmak icin koydugu ** isaretleri ekranda
 * oldugu gibi gorunuyor. Ama blok paragraf araya bosluk sokuyor, o yuzden
 * burada p etiketi yerine dogrudan icerik donuyor.
 */
const inlineComponents: Components = {
  ...components,
  p: ({ children }) => <>{children}</>,
};

function MarkdownImpl({ children }: { children: string }) {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
}

function InlineMarkdownImpl({ children }: { children: string }) {
  return <ReactMarkdown components={inlineComponents}>{children}</ReactMarkdown>;
}

// Akis sirasinda ust bilesen sik render oluyor; metin degismedikce yeniden
// ayristirmaya gerek yok.
export const Markdown = memo(MarkdownImpl);
export const InlineMarkdown = memo(InlineMarkdownImpl);
