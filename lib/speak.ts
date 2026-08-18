"use client";

/**
 * Telaffuz — tarayicinin kendi ses motoru (speechSynthesis).
 *
 * Bedava, internetsiz calisir, token harcamaz ve ek paket gerektirmez. Ses
 * kalitesi cihaza gore degisiyor; Android ve iOS'ta Almanca sesi yerlesik
 * geliyor. Ses yoksa fonksiyon sessizce hicbir sey yapmiyor.
 */

import { LANGUAGES, type LanguageCode } from "./dictionary";

/**
 * Sesler bazi tarayicilarda ilk cagrida bos donuyor ve `voiceschanged` olayiyla
 * sonradan doluyor; secimi her seferinde yeniden yapiyoruz.
 */
function pickVoice(locale: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefix = locale.split("-")[0];
  return (
    voices.find((voice) => voice.lang === locale) ??
    voices.find((voice) => voice.lang.startsWith(prefix)) ??
    null
  );
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, language: LanguageCode): void {
  if (!canSpeak() || !text.trim()) return;

  const locale = LANGUAGES[language].locale ?? "de-DE";
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  // Ogrenirken normal hizin biraz altinda anlasilir oluyor.
  utterance.rate = 0.9;

  const voice = pickVoice(locale);
  if (voice) utterance.voice = voice;

  // Ust uste basilirsa siraya girmesin, sonuncusu calsin.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
