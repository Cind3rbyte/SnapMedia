import { compressGif, convertGifToMp4, rasterizeWithFFmpeg } from "../ffmpeg/tasks";
import { FORMATS, isCanvasDecodable, type MediaType } from "../file-types";
import { imageTargetMiB, type CompressPreset } from "../presets";
import type { TaskContext, TaskResult } from "../task-types";
import { formatBytes, outputName, throwIfAborted } from "../utils";
import { canEncodeWebp, EXTENSION_FOR_MIME, type RasterMime } from "./canvas";
import { decodeHeic, imageSize, rasterizeSvg } from "./decode";
import { countFrames, supportsLosslessStrip, type ImageMetadataReport, type MetadataFinding } from "./metadata";
import { ImageDecodeError, inspectInWorker, renderInWorker, stripInWorker } from "./worker-client";

export type ImageOutputChoice = "auto" | "jpeg" | "webp" | "png";

/** Formats that every browser and chat app can display directly. */
const WEB_FRIENDLY = new Set(["jpeg", "png", "webp", "gif"]);
export type ImageTarget = "jpeg" | "png" | "webp" | "mp4";

const MIME_FOR_TARGET: Record<Exclude<ImageTarget, "mp4">, RasterMime> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Animated GIF/WebP/PNG detection (a few KB per frame header, cheap). */
export async function frameCount(file: File, type: MediaType): Promise<number> {
  if (!["gif", "png", "webp"].includes(type.format)) return 1;
  return countFrames(new Uint8Array(await file.arrayBuffer()), type.format);
}

/**
 * Turns any supported image into something the canvas pipeline can read.
 * HEIC → libheif / native, TIFF & exotic formats → FFmpeg, everything else stays as is.
 */
async function decodableSource(file: File, type: MediaType, ctx: TaskContext): Promise<Blob> {
  if (type.format === "heic") {
    ctx.onStage?.("Dekodiere HEIC (iPhone-Foto)…");
    return decodeHeic(file, "image/png");
  }
  if (!isCanvasDecodable(type.format)) {
    return rasterizeWithFFmpeg(file, type, ctx);
  }
  return file;
}

async function resolveOutputMime(type: MediaType, choice: ImageOutputChoice, preset: CompressPreset): Promise<RasterMime> {
  let mime: RasterMime;
  if (choice !== "auto") {
    mime = MIME_FOR_TARGET[choice];
  } else if (preset.id === "web") {
    mime = "image/webp";
  } else if (type.format === "jpeg" || type.format === "png" || type.format === "webp") {
    mime = FORMATS[type.format].mime as RasterMime;
  } else if (type.format === "gif" || type.format === "ico") {
    mime = "image/png";
  } else {
    mime = "image/jpeg";
  }
  if (mime === "image/webp" && !(await canEncodeWebp())) mime = "image/jpeg";
  return mime;
}

function libUrl(): string {
  return new URL("/vendor/browser-image-compression.js", window.location.origin).href;
}

/**
 * Image compression with browser-image-compression (runs in its own Web Worker).
 * For size presets the result is verified and, if needed, compressed again with smaller dimensions.
 */
