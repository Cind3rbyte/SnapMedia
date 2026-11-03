import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { FORMATS, type MediaType } from "../file-types";
import type { MetadataFinding } from "../image/metadata";
import {
  MIN_VIDEO_KBPS,
  SPEED_PRESETS,
  planAudioBitrate,
  planVideoCompression,
  type CompressPreset,
  type SpeedPreset,
  type VideoPlan,
} from "../presets";
import { formatBytes, outputName, throwIfAborted } from "../utils";
import { ffmpegEngine } from "./engine";
import { probeInput, readOutput, removeFile, tempName, withInputFile } from "./io";
import { mediaTagFindings, type MediaInfo } from "./probe";
import type { TaskContext, TaskResult } from "../task-types";

export type { TaskContext, TaskResult };

/** Runs a job on the engine with an input file mounted and probed. */
async function withMedia<T>(
  file: File,
  type: MediaType,
  ctx: TaskContext,
  job: (ffmpeg: FFmpeg, input: string, info: MediaInfo) => Promise<T>,
): Promise<T> {
  ctx.onStage?.("Warte auf FFmpeg-Engine…");
  return ffmpegEngine.run(async (ffmpeg) => {
    throwIfAborted(ctx.signal);
    return withInputFile(ffmpeg, file, type.format, async (input) => {
      ctx.onStage?.("Analysiere Datei…");
      const info = await probeInput(ffmpeg, input);
      throwIfAborted(ctx.signal);
      return job(ffmpeg, input, info);
    });
  }, ctx.signal);
}

function threadArgs(): { decode: string[]; encode: string[]; global: string[] } {
  const threads = String(ffmpegEngine.threads());
  return {
    decode: ["-threads", threads],
    encode: ["-threads", threads],
    global: ["-filter_threads", "2", "-filter_complex_threads", "2"],
  };
}

function scaleFilter(shortSide: number | null): string {
  if (!shortSide) return "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  // Works for landscape and portrait (after auto-rotation) and keeps the aspect ratio with even sizes.
  return `scale='if(gte(iw,ih),-2,${shortSide})':'if(gte(iw,ih),${shortSide},-2)':flags=bicubic`;
}

function describeVideo(info: MediaInfo, plan: VideoPlan, videoKbps: number | null): string[] {
  const details: string[] = [];
  if (info.video && plan.shortSide) {
    const sourceShort = Math.min(info.video.width, info.video.height);
    details.push(plan.shortSide < sourceShort ? `${plan.shortSide}p (vorher ${sourceShort}p)` : `${plan.shortSide}p`);
  }
  if (plan.fps) details.push(`${plan.fps} fps`);
  if (videoKbps) details.push(`Video ${videoKbps.toLocaleString("de-DE")} kbit/s`);
  if (plan.crf) details.push(`Qualitätsstufe CRF ${plan.crf}`);
  if (info.audio && plan.audioKbps) details.push(`Audio ${plan.audioKbps} kbit/s${plan.mono ? " mono" : ""}`);
  return details;
}

function videoArgs(input: string, output: string, plan: VideoPlan, videoKbps: number | null, speed: SpeedPreset): string[] {
  const t = threadArgs();
  const filters = [scaleFilter(plan.shortSide)];
  if (plan.fps) filters.push(`fps=${plan.fps}`);
  const args = [...t.global, ...t.decode, "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-vf", filters.join(",")];
  args.push("-c:v", "libx264", "-preset", SPEED_PRESETS[speed].x264, "-pix_fmt", "yuv420p", "-profile:v", "high");
  if (plan.mode === "target" && videoKbps) {
    args.push("-b:v", `${videoKbps}k`, "-maxrate", `${Math.round(videoKbps * 1.5)}k`, "-bufsize", `${videoKbps * 2}k`);
  } else {
    args.push("-crf", String(plan.crf ?? 28));
    if (plan.maxrateKbps) args.push("-maxrate", `${plan.maxrateKbps}k`, "-bufsize", `${plan.maxrateKbps * 2}k`);
  }
  args.push(...t.encode);
  if (plan.audioKbps > 0) {
    args.push("-c:a", "aac", "-b:a", `${plan.audioKbps}k`, "-ac", plan.mono ? "1" : "2");
  } else {
    args.push("-an");
  }
  args.push("-sn", "-dn", "-map_metadata", "-1", "-movflags", "+faststart", output);
  return args;
}

