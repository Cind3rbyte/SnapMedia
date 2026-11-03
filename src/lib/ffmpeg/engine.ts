import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { CancelledError, errorMessage } from "../utils";

/**
 * FFmpeg WebAssembly engine.
 *
 * - FFmpeg itself runs inside a dedicated Web Worker that @ffmpeg/ffmpeg spawns – the UI thread never blocks.
 * - With cross-origin isolation (COOP/COEP headers → SharedArrayBuffer) the multi-threaded core is used,
 *   otherwise (or if it fails to start) the single-threaded core.
 * - Core files are served from this origin (/ffmpeg/…), downloaded once with progress and kept as Blob URLs,
 *   so restarting the worker after a cancel does not download anything again.
 * - Jobs are serialized: one FFmpeg instance can only run one command at a time.
 */

export type EngineMode = "mt" | "st";

export type EngineStatus =
  | { state: "idle" }
  | { state: "downloading"; mode: EngineMode; received: number; total: number | null }
  | { state: "initializing"; mode: EngineMode }
  | { state: "ready"; mode: EngineMode }
  | { state: "error"; message: string };

type StatusListener = (status: EngineStatus) => void;

export interface ExecOptions {
  /** Expected duration of the output in seconds – enables percentage progress. */
  duration?: number | null;
  onProgress?: (ratio: number, detail: { time: number; speed: number | null }) => void;
  signal?: AbortSignal;
}

export class FFmpegError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly log: string[],
  ) {
    super(message);
    this.name = "FFmpegError";
  }
}

const LOAD_TIMEOUT_MS = 90_000;

/**
 * The WebAssembly instance is reused between commands and keeps FFmpeg's global log level.
 * An `ffprobe -v error` would otherwise silence the stream info and the `time=` progress lines
 * of every following command – so each command sets the level explicitly.
 */
const BASE_ARGS = ["-hide_banner", "-loglevel", "info"];
const MAX_LOG_LINES = 400;

async function downloadToBlobUrl(
  url: string,
  mimeType: string,
  onProgress?: (received: number, total: number | null) => void,
  knownSize?: number | null,
): Promise<string> {
  const response = await fetch(url, { cache: "default" });
  if (!response.ok) throw new Error(`Engine-Datei konnte nicht geladen werden (${response.status}): ${url}`);
  const encoding = response.headers.get("Content-Encoding");
  const lengthHeader = Number(response.headers.get("Content-Length"));
  // With Content-Encoding the header describes the compressed size – prefer the size from the manifest.
  const exact = !encoding || encoding === "identity";
  const headerTotal = exact && Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null;
  const total = knownSize ?? headerTotal;
  let blob: Blob;
  if (response.body && onProgress) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(received, total ? Math.max(total, received) : null);
    }
    blob = new Blob(chunks as BlobPart[], { type: mimeType });
  } else {
    blob = new Blob([await response.arrayBuffer()], { type: mimeType });
  }
  return URL.createObjectURL(blob);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Verbose FFmpeg logging for bug reports: run `localStorage.snapmediaDebug = "1"` in the console. */
function isDebugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("snapmediaDebug") === "1";
  } catch {
    return false;
  }
}

/** Parses "time=00:01:02.34" from FFmpeg's stats line. */
function parseStatsTime(line: string): number | null {
  const match = /time=\s*(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  if (!match) return null;
  const seconds = Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]);
  return match[1] === "-" ? 0 : seconds;
}

function parseSpeed(line: string): number | null {
  const match = /speed=\s*([\d.]+)x/.exec(line);
  return match ? Number(match[1]) : null;
}

/** Errors that leave the WebAssembly instance unusable (abort, out of memory, worker crash). */
function isFatalEngineError(error: unknown): boolean {
  if (error instanceof FFmpegError) return false;
  const text = errorMessage(error);
  return /abort|runtimeerror|out of memory|\boom\b|memory access|unreachable|cannot enlarge memory/i.test(text);
}

