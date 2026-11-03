"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createId, errorMessage, isCancelled } from "@/lib/utils";
import type { Job, JobRequest } from "./types";

interface QueueEntry {
  jobId: string;
  run: JobRequest["run"];
  controller: AbortController;
}

/**
 * Sequential job queue. Media processing is memory hungry (and FFmpeg can only run one command at a time),
 * so jobs run one after another; progress updates are throttled to keep React renders cheap.
 */
export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const queue = useRef<QueueEntry[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const active = controllers.current;
    return () => {
      mounted.current = false;
      active.forEach((controller) => controller.abort());
    };
  }, []);

  const patch = useCallback((id: string, update: Partial<Job>) => {
    if (!mounted.current) return;
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...update } : job)));
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length > 0) {
        const entry = queue.current.shift()!;
        if (entry.controller.signal.aborted) {
          patch(entry.jobId, { status: "cancelled", stage: null, progress: null, finishedAt: Date.now() });
          continue;
        }
        patch(entry.jobId, { status: "running", stage: "Starte…", progress: null, startedAt: Date.now() });
        let lastUpdate = 0;
        let pendingProgress: number | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
          timer = null;
          lastUpdate = performance.now();
          patch(entry.jobId, { progress: pendingProgress });
        };
        try {
          const result = await entry.run({
            signal: entry.controller.signal,
            onStage: (stage) => patch(entry.jobId, { stage }),
            onProgress: (ratio) => {
              pendingProgress = ratio;
              const elapsed = performance.now() - lastUpdate;
              if (elapsed > 120) flush();
              else if (!timer) timer = setTimeout(flush, 120 - elapsed);
            },
          });
          if (timer) clearTimeout(timer);
          patch(entry.jobId, { status: "done", stage: null, progress: 1, result, finishedAt: Date.now() });
        } catch (error) {
          if (timer) clearTimeout(timer);
          if (isCancelled(error) || entry.controller.signal.aborted) {
            patch(entry.jobId, { status: "cancelled", stage: null, progress: null, finishedAt: Date.now() });
          } else {
            console.error("[SnapMedia] Job fehlgeschlagen:", error);
            patch(entry.jobId, { status: "error", stage: null, error: errorMessage(error), finishedAt: Date.now() });
          }
        } finally {
          controllers.current.delete(entry.jobId);
        }
      }
    } finally {
      running.current = false;
    }
  }, [patch]);

  const enqueue = useCallback(
    (requests: JobRequest[]) => {
      const now = Date.now();
      const created: Job[] = requests.map((request) => ({
        id: createId(),
        itemId: request.item.id,
        tool: request.tool,
        title: request.title,
        fileName: request.item.file.name,
        inputSize: request.item.file.size,
        kind: request.item.type.kind,
        status: "queued",
        stage: null,
        progress: null,
        result: null,
        error: null,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      }));
      created.forEach((job, index) => {
        const controller = new AbortController();
        controllers.current.set(job.id, controller);
        queue.current.push({ jobId: job.id, run: requests[index].run, controller });
      });
      setJobs((current) => [...created.slice().reverse(), ...current]);
      void pump();
      return created.map((job) => job.id);
    },
    [pump],
  );

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const cancelAll = useCallback(() => {
    controllers.current.forEach((controller) => controller.abort());
  }, []);

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    setJobs((current) => current.filter((job) => job.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs((current) => current.filter((job) => job.status === "queued" || job.status === "running"));
  }, []);

  return { jobs, enqueue, cancel, cancelAll, remove, clearFinished };
}