function keepOriginal(file: File, note: string): TaskResult {
  return { blob: file, name: file.name, note };
}

/* ----------------------------------------------------------------------------------------------
 * Compression
 * --------------------------------------------------------------------------------------------*/

export async function compressVideo(
  file: File,
  type: MediaType,
  preset: CompressPreset,
  speed: SpeedPreset,
  ctx: TaskContext,
): Promise<TaskResult> {
  if (preset.targetBytes && file.size <= preset.targetBytes) {
    return keepOriginal(file, `Bereits unter ${formatBytes(preset.targetBytes, 0)} – Original unverändert übernommen.`);
  }
  return withMedia(file, type, ctx, async (ffmpeg, input, info) => {
    if (!info.video) return compressAudioLoaded(ffmpeg, file, input, info, preset, ctx);
    const plan = planVideoCompression(info, preset);
    let videoKbps = plan.videoKbps;
    const maxAttempts = plan.mode === "target" ? 3 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      throwIfAborted(ctx.signal);
      ctx.onStage?.(attempt === 1 ? "Komprimiere Video…" : `Feinabstimmung – Durchgang ${attempt} von ${maxAttempts}…`);
      ctx.onProgress?.(0);
      const output = tempName("mp4");
      await ffmpegEngine.exec(ffmpeg, videoArgs(input, output, plan, videoKbps, speed), {
        duration: info.duration,
        onProgress: (ratio) => ctx.onProgress?.(ratio),
        signal: ctx.signal,
      });
      const blob = await readOutput(ffmpeg, output, "video/mp4");
      const name = outputName(file.name, "mp4", preset.id === "web" ? "web" : `unter-${Math.round((preset.targetBytes ?? 0) / 1e6)}mb`);
      if (plan.mode === "quality") {
        if (blob.size >= file.size) {
          return keepOriginal(file, "Die Datei ist bereits optimal komprimiert – Original beibehalten.");
        }
        return { blob, name, details: describeVideo(info, plan, null), note: plan.warnings[0] };
      }
      const target = plan.targetBytes ?? Infinity;
      if (blob.size <= target) {
        return { blob, name, details: describeVideo(info, plan, videoKbps), note: plan.warnings[0] };
      }
      // Overshoot: scale the video bitrate down proportionally (audio stays fixed) and try again.
      const duration = info.duration ?? 1;
      const audioBytes = (plan.audioKbps * 1000 * duration) / 8;
      const factor = Math.max(0.3, (target * 0.93 - audioBytes) / Math.max(1, blob.size - audioBytes));
      videoKbps = Math.max(MIN_VIDEO_KBPS, Math.floor((videoKbps ?? MIN_VIDEO_KBPS) * factor));
    }
    throw new Error(
      `Die Zielgröße von ${formatBytes(plan.targetBytes ?? 0, 0)} konnte nicht erreicht werden. Kürze das Video oder wähle ein größeres Limit.`,
    );
  });
}