function friendlyEngineError(error: unknown): string {
  const text = errorMessage(error);
  if (/out of memory|\boom\b|cannot enlarge memory|memory access/i.test(text)) {
    return "Nicht genug Arbeitsspeicher im Browser für diese Datei. Tipp: Video vorher kürzen, eine kleinere Auflösung wählen oder andere Tabs schließen.";
  }
  return `Die FFmpeg-Engine ist abgestürzt und wurde neu gestartet. Bitte versuche es erneut. (${text.slice(0, 160)})`;
}

/** Picks the most helpful line from FFmpeg's log for an error message. */
export function summarizeFFmpegLog(log: string[]): string {
  const interesting = [...log]
    .reverse()
    .find((line) =>
      /(error|invalid|not found|no such|unsupported|does not contain|could not|failed|unknown|cannot|too large|out of memory)/i.test(
        line,
      ) && !/^\s*(configuration|built with|lib)/i.test(line),
    );
  return (interesting ?? log[log.length - 1] ?? "Unbekannter FFmpeg-Fehler").trim();
}

class FFmpegEngine {
  private instance: FFmpeg | null = null;
  private loading: Promise<FFmpeg> | null = null;
  private currentMode: EngineMode | null = null;
  private status: EngineStatus = { state: "idle" };
  private readonly listeners = new Set<StatusListener>();
  private readonly logListeners = new Set<(line: string) => void>();
  private readonly blobUrls = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private multiThreadFailed = false;

