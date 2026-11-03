import { fileExtension } from "./utils";

export type MediaKind = "image" | "video" | "audio" | "unsupported";
export type ToolId = "compress" | "convert" | "trim" | "privacy";

export interface MediaType {
  kind: MediaKind;
  /** Canonical short format id, e.g. "jpeg", "heic", "mp4", "mp3". */
  format: string;
  /** Best known MIME type for the format. */
  mime: string;
  /** Short display label, e.g. "HEIC". */
  label: string;
}

interface FormatInfo {
  kind: Exclude<MediaKind, "unsupported">;
  mime: string;
  label: string;
}

export const FORMATS: Record<string, FormatInfo> = {
  jpeg: { kind: "image", mime: "image/jpeg", label: "JPG" },
  png: { kind: "image", mime: "image/png", label: "PNG" },
  webp: { kind: "image", mime: "image/webp", label: "WebP" },
  gif: { kind: "image", mime: "image/gif", label: "GIF" },
  bmp: { kind: "image", mime: "image/bmp", label: "BMP" },
  avif: { kind: "image", mime: "image/avif", label: "AVIF" },
  tiff: { kind: "image", mime: "image/tiff", label: "TIFF" },
  heic: { kind: "image", mime: "image/heic", label: "HEIC" },
  svg: { kind: "image", mime: "image/svg+xml", label: "SVG" },
  ico: { kind: "image", mime: "image/x-icon", label: "ICO" },
  mp4: { kind: "video", mime: "video/mp4", label: "MP4" },
  m4v: { kind: "video", mime: "video/x-m4v", label: "M4V" },
  mov: { kind: "video", mime: "video/quicktime", label: "MOV" },
  webm: { kind: "video", mime: "video/webm", label: "WebM" },
  mkv: { kind: "video", mime: "video/x-matroska", label: "MKV" },
  avi: { kind: "video", mime: "video/x-msvideo", label: "AVI" },
  "3gp": { kind: "video", mime: "video/3gpp", label: "3GP" },
  mpeg: { kind: "video", mime: "video/mpeg", label: "MPEG" },
  ts: { kind: "video", mime: "video/mp2t", label: "MPEG-TS" },
  flv: { kind: "video", mime: "video/x-flv", label: "FLV" },
  wmv: { kind: "video", mime: "video/x-ms-wmv", label: "WMV" },
  ogv: { kind: "video", mime: "video/ogg", label: "OGV" },
  mp3: { kind: "audio", mime: "audio/mpeg", label: "MP3" },
  wav: { kind: "audio", mime: "audio/wav", label: "WAV" },
  ogg: { kind: "audio", mime: "audio/ogg", label: "OGG" },
  opus: { kind: "audio", mime: "audio/ogg; codecs=opus", label: "Opus" },
  flac: { kind: "audio", mime: "audio/flac", label: "FLAC" },
  m4a: { kind: "audio", mime: "audio/mp4", label: "M4A" },
  aac: { kind: "audio", mime: "audio/aac", label: "AAC" },
  wma: { kind: "audio", mime: "audio/x-ms-wma", label: "WMA" },
  aiff: { kind: "audio", mime: "audio/aiff", label: "AIFF" },
  amr: { kind: "audio", mime: "audio/amr", label: "AMR" },
  weba: { kind: "audio", mime: "audio/webm", label: "WebM Audio" },
};

const EXTENSION_FORMATS: Record<string, string> = {
  jpg: "jpeg", jpeg: "jpeg", jpe: "jpeg", jfif: "jpeg", png: "png", apng: "png", webp: "webp", gif: "gif",
  bmp: "bmp", dib: "bmp", avif: "avif", tif: "tiff", tiff: "tiff", heic: "heic", heif: "heic", hif: "heic",
  svg: "svg", ico: "ico", mp4: "mp4", m4v: "m4v", mov: "mov", qt: "mov", webm: "webm", mkv: "mkv",
  avi: "avi", "3gp": "3gp", "3g2": "3gp", mpg: "mpeg", mpeg: "mpeg", ts: "ts", mts: "ts", m2ts: "ts",
  flv: "flv", wmv: "wmv", ogv: "ogv", mp3: "mp3", wav: "wav", wave: "wav", ogg: "ogg", oga: "ogg",
  opus: "opus", flac: "flac", m4a: "m4a", m4b: "m4a", aac: "aac", wma: "wma", aif: "aiff", aiff: "aiff",
  amr: "amr", weba: "weba",
};

const MIME_FORMATS: Record<string, string> = {
  "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/pjpeg": "jpeg", "image/png": "png", "image/apng": "png",
  "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp", "image/x-ms-bmp": "bmp", "image/avif": "avif",
  "image/tiff": "tiff", "image/heic": "heic", "image/heif": "heic", "image/heic-sequence": "heic",
  "image/heif-sequence": "heic", "image/svg+xml": "svg", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4", "video/x-m4v": "m4v", "video/quicktime": "mov", "video/webm": "webm",
  "video/x-matroska": "mkv", "video/matroska": "mkv", "video/x-msvideo": "avi", "video/avi": "avi",
  "video/3gpp": "3gp", "video/3gpp2": "3gp", "video/mpeg": "mpeg", "video/mp2t": "ts", "video/x-flv": "flv",
  "video/x-ms-wmv": "wmv", "video/ogg": "ogv", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
  "audio/x-wav": "wav", "audio/wave": "wav", "audio/vnd.wave": "wav", "audio/ogg": "ogg", "audio/opus": "opus",
  "audio/flac": "flac", "audio/x-flac": "flac", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac",
  "audio/x-aac": "aac", "audio/x-ms-wma": "wma", "audio/aiff": "aiff", "audio/x-aiff": "aiff",
  "audio/amr": "amr", "audio/webm": "weba",
};

