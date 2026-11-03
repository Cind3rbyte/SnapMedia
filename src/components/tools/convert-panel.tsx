"use client";

import { FileImage, Film, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, RangeField, SelectField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import type { AudioTarget, Mp3Bitrate } from "@/lib/ffmpeg/tasks";
import type { InputItem } from "../workspace/types";
import type { ConvertSettings, VideoConvertTarget } from "./settings";

interface ConvertPanelProps {
  items: InputItem[];
  settings: ConvertSettings;
  onChange: (settings: ConvertSettings) => void;
  onStart: () => void;
}

const AUDIO_OPTIONS: Array<{ value: AudioTarget; label: string; hint: string }> = [
  { value: "mp3", label: "MP3", hint: "überall abspielbar" },
  { value: "aac", label: "AAC", hint: ".m4a, verlustarm" },
  { value: "wav", label: "WAV", hint: "unkomprimiert" },
];

export function ConvertPanel({ items, settings, onChange, onStart }: ConvertPanelProps) {
  const images = items.filter((item) => item.type.kind === "image");
  const videos = items.filter((item) => item.type.kind === "video");
  const audios = items.filter((item) => item.type.kind === "audio");
  const hasSvg = images.some((item) => item.type.format === "svg");
  const hasGif = images.some((item) => item.type.format === "gif");
  const lossy = settings.imageTarget !== "png";
  const set = <K extends keyof ConvertSettings>(key: K, value: ConvertSettings[K]) => onChange({ ...settings, [key]: value });
  const showMp3Bitrate =
    (videos.length > 0 && settings.videoTarget === "mp3") || (audios.length > 0 && settings.audioTarget === "mp3");

  return (
    <div className="space-y-6">
      {images.length > 0 && (
        <section className="space-y-4" aria-label="Bilder konvertieren">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileImage className="size-4 text-primary" aria-hidden /> Bilder ({images.length}) – HEIC, WebP, SVG, PNG, JPG …
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Segmented<ConvertSettings["imageTarget"]>
              label="Zielformat"
              value={settings.imageTarget}
              onChange={(value) => set("imageTarget", value)}
              options={[
                { value: "jpeg", label: "JPG", hint: "Fotos" },
                { value: "png", label: "PNG", hint: "verlustfrei" },
                { value: "webp", label: "WebP", hint: "modern" },
              ]}
            />
            <SelectField
              label="Maximale Kantenlänge"
              value={settings.maxDimension}
              onChange={(value) => set("maxDimension", value)}
              options={[
                { value: "0", label: "Originalgröße" },
                { value: "3840", label: "3840 px (4K)" },
                { value: "2560", label: "2560 px" },
                { value: "1920", label: "1920 px (Full HD)" },
                { value: "1280", label: "1280 px" },
                { value: "800", label: "800 px" },
              ]}
            />
            {lossy && (
              <RangeField
                label="Qualität"
                value={settings.quality}
                min={0.5}
                max={1}
                step={0.01}
                onChange={(value) => set("quality", value)}
                format={(value) => `${Math.round(value * 100)} %`}
              />
            )}
            {settings.imageTarget === "jpeg" && (
              <div className="space-y-1.5">
                <label htmlFor="jpg-background" className="text-sm font-medium">
                  Hintergrund für Transparenz
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="jpg-background"
                    type="color"
                    value={settings.background}
                    onChange={(event) => set("background", event.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-card p-1"
                  />
                  <span className="font-mono text-xs text-muted-foreground">{settings.background}</span>
                </div>
              </div>
            )}
            {hasSvg && (
              <Segmented<ConvertSettings["svgScale"]>
                label="SVG-Auflösung"
                value={settings.svgScale}
                onChange={(value) => set("svgScale", value)}
                options={[
                  { value: "1", label: "1×" },
                  { value: "2", label: "2×", hint: "Retina" },
                  { value: "4", label: "4×", hint: "Druck" },
                ]}
              />
            )}
          </div>
          {hasGif && (
            <CheckboxField
              label="Animierte GIFs als MP4 speichern"
              description="Bis zu 90 % kleiner und flüssiger – perfekt für Discord & WhatsApp."
              checked={settings.gifToMp4}
              onChange={(value) => set("gifToMp4", value)}
            />
          )}
        </section>
      )}

      {videos.length > 0 && (
        <section className="space-y-4" aria-label="Videos konvertieren">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Film className="size-4 text-primary" aria-hidden /> Videos ({videos.length}) – MP4, MOV, MKV, WebM …
          </h3>
          <Segmented<VideoConvertTarget>
            label="Zielformat"
            value={settings.videoTarget}
            onChange={(value) => set("videoTarget", value)}
            options={[
              { value: "mp3", label: "MP3", hint: "nur Ton" },
              { value: "aac", label: "AAC", hint: "nur Ton" },
              { value: "wav", label: "WAV", hint: "nur Ton" },
              { value: "mp4", label: "MP4", hint: "H.264" },
              { value: "gif", label: "GIF", hint: "animiert" },
            ]}
          />
          {settings.videoTarget === "aac" && (
            <p className="text-xs text-muted-foreground">
              Ist die Tonspur bereits AAC (bei fast allen MP4/MOV-Videos), wird sie 1:1 ohne Qualitätsverlust übernommen.
            </p>
          )}
          {settings.videoTarget === "mp4" && (
            <p className="text-xs text-muted-foreground">
              H.264-Videos werden blitzschnell und verlustfrei umverpackt (z. B. MOV → MP4), andere Codecs werden neu kodiert.
            </p>
          )}
          {settings.videoTarget === "gif" && (
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Bildrate"
                value={settings.gifFps}
                onChange={(value) => set("gifFps", value)}
                options={[
                  { value: "10", label: "10 fps – kleinste Datei" },
                  { value: "12", label: "12 fps – empfohlen" },
                  { value: "15", label: "15 fps" },
                  { value: "20", label: "20 fps – flüssig" },
                ]}
              />
              <SelectField
                label="Breite"
                value={settings.gifWidth}
                onChange={(value) => set("gifWidth", value)}
                options={[
                  { value: "320", label: "320 px" },
                  { value: "480", label: "480 px – empfohlen" },
                  { value: "640", label: "640 px" },
                  { value: "800", label: "800 px" },
                ]}
              />
            </div>
          )}
        </section>
      )}

      {audios.length > 0 && (
        <section className="space-y-4" aria-label="Audio konvertieren">
          <h3 className="text-sm font-semibold">Audio ({audios.length})</h3>
          <Segmented<AudioTarget>
            label="Zielformat"
            value={settings.audioTarget}
            onChange={(value) => set("audioTarget", value)}
            options={AUDIO_OPTIONS}
          />
        </section>
      )}

      {showMp3Bitrate && (
        <SelectField
          label="MP3-Bitrate"
          value={String(settings.mp3Bitrate) as `${Mp3Bitrate}`}
          onChange={(value) => set("mp3Bitrate", Number(value) as Mp3Bitrate)}
          options={[
            { value: "320", label: "320 kbit/s – maximale Qualität" },
            { value: "256", label: "256 kbit/s" },
            { value: "192", label: "192 kbit/s – empfohlen" },
            { value: "128", label: "128 kbit/s – kleine Datei" },
          ]}
          className="max-w-sm"
        />
      )}

      <Button size="lg" className="w-full sm:w-auto" onClick={onStart} data-testid="start-convert">
        <RefreshCw className="size-5" aria-hidden />
        {items.length === 1 ? "Datei konvertieren" : `${items.length} Dateien konvertieren`}
      </Button>
    </div>
  );
}
