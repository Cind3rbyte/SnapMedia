import type { MetadataFinding } from "../image/metadata";

export interface VideoStreamInfo {
  codec: string;
  width: number;
  height: number;
  /** Size after applying the rotation (what the viewer sees). */
  displayWidth: number;
  displayHeight: number;
  rotation: number;
  fps: number | null;
  bitrate: number | null;
  pixelFormat: string | null;
}

export interface AudioStreamInfo {
  codec: string;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
}

export interface MediaInfo {
  /** Duration in seconds, null if the container does not tell. */
  duration: number | null;
  /** Overall bitrate in bits per second. */
  bitrate: number | null;
  container: string;
  video: VideoStreamInfo | null;
  audio: AudioStreamInfo | null;
  audioStreams: number;
  /** Lower-cased container tags (title, location, make, model, creation_time …). */
  tags: Record<string, string>;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  pix_fmt?: string;
  duration?: string;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
  side_data_list?: Array<{ side_data_type?: string; rotation?: number }>;
}

interface ProbeJson {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string; bit_rate?: string; tags?: Record<string, string> };
}

function toNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "N/A" || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseRate(rate: string | undefined): number | null {
  if (!rate || rate === "0/0") return null;
  const [num, den] = rate.split("/").map(Number);
  if (!den) return toNumber(num);
  const fps = num / den;
  return Number.isFinite(fps) && fps > 0 && fps < 1000 ? fps : null;
}

function normalizeRotation(value: number): number {
  const r = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return r;
}

export function parseProbeJson(text: string): MediaInfo {
  const json = JSON.parse(text) as ProbeJson;
  const streams = json.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audioStreams = streams.filter((s) => s.codec_type === "audio");
  const audioStream = audioStreams[0];

  let video: VideoStreamInfo | null = null;
  if (videoStream && videoStream.width && videoStream.height) {
    const sideRotation = videoStream.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation;
    const tagRotation = toNumber(videoStream.tags?.rotate);
    const rotation = normalizeRotation(sideRotation ?? tagRotation ?? 0);
    const swap = rotation === 90 || rotation === 270;
    video = {
      codec: videoStream.codec_name ?? "unbekannt",
      width: videoStream.width,
      height: videoStream.height,
      displayWidth: swap ? videoStream.height : videoStream.width,
      displayHeight: swap ? videoStream.width : videoStream.height,
      rotation,
      fps: parseRate(videoStream.avg_frame_rate) ?? parseRate(videoStream.r_frame_rate),
      bitrate: toNumber(videoStream.bit_rate),
      pixelFormat: videoStream.pix_fmt ?? null,
    };
  }

  const audio: AudioStreamInfo | null = audioStream
    ? {
        codec: audioStream.codec_name ?? "unbekannt",
        sampleRate: toNumber(audioStream.sample_rate),
        channels: audioStream.channels ?? null,
        bitrate: toNumber(audioStream.bit_rate),
      }
    : null;

  const durations = [json.format?.duration, ...streams.map((s) => s.duration)]
    .map((d) => toNumber(d))
    .filter((d): d is number => d !== null && d > 0);

  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(json.format?.tags ?? {})) tags[key.toLowerCase()] = String(value);

  return {
    duration: durations.length ? durations[0] : null,
    bitrate: toNumber(json.format?.bit_rate),
    container: json.format?.format_name ?? "",
    video,
    audio,
    audioStreams: audioStreams.length,
    tags,
  };
}