const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"];
const AVIF_BRANDS = ["avif", "avis"];

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** Identifies a file from its first bytes. Returns a format id or null. */
export function sniffFormat(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  const head4 = ascii(bytes, 0, 4);
  if (head4 === "GIF8") return "gif";
  if (head4 === "RIFF") {
    const type = ascii(bytes, 8, 4);
    if (type === "WEBP") return "webp";
    if (type === "WAVE") return "wav";
    if (type === "AVI ") return "avi";
  }
  if (head4 === "II*\0" || head4 === "MM\0*") return "tiff";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const boxSize = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    const brands: string[] = [ascii(bytes, 8, 4)];
    for (let offset = 16; offset + 4 <= Math.min(boxSize, bytes.length); offset += 4) {
      brands.push(ascii(bytes, offset, 4));
    }
    const major = brands[0];
    if (AVIF_BRANDS.includes(major)) return "avif";
    if (HEIC_BRANDS.includes(major)) return "heic";
    if (major === "mif1" || major === "msf1") {
      return brands.some((brand) => AVIF_BRANDS.includes(brand)) ? "avif" : "heic";
    }
    if (major === "qt  ") return "mov";
    if (major.startsWith("M4A") || major.startsWith("M4B") || major.startsWith("M4P")) return "m4a";
    if (major.startsWith("M4V")) return "m4v";
    if (major.startsWith("3g")) return "3gp";
    return "mp4";
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ascii(bytes, 0, Math.min(bytes.length, 64)).includes("webm") ? "webm" : "mkv";
  }
  if (head4 === "OggS") {
    const text = ascii(bytes, 0, Math.min(bytes.length, 128));
    if (text.includes("theora")) return "ogv";
    if (text.includes("OpusHead")) return "opus";
    return "ogg";
  }
  if (head4 === "fLaC") return "flac";
  if (head4 === "FORM" && ["AIFF", "AIFC"].includes(ascii(bytes, 8, 4))) return "aiff";
  if (ascii(bytes, 0, 5) === "#!AMR") return "amr";
  if (ascii(bytes, 0, 3) === "ID3") return "mp3";
  if (ascii(bytes, 0, 3) === "FLV") return "flv";
  if (startsWith(bytes, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return "wmv";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0xba]) || startsWith(bytes, [0x00, 0x00, 0x01, 0xb3])) return "mpeg";
  if (bytes[0] === 0x47 && bytes.length > 188 && bytes[188] === 0x47) return "ts";
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return "aac";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) && bytes[4] > 0) return "ico";
  if (head4.startsWith("BM") && bytes.length > 18) {
    const dibSize = bytes[14] | (bytes[15] << 8) | (bytes[16] << 16) | (bytes[17] << 24);
    if ([12, 40, 52, 56, 64, 108, 124].includes(dibSize)) return "bmp";
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  if (/^﻿?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text)) return "svg";
  return null;
}

/**
 * Detects the media type of a file by combining magic bytes, MIME type and extension.
 * Magic bytes win because browsers report empty or wrong MIME types for HEIC, MKV & co.
 */
export async function detectMediaType(file: File): Promise<MediaType> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const sniffed = sniffFormat(head);
  const fromMime = MIME_FORMATS[file.type.toLowerCase().split(";")[0].trim()];
  const fromExtension = EXTENSION_FORMATS[fileExtension(file.name)];
  let format = sniffed ?? fromMime ?? fromExtension ?? null;

  // Containers that carry either audio or video: let the declared type decide.
  const declaredKind = (fromMime && FORMATS[fromMime]?.kind) || (fromExtension && FORMATS[fromExtension]?.kind);
  if (format && declaredKind === "audio") {
    if (format === "mp4" || format === "m4v" || format === "3gp") format = "m4a";
    if (format === "webm" || format === "mkv") format = "weba";
    if (format === "ogv") format = "ogg";
  }
  if (format === "wmv" && fromExtension === "wma") format = "wma";
  // An ID3 tag can precede AAC, FLAC or WAV data – trust the declared audio format in that case.
  if (sniffed === "mp3" && fromExtension && fromExtension !== "mp3" && FORMATS[fromExtension]?.kind === "audio") {
    format = fromExtension;
  }

  if (!format || !FORMATS[format]) {
    return { kind: "unsupported", format: fileExtension(file.name) || "unknown", mime: file.type, label: "Unknown" };
  }
  const info = FORMATS[format];
  return { kind: info.kind, format, mime: info.mime, label: info.label };
}

export function toolsFor(type: MediaType): ToolId[] {
  switch (type.kind) {
    case "image":
      return type.format === "svg" ? ["convert"] : ["compress", "convert", "privacy"];
    case "video":
    case "audio":
      return ["compress", "convert", "trim", "privacy"];
    default:
      return [];
  }
}

/** Formats a browser can draw onto a canvas without help (HEIC/TIFF need decoders). */
export function isCanvasDecodable(format: string): boolean {
  return ["jpeg", "png", "webp", "gif", "bmp", "avif", "ico"].includes(format);
}

export const ACCEPT_ATTRIBUTE = [
  "image/*",
  "video/*",
  "audio/*",
  ".heic",
  ".heif",
  ".mkv",
  ".mov",
  ".m4a",
  ".flac",
  ".opus",
  ".svg",
  ".avif",
  ".tif",
  ".tiff",
].join(",");
