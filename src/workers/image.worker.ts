/// <reference lib="webworker" />
/**
 * Dedicated Web Worker for image work that must not block the UI:
 *  - "inspect": read EXIF/GPS/XMP metadata
 *  - "strip":   remove metadata losslessly (JPEG/PNG/WebP/GIF)
 *  - "convert": decode + resize + encode via OffscreenCanvas (JPG/PNG/WebP)
 */
import type { Locale } from "../i18n/config";
import { msg, setActiveLocale } from "../i18n/runtime";
import { decodeBitmap, renderToBlob, type RenderOptions } from "../lib/image/canvas";
import { inspectImageMetadata, stripImageMetadata, type StripOptions } from "../lib/image/metadata";

export type ImageWorkerRequest = { id: number; locale: Locale } & (
  | { type: "inspect"; buffer: ArrayBuffer; format: string }
  | { type: "strip"; buffer: ArrayBuffer; format: string; options: StripOptions }
  | { type: "convert"; blob: Blob; options: RenderOptions }
);

export type ImageWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string; code: "decode" | "unsupported" | "failed" };

const scope = self as unknown as DedicatedWorkerGlobalScope;

function reply(message: ImageWorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

scope.onmessage = async (event: MessageEvent<ImageWorkerRequest>) => {
  const request = event.data;
  // Findings and error messages are produced in the language of the page that sent the request.
  setActiveLocale(request.locale);
  try {
    switch (request.type) {
      case "inspect": {
        reply({ id: request.id, ok: true, result: inspectImageMetadata(new Uint8Array(request.buffer), request.format) });
        break;
      }
      case "strip": {
        const bytes = new Uint8Array(request.buffer);
        const before = inspectImageMetadata(bytes, request.format);
        const stripped = stripImageMetadata(bytes, request.format, request.options);
        const after = inspectImageMetadata(stripped, request.format);
        const buffer = stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength) as ArrayBuffer;
        reply({ id: request.id, ok: true, result: { buffer, before, after } }, [buffer]);
        break;
      }
      case "convert": {
        if (typeof OffscreenCanvas === "undefined") {
          reply({ id: request.id, ok: false, error: "OffscreenCanvas unavailable", code: "unsupported" });
          return;
        }
        let bitmap: ImageBitmap;
        try {
          bitmap = await decodeBitmap(request.blob);
        } catch {
          reply({ id: request.id, ok: false, error: msg().errors.decode, code: "decode" });
          return;
        }
        try {
          const result = await renderToBlob(bitmap, request.options);
          reply({ id: request.id, ok: true, result });
        } finally {
          bitmap.close();
        }
        break;
      }
      default:
        reply({ id: (request as { id: number }).id, ok: false, error: "Unknown request", code: "failed" });
    }
  } catch (error) {
    reply({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: "failed",
    });
  }
};
