import type { MediaInfo } from "./ffmpeg/probe";

export type CompressPresetId = "discord" | "email" | "web";

export interface CompressPreset {
  id: CompressPresetId;
  label: string;
  short: string;
  description: string;
  /** Hard size limit in bytes (decimal MB, so the file also fits under binary MiB limits). */
  targetBytes: number | null;
}

export const COMPRESS_PRESETS: CompressPreset[] = [
  {
    id: "discord",
    label: "Unter 10 MB (Discord Free)",
    short: "Discord",
    description: "Passt garantiert unter das 10-MB-Upload-Limit von Discord ohne Nitro.",
    targetBytes: 10_000_000,
  },
  {
    id: "email",
    label: "Unter 5 MB (E-Mail / Upload-Limits)",
    short: "E-Mail",
    description: "Ideal für E-Mail-Anhänge, Formulare und Upload-Grenzen von Webseiten.",
    targetBytes: 5_000_000,
  },
  {
    id: "web",
    label: "Maximale Web-Kompression",
    short: "Web",
    description: "Kleinstmögliche Datei bei guter Qualität – perfekt für Webseiten & Messenger.",
    targetBytes: null,
  },
];

export type SpeedPreset = "fast" | "balanced" | "quality";

export const SPEED_PRESETS: Record<SpeedPreset, { label: string; x264: string; vp9: number }> = {
  fast: { label: "Schnell", x264: "superfast", vp9: 8 },
  balanced: { label: "Ausgewogen", x264: "veryfast", vp9: 6 },
  quality: { label: "Beste Qualität", x264: "medium", vp9: 4 },
};

export interface VideoPlan {
  mode: "target" | "quality";
  /** Total size budget for target mode. */
  targetBytes: number | null;
  videoKbps: number | null;
  audioKbps: number;
  crf: number | null;
  maxrateKbps: number | null;
  /** Target length of the shorter side in pixels (never larger than the source). */
  shortSide: number | null;
  fps: number | null;
  mono: boolean;
  warnings: string[];
}

const RESOLUTION_LADDER: Array<{ minKbps: number; shortSide: number }> = [
  { minKbps: 4000, shortSide: 1080 },
  { minKbps: 2000, shortSide: 720 },
  { minKbps: 1000, shortSide: 540 },
  { minKbps: 600, shortSide: 480 },
  { minKbps: 300, shortSide: 360 },
  { minKbps: 0, shortSide: 240 },
];

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

export const MIN_VIDEO_KBPS = 40;

/**
 * Calculates bitrate, resolution and frame rate so the encoded file ends up below the size limit.
 *
 * budget = limit × safety − container overhead
 * total kbps = budget × 8 / duration
 * video kbps = total − audio kbps  → picks the resolution step and frame rate cap.
 */
export function planVideoCompression(info: MediaInfo, preset: CompressPreset, safety = 0.95): VideoPlan {
  const warnings: string[] = [];
  const duration = info.duration ?? 0;
  if (duration <= 0) throw new Error("Die Videolänge konnte nicht ermittelt werden.");
  const sourceShort = info.video ? Math.min(info.video.width, info.video.height) : null;
  const sourceFps = info.video?.fps ?? 30;
  const hasAudio = Boolean(info.audio);

  if (preset.targetBytes === null) {
    return {
      mode: "quality",
      targetBytes: null,
      videoKbps: null,
      audioKbps: hasAudio ? Math.min(96, sourceAudioKbps(info) ?? 96) : 0,
      crf: 28,
      maxrateKbps: 3000,
      shortSide: sourceShort ? even(Math.min(720, sourceShort)) : null,
      fps: sourceFps > 31 ? 30 : null,
      mono: false,
      warnings,
    };
  }

  const fpsForOverhead = Math.min(sourceFps, 60);
  const overheadBytes = 48 * 1024 + duration * (fpsForOverhead * 16 + 50 * 8);
  const budgetBits = (preset.targetBytes * safety - overheadBytes) * 8;
  const totalKbps = budgetBits / duration / 1000;

  let audioKbps = 0;
  if (hasAudio) {
    audioKbps = totalKbps >= 2000 ? 128 : totalKbps >= 800 ? 96 : totalKbps >= 300 ? 64 : 32;
    const source = sourceAudioKbps(info);
    if (source) audioKbps = Math.min(audioKbps, Math.max(32, Math.round(source)));
  }
  let videoKbps = Math.floor(totalKbps - audioKbps);
  if (!info.video) {
    return {
      mode: "target",
      targetBytes: preset.targetBytes,
      videoKbps: null,
      audioKbps: Math.max(8, Math.min(320, Math.floor(totalKbps))),
      crf: null,
      maxrateKbps: null,
      shortSide: null,
      fps: null,
      mono: totalKbps < 48,
      warnings,
    };
  }
  if (videoKbps < MIN_VIDEO_KBPS) {
    const maxSeconds = Math.floor(((preset.targetBytes * safety - 48 * 1024) * 8) / 1000 / (MIN_VIDEO_KBPS + 32));
    throw new Error(
      `Das Video ist zu lang für ${preset.short} (max. ca. ${Math.max(1, maxSeconds)} Sekunden bei minimaler Qualität). Kürze es zuerst mit dem Video-Cutter.`,
    );
  }
  const sourceVideoKbps = info.video.bitrate ? info.video.bitrate / 1000 : null;
  if (sourceVideoKbps && videoKbps > sourceVideoKbps) videoKbps = Math.floor(sourceVideoKbps);
  if (videoKbps < 150) warnings.push("Sehr niedrige Bitrate – die Bildqualität wird deutlich sichtbar leiden.");

  const step = RESOLUTION_LADDER.find((entry) => videoKbps >= entry.minKbps) ?? RESOLUTION_LADDER[RESOLUTION_LADDER.length - 1];
  const shortSide = sourceShort ? even(Math.min(step.shortSide, sourceShort)) : null;
  const fpsCap = videoKbps >= 4000 ? 60 : videoKbps >= 300 ? 30 : 24;

  return {
    mode: "target",
    targetBytes: preset.targetBytes,
    videoKbps,
    audioKbps,
    crf: null,
    maxrateKbps: Math.round(videoKbps * 1.5),
    shortSide,
    fps: sourceFps > fpsCap + 0.5 ? fpsCap : null,
    mono: audioKbps <= 32,
    warnings,
  };
}

function sourceAudioKbps(info: MediaInfo): number | null {
  return info.audio?.bitrate ? info.audio.bitrate / 1000 : null;
}

/** Audio-only compression: bitrate that fits the target size. */
export function planAudioBitrate(durationSeconds: number, targetBytes: number, safety = 0.95): number {
  const kbps = ((targetBytes * safety - 16 * 1024) * 8) / durationSeconds / 1000;
  if (kbps < 8) {
    throw new Error("Die Audiodatei ist zu lang, um sie unter das Limit zu bringen. Kürze sie zuerst mit dem Cutter.");
  }
  const steps = [320, 256, 192, 160, 128, 112, 96, 80, 64, 48, 40, 32, 24, 16, 12, 8];
  return steps.find((step) => step <= kbps) ?? 8;
}

/** Image targets for browser-image-compression (it measures MiB). */
export function imageTargetMiB(targetBytes: number, safety = 0.97): number {
  return (targetBytes * safety) / (1024 * 1024);
}
