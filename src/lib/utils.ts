import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { msg } from "@/i18n/runtime";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const byteUnits = ["B", "KB", "MB", "GB", "TB"];

/** Formats a byte count with decimal units (1 MB = 1,000,000 bytes), like file managers and Discord do. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), byteUnits.length - 1);
  const value = bytes / 1000 ** exponent;
  const digits = exponent === 0 ? 0 : value >= 100 ? 0 : fractionDigits;
  return `${formatNumber(value, digits)} ${byteUnits[exponent]}`;
}

/** Number with the decimal separator of the active UI language (1.5 / 1,5). */
export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return value.toLocaleString(msg().numberLocale, { maximumFractionDigits, minimumFractionDigits: 0 });
}

/** 83.25 -> "1:23.2" (or "1:02:03.0" for long media). */
export function formatTimecode(seconds: number, fractionDigits = 1): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const factor = 10 ** fractionDigits;
  const rounded = Math.round(seconds * factor) / factor;
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  const sec = s.toFixed(fractionDigits).padStart(fractionDigits > 0 ? 3 + fractionDigits : 2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Human friendly duration in the active UI language: "12.4 s", "2 min 05 s" / "12,4 Sek.", "2 Min. 05 Sek." */
export function formatDuration(seconds: number): string {
  const { units } = msg();
  if (!Number.isFinite(seconds) || seconds <= 0) return units.seconds("0");
  if (seconds < 60) return units.seconds(formatNumber(seconds, 1));
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return units.minutesSeconds(m, String(s).padStart(2, "0"));
  return units.hoursMinutes(Math.floor(m / 60), String(m % 60).padStart(2, "0"));
}

/**
 * Parses "1:23.4", "01:02:03", "83.5" or "83,5" into seconds.
 * Returns null for invalid input.
 */
export function parseTimecode(input: string): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return Number.isFinite(total) ? total : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Builds an output filename like "holiday-web.jpg" from "holiday.HEIC". */
export function outputName(originalName: string, extension: string, suffix?: string): string {
  const cleanBase =
    baseName(originalName)
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
      .trim() || "file";
  return `${cleanBase}${suffix ? `-${suffix}` : ""}.${extension}`;
}

export function percentSaved(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round((1 - after / before) * 100);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Thrown when the user cancels a running job. */
export class CancelledError extends Error {
  constructor(message = msg().errors.cancelled) {
    super(message);
    this.name = "CancelledError";
  }
}

export function isCancelled(error: unknown): boolean {
  return error instanceof CancelledError || (error instanceof DOMException && error.name === "AbortError");
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new CancelledError();
}
