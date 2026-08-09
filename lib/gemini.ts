"use client";

import type { LanguageCode, LookupResult } from "./dictionary";
import {
  LookupError,
  extractJson,
  normalizeResult,
  systemPrompt,
} from "./llm";

/**
 * Gemini cagrisi dogrudan tarayicidan yapiliyor.
 *
 * Site statik olarak dagitildigi icin (GitHub Pages) arada bir sunucu yok.
 * Anahtar kullanicinin kendi anahtari, kendi tarayicisinda duruyor ve yalniz
 * Google'a gidiyor — baska hicbir yere gonderilmiyor.
 *
 * Gemini'nin REST ucu tarayici cagrilarina CORS izni veriyor; izin verilen
 * baslikar content-type ve x-goog-api-key.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const GEMINI_MODELS = [
  {
    id: "gemini-2.5-flash-lite",
    label: "Flash-Lite — günde 1.000 arama",
  },
  {
    id: "gemini-2.5-flash",
    label: "Flash — günde 250, daha isabetli",
  },
  {
    id: "gemini-2.5-pro",
    label: "Pro — günde 100, en isabetli",
  },
] as const;

export const DEFAULT_MODEL = GEMINI_MODELS[0].id;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export async function lookupWithGemini({
  word,
  language,
  apiKey,
  model,
}: {
  word: string;
  language: LanguageCode;
  apiKey: string;
  model: string;
}): Promise<LookupResult> {
  if (!apiKey) {
    throw new LookupError("Önce Gemini API anahtarını gir.");
  }

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(language) }] },
        contents: [{ role: "user", parts: [{ text: word }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch {
    throw new LookupError(
      "Google'a bağlanılamadı. İnternet bağlantını kontrol et.",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as GeminiResponse;

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      throw new LookupError(
        `Anahtar reddedildi (${response.status}). ` +
          "aistudio.google.com/apikey adresinden aldığın anahtarı doğru " +
          "yapıştırdığından emin ol.",
      );
    }
    if (response.status === 429) {
      throw new LookupError(
        "Günlük ücretsiz kotan doldu. Yarın sıfırlanır; ayarlardan daha " +
          "yüksek kotalı bir model de seçebilirsin.",
      );
    }
    throw new LookupError(
      payload.error?.message ?? `Google ${response.status} döndü.`,
    );
  }

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    if (payload.promptFeedback?.blockReason) {
      throw new LookupError(
        `İstek engellendi: ${payload.promptFeedback.blockReason}`,
      );
    }
    throw new LookupError("Modelden boş cevap geldi.");
  }

  return normalizeResult(extractJson(text), word, language);
}
