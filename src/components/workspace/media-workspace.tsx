"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompressPanel } from "@/components/tools/compress-panel";
import { ConvertPanel } from "@/components/tools/convert-panel";
import { PrivacyPanel } from "@/components/tools/privacy-panel";
import {
  DEFAULT_COMPRESS,
  DEFAULT_CONVERT,
  DEFAULT_PRIVACY,
  type CompressSettings,
  type ConvertSettings,
  type PrivacySettings,
} from "@/components/tools/settings";
import { TrimPanel } from "@/components/tools/trim-panel";
import { ffmpegEngine } from "@/lib/ffmpeg/engine";
import {
  compressAudio,
  compressVideo,
  convertToAudio,
  convertVideoToGif,
  convertVideoToMp4,
  stripMediaMetadata,
  trimMedia,
  type TrimOptions,
} from "@/lib/ffmpeg/tasks";
import { detectMediaType, toolsFor, type ToolId } from "@/lib/file-types";
import { compressImage, convertImage, stripImage } from "@/lib/image/tasks";
import { COMPRESS_PRESETS } from "@/lib/presets";
import { createId, formatTimecode } from "@/lib/utils";
import { Dropzone } from "./dropzone";
import { EngineStatus } from "./engine-status";
import { FileList } from "./file-list";
import { JobList } from "./job-list";
import { TOOL_META, TOOL_ORDER } from "./tool-meta";
import { ToolTabs } from "./tool-tabs";
import type { InputItem, JobRequest } from "./types";
import { useJobs } from "./use-jobs";

const PREVIEWABLE_IMAGES = new Set(["jpeg", "png", "webp", "gif", "bmp", "avif", "svg", "ico"]);

const CONVERT_LABELS: Record<string, string> = {
  jpeg: "JPG",
  png: "PNG",
  webp: "WebP",
  mp3: "MP3",
  aac: "AAC (M4A)",
  wav: "WAV",
  mp4: "MP4",
  gif: "GIF",
};