export async function compressImage(
  file: File,
  type: MediaType,
  preset: CompressPreset,
  choice: ImageOutputChoice,
  ctx: TaskContext,
): Promise<TaskResult> {
  if (type.format === "gif" && (await frameCount(file, type)) > 1) {
    return compressGif(file, type, preset, ctx);
  }
  const target = preset.targetBytes;
  // Web-friendly files that already fit are passed through untouched. HEIC, TIFF & co. are still converted,
  // because chat apps and browsers often cannot display them.
  if (target && file.size <= target && choice === "auto" && WEB_FRIENDLY.has(type.format)) {
    return { blob: file, name: file.name, note: `Bereits unter ${formatBytes(target, 0)} – Original unverändert übernommen.` };
  }
  const outputMime = await resolveOutputMime(type, choice, preset);
  const source = await decodableSource(file, type, ctx);
  throwIfAborted(ctx.signal);
  const sourceFile = source instanceof File ? source : new File([source], file.name, { type: source.type });
  const size = await imageSize(sourceFile);

  const { default: imageCompression } = await import("browser-image-compression");
  let maxDimension = preset.id === "web" ? 1920 : size ? Math.max(size.width, size.height) : 8192;
  if (size) maxDimension = Math.min(maxDimension, Math.max(size.width, size.height));
  let result: Blob | null = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    throwIfAborted(ctx.signal);
    ctx.onStage?.(attempt === 1 ? "Komprimiere Bild…" : `Verkleinere weiter – Versuch ${attempt}…`);
    ctx.onProgress?.(0);
    result = await imageCompression(sourceFile, {
      maxSizeMB: target ? imageTargetMiB(target) : undefined,
      maxWidthOrHeight: maxDimension,
      initialQuality: preset.id === "web" ? 0.72 : 0.9,
      fileType: outputMime,
      useWebWorker: true,
      libURL: libUrl(),
      maxIteration: 15,
      preserveExif: false,
      signal: ctx.signal,
      onProgress: (percent: number) => ctx.onProgress?.(Math.min(0.999, percent / 100)),
    });
    if (!target || result.size <= target) break;
    maxDimension = Math.max(320, Math.round(maxDimension * 0.7));
  }
  if (!result || (target && result.size > target)) {
    throw new Error(`Das Bild konnte nicht unter ${formatBytes(target ?? 0, 0)} gebracht werden.`);
  }
  // Compression must never make a web-friendly file bigger – then the original is the better result.
  if (result.size >= file.size && WEB_FRIENDLY.has(type.format)) {
    return { blob: file, name: file.name, note: "Das Bild ist bereits optimal komprimiert – Original beibehalten." };
  }
  const outSize = await imageSize(result);
  const details: string[] = [];
  if (outSize) details.push(`${outSize.width} × ${outSize.height} px`);
  details.push(EXTENSION_FOR_MIME[outputMime].toUpperCase());
  details.push("Metadaten entfernt");
  const suffix = preset.id === "web" ? "web" : `unter-${Math.round((target ?? 0) / 1e6)}mb`;
  return {
    blob: result,
    name: outputName(file.name, EXTENSION_FOR_MIME[outputMime], suffix),
    details,
  };
}

export interface ImageConvertOptions {
  quality: number;
  maxDimension: number | null;
  background: string;
  /** Render scale for SVG. */
  svgScale: number;
}

export async function convertImage(
  file: File,
  type: MediaType,
  target: ImageTarget,
  options: ImageConvertOptions,
  ctx: TaskContext,
): Promise<TaskResult> {
  if (target === "mp4") {
    if (type.format !== "gif") throw new Error("MP4 ist nur für animierte GIFs verfügbar.");
    return convertGifToMp4(file, type, ctx);
  }
  const mime = MIME_FOR_TARGET[target];
  const extension = EXTENSION_FOR_MIME[mime];
  const frames = await frameCount(file, type);

  if (type.format === "svg") {
    ctx.onStage?.("Rendere SVG…");
    const rendered = await rasterizeSvg(file, options.svgScale, mime, options.quality, options.background);
    return finishConversion(file, rendered.blob, mime, rendered.width, rendered.height, options, frames);
  }

  let source: Blob = file;
  if (type.format === "heic") {
    ctx.onStage?.("Dekodiere HEIC (iPhone-Foto)…");
    // heic2any can write JPEG/PNG directly – skip the second encoding step when possible.
    if (mime !== "image/webp" && !options.maxDimension) {
      const blob = await decodeHeic(file, mime, options.quality);
      const size = await imageSize(blob);
      return finishConversion(file, blob, mime, size?.width ?? 0, size?.height ?? 0, options, frames);
    }
    source = await decodeHeic(file, "image/png");
  } else if (!isCanvasDecodable(type.format)) {
    source = await rasterizeWithFFmpeg(file, type, ctx);
  }

  throwIfAborted(ctx.signal);
  ctx.onStage?.(`Konvertiere zu ${extension.toUpperCase()}…`);
  ctx.onProgress?.(0.3);
  const renderOptions = { type: mime, quality: options.quality, maxDimension: options.maxDimension, background: options.background };
  let rendered;
  try {
    rendered = await renderInWorker(source, renderOptions);
  } catch (error) {
    if (!(error instanceof ImageDecodeError) || source !== file) throw error;
    // Browser cannot decode this file (rare formats) – let FFmpeg decode it and retry.
    source = await rasterizeWithFFmpeg(file, type, ctx);
    rendered = await renderInWorker(source, renderOptions);
  }
  const note = rendered.fellBack ? "Dein Browser kann kein WebP speichern – stattdessen wurde JPG erzeugt." : undefined;
  const result = finishConversion(file, rendered.blob, rendered.fellBack ? "image/jpeg" : mime, rendered.width, rendered.height, options, frames);
  return note ? { ...result, note } : result;
}