async function compressAudioLoaded(
  ffmpeg: FFmpeg,
  file: File,
  input: string,
  info: MediaInfo,
  preset: CompressPreset,
  ctx: TaskContext,
): Promise<TaskResult> {
  if (!info.audio) throw new Error("Die Datei enthält keine Audiospur.");
  const duration = info.duration ?? 0;
  if (duration <= 0) throw new Error("Die Länge der Audiodatei konnte nicht ermittelt werden.");
  let kbps = preset.targetBytes ? planAudioBitrate(duration, preset.targetBytes) : 96;
  const t = threadArgs();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    ctx.onStage?.(attempt === 1 ? "Komprimiere Audio…" : `Feinabstimmung – Durchgang ${attempt}…`);
    const output = tempName("m4a");
    const mono = kbps <= 48;
    await ffmpegEngine.exec(
      ffmpeg,
      [...t.global, "-i", input, "-map", "0:a:0", "-vn", "-c:a", "aac", "-b:a", `${kbps}k`, "-ac", mono ? "1" : "2", "-map_metadata", "-1", "-movflags", "+faststart", output],
      { duration, onProgress: (ratio) => ctx.onProgress?.(ratio), signal: ctx.signal },
    );
    const blob = await readOutput(ffmpeg, output, "audio/mp4");
    const name = outputName(file.name, "m4a", preset.id === "web" ? "web" : `unter-${Math.round((preset.targetBytes ?? 0) / 1e6)}mb`);
    const details = [`AAC ${kbps} kbit/s${mono ? " mono" : ""}`];
    if (!preset.targetBytes) {
      if (blob.size >= file.size) return keepOriginal(file, "Die Datei ist bereits optimal komprimiert – Original beibehalten.");
      return { blob, name, details };
    }
    if (blob.size <= preset.targetBytes) return { blob, name, details };
    kbps = Math.max(8, Math.floor(kbps * ((preset.targetBytes * 0.93) / blob.size)));
  }
  throw new Error("Die Zielgröße konnte nicht erreicht werden. Kürze die Audiodatei zuerst.");
}

export async function compressAudio(
  file: File,
  type: MediaType,
  preset: CompressPreset,
  ctx: TaskContext,
): Promise<TaskResult> {
  if (preset.targetBytes && file.size <= preset.targetBytes) {
    return keepOriginal(file, `Bereits unter ${formatBytes(preset.targetBytes, 0)} – Original unverändert übernommen.`);
  }
  return withMedia(file, type, ctx, (ffmpeg, input, info) => compressAudioLoaded(ffmpeg, file, input, info, preset, ctx));
}

/** Palette-based GIF encoding keeps colors clean and files small. */
function gifFilter(fps: number, width: number, colors: number): string {
  return (
    `fps=${fps},scale='min(${width},iw)':-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=${colors}:stats_mode=diff[p];` +
    `[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`
  );
}

/** Shrinks animated GIFs (frame rate, size, colors) until they fit – the animation stays a GIF. */
export async function compressGif(file: File, type: MediaType, preset: CompressPreset, ctx: TaskContext): Promise<TaskResult> {
  if (preset.targetBytes && file.size <= preset.targetBytes) {
    return keepOriginal(file, `Bereits unter ${formatBytes(preset.targetBytes, 0)} – Original unverändert übernommen.`);
  }
  return withMedia(file, type, ctx, async (ffmpeg, input, info) => {
    const sourceWidth = info.video?.displayWidth ?? 480;
    const sourceFps = Math.min(info.video?.fps ?? 15, 30);
    let width = preset.targetBytes ? Math.min(sourceWidth, 800) : Math.min(sourceWidth, 480);
    let fps = preset.targetBytes ? Math.min(sourceFps, 25) : Math.min(sourceFps, 15);
    let colors = preset.targetBytes ? 256 : 128;
    const t = threadArgs();
    const attempts = preset.targetBytes ? 5 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      throwIfAborted(ctx.signal);
      ctx.onStage?.(attempt === 1 ? "Optimiere GIF…" : `Verkleinere weiter – Versuch ${attempt} von ${attempts}…`);
      const output = tempName("gif");
      await ffmpegEngine.exec(
        ffmpeg,
        [...t.global, "-i", input, "-filter_complex", gifFilter(Math.max(5, Math.round(fps)), Math.round(width), colors), "-loop", "0", output],
        { duration: info.duration, onProgress: (ratio) => ctx.onProgress?.(ratio), signal: ctx.signal },
      );
      const blob = await readOutput(ffmpeg, output, "image/gif");
      const details = [`${Math.round(width)} px breit`, `${Math.round(fps)} fps`, `${colors} Farben`];
      const name = outputName(file.name, "gif", preset.id === "web" ? "web" : `unter-${Math.round((preset.targetBytes ?? 0) / 1e6)}mb`);
      if (!preset.targetBytes) {
        if (blob.size >= file.size) return keepOriginal(file, "Das GIF ist bereits optimal komprimiert – Original beibehalten.");
        return { blob, name, details };
      }
      if (blob.size <= preset.targetBytes) return { blob, name, details };
      const ratio = (preset.targetBytes * 0.9) / blob.size;
      if (ratio < 0.7 && fps > 10) {
        const newFps = Math.max(10, fps * Math.max(0.6, Math.sqrt(ratio)));
        width *= Math.min(0.95, Math.sqrt(ratio / (newFps / fps)));
        fps = newFps;
      } else {
        width *= Math.min(0.95, Math.sqrt(ratio));
      }
      width = Math.max(64, width);
      if (attempt >= 2) colors = Math.max(32, colors / 2);
    }
    throw new Error("Das GIF ließ sich nicht klein genug bekommen. Tipp: Wandle es in ein MP4 um – das ist bis zu 90 % kleiner.");
  });
}

