import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { ffmpegEngine } from "./engine";
import { parseFFmpegInfoLog, parseProbeJson, type MediaInfo } from "./probe";

let counter = 0;

/** Unique, FFmpeg-safe file names (no protocols, no spaces, no pattern characters). */
export function tempName(extension: string): string {
  counter += 1;
  return `/snap_${Date.now().toString(36)}_${counter}.${extension}`;
}

/**
 * Makes an input file available to FFmpeg.
 * Prefers WORKERFS (FFmpeg reads the File lazily – no copy of the whole video in memory),
 * falls back to copying it into the in-memory file system.
 */
export async function withInputFile<T>(
  ffmpeg: FFmpeg,
  file: File,
  extension: string,
  job: (inputPath: string) => Promise<T>,
): Promise<T> {
  counter += 1;
  const dir = `/input_${Date.now().toString(36)}_${counter}`;
  const safeName = `source.${extension || "bin"}`;
  let mounted = false;
  let inputPath = `${dir}/${safeName}`;
  try {
    await ffmpeg.createDir(dir);
    const { FFFSType } = await import("@ffmpeg/ffmpeg");
    const renamed = new File([file], safeName, { type: file.type, lastModified: file.lastModified });
    mounted = await ffmpeg.mount(FFFSType.WORKERFS, { files: [renamed] }, dir);
    if (!mounted) throw new Error("WORKERFS nicht verfügbar");
  } catch {
    mounted = false;
    inputPath = tempName(extension || "bin");
    await ffmpeg.writeFile(inputPath, await fetchFile(file));
  }
  try {
    return await job(inputPath);
  } finally {
    try {
      if (mounted) {
        await ffmpeg.unmount(dir);
        await ffmpeg.deleteDir(dir);
      } else {
        await ffmpeg.deleteFile(inputPath);
        await ffmpeg.deleteDir(dir).catch(() => undefined);
      }
    } catch {
      // The worker may already be terminated (cancel) – nothing left to clean up.
    }
  }
}

/** Reads an output file from FFmpeg's file system into a Blob and removes it there. */
export async function readOutput(ffmpeg: FFmpeg, path: string, mime: string): Promise<Blob> {
  const data = await ffmpeg.readFile(path);
  await ffmpeg.deleteFile(path).catch(() => undefined);
  if (typeof data === "string") throw new Error("Unerwartete Textausgabe von FFmpeg.");
  if (data.byteLength === 0) throw new Error("FFmpeg hat eine leere Datei erzeugt.");
  return new Blob([data as BlobPart], { type: mime });
}

export async function removeFile(ffmpeg: FFmpeg, path: string) {
  await ffmpeg.deleteFile(path).catch(() => undefined);
}

/** Reads duration, streams and tags. Uses ffprobe's JSON output, with a log-parsing fallback. */
export async function probeInput(ffmpeg: FFmpeg, inputPath: string): Promise<MediaInfo> {
  let info: MediaInfo | null = null;
  const jsonPath = tempName("json");
  try {
    // ffmpeg.wasm reports a non-zero code for ffprobe even on success – the JSON file is the real result.
    await ffmpeg.ffprobe(["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath, "-o", jsonPath]);
    const raw = await ffmpeg.readFile(jsonPath, "utf8");
    info = parseProbeJson(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
  } catch {
    info = null;
  } finally {
    await removeFile(ffmpeg, jsonPath);
  }
  if (!info || (!info.video && !info.audio)) {
    const log = await ffmpegEngine.execForLog(ffmpeg, ["-i", inputPath]);
    info = parseFFmpegInfoLog(log);
  }
  if (!info.video && !info.audio) {
    throw new Error("Die Datei enthält keine lesbaren Video- oder Audiospuren.");
  }
  if (!info.duration) {
    // Containers without duration (e.g. WebM from MediaRecorder): demux once to measure it.
    const log = await ffmpegEngine.execForLog(ffmpeg, ["-i", inputPath, "-map", "0", "-c", "copy", "-f", "null", "-"]);
    const times = log
      .map((line) => /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    if (times.length) info.duration = times[times.length - 1];
  }
  return info;
}
