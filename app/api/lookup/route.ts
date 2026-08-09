import { NextResponse } from "next/server";

import { isLanguageCode } from "@/lib/dictionary";
import { LLMError, lookupWord } from "@/lib/llm";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const word = (searchParams.get("word") ?? "").trim();
  const lang = searchParams.get("lang") ?? "";

  if (!word) {
    return NextResponse.json({ error: "Kelime boş olamaz." }, { status: 400 });
  }
  if (word.length > 80) {
    return NextResponse.json({ error: "Kelime çok uzun." }, { status: 400 });
  }
  if (!isLanguageCode(lang)) {
    return NextResponse.json(
      { error: `Desteklenmeyen dil: ${lang}` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await lookupWord(word, lang));
  } catch (error) {
    if (error instanceof LLMError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Beklenmeyen bir hata oluştu." },
      { status: 500 },
    );
  }
}
