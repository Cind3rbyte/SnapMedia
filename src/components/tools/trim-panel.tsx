"use client";

import { Info, LoaderCircle, Pause, Play, Repeat, Scissors, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { extractThumbnails, probeMedia, type TrimOptions } from "@/lib/ffmpeg/tasks";
import { clamp, errorMessage, formatTimecode, parseTimecode } from "@/lib/utils";
import type { InputItem } from "../workspace/types";
import { Timeline } from "./timeline";

const THUMBNAIL_COUNT = 10;

function waitFor(target: HTMLMediaElement, event: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout: ${event}`));
    }, timeout);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Medium kann nicht dekodiert werden"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

/** Grabs evenly spaced frames with a hidden <video> element (fast, uses the browser's decoder). */
async function captureFrames(url: string, duration: number, count: number, signal: { cancelled: boolean }): Promise<string[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await waitFor(video, "loadeddata", 10_000);
    if (!video.videoWidth || !video.videoHeight) throw new Error("Kein Videobild");
    const canvas = document.createElement("canvas");
    canvas.height = 108;
    canvas.width = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * canvas.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nicht verfügbar");
    const frames: string[] = [];
    for (let index = 0; index < count; index += 1) {
      if (signal.cancelled) break;
      const time = Math.min(Math.max(0, duration - 0.05), ((index + 0.5) * duration) / count);
      video.currentTime = time;
      await waitFor(video, "seeked", 6_000);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.7));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

/** Peak waveform for audio files (decoded at a low sample rate to keep memory small). */
async function computeWaveform(file: File, bars: number): Promise<number[] | null> {
  if (file.size > 25_000_000 || typeof OfflineAudioContext === "undefined") return null;
  const context = new OfflineAudioContext(1, 1, 8000);
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / bars));
  const peaks: number[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    let peak = 0;
    for (let i = bar * size; i < Math.min(data.length, (bar + 1) * size); i += 1) peak = Math.max(peak, Math.abs(data[i]));
    peaks.push(peak);
  }
  const max = Math.max(...peaks, 0.001);
  return peaks.map((peak) => peak / max);
}

interface TrimEditorProps {
  item: InputItem;
  onExport: (options: TrimOptions) => void;
}

function TrimEditor({ item, onExport }: TrimEditorProps) {
  const isVideo = item.type.kind === "video";
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(true);
  const [precise, setPrecise] = useState(false);
  const [previewOk, setPreviewOk] = useState<boolean | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [status, setStatus] = useState<string | null>("Lade Vorschau…");
  const [error, setError] = useState<string | null>(null);
  const [startText, setStartText] = useState("0:00.0");
  const [endText, setEndText] = useState("0:00.0");
  const thumbUrls = useRef<string[]>([]);

  const initDuration = useCallback((value: number) => {
    setDuration(value);
    setRange({ start: 0, end: value });
    setStartText(formatTimecode(0));
    setEndText(formatTimecode(value));
  }, []);

  // Fallback: let FFmpeg measure the file and render frames when the browser cannot decode it (e.g. HEVC).
  const runFallback = useCallback(
    async (needDuration: boolean, cancel: { cancelled: boolean }) => {
      try {
        setStatus("Browser kann diesen Codec nicht abspielen – analysiere mit FFmpeg…");
        let total = duration;
        if (needDuration || !total) {
          const info = await probeMedia(item.file, item.type);
          if (cancel.cancelled) return;
          if (!info.duration) throw new Error("Die Länge der Datei konnte nicht ermittelt werden.");
          total = info.duration;
          initDuration(total);
        }
        if (isVideo && total) {
          setStatus("Erzeuge Vorschaubilder mit FFmpeg…");
          const times = Array.from({ length: THUMBNAIL_COUNT }, (_, index) => ((index + 0.5) * total!) / THUMBNAIL_COUNT);
          const blobs = await extractThumbnails(item.file, item.type, times);
          if (cancel.cancelled) return;
          const urls = blobs.filter((blob): blob is Blob => blob !== null).map((blob) => URL.createObjectURL(blob));
          thumbUrls.current.push(...urls);
          setThumbnails(urls);
        }
        setStatus(null);
      } catch (fallbackError) {
        if (!cancel.cancelled) {
          setStatus(null);
          setError(errorMessage(fallbackError));
        }
      }
    },
    [duration, initDuration, isVideo, item.file, item.type],
  );

  useEffect(() => {
    const media = mediaRef.current;
    const cancel = { cancelled: false };
    if (!media || !item.previewUrl) return;

    const onLoaded = async () => {
      const value = media.duration;
      const decodable = !isVideo || media.videoWidth > 0;
      setPreviewOk(decodable);
      if (!Number.isFinite(value) || value <= 0) {
        void runFallback(true, cancel);
        return;
      }
      initDuration(value);
      if (!decodable) {
        void runFallback(false, cancel);
        return;
      }
      setStatus(isVideo ? "Erzeuge Vorschaubilder…" : null);
      try {
        if (isVideo) {
          const frames = await captureFrames(item.previewUrl!, value, THUMBNAIL_COUNT, cancel);
          if (!cancel.cancelled) setThumbnails(frames);
        } else {
          const peaks = await computeWaveform(item.file, 140).catch(() => null);
          if (!cancel.cancelled) setWaveform(peaks);
        }
      } catch {
        // Thumbnails are optional – the timeline still works without them.
      }
      if (!cancel.cancelled) setStatus(null);
    };
    const onError = () => {
      setPreviewOk(false);
      void runFallback(true, cancel);
    };
    media.addEventListener("loadedmetadata", onLoaded, { once: true });
    media.addEventListener("error", onError, { once: true });
    media.src = item.previewUrl;
    media.load();
    return () => {
      cancel.cancelled = true;
      media.removeEventListener("loadedmetadata", onLoaded);
      media.removeEventListener("error", onError);
    };
    // runFallback/initDuration are stable for one item; restarting on their identity would reload the media.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    const urls = thumbUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Smooth playhead + stop/loop at the selection end.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const media = mediaRef.current;
      if (!media) return;
      if (media.currentTime >= range.end - 0.02) {
        if (loop) {
          media.currentTime = range.start;
        } else {
          media.pause();
          setPlaying(false);
          setCurrent(range.end);
          return;
        }
      }
      setCurrent(media.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, range.start, range.end, loop]);

  const seek = useCallback((time: number) => {
    const media = mediaRef.current;
    setCurrent(time);
    if (media && Number.isFinite(time)) media.currentTime = time;
  }, []);

  const updateRange = useCallback((start: number, end: number) => {
    setRange({ start, end });
    setStartText(formatTimecode(start));
    setEndText(formatTimecode(end));
  }, []);

  const togglePlay = async () => {
    const media = mediaRef.current;
    if (!media || !previewOk) return;
    if (playing) {
      media.pause();
      setPlaying(false);
      return;
    }
    if (media.currentTime < range.start || media.currentTime >= range.end - 0.05) media.currentTime = range.start;
    try {
      await media.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const commitText = (which: "start" | "end") => {
    if (duration === null) return;
    const parsed = parseTimecode(which === "start" ? startText : endText);
    if (parsed === null) {
      updateRange(range.start, range.end);
      return;
    }
    if (which === "start") {
      const next = clamp(parsed, 0, range.end - 0.1);
      updateRange(next, range.end);
      seek(next);
    } else {
      const next = clamp(parsed, range.start + 0.1, duration);
      updateRange(range.start, next);
      seek(next);
    }
  };

  const length = range.end - range.start;
  const canExport = duration !== null && length >= 0.1 && !error;
  const modeOptions = useMemo(
    () => [
      { value: "copy" as const, label: "Schnell & verlustfrei", hint: "ohne Neukodierung" },
      { value: "precise" as const, label: isVideo ? "Framegenau" : "Sample-genau", hint: "neu kodieren, langsamer" },
    ],
    [isVideo],
  );

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-border bg-black/90">
        {isVideo ? (
          <video
            ref={mediaRef}
            playsInline
            muted={muted}
            preload="auto"
            onClick={() => void togglePlay()}
            onPause={() => setPlaying(false)}
            className="mx-auto max-h-[46vh] w-full bg-black object-contain"
            data-testid="trim-video"
          />
        ) : (
          <div className="flex h-28 items-center justify-center text-sm text-white/70">
            <audio ref={mediaRef} preload="auto" muted={muted} onPause={() => setPlaying(false)} />
            {item.file.name}
          </div>
        )}
        {previewOk === false && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white/85">
            Dein Browser kann diesen Codec nicht abspielen (z. B. HEVC). Der Schnitt funktioniert trotzdem – nutze die
            Vorschaubilder und Zeitangaben.
          </div>
        )}
      </div>

      {status && (
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> {status}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {duration !== null && (
        <>
          <Timeline
            duration={duration}
            start={range.start}
            end={range.end}
            current={current}
            thumbnails={thumbnails}
            waveform={waveform}
            onChange={updateRange}
            onSeek={seek}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void togglePlay()} disabled={!previewOk} data-testid="trim-play">
              {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
              {playing ? "Pause" : "Auswahl abspielen"}
            </Button>
            <Button
              variant={loop ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setLoop((value) => !value)}
              aria-pressed={loop}
              disabled={!previewOk}
            >
              <Repeat className="size-3.5" aria-hidden /> Schleife
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMuted((value) => !value)} aria-pressed={muted} disabled={!previewOk}>
              {muted ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
              {muted ? "Stumm" : "Ton an"}
            </Button>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              Position {formatTimecode(current)} / {formatTimecode(duration)}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {(["start", "end"] as const).map((which) => (
              <div key={which} className="space-y-1.5">
                <label htmlFor={`trim-${which}`} className="text-sm font-medium">
                  {which === "start" ? "Start" : "Ende"} <span className="text-xs font-normal text-muted-foreground">(m:ss.s)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id={`trim-${which}`}
                    value={which === "start" ? startText : endText}
                    onChange={(event) => (which === "start" ? setStartText(event.target.value) : setEndText(event.target.value))}
                    onBlur={() => commitText(which)}
                    onKeyDown={(event) => event.key === "Enter" && commitText(which)}
                    inputMode="decimal"
                    className="h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 font-mono text-sm"
                    data-testid={`trim-${which}`}
                  />
                  <Button
                    variant="secondary"
                    size="md"
                    className="px-3"
                    title={`Aktuelle Position als ${which === "start" ? "Start" : "Ende"} setzen`}
                    onClick={() =>
                      which === "start"
                        ? updateRange(clamp(current, 0, range.end - 0.1), range.end)
                        : updateRange(range.start, clamp(current, range.start + 0.1, duration))
                    }
                  >
                    Aktuelle Position
                  </Button>
                </div>
              </div>
            ))}
            <div className="rounded-lg bg-primary-soft px-3 py-2 text-center text-sm">
              <span className="block text-[11px] text-primary-soft-foreground">Länge</span>
              <span className="font-mono font-semibold" data-testid="trim-length">
                {formatTimecode(length)}
              </span>
            </div>
          </div>

          <Segmented
            label="Schnitt-Modus"
            value={precise ? "precise" : "copy"}
            onChange={(value) => setPrecise(value === "precise")}
            options={modeOptions}
          />
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {precise
              ? "Framegenau: Der Ausschnitt wird neu kodiert (H.264/AAC als MP4) und beginnt exakt am gewählten Bild."
              : "Verlustfrei: Bild und Ton werden 1:1 kopiert – in Sekunden fertig, auch bei großen Dateien. MP4/MOV starten exakt am gewählten Zeitpunkt, MKV/WebM am nächstgelegenen Keyframe davor."}
          </p>

          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={!canExport}
            onClick={() => onExport({ start: range.start, end: range.end, precise })}
            data-testid="start-trim"
          >
            <Scissors className="size-5" aria-hidden />
            Ausschnitt exportieren ({formatTimecode(length)})
          </Button>
        </>
      )}
    </div>
  );
}

interface TrimPanelProps {
  items: InputItem[];
  onExport: (item: InputItem, options: TrimOptions) => void;
}

export function TrimPanel({ items, onExport }: TrimPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const item = items.find((entry) => entry.id === selectedId) ?? items[0] ?? null;

  if (!item) return <p className="text-sm text-muted-foreground">Füge ein Video oder eine Audiodatei hinzu.</p>;

  return (
    <div className="space-y-4">
      {items.length > 1 && (
        <SelectField
          label="Datei zum Schneiden"
          value={item.id}
          onChange={setSelectedId}
          options={items.map((entry) => ({ value: entry.id, label: entry.file.name }))}
          className="max-w-md"
        />
      )}
      <TrimEditor key={item.id} item={item} onExport={(options) => onExport(item, options)} />
    </div>
  );
}