/* ----------------------------------------------------------------------------------------------
 * Conversion
 * --------------------------------------------------------------------------------------------*/

export type AudioTarget = "mp3" | "aac" | "wav";
export type Mp3Bitrate = 128 | 192 | 256 | 320;

export async function convertToAudio(
  file: File,
  type: MediaType,
  target: AudioTarget,
  mp3Bitrate: Mp3Bitrate,
  ctx: TaskContext,
): Promise<TaskResult> {
  return withMedia(file, type, ctx, async (ffmpeg, input, info) => {
    if (!info.audio) throw new Error("Diese Datei enthält keine Tonspur.");
    const t = threadArgs();
    const sourceCodec = info.audio.codec;
    let ext: string;
    let mime: string;
    let codecArgs: string[];
    let details: string[];
    if (target === "aac") {
      ext = "m4a";
      mime = "audio/mp4";
      if (sourceCodec === "aac") {
        codecArgs = ["-c:a", "copy"];
        details = ["Original-AAC-Spur 1:1 übernommen (verlustfrei)"];
      } else {
        codecArgs = ["-c:a", "aac", "-b:a", "192k"];
        details = ["AAC 192 kbit/s"];
      }
    } else if (target === "mp3") {
      ext = "mp3";
      mime = "audio/mpeg";
      if (sourceCodec === "mp3" && type.format !== "mp3") {
        codecArgs = ["-c:a", "copy"];
        details = ["Original-MP3-Spur 1:1 übernommen (verlustfrei)"];
      } else {
        codecArgs = ["-c:a", "libmp3lame", "-b:a", `${mp3Bitrate}k`];
        details = [`MP3 ${mp3Bitrate} kbit/s`];
      }
    } else {
      ext = "wav";
      mime = "audio/wav";
      codecArgs = ["-c:a", "pcm_s16le"];
      details = ["WAV 16 Bit (unkomprimiert)"];
    }
    ctx.onStage?.(`Erzeuge ${ext.toUpperCase()}…`);
    const output = tempName(ext);
    const metadataArgs = ext === "mp3" ? ["-id3v2_version", "3"] : [];
    await ffmpegEngine.exec(
      ffmpeg,
      [...t.global, "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn", ...codecArgs, ...metadataArgs, output],
      { duration: info.duration, onProgress: (ratio) => ctx.onProgress?.(ratio), signal: ctx.signal },
    );
    const blob = await readOutput(ffmpeg, output, mime);
    return { blob, name: outputName(file.name, ext), details };
  });
}

