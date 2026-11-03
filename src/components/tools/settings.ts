import type { AudioTarget, Mp3Bitrate } from "@/lib/ffmpeg/tasks";
import type { ImageOutputChoice } from "@/lib/image/tasks";
import type { CompressPresetId, SpeedPreset } from "@/lib/presets";

export interface CompressSettings {
  preset: CompressPresetId;
  imageFormat: ImageOutputChoice;
  speed: SpeedPreset;
}

export type VideoConvertTarget = AudioTarget | "mp4" | "gif";

export interface ConvertSettings {
  imageTarget: "jpeg" | "png" | "webp";
  quality: number;
  maxDimension: "0" | "3840" | "2560" | "1920" | "1280" | "800";
  background: string;
  svgScale: "1" | "2" | "4";
  gifToMp4: boolean;
  videoTarget: VideoConvertTarget;
  audioTarget: AudioTarget;
  mp3Bitrate: Mp3Bitrate;
  gifFps: "10" | "12" | "15" | "20";
  gifWidth: "320" | "480" | "640" | "800";
}

export interface PrivacySettings {
  keepIcc: boolean;
}

export const DEFAULT_COMPRESS: CompressSettings = { preset: "discord", imageFormat: "auto", speed: "balanced" };

export const DEFAULT_CONVERT: ConvertSettings = {
  imageTarget: "jpeg",
  quality: 0.9,
  maxDimension: "0",
  background: "#ffffff",
  svgScale: "2",
  gifToMp4: false,
  videoTarget: "mp3",
  audioTarget: "mp3",
  mp3Bitrate: 192,
  gifFps: "12",
  gifWidth: "480",
};

export const DEFAULT_PRIVACY: PrivacySettings = { keepIcc: true };
