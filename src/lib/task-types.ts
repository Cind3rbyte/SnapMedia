import type { MetadataFinding } from "./image/metadata";

export interface TaskContext {
  signal?: AbortSignal;
  /** Progress of the current stage, 0…1. */
  onProgress?: (ratio: number) => void;
  /** Short status text, e.g. "Analysiere Datei…". */
  onStage?: (label: string) => void;
}

export interface TaskResult {
  blob: Blob;
  name: string;
  /** Facts shown under the result, e.g. "1280 × 720", "Qualität 82 %". */
  details?: string[];
  /** Highlighted hint, e.g. that the original was kept unchanged. */
  note?: string;
  /** Privacy cleaner: metadata found in the original. */
  removed?: MetadataFinding[];
  /** Privacy cleaner: metadata still present afterwards (should be empty). */
  remaining?: MetadataFinding[];
}