export async function convertVideoToMp4(file: File, type: MediaType, speed: SpeedPreset, ctx: TaskContext): Promise<TaskResult> {
  return withMedia(file, type, ctx, async (ffmpeg, input, info) => {
    if (!info.video) throw new Error("Diese Datei enthält keine Videospur.");
    const t = threadArgs();
    // H.264 plays everywhere and can be remuxed losslessly; everything else (HEVC, VP9, …) is re-encoded.
    const videoCopy = info.video.codec === "h264";
    const audioCopy = !info.audio || ["aac", "mp3"].includes(info.audio.codec);
    const output = tempName("mp4");
    let args: string[];
    let details: string[];
    if (videoCopy && audioCopy) {
      ctx.onStage?.("Übertrage Spuren ins MP4-Format (ohne Neukodierung)…");
      args = ["-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-sn", "-dn"];
      details = ["Verlustfrei umverpackt (Remux)", "H.264"];
    } else {
      ctx.onStage?.("Kodiere zu MP4 (H.264)…");
      args = [
        ...t.global, ...t.decode, "-i", input, "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", scaleFilter(null), "-c:v", "libx264", "-preset", SPEED_PRESETS[speed].x264, "-crf", "21",
        "-pix_fmt", "yuv420p", ...t.encode, "-c:a", "aac", "-b:a", "160k", "-sn", "-dn",
      ];
      details = ["H.264 / AAC", "CRF 21 (sehr gute Qualität)"];
    }
    args.push("-movflags", "+faststart", output);
    await ffmpegEngine.exec(ffmpeg, args, {
      duration: info.duration,
      onProgress: (ratio) => ctx.onProgress?.(ratio),
      signal: ctx.signal,
    });
    const blob = await readOutput(ffmpeg, output, "video/mp4");
    return { blob, name: outputName(file.name, "mp4"), details };
  });
}

export interface GifOptions {
  fps: number;
  width: number;
}

export async function convertVideoToGif(file: File, type: MediaType, options: GifOptions, ctx: TaskContext): Promise<TaskResult> {
  return withMedia(file, type, ctx, async (ffmpeg, input, info) => {
    if (!info.video) throw new Error("Diese Datei enthält keine Videospur.");
    const t = threadArgs();
    ctx.onStage?.("Erzeuge animiertes GIF…");
    const output = tempName("gif");
    await ffmpegEngine.exec(
      ffmpeg,
      [...t.global, ...t.decode, "-i", input, "-filter_complex", gifFilter(options.fps, options.width, 256), "-loop", "0", output],
      { duration: info.duration, onProgress: (ratio) => ctx.onProgress?.(ratio), signal: ctx.signal },
    );
    const blob = await readOutput(ffmpeg, output, "image/gif");
    const note = info.duration && info.duration > 20 ? "Tipp: Lange GIFs werden sehr groß – kürze das Video vorher mit dem Cutter." : undefined;
    return { blob, name: outputName(file.name, "gif"), details: [`${options.width} px`, `${options.fps} fps`], note };
  });
}

export async function convertGifToMp4(file: File, type: MediaType, ctx: TaskContext): Promise<TaskResult> {
  return withMedia(file, type, ctx, async (ffmpeg, input, info) => {
    const t = threadArgs();
    ctx.onStage?.("Wandle GIF in MP4 um…");
    const output = tempName("mp4");
    await ffmpegEngine.exec(
      ffmpeg,
      [
        ...t.global, "-i", input, "-vf", scaleFilter(null), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", ...t.encode, "-an", "-movflags", "+faststart", output,
      ],
      { duration: info.duration, onProgress: (ratio) => ctx.onProgress?.(ratio), signal: ctx.signal },
    );
    const blob = await readOutput(ffmpeg, output, "video/mp4");
    return { blob, name: outputName(file.name, "mp4"), details: ["H.264", "Ideal für Discord, WhatsApp & Web"] };
  });
}

/* ----------------------------------------------------------------------------------------------
 * Trimming
 * --------------------------------------------------------------------------------------------*/

const COPY_CONTAINERS: Record<string, { ext: string; mime: string }> = {
  mp4: { ext: "mp4", mime: "video/mp4" },
  m4v: { ext: "m4v", mime: "video/x-m4v" },
  mov: { ext: "mov", mime: "video/quicktime" },
  webm: { ext: "webm", mime: "video/webm" },
  mkv: { ext: "mkv", mime: "video/x-matroska" },
  avi: { ext: "avi", mime: "video/x-msvideo" },
  "3gp": { ext: "3gp", mime: "video/3gpp" },
  ts: { ext: "ts", mime: "video/mp2t" },
  mpeg: { ext: "mpg", mime: "video/mpeg" },
  mp3: { ext: "mp3", mime: "audio/mpeg" },
  m4a: { ext: "m4a", mime: "audio/mp4" },
  aac: { ext: "aac", mime: "audio/aac" },
  wav: { ext: "wav", mime: "audio/wav" },
  ogg: { ext: "ogg", mime: "audio/ogg" },
  opus: { ext: "opus", mime: "audio/ogg" },
  flac: { ext: "flac", mime: "audio/flac" },
  weba: { ext: "webm", mime: "audio/webm" },
  aiff: { ext: "aiff", mime: "audio/aiff" },
};

