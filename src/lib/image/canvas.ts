/**
 * Canvas helpers that work both on the main thread and inside Web Workers (OffscreenCanvas).
 */

export type RasterMime = "image/jpeg" | "image/png" | "image/webp";

export interface RenderOptions {
  type: RasterMime;
  /** 0…1, ignored for PNG. */
  quality: number;
  /** Longest side in pixels; null keeps the original size. */
  maxDimension: number | null;
  /** Fill color for formats without transparency (JPEG). */
  background: string;
}

export interface RenderResult {
  blob: Blob;
  width: number;
  height: number;
  /** True when the browser could not encode the requested type and JPEG was used instead. */
  fellBack: boolean;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Drawable = CanvasImageSource & { width: number; height: number };

const MAX_SIDE = 16_384;

function maxPixels(): number {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAppleMobile = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  return isAppleMobile ? 16_777_216 : 120_000_000;
}

export function fitDimensions(width: number, height: number, maxDimension: number | null): { width: number; height: number } {
  let scale = 1;
  if (maxDimension && Math.max(width, height) > maxDimension) scale = maxDimension / Math.max(width, height);
  scale = Math.min(scale, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(maxPixels() / (width * height)), 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    if (canvas.getContext("2d")) return canvas;
  }
  if (typeof document === "undefined") throw new Error("Canvas ist in dieser Umgebung nicht verfügbar.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: AnyCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("2D-Canvas konnte nicht erstellt werden (zu wenig Speicher?).");
  return ctx;
}

export async function canvasToBlob(canvas: AnyCanvas, type: RasterMime, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Bild konnte nicht kodiert werden."))),
      type,
      quality,
    );
  });
}

/** Draws an image source scaled onto a fresh canvas and encodes it. */
export async function renderToBlob(source: Drawable, options: RenderOptions): Promise<RenderResult> {
  const { width, height } = fitDimensions(source.width, source.height, options.maxDimension);
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  if (options.type === "image/jpeg") {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  let blob = await canvasToBlob(canvas, options.type, options.quality);
  let fellBack = false;
  if (blob.type !== options.type) {
    // e.g. Safari cannot encode WebP and silently returns PNG – use JPEG instead.
    fellBack = true;
    if (options.type !== "image/jpeg") {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, width, height);
      blob = await canvasToBlob(canvas, "image/jpeg", options.quality);
    }
  }
  if ("width" in canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  return { blob, width, height, fellBack };
}

/** Decodes a Blob with the browser's image decoders, honoring EXIF orientation. */
export async function decodeBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return createImageBitmap(blob);
  }
}

let webpSupport: boolean | null = null;

/** Whether this browser can encode WebP via canvas (Safari cannot). */
export async function canEncodeWebp(): Promise<boolean> {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = createCanvas(2, 2);
    context2d(canvas).fillRect(0, 0, 2, 2);
    const blob = await canvasToBlob(canvas, "image/webp", 0.8);
    webpSupport = blob.type === "image/webp";
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

export const EXTENSION_FOR_MIME: Record<RasterMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
