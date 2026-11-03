"use client";

import { FileImage, Film, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, RangeField, SelectField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/provider";
import type { AudioTarget, Mp3Bitrate } from "@/lib/ffmpeg/tasks";
import type { InputItem } from "../workspace/types";
import type { ConvertSettings, VideoConvertTarget } from "./settings";

interface ConvertPanelProps {
  items: InputItem[];
  settings: ConvertSettings;
  onChange: (settings: ConvertSettings) => void;
  onStart: () => void;
}

export function ConvertPanel({ items, settings, onChange, onStart }: ConvertPanelProps) {
  const { t } = useI18n();
  const c = t.convert;
  const images = items.filter((item) => item.type.kind === "image");
  const videos = items.filter((item) => item.type.kind === "video");
  const audios = items.filter((item) => item.type.kind === "audio");
  const hasSvg = images.some((item) => item.type.format === "svg");
  const hasGif = images.some((item) => item.type.format === "gif");
  const lossy = settings.imageTarget !== "png";
  const set = <K extends keyof ConvertSettings>(key: K, value: ConvertSettings[K]) => onChange({ ...settings, [key]: value });
  const showMp3Bitrate =
    (videos.length > 0 && settings.videoTarget === "mp3") || (audios.length > 0 && settings.audioTarget === "mp3");
  const audioOptions: Array<{ value: AudioTarget; label: string; hint: string }> = [
    { value: "mp3", label: "MP3", hint: c.hintEverywhere },
    { value: "aac", label: "AAC", hint: c.hintM4a },
    { value: "wav", label: "WAV", hint: c.hintUncompressed },
  ];

  return (
    <div className="space-y-6">
      {images.length > 0 && (
        <section className="space-y-4" aria-label={c.imagesAria} data-testid="convert-images">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileImage className="size-4 text-primary" aria-hidden /> {c.imagesHeading(images.length)}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Segmented<ConvertSettings["imageTarget"]>
              label={c.target}
              value={settings.imageTarget}
              onChange={(value) => set("imageTarget", value)}
              options={[
                { value: "jpeg", label: "JPG", hint: c.hintPhotos },
                { value: "png", label: "PNG", hint: c.hintLossless },
                { value: "webp", label: "WebP", hint: c.hintModern },
              ]}
            />
            <SelectField
              label={c.maxSize}
              value={settings.maxDimension}
              onChange={(value) => set("maxDimension", value)}
              options={[
                { value: "0", label: c.originalSize },
                { value: "3840", label: "3840 px (4K)" },
                { value: "2560", label: "2560 px" },
                { value: "1920", label: "1920 px (Full HD)" },
                { value: "1280", label: "1280 px" },
                { value: "800", label: "800 px" },
              ]}
            />
            {lossy && (
              <RangeField
                label={c.quality}
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
                  {c.background}
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
                label={c.svgScale}
                value={settings.svgScale}
                onChange={(value) => set("svgScale", value)}
                options={[
                  { value: "1", label: "1×" },
                  { value: "2", label: "2×", hint: c.retina },
                  { value: "4", label: "4×", hint: c.print },
                ]}
              />
            )}
          </div>
          {hasGif && (
            <CheckboxField
              label={c.gifToMp4}
              description={c.gifToMp4Hint}
              checked={settings.gifToMp4}
              onChange={(value) => set("gifToMp4", value)}
              testId="gif-to-mp4"
            />
          )}
        </section>
      )}

      {videos.length > 0 && (
        <section className="space-y-4" aria-label={c.videosAria} data-testid="convert-videos">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Film className="size-4 text-primary" aria-hidden /> {c.videosHeading(videos.length)}
          </h3>
          <Segmented<VideoConvertTarget>
            label={c.target}
            value={settings.videoTarget}
            onChange={(value) => set("videoTarget", value)}
            options={[
              { value: "mp3", label: "MP3", hint: c.hintAudioOnly },
              { value: "aac", label: "AAC", hint: c.hintAudioOnly },
              { value: "wav", label: "WAV", hint: c.hintAudioOnly },
              { value: "mp4", label: "MP4", hint: "H.264" },
              { value: "gif", label: "GIF", hint: c.hintAnimated },
            ]}
          />
          {settings.videoTarget === "aac" && <p className="text-xs text-muted-foreground">{c.aacHint}</p>}
          {settings.videoTarget === "mp4" && <p className="text-xs text-muted-foreground">{c.mp4Hint}</p>}
          {settings.videoTarget === "gif" && (
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label={c.frameRate}
                value={settings.gifFps}
                onChange={(value) => set("gifFps", value)}
                options={[
                  { value: "10", label: c.fps10 },
                  { value: "12", label: c.fps12 },
                  { value: "15", label: c.fps15 },
                  { value: "20", label: c.fps20 },
                ]}
              />
              <SelectField
                label={c.width}
                value={settings.gifWidth}
                onChange={(value) => set("gifWidth", value)}
                options={[
                  { value: "320", label: "320 px" },
                  { value: "480", label: c.width480 },
                  { value: "640", label: "640 px" },
                  { value: "800", label: "800 px" },
                ]}
              />
            </div>
          )}
        </section>
      )}

      {audios.length > 0 && (
        <section className="space-y-4" aria-label={c.audioAria} data-testid="convert-audio">
          <h3 className="text-sm font-semibold">{c.audioHeading(audios.length)}</h3>
          <Segmented<AudioTarget>
            label={c.target}
            value={settings.audioTarget}
            onChange={(value) => set("audioTarget", value)}
            options={audioOptions}
          />
        </section>
      )}

      {showMp3Bitrate && (
        <SelectField
          label={c.mp3Bitrate}
          value={String(settings.mp3Bitrate) as `${Mp3Bitrate}`}
          onChange={(value) => set("mp3Bitrate", Number(value) as Mp3Bitrate)}
          options={[
            { value: "320", label: c.mp3_320 },
            { value: "256", label: c.mp3_256 },
            { value: "192", label: c.mp3_192 },
            { value: "128", label: c.mp3_128 },
          ]}
          className="max-w-sm"
        />
      )}

      <Button size="lg" className="w-full sm:w-auto" onClick={onStart} data-testid="start-convert">
        <RefreshCw className="size-5" aria-hidden />
        {c.start(items.length)}
      </Button>
    </div>
  );
}