export interface TrimOptions {
  start: number;
  end: number;
  /** Re-encode for frame accurate cuts; otherwise lossless stream copy (cuts at keyframes). */
  precise: boolean;
}

export async function trimMedia(
  file: File,
  type: MediaType,
  options: TrimOptions,
  speed: SpeedPreset,
  ctx: TaskContext,
): Promise<TaskResult> {
  const duration = Math.max(0.05, options.end - options.start);
  return withMedia(file, type, ctx, async (ffmpeg, input, info) => {
    const t = threadArgs();
    const container = COPY_CONTAINERS[type.format];
    const isAudio = !info.video;
    const copy = !options.precise && Boolean(container);
    const seek = ["-ss", options.start.toFixed(3)];
    let ext: string;
    let mime: string;
    let args: string[];
    let details: string[];
    if (copy && container) {
      ext = container.ext;
      mime = container.mime;
      ctx.onStage?.("Schneide verlustfrei…");
      args = [...seek, "-i", input, "-t", duration.toFixed(3), "-map", "0:v:0?", "-map", "0:a?", "-c", "copy"];
      const movFamily = ["mp4", "m4v", "mov", "m4a", "3gp"].includes(ext);
      if (movFamily) {
        // MP4/MOV: the frames between the previous keyframe and the start are hidden with an edit list,
        // so players start exactly at the selected time – still without re-encoding.
        args.push("-movflags", "+faststart");
        details = ["Verlustfrei (Stream-Copy)", isAudio ? "Ton 1:1 übernommen" : "Exakter Start per Edit-List"];
      } else {
        args.push("-avoid_negative_ts", "make_zero");
        details = ["Verlustfrei (Stream-Copy)", isAudio ? "Ton 1:1 übernommen" : "Schnitt am nächstgelegenen Keyframe"];
      }
    } else if (isAudio) {
      const audioTargets: Record<string, { ext: string; mime: string; codec: string[] }> = {
        mp3: { ext: "mp3", mime: "audio/mpeg", codec: ["-c:a", "libmp3lame", "-q:a", "2"] },
        wav: { ext: "wav", mime: "audio/wav", codec: ["-c:a", "pcm_s16le"] },
        flac: { ext: "flac", mime: "audio/flac", codec: ["-c:a", "flac"] },
      };
      const target = audioTargets[type.format] ?? { ext: "m4a", mime: "audio/mp4", codec: ["-c:a", "aac", "-b:a", "192k"] };
      ext = target.ext;
      mime = target.mime;
      ctx.onStage?.("Schneide Audio sample-genau…");
      args = [...seek, "-i", input, "-t", duration.toFixed(3), "-map", "0:a:0", "-vn", ...target.codec];
      details = ["Sample-genau neu kodiert", FORMATS[type.format]?.label ?? ext.toUpperCase()];
    } else {
      ext = "mp4";
      mime = "video/mp4";
      ctx.onStage?.("Schneide framegenau (Neukodierung)…");
      args = [
        ...t.global, ...t.decode, ...seek, "-i", input, "-t", duration.toFixed(3), "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", scaleFilter(null), "-c:v", "libx264", "-preset", SPEED_PRESETS[speed].x264, "-crf", "20", "-pix_fmt", "yuv420p",
        ...t.encode, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
      ];
      details = ["Framegenau", "H.264 / AAC, CRF 20"];
    }
    const output = tempName(ext);
    args.push(output);
    await ffmpegEngine.exec(ffmpeg, args, {
      duration,
      onProgress: (ratio) => ctx.onProgress?.(ratio),
      signal: ctx.signal,
    });
    const blob = await readOutput(ffmpeg, output, mime);
    const label = `${options.start.toFixed(1).replace(".", ",")}s-${options.end.toFixed(1).replace(".", ",")}s`;
    const suffix = `schnitt-${label}${copy ? "" : isAudio ? "-genau" : "-framegenau"}`;
    return { blob, name: outputName(file.name, ext, suffix), details };
  });
}