/** Fallback parser for "ffmpeg -i" output when ffprobe is unavailable. */
export function parseFFmpegInfoLog(log: string[]): MediaInfo {
  const text = log.join("\n");
  const durationMatch = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text);
  const duration = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : null;
  const bitrateMatch = /Duration:.*bitrate:\s*(\d+)\s*kb\/s/.exec(text);
  const videoLine = log.find((line) => /Stream #\d+:\d+.*Video:/.test(line) && !/attached pic/.test(line));
  const audioLines = log.filter((line) => /Stream #\d+:\d+.*Audio:/.test(line));
  const rotationMatch = /rotation of (-?[\d.]+) degrees/.exec(text);

  let video: VideoStreamInfo | null = null;
  if (videoLine) {
    const size = /,\s*(\d{2,5})x(\d{2,5})/.exec(videoLine);
    if (size) {
      const width = Number(size[1]);
      const height = Number(size[2]);
      const rotation = normalizeRotation(rotationMatch ? -Number(rotationMatch[1]) : 0);
      const swap = rotation === 90 || rotation === 270;
      const fps = /([\d.]+)\s*fps/.exec(videoLine) ?? /([\d.]+)\s*tbr/.exec(videoLine);
      const kbps = /(\d+)\s*kb\/s/.exec(videoLine);
      video = {
        codec: /Video:\s*([\w-]+)/.exec(videoLine)?.[1] ?? "unbekannt",
        width,
        height,
        displayWidth: swap ? height : width,
        displayHeight: swap ? width : height,
        rotation,
        fps: fps ? Number(fps[1]) : null,
        bitrate: kbps ? Number(kbps[1]) * 1000 : null,
        pixelFormat: /Video:[^,]*,\s*([a-z0-9_]+)/.exec(videoLine)?.[1] ?? null,
      };
    }
  }
  const audioLine = audioLines[0];
  const audio: AudioStreamInfo | null = audioLine
    ? {
        codec: /Audio:\s*([\w-]+)/.exec(audioLine)?.[1] ?? "unbekannt",
        sampleRate: Number(/(\d+)\s*Hz/.exec(audioLine)?.[1]) || null,
        channels: /mono/.test(audioLine) ? 1 : /stereo/.test(audioLine) ? 2 : null,
        bitrate: Number(/(\d+)\s*kb\/s/.exec(audioLine)?.[1]) * 1000 || null,
      }
    : null;

  const tags: Record<string, string> = {};
  const metadataStart = log.findIndex((line) => /^\s{2}Metadata:/.test(line));
  if (metadataStart !== -1) {
    for (let i = metadataStart + 1; i < log.length; i += 1) {
      const match = /^\s{4}([^:]+?)\s*:\s?(.*)$/.exec(log[i]);
      if (!match) break;
      tags[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }

  return {
    duration,
    bitrate: bitrateMatch ? Number(bitrateMatch[1]) * 1000 : null,
    container: /Input #0,\s*([^,]+(?:,[^,]+)*?),\s*from/.exec(text)?.[1] ?? "",
    video,
    audio,
    audioStreams: audioLines.length,
    tags,
  };
}

const TAG_LABELS: Array<{ test: RegExp; category: MetadataFinding["category"]; label: string }> = [
  { test: /location|iso6709|gps|xyz/, category: "gps", label: "GPS-Position" },
  { test: /(^|\.)(make|model)$|com\.apple\.quicktime\.(make|model)|android\.manufacturer|android\.model/, category: "device", label: "Gerät" },
  { test: /software|encoder|encoded_by|handler|com\.apple\.quicktime\.software|android\.version/, category: "software", label: "Software" },
  { test: /creation_time|date|com\.apple\.quicktime\.creationdate/, category: "datetime", label: "Aufnahmezeitpunkt" },
  { test: /artist|author|composer|album_artist|copyright|publisher/, category: "author", label: "Urheber" },
  { test: /title|comment|description|album|genre|lyrics|synopsis|keywords/, category: "other", label: "Text" },
];

/** Turns container tags into human-readable privacy findings. */
export function mediaTagFindings(tags: Record<string, string>): MetadataFinding[] {
  const findings: MetadataFinding[] = [];
  for (const [key, value] of Object.entries(tags)) {
    if (!value || /^(major_brand|minor_version|compatible_brands)$/.test(key)) continue;
    const rule = TAG_LABELS.find((entry) => entry.test.test(key));
    const category = rule?.category ?? "other";
    let shown = value;
    if (category === "gps") {
      const iso = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(value);
      if (iso) shown = `${Number(iso[1]).toFixed(5)}, ${Number(iso[2]).toFixed(5)}`;
    }
    findings.push({ category, label: `${rule?.label ?? "Metadaten"} (${key})`, value: shown.slice(0, 120) });
  }
  return findings;
}