export function MediaWorkspace() {
  const [items, setItems] = useState<InputItem[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [compress, setCompress] = useState<CompressSettings>(DEFAULT_COMPRESS);
  const [convert, setConvert] = useState<ConvertSettings>(DEFAULT_CONVERT);
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const { jobs, enqueue, cancel, remove, clearFinished } = useJobs();
  const resultsRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<InputItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Release all preview object URLs when the workspace unmounts.
  useEffect(() => () => itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl)), []);

  const addFiles = useCallback(async (files: File[]) => {
    const created = await Promise.all(
      files.map(async (file): Promise<InputItem> => {
        const type = await detectMediaType(file);
        const previewable =
          (type.kind === "image" && PREVIEWABLE_IMAGES.has(type.format)) || type.kind === "video" || type.kind === "audio";
        return {
          id: createId(),
          file,
          type,
          tools: toolsFor(type),
          previewUrl: previewable ? URL.createObjectURL(file) : null,
        };
      }),
    );
    setItems((current) => [...current, ...created]);
    // Warm up the FFmpeg engine in the background as soon as video/audio arrives.
    if (created.some((item) => item.type.kind === "video" || item.type.kind === "audio")) {
      ffmpegEngine.load().catch(() => undefined);
    }
  }, []);

  const onFiles = useCallback((files: File[]) => void addFiles(files), [addFiles]);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  const clearItems = useCallback(() => {
    setItems((current) => {
      current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, []);

  const available = useMemo(() => {
    const counts: Record<ToolId, number> = { compress: 0, convert: 0, trim: 0, privacy: 0 };
    for (const item of items) for (const tool of item.tools) counts[tool] += 1;
    return counts;
  }, [items]);

  const tool = activeTool && available[activeTool] > 0 ? activeTool : (TOOL_ORDER.find((entry) => available[entry] > 0) ?? null);
  const toolItems = useMemo(() => (tool ? items.filter((item) => item.tools.includes(tool)) : []), [items, tool]);

  const scrollToResults = () =>
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const startCompress = () => {
    const preset = COMPRESS_PRESETS.find((entry) => entry.id === compress.preset)!;
    const settings = compress;
    const title = preset.id === "web" ? "Maximale Web-Kompression" : `Unter ${Math.round((preset.targetBytes ?? 0) / 1e6)} MB`;
    const requests: JobRequest[] = toolItems.map((item) => ({
      item,
      tool: "compress",
      title,
      run: (ctx) => {
        if (item.type.kind === "image") return compressImage(item.file, item.type, preset, settings.imageFormat, ctx);
        if (item.type.kind === "video") return compressVideo(item.file, item.type, preset, settings.speed, ctx);
        return compressAudio(item.file, item.type, preset, ctx);
      },
    }));
    enqueue(requests);
    scrollToResults();
  };

  const startConvert = () => {
    const settings = convert;
    const requests: JobRequest[] = toolItems.map((item) => {
      if (item.type.kind === "image") {
        const toMp4 = item.type.format === "gif" && settings.gifToMp4;
        const target = toMp4 ? "mp4" : settings.imageTarget;
        return {
          item,
          tool: "convert",
          title: `${item.type.label} → ${CONVERT_LABELS[target]}`,
          run: (ctx) =>
            convertImage(
              item.file,
              item.type,
              target,
              {
                quality: settings.quality,
                maxDimension: settings.maxDimension === "0" ? null : Number(settings.maxDimension),
                background: settings.background,
                svgScale: Number(settings.svgScale),
              },
              ctx,
            ),
        };
      }
      if (item.type.kind === "video") {
        const target = settings.videoTarget;
        return {
          item,
          tool: "convert",
          title: `${item.type.label} → ${CONVERT_LABELS[target]}`,
          run: (ctx) => {
            if (target === "mp4") return convertVideoToMp4(item.file, item.type, compress.speed, ctx);
            if (target === "gif") {
              return convertVideoToGif(item.file, item.type, { fps: Number(settings.gifFps), width: Number(settings.gifWidth) }, ctx);
            }
            return convertToAudio(item.file, item.type, target, settings.mp3Bitrate, ctx);
          },
        };
      }
      const target = settings.audioTarget;
      return {
        item,
        tool: "convert",
        title: `${item.type.label} → ${CONVERT_LABELS[target]}`,
        run: (ctx) => convertToAudio(item.file, item.type, target, settings.mp3Bitrate, ctx),
      };
    });
    enqueue(requests);
    scrollToResults();
  };

  const startPrivacy = () => {
    const keepIcc = privacy.keepIcc;
    enqueue(
      toolItems.map((item) => ({
        item,
        tool: "privacy" as const,
        title: "Metadaten entfernen",
        run: (ctx) =>
          item.type.kind === "image" ? stripImage(item.file, item.type, keepIcc, ctx) : stripMediaMetadata(item.file, item.type, ctx),
      })),
    );
    scrollToResults();
  };

  const startTrim = (item: InputItem, options: TrimOptions) => {
    enqueue([
      {
        item,
        tool: "trim",
        title: `${formatTimecode(options.start)} – ${formatTimecode(options.end)}${options.precise ? " (framegenau)" : ""}`,
        run: (ctx) => trimMedia(item.file, item.type, options, compress.speed, ctx),
      },
    ]);
    scrollToResults();
  };

  return (
    <div className="space-y-6" id="werkzeuge">
      <Dropzone onFiles={onFiles} compact={items.length > 0} />

      {items.length > 0 && <FileList items={items} onRemove={removeItem} onClear={clearItems} />}

      {items.length > 0 && !tool && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Für diese Dateien gibt es leider kein passendes Werkzeug. Unterstützt werden gängige Bild-, Video- und Audioformate.
        </p>
      )}

      {tool && (
        <section className="card-surface space-y-5 rounded-2xl p-4 sm:p-6" aria-label="Werkzeuge">
          <ToolTabs available={available} active={tool} onSelect={setActiveTool} />
          <EngineStatus />
          <div role="tabpanel" id={`panel-${tool}`} aria-labelledby={`tab-${tool}`} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{TOOL_META[tool].label}</h2>
              <p className="text-sm text-muted-foreground">
                {toolItems.length === 1 ? "1 passende Datei" : `${toolItems.length} passende Dateien`} · {TOOL_META[tool].description}
              </p>
            </div>
            {tool === "compress" && <CompressPanel items={toolItems} settings={compress} onChange={setCompress} onStart={startCompress} />}
            {tool === "convert" && <ConvertPanel items={toolItems} settings={convert} onChange={setConvert} onStart={startConvert} />}
            {tool === "trim" && <TrimPanel items={toolItems} onExport={startTrim} />}
            {tool === "privacy" && <PrivacyPanel items={toolItems} settings={privacy} onChange={setPrivacy} onStart={startPrivacy} />}
          </div>
        </section>
      )}

      <div ref={resultsRef} className="scroll-mt-24">
        <JobList jobs={jobs} onCancel={cancel} onRemove={remove} onClearFinished={clearFinished} />
      </div>
    </div>
  );
}
