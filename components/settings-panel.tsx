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
  const [explainLevel, setExplainLevel] = useState<storage.ExplainLevel>(
    settings.explainLevel,
  );

  const provider = getProvider(providerId);
  const apiKey = keys[providerId] ?? "";

  // Model, secili saglayiciya ait degilse o saglayicinin varsayilanina duser.
  // Alan yine de elle yazilabilir: saglayici yeni bir model cikardiginda
  // uygulamayi guncellemeyi beklemeden yazabilmek gerekiyor.
  const models = provider.models;
  const belongsToProvider = models.some((option) => option.id === model);
  const effectiveModel = belongsToProvider ? model : provider.defaultModel;

  const canSave = Boolean(apiKey.trim() && effectiveModel.trim());

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
              explainLevel,
              keys: { ...keys, [providerId]: apiKey.trim() },
            });
            onDone();
          }}
        >
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
            {/* Secim yerine duzenlenebilir alan: saglayici yeni bir model
                cikardiginda uygulamayi guncellemeyi beklemek gerekmesin. */}
            <Input
              key={providerId}
              value={effectiveModel}
              onChange={(event) => setModel(event.target.value)}
              list={`models-${providerId}`}
              placeholder={provider.defaultModel}
              autoComplete="off"
              spellCheck={false}
              aria-label="Model"
              className="h-11 font-mono text-base"
            />
            <datalist id={`models-${providerId}`}>
              {models.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </datalist>
            <p className="text-muted-foreground text-xs">
              Öneriler için kutuya dokun. Sağlayıcı yeni bir model çıkarırsa
              adını buraya elle yazabilirsin.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs">
              Açıklama seviyesi
            </label>
            <Select
              value={explainLevel}
              onValueChange={(value) =>
                setExplainLevel(value as storage.ExplainLevel)
              }
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storage.EXPLAIN_LEVELS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Açıklamalar bu seviyede, hedef dilde yazılır. Sadece kelimenin
              Türkçe karşılığı Türkçe olur.
            </p>
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
