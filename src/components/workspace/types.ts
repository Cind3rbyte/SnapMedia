import type { MediaKind, MediaType, ToolId } from "@/lib/file-types";
import type { TaskContext, TaskResult } from "@/lib/task-types";

export interface InputItem {
  id: string;
  file: File;
  type: MediaType;
  tools: ToolId[];
  /** Object URL for previews (null for formats the browser cannot display, e.g. HEIC). */
  previewUrl: string | null;
}

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export interface Job {
  id: string;
  itemId: string;
  tool: ToolId;
  title: string;
  fileName: string;
  inputSize: number;
  kind: MediaKind;
  status: JobStatus;
  stage: string | null;
  /** 0…1 or null when the step has no measurable progress. */
  progress: number | null;
  result: TaskResult | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface JobRequest {
  item: InputItem;
  tool: ToolId;
  title: string;
  run: (ctx: TaskContext) => Promise<TaskResult>;
}