function finishConversion(
  file: File,
  blob: Blob,
  mime: RasterMime,
  width: number,
  height: number,
  options: ImageConvertOptions,
  frames: number,
): TaskResult {
  const extension = EXTENSION_FOR_MIME[mime];
  const details: string[] = [];
  if (width && height) details.push(`${width} × ${height} px`);
  if (mime !== "image/png") details.push(`Qualität ${Math.round(options.quality * 100)} %`);
  details.push("ohne Metadaten");
  return {
    blob,
    name: outputName(file.name, extension),
    details,
    note: frames > 1 ? "Animation: Es wurde das erste Einzelbild gespeichert. Für bewegte Bilder wähle MP4." : undefined,
  };
}

/** Flags without detailed values become generic findings so the user sees everything that was removed. */
export function reportFindings(report: ImageMetadataReport, includeGenericExif = true): MetadataFinding[] {
  const findings = [...report.findings];
  if (report.hasXmp && !findings.some((f) => f.label.includes("XMP"))) {
    findings.push({ category: "other", label: "XMP-Metadaten", value: "Bearbeitungs- und Kamerainformationen" });
  }
  // After cleaning, a minimal EXIF block that only carries the orientation may remain – that is intended.
  if (includeGenericExif && report.hasExif && findings.length === 0) {
    findings.push({ category: "other", label: "EXIF-Block", value: "Technische Aufnahmedaten" });
  }
  return findings;
}

export async function inspectImage(file: File, type: MediaType): Promise<ImageMetadataReport> {
  return inspectInWorker(await file.arrayBuffer(), type.format);
}

/**
 * Removes GPS, camera and personal metadata.
 * JPEG/PNG/WebP/GIF: lossless (pixels untouched). HEIC/AVIF/TIFF/…: re-saved as clean JPG/PNG.
 */
export async function stripImage(file: File, type: MediaType, keepIcc: boolean, ctx: TaskContext): Promise<TaskResult> {
  if (supportsLosslessStrip(type.format)) {
    ctx.onStage?.("Entferne Metadaten (verlustfrei)…");
    ctx.onProgress?.(0.4);
    const result = await stripInWorker(await file.arrayBuffer(), type.format, { keepIcc });
    const extension = type.format === "jpeg" ? "jpg" : type.format;
    const details = ["Verlustfrei – Bildpunkte unverändert"];
    if (result.before.orientation !== 1) details.push("Ausrichtung beibehalten");
    if (keepIcc && result.after.hasIcc) details.push("Farbprofil beibehalten");
    return {
      blob: new Blob([result.buffer], { type: FORMATS[type.format].mime }),
      name: outputName(file.name, extension, "ohne-metadaten"),
      details,
      removed: reportFindings(result.before),
      remaining: reportFindings(result.after, false),
    };
  }

  ctx.onStage?.("Lese Metadaten…");
  const before = await inspectImage(file, type);
  const toJpeg = ["heic", "avif"].includes(type.format);
  const mime: RasterMime = toJpeg ? "image/jpeg" : "image/png";
  let blob: Blob;
  if (type.format === "heic") {
    ctx.onStage?.("Dekodiere HEIC und speichere als sauberes JPG…");
    blob = await decodeHeic(file, "image/jpeg", 0.92);
  } else {
    const source = isCanvasDecodable(type.format) ? file : await rasterizeWithFFmpeg(file, type, ctx);
    ctx.onStage?.("Speichere sauberes Bild…");
    blob = (await renderInWorker(source, { type: mime, quality: 0.92, maxDimension: null, background: "#ffffff" })).blob;
  }
  const outFormat = mime === "image/jpeg" ? "jpeg" : "png";
  const after = await inspectInWorker(await blob.arrayBuffer(), outFormat);
  return {
    blob,
    name: outputName(file.name, EXTENSION_FOR_MIME[mime], "ohne-metadaten"),
    details: [toJpeg ? "Neu gespeichert als JPG (Qualität 92 %)" : "Neu gespeichert als PNG (verlustfrei)"],
    removed: reportFindings(before),
    remaining: reportFindings(after, false),
  };
}