  getStatus(): EngineStatus {
    return this.status;
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: EngineStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  /** True when SharedArrayBuffer is usable (requires the COOP/COEP headers from next.config.js). */
  canUseMultiThreading(): boolean {
    return (
      typeof window !== "undefined" &&
      window.crossOriginIsolated === true &&
      typeof SharedArrayBuffer !== "undefined" &&
      !this.multiThreadFailed
    );
  }

  /** Thread count for decoders/encoders. The MT core has a fixed pool of 32 workers – stay well below it. */
  threads(): number {
    if (this.currentMode !== "mt") return 1;
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
    return Math.max(2, Math.min(8, cores));
  }

  async load(): Promise<FFmpeg> {
    if (this.instance?.loaded) return this.instance;
    if (!this.loading) {
      this.loading = this.loadPreferred().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async loadPreferred(): Promise<FFmpeg> {
    if (this.canUseMultiThreading()) {
      try {
        return await this.loadMode("mt");
      } catch (error) {
        console.warn("[SnapMedia] Multi-Thread-Engine nicht verfügbar, nutze Single-Thread:", error);
        this.multiThreadFailed = true;
      }
    }
    try {
      return await this.loadMode("st");
    } catch (error) {
      const message = `FFmpeg-Engine konnte nicht gestartet werden: ${errorMessage(error)}`;
      this.setStatus({ state: "error", message });
      throw new Error(message);
    }
  }

  private async cachedBlobUrl(
    url: string,
    mime: string,
    onProgress?: (received: number, total: number | null) => void,
    knownSize?: number | null,
  ): Promise<string> {
    const cached = this.blobUrls.get(url);
    if (cached) return cached;
    const blobUrl = await downloadToBlobUrl(url, mime, onProgress, knownSize);
    this.blobUrls.set(url, blobUrl);
    return blobUrl;
  }

  /** File sizes written by scripts/copy-wasm-assets.mjs (optional – only used for progress display). */
  private async manifestSizes(): Promise<Record<string, number>> {
    try {
      const response = await fetch(new URL("/ffmpeg/manifest.json", window.location.origin), { cache: "no-cache" });
      if (!response.ok) return {};
      const json = (await response.json()) as { sizes?: Record<string, number> };
      return json.sizes ?? {};
    } catch {
      return {};
    }
  }

  private async loadMode(mode: EngineMode): Promise<FFmpeg> {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const base = new URL(`/ffmpeg/${mode}/`, window.location.origin).href;
    const wasmKey = `${base}ffmpeg-core.wasm`;
    const sizes = this.blobUrls.has(wasmKey) ? {} : await this.manifestSizes();
    const wasmSize = sizes[`ffmpeg/${mode}/ffmpeg-core.wasm`] ?? null;
    this.setStatus({ state: "downloading", mode, received: 0, total: wasmSize });
    const coreURL = await this.cachedBlobUrl(`${base}ffmpeg-core.js`, "text/javascript");
    const wasmURL = await this.cachedBlobUrl(
      wasmKey,
      "application/wasm",
      (received, total) => this.setStatus({ state: "downloading", mode, received, total }),
      wasmSize,
    );
    const workerURL =
      mode === "mt" ? await this.cachedBlobUrl(`${base}ffmpeg-core.worker.js`, "text/javascript") : undefined;

    this.setStatus({ state: "initializing", mode });
    const ffmpeg = new FFmpeg();
    const debug = isDebugEnabled();
    ffmpeg.on("log", ({ message }) => {
      if (debug) console.debug(`[ffmpeg] ${message}`);
      this.logListeners.forEach((listener) => listener(message));
    });
    try {
      await withTimeout(
        ffmpeg.load({ coreURL, wasmURL, workerURL }),
        LOAD_TIMEOUT_MS,
        "Zeitüberschreitung beim Starten der FFmpeg-Engine.",
      );
    } catch (error) {
      ffmpeg.terminate();
      throw error;
    }
    this.instance = ffmpeg;
    this.currentMode = mode;
    this.setStatus({ state: "ready", mode });
    return ffmpeg;
  }

  /**
   * Runs a job exclusively on the engine. Jobs queue up in order.
   * Aborting the signal terminates the worker; the engine restarts transparently for the next job.
   */
  run<T>(job: (ffmpeg: FFmpeg) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const next = this.queue.then(async () => {
      if (signal?.aborted) throw new CancelledError();
      const ffmpeg = await this.load();
      if (signal?.aborted) throw new CancelledError();
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        this.terminate();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        return await job(ffmpeg);
      } catch (error) {
        if (aborted || signal?.aborted) throw new CancelledError();
        if (typeof error === "string" && /terminate/i.test(error)) throw new CancelledError();
        if (isFatalEngineError(error)) {
          // A crashed WebAssembly instance cannot be reused – the next job starts a fresh one.
          this.terminate();
          throw new Error(friendlyEngineError(error));
        }
        throw error;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Stops the running command immediately by terminating the worker. */
  terminate() {
    if (this.instance) {
      this.instance.terminate();
      this.instance = null;
      this.setStatus({ state: "idle" });
    }
  }

  /**
   * Executes an FFmpeg command and reports progress parsed from the stats output.
   * Throws FFmpegError with the most relevant log line if FFmpeg exits with an error.
   */
  async exec(ffmpeg: FFmpeg, args: string[], options: ExecOptions = {}): Promise<string[]> {
    const log: string[] = [];
    const listener = (line: string) => {
      log.push(line);
      if (log.length > MAX_LOG_LINES) log.shift();
      if (!options.onProgress) return;
      const time = parseStatsTime(line);
      if (time === null) return;
      const duration = options.duration ?? 0;
      const ratio = duration > 0 ? Math.min(0.999, Math.max(0, time / duration)) : 0;
      options.onProgress(ratio, { time, speed: parseSpeed(line) });
    };
    this.logListeners.add(listener);
    try {
      const code = await ffmpeg.exec([...BASE_ARGS, ...args], undefined, { signal: options.signal });
      if (code !== 0) {
        throw new FFmpegError(`FFmpeg konnte die Datei nicht verarbeiten: ${summarizeFFmpegLog(log)}`, code, log);
      }
      return log;
    } finally {
      this.logListeners.delete(listener);
    }
  }

  /** Runs FFmpeg and returns the log even when the command "fails" (used for probing). */
  async execForLog(ffmpeg: FFmpeg, args: string[]): Promise<string[]> {
    const log: string[] = [];
    const listener = (line: string) => {
      log.push(line);
      if (log.length > MAX_LOG_LINES) log.shift();
    };
    this.logListeners.add(listener);
    try {
      await ffmpeg.exec([...BASE_ARGS, ...args]);
      return log;
    } finally {
      this.logListeners.delete(listener);
    }
  }
}

export const ffmpegEngine = new FFmpegEngine();

if (typeof window !== "undefined" && isDebugEnabled()) {
  (window as unknown as { snapmediaEngine: FFmpegEngine }).snapmediaEngine = ffmpegEngine;
}
