import { createCanvas, canvasToBlob, decodeBitmap, fitDimensions, type RasterMime } from "./canvas";

/**
 * Decoders for formats that need special handling on the main thread:
 *  - HEIC/HEIF (iPhone photos): native decoding in Safari 17+, otherwise heic2any (libheif).
 *  - SVG: rendered through an <img> element (the only way to rasterize SVG with full fidelity).
 */

export async function decodeHeic(file: Blob, toType: "image/png" | "image/jpeg", quality = 0.92): Promise<Blob> {
  // Safari decodes HEIC natively – fastest path and keeps the exact colors.
  try {
    const bitmap = await decodeBitmap(file);
    try {
      const canvas = createCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw new Error("Canvas nicht verfügbar");
      if (toType === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, bitmap.width, bitmap.height);
      }
      ctx.drawImage(bitmap, 0, 0);
      return await canvasToBlob(canvas, toType, quality);
    } finally {
      bitmap.close();
    }
  } catch {
    // Not supported natively (Chrome, Firefox, Edge) – fall through to libheif.
  }
  const { default: heic2any } = await import("heic2any");
  try {
    const output = await heic2any({ blob: file, toType, quality });
    const blob = Array.isArray(output) ? output[0] : output;
    if (!blob || blob.size === 0) throw new Error("Leeres Ergebnis");
    return blob;
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
    throw new Error(`HEIC-Datei konnte nicht gelesen werden (${message}).`);
  }
}

const UNIT_TO_PX: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, rem: 16 };

function parseLength(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*([\d.]+)\s*([a-z%]*)\s*$/i.exec(value);
  if (!match || match[2] === "%") return null;
  const factor = UNIT_TO_PX[match[2].toLowerCase() || "px"];
  const result = Number(match[1]) * (factor ?? 1);
  return Number.isFinite(result) && result > 0 ? result : null;
}

export interface SvgSize {
  width: number;
  height: number;
}

/** Reads the intrinsic size of an SVG (width/height attributes or viewBox). */
export function svgIntrinsicSize(svg: Element): SvgSize {
  let width = parseLength(svg.getAttribute("width"));
  let height = parseLength(svg.getAttribute("height"));
  const viewBox = (svg.getAttribute("viewBox") ?? "")
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const vbWidth = viewBox.length === 4 ? viewBox[2] : null;
  const vbHeight = viewBox.length === 4 ? viewBox[3] : null;
  if (vbWidth && vbHeight && vbWidth > 0 && vbHeight > 0) {
    if (!width && !height) {
      width = vbWidth;
      height = vbHeight;
    } else if (!width && height) {
      width = (height * vbWidth) / vbHeight;
    } else if (width && !height) {
      height = (width * vbHeight) / vbWidth;
    }
  }
  return { width: width ?? 512, height: height ?? 512 };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Die SVG-Grafik konnte nicht gerendert werden."));
    image.src = url;
  });
}

/** Rasterizes an SVG at `scale` × its intrinsic size and encodes it. */
export async function rasterizeSvg(
  file: Blob,
  scale: number,
  type: RasterMime,
  quality: number,
  background: string,
): Promise<{ blob: Blob; width: number; height: number }> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Die SVG-Datei ist ungültig oder beschädigt.");
  }
  const size = svgIntrinsicSize(svg);
  const target = fitDimensions(size.width * scale, size.height * scale, null);
  svg.setAttribute("width", String(target.width));
  svg.setAttribute("height", String(target.height));
  if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  svg.setAttribute("preserveAspectRatio", svg.getAttribute("preserveAspectRatio") ?? "xMidYMid meet");
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas nicht verfügbar.");
    if (type === "image/jpeg") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, target.width, target.height);
    }
    ctx.drawImage(image, 0, 0, target.width, target.height);
    let blob = await canvasToBlob(canvas, type, quality);
    if (blob.type !== type) {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, target.width, target.height);
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }
    return { blob, width: target.width, height: target.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Width/height of a decodable image (null if the browser cannot decode it). */
export async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await decodeBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}
