"use client";

import { Gauge, Mail, MessageCircle, Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/provider";
import { COMPRESS_PRESETS, type CompressPresetId, type SpeedPreset } from "@/lib/presets";
import { cn } from "@/lib/utils";
import type { InputItem } from "../workspace/types";
import type { CompressSettings } from "./settings";

const PRESET_ICONS: Record<CompressPresetId, typeof Gauge> = {
  discord: MessageCircle,
  email: Mail,
  web: Gauge,
};

const SPEEDS: SpeedPreset[] = ["fast", "balanced", "quality"];

interface CompressPanelProps {
  items: InputItem[];
  settings: CompressSettings;
  onChange: (settings: CompressSettings) => void;
  onStart: () => void;
}

export function CompressPanel({ items, settings, onChange, onStart }: CompressPanelProps) {
  const { t } = useI18n();
  const hasImages = items.some((item) => item.type.kind === "image");
  const hasVideos = items.some((item) => item.type.kind === "video");
  const hasAudio = items.some((item) => item.type.kind === "audio");

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.compress.presetLegend}</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {COMPRESS_PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.id];
            const text = t.compress.presets[preset.id];
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
                  <span className="block text-sm font-semibold">{text.label}</span>
                  <span className="block text-xs text-muted-foreground">{text.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        {hasImages && (
          <SelectField
            label={t.compress.imageFormat}
            value={settings.imageFormat}
            onChange={(imageFormat) => onChange({ ...settings, imageFormat })}
            options={[
              { value: "auto", label: settings.preset === "web" ? t.compress.formatAutoWeb : t.compress.formatAutoKeep },
              { value: "jpeg", label: t.compress.formatJpeg },
              { value: "webp", label: t.compress.formatWebp },
              { value: "png", label: t.compress.formatPng },
            ]}
            hint={t.compress.formatHint}
          />
        )}
        {(hasVideos || hasAudio) && (
          <Segmented<SpeedPreset>
            label={t.compress.encoder}
            value={settings.speed}
            onChange={(speed) => onChange({ ...settings, speed })}
            options={SPEEDS.map((key) => ({ value: key, label: t.compress.speed[key] }))}
          />
        )}
      </div>

      {hasVideos && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {settings.preset === "web" ? t.compress.infoWeb : t.compress.infoTarget}
        </p>
      )}

      <Button size="lg" className="w-full sm:w-auto" onClick={onStart} data-testid="start-compress">
        <Shrink className="size-5" aria-hidden />
        {t.compress.start(items.length)}
      </Button>
    </div>
  );
}
