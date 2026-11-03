import { msg } from "@/i18n/runtime";
import type { MediaInfo } from "./ffmpeg/probe";

export type CompressPresetId = "discord" | "email" | "web";

export interface CompressPreset {
  id: CompressPresetId;
  /** Hard size limit in bytes (decimal MB, so the file also fits under binary MiB limits). */
  targetBytes: number | null;
}

/** Labels and descriptions live in the dictionaries (`compress.presets`). */
export const COMPRESS_PRESETS: CompressPreset[] = [
  { id: "discord", targetBytes: 10_000_000 },
  { id: "email", targetBytes: 5_000_000 },
  { id: "web", targetBytes: null },
];

export type SpeedPreset = "fast" | "balanced" | "quality";

export const SPEED_PRESETS: Record<SpeedPreset, { x264: string }> = {
  fast: { x264: "superfast" },
  balanced: { x264: "veryfast" },
  quality: { x264: "medium" },
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
  const t = msg();
  if (duration <= 0) throw new Error(t.errors.durationUnknown);
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
    throw new Error(t.errors.tooLong(t.compress.presets[preset.id].short, Math.max(1, maxSeconds)));
  }
  const sourceVideoKbps = info.video.bitrate ? info.video.bitrate / 1000 : null;
  if (sourceVideoKbps && videoKbps > sourceVideoKbps) videoKbps = Math.floor(sourceVideoKbps);
  if (videoKbps < 150) warnings.push(t.notes.lowBitrate);

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
  if (kbps < 8) throw new Error(msg().errors.audioTooLong);
  const steps = [320, 256, 192, 160, 128, 112, 96, 80, 64, 48, 40, 32, 24, 16, 12, 8];
  return steps.find((step) => step <= kbps) ?? 8;
}

/** Image targets for browser-image-compression (it measures MiB). */
export function imageTargetMiB(targetBytes: number, safety = 0.97): number {
  return (targetBytes * safety) / (1024 * 1024);
}
