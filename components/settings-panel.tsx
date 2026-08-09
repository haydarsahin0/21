"use client";

import { useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";

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
import { GEMINI_MODELS } from "@/lib/dictionary";
import * as storage from "@/lib/storage";

export function SettingsPanel({
  settings,
  onDone,
  firstRun,
}: {
  settings: storage.Settings;
  onDone: () => void;
  firstRun: boolean;
}) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <KeyRound className="size-4" />
            {firstRun ? "Başlamak için tek adım" : "Ayarlar"}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Bu site tamamen tarayıcında çalışıyor; arkasında sunucu yok. Kendi
            ücretsiz Google Gemini anahtarını gir — anahtar bu cihazda kalır ve
            yalnızca Google&apos;a gider, başka hiçbir yere gönderilmez.
          </p>
        </div>

        <ol className="text-muted-foreground list-inside list-decimal space-y-1.5 text-sm">
          <li>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 hover:underline"
            >
              aistudio.google.com/apikey
              <ExternalLink className="size-3" />
            </a>{" "}
            adresini aç (telefondan da olur).
          </li>
          <li>Google hesabınla giriş yap, “Create API key” de.</li>
          <li>Çıkan anahtarı kopyalayıp aşağıya yapıştır.</li>
        </ol>
        <p className="text-muted-foreground text-sm">
          Kredi kartı istemiyor. Günde 1.000 aramaya kadar ücretsiz.
        </p>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            storage.setSettings({ apiKey: apiKey.trim(), model });
            onDone();
          }}
        >
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            spellCheck={false}
            aria-label="Gemini API anahtarı"
            className="h-11 font-mono text-base"
          />

          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs">Model</label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEMINI_MODELS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={!apiKey.trim()} className="h-11">
              Kaydet ve başla
            </Button>
            {!firstRun ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={onDone}
              >
                Vazgeç
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