/* ----------------------------------------------------------------------------------------------
 * Privacy
 * --------------------------------------------------------------------------------------------*/

/** Removes container metadata (GPS, device, dates, titles) without re-encoding. */
export async function stripMediaMetadata(file: File, type: MediaType, ctx: TaskContext): Promise<TaskResult> {
  const container = COPY_CONTAINERS[type.format] ?? (type.kind === "audio" ? COPY_CONTAINERS.m4a : COPY_CONTAINERS.mkv);
  return withMedia(file, type, ctx, async (ffmpeg, input, info) => {
    const before = mediaTagFindings(info.tags);
    ctx.onStage?.("Entferne Metadaten (ohne Neukodierung)…");
    const output = tempName(container.ext);
    const args = [
      "-i", input, "-map", "0:v?", "-map", "0:a?", "-map", "0:s?", "-dn", "-c", "copy",
      "-map_metadata", "-1", "-map_metadata:s", "-1", "-map_chapters", "-1",
      "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
    ];
    if (["mp4", "m4v", "mov", "m4a", "3gp"].includes(container.ext)) args.push("-movflags", "+faststart");
    args.push(output);
    await ffmpegEngine.exec(ffmpeg, args, {
      duration: info.duration,
      onProgress: (ratio) => ctx.onProgress?.(ratio),
      signal: ctx.signal,
    });
    ctx.onStage?.("Prüfe Ergebnis…");
    let remaining: MetadataFinding[] = [];
    try {
      remaining = mediaTagFindings((await probeInput(ffmpeg, output)).tags);
    } catch {
      remaining = [];
    }
    const blob = await readOutput(ffmpeg, output, container.mime);
    return {
      blob,
      name: outputName(file.name, container.ext, "ohne-metadaten"),
      details: ["Bild & Ton unverändert (Stream-Copy)"],
      removed: before,
      remaining,
    };
  });
}

/* ----------------------------------------------------------------------------------------------
 * Helpers for the UI
 * --------------------------------------------------------------------------------------------*/

export async function probeMedia(file: File, type: MediaType, ctx: TaskContext = {}): Promise<MediaInfo> {
  return withMedia(file, type, ctx, async (_ffmpeg, _input, info) => info);
}

/** Frame previews for the trimmer when the browser cannot decode the codec itself (e.g. HEVC). */
export async function extractThumbnails(
  file: File,
  type: MediaType,
  times: number[],
  ctx: TaskContext = {},
): Promise<Array<Blob | null>> {
  return withMedia(file, type, ctx, async (ffmpeg, input) => {
    const thumbs: Array<Blob | null> = [];
    for (const time of times) {
      throwIfAborted(ctx.signal);
      const output = tempName("jpg");
      try {
        await ffmpegEngine.exec(ffmpeg, ["-ss", time.toFixed(2), "-i", input, "-frames:v", "1", "-vf", "scale=160:-2", "-q:v", "6", output]);
        thumbs.push(await readOutput(ffmpeg, output, "image/jpeg"));
      } catch {
        thumbs.push(null);
        await removeFile(ffmpeg, output);
      }
    }
    return thumbs;
  });
}

/** Decodes images the browser cannot read (e.g. TIFF) into a PNG. */
export async function rasterizeWithFFmpeg(file: File, type: MediaType, ctx: TaskContext = {}): Promise<Blob> {
  ctx.onStage?.("Warte auf FFmpeg-Engine…");
  return ffmpegEngine.run(
    (ffmpeg) =>
      withInputFile(ffmpeg, file, type.format, async (input) => {
        ctx.onStage?.("Dekodiere Bild mit FFmpeg…");
        const output = tempName("png");
        await ffmpegEngine.exec(ffmpeg, ["-i", input, "-frames:v", "1", "-update", "1", output], { signal: ctx.signal });
        return readOutput(ffmpeg, output, "image/png");
      }),
    ctx.signal,
  );
}
