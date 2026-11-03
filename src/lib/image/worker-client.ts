import { getActiveLocale, msg } from "@/i18n/runtime";
import type { ImageWorkerRequest, ImageWorkerResponse } from "../../workers/image.worker";
import { decodeBitmap, renderToBlob, type RenderOptions, type RenderResult } from "./canvas";
import { inspectImageMetadata, stripImageMetadata, type ImageMetadataReport, type StripOptions } from "./metadata";

/**
 * Talks to the dedicated image worker. Every call has a main-thread fallback,
 * so the app also works in browsers without (module) worker or OffscreenCanvas support.
 */

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Payload = DistributiveOmit<ImageWorkerRequest, "id" | "locale">;

export class ImageDecodeError extends Error {
  constructor(message = msg().errors.decode) {
    super(message);
    this.name = "ImageDecodeError";
  }
}

class WorkerUnavailableError extends Error {}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

function rejectAll(error: Error) {
  pending.forEach(({ reject }) => reject(error));
  pending.clear();
}

function getWorker(): Worker {
  if (workerBroken || typeof Worker === "undefined") throw new WorkerUnavailableError();
  if (!worker) {
    try {
      worker = new Worker(new URL("../../workers/image.worker.ts", import.meta.url), { type: "module" });
    } catch {
      workerBroken = true;
      throw new WorkerUnavailableError();
    }
    worker.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
      const message = event.data;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else if (message.code === "decode") entry.reject(new ImageDecodeError(message.error));
      else if (message.code === "unsupported") entry.reject(new WorkerUnavailableError(message.error));
      else entry.reject(new Error(message.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      workerBroken = true;
      worker?.terminate();
      worker = null;
      rejectAll(new WorkerUnavailableError(event.message || "Image worker crashed"));
    };
  }
  return worker;
}

function call<T>(payload: Payload, transfer: Transferable[] = []): Promise<T> {
  const instance = getWorker();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    instance.postMessage({ ...payload, id, locale: getActiveLocale() }, transfer);
  });
}

export async function inspectInWorker(buffer: ArrayBuffer, format: string): Promise<ImageMetadataReport> {
  try {
    return await call<ImageMetadataReport>({ type: "inspect", buffer: buffer.slice(0), format });
  } catch (error) {
    if (!(error instanceof WorkerUnavailableError)) throw error;
    return inspectImageMetadata(new Uint8Array(buffer), format);
  }
}

export interface StripResult {
  buffer: ArrayBuffer;
  before: ImageMetadataReport;
  after: ImageMetadataReport;
}

export async function stripInWorker(buffer: ArrayBuffer, format: string, options: StripOptions): Promise<StripResult> {
  try {
    const copy = buffer.slice(0);
    return await call<StripResult>({ type: "strip", buffer: copy, format, options }, [copy]);
  } catch (error) {
    if (!(error instanceof WorkerUnavailableError)) throw error;
    const bytes = new Uint8Array(buffer);
    const before = inspectImageMetadata(bytes, format);
    const stripped = stripImageMetadata(bytes, format, options);
    return {
      buffer: stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength) as ArrayBuffer,
      before,
      after: inspectImageMetadata(stripped, format),
    };
  }
}

/** Decodes and re-encodes an image. Throws ImageDecodeError when the browser cannot read the format. */
export async function renderInWorker(blob: Blob, options: RenderOptions): Promise<RenderResult> {
  try {
    return await call<RenderResult>({ type: "convert", blob, options });
  } catch (error) {
    if (!(error instanceof WorkerUnavailableError)) throw error;
    let bitmap: ImageBitmap;
    try {
      bitmap = await decodeBitmap(blob);
    } catch {
      throw new ImageDecodeError();
    }
    try {
      return await renderToBlob(bitmap, options);
    } finally {
      bitmap.close();
    }
  }
}
