"use client";

import { Gauge, Mail, MessageCircle, Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { COMPRESS_PRESETS, SPEED_PRESETS, type CompressPresetId, type SpeedPreset } from "@/lib/presets";
import { cn } from "@/lib/utils";
import type { InputItem } from "../workspace/types";
import type { CompressSettings } from "./settings";

const PRESET_ICONS: Record<CompressPresetId, typeof Gauge> = {
  discord: MessageCircle,
  email: Mail,
  web: Gauge,
};

interface CompressPanelProps {
  items: InputItem[];
  settings: CompressSettings;
  onChange: (settings: CompressSettings) => void;
  onStart: () => void;
}

export function CompressPanel({ items, settings, onChange, onStart }: CompressPanelProps) {
  const hasImages = items.some((item) => item.type.kind === "image");
  const hasVideos = items.some((item) => item.type.kind === "video");
  const hasAudio = items.some((item) => item.type.kind === "audio");

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Schnell-Preset</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {COMPRESS_PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.id];
            const active = settings.preset === preset.id;
            return (
              <label
                key={preset.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                  active ? "border-primary bg-primary-soft/60" : "border-border bg-card hover:border-primary/50",
                )}
              >
                <input
                  type="radio"
                  name="compress-preset"
                  value={preset.id}
                  checked={active}
                  onChange={() => onChange({ ...settings, preset: preset.id })}
                  className="sr-only"
                  data-testid={`preset-${preset.id}`}
                />
                <Icon className={cn("mt-0.5 size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">{preset.label}</span>
                  <span className="block text-xs text-muted-foreground">{preset.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        {hasImages && (
          <SelectField
            label="Bild-Ausgabeformat"
            value={settings.imageFormat}
            onChange={(imageFormat) => onChange({ ...settings, imageFormat })}
            options={[
              { value: "auto", label: settings.preset === "web" ? "Automatisch (WebP)" : "Automatisch (Format beibehalten)" },
              { value: "jpeg", label: "JPG – überall kompatibel" },
              { value: "webp", label: "WebP – kleiner bei gleicher Qualität" },
              { value: "png", label: "PNG – mit Transparenz" },
            ]}
            hint="HEIC, AVIF & TIFF werden automatisch als JPG gespeichert. Metadaten werden dabei entfernt."
          />
        )}
        {(hasVideos || hasAudio) && (
          <Segmented<SpeedPreset>
            label="Video-Encoder"
            value={settings.speed}
            onChange={(speed) => onChange({ ...settings, speed })}
            options={(Object.keys(SPEED_PRESETS) as SpeedPreset[]).map((key) => ({ value: key, label: SPEED_PRESETS[key].label }))}
          />
        )}
      </div>

      {hasVideos && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {settings.preset === "web"
            ? "Videos werden mit H.264 (CRF 28) auf max. 720p und 30 fps optimiert – ideal fürs Web."
            : "Bitrate, Auflösung und Bildrate werden aus der Videolänge berechnet. Die Datei wird anschließend geprüft – liegt sie doch über dem Limit, wird automatisch nachjustiert."}
        </p>
      )}

      <Button size="lg" className="w-full sm:w-auto" onClick={onStart} data-testid="start-compress">
        <Shrink className="size-5" aria-hidden />
        {items.length === 1 ? "Datei komprimieren" : `${items.length} Dateien komprimieren`}
      </Button>
    </div>
  );
}
