"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, KeyRound } from "lucide-react";

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
import { PROVIDERS, getProvider } from "@/lib/providers";
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
  const [providerId, setProviderId] = useState(settings.provider);
  const [keys, setKeys] = useState<Record<string, string>>(settings.keys);
  const [model, setModel] = useState(settings.model);
  const [customBaseUrl, setCustomBaseUrl] = useState(settings.customBaseUrl);

  const provider = getProvider(providerId);
  const apiKey = keys[providerId] ?? "";
  const isCustom = Boolean(provider.editableBaseUrl);

  // Model, secili saglayicidan turetiliyor: state'te tutulan deger baska bir
  // saglayiciya aitse (saglayici degistirildiginde ya da eski ayar goc
  // ettiginde) sessizce o saglayicinin ilk modeline duser. Boylece secilemez
  // bir deger yuzunden form kilitlenmiyor.
  const models = provider.models;
  const effectiveModel =
    models.length === 0
      ? model
      : (models.find((option) => option.id === model)?.id ?? models[0].id);

  const canSave = Boolean(
    apiKey.trim() && effectiveModel.trim() && (!isCustom || customBaseUrl.trim()),
  );

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
            API anahtarını gir — anahtar bu cihazda kalır ve yalnızca seçtiğin
            sağlayıcıya gider, başka hiçbir yere gönderilmez.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs">Sağlayıcı</label>
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{provider.note}</p>
        </div>

        {!provider.corsVerified ? (
          <p className="text-muted-foreground flex gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Bu sağlayıcının tarayıcıdan doğrudan çağrılmasına izin verip
              vermediğini (CORS) doğrulayamadık. Denediğinde “ulaşılamadı”
              hatası alırsan sağlayıcı buna izin vermiyordur; OpenRouter
              üzerinden aynı modellere erişebilirsin.
            </span>
          </p>
        ) : null}

        {provider.keyUrl ? (
          <p className="text-muted-foreground text-sm">
            Anahtarı{" "}
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 hover:underline"
            >
              {provider.keyUrl.replace("https://", "")}
              <ExternalLink className="size-3" />
            </a>{" "}
            adresinden alabilirsin (telefondan da olur).
          </p>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            storage.setSettings({
              provider: providerId,
              model: effectiveModel.trim(),
              keys: { ...keys, [providerId]: apiKey.trim() },
              customBaseUrl: customBaseUrl.trim(),
            });
            onDone();
          }}
        >
          {isCustom ? (
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs">
                Adres (OpenAI uyumlu, /chat/completions olmadan)
              </label>
              <Input
                value={customBaseUrl}
                onChange={(event) => setCustomBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
                autoComplete="off"
                spellCheck={false}
                className="h-11 font-mono text-base"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs">
              {provider.label} API anahtarı
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(event) =>
                setKeys({ ...keys, [providerId]: event.target.value })
              }
              placeholder={provider.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-label="API anahtarı"
              className="h-11 font-mono text-base"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs">Model</label>
            {models.length > 0 ? (
              // key: saglayici degisince Radix'in ic koleksiyonu da bastan
              // kurulsun, yoksa eski saglayicinin ogeleri asili kaliyor.
              <Select key={providerId} value={effectiveModel} onValueChange={setModel}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="model-adi"
                autoComplete="off"
                spellCheck={false}
                className="h-11 font-mono text-base"
              />
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={!canSave} className="h-11">
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
