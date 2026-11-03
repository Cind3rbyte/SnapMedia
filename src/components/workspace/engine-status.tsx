"use client";

import { Cpu, LoaderCircle, TriangleAlert, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ffmpegEngine, type EngineStatus as Status } from "@/lib/ffmpeg/engine";
import { formatBytes } from "@/lib/utils";

/** Shows download/initialization state of the FFmpeg WebAssembly engine. */
export function EngineStatus() {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  useEffect(() => ffmpegEngine.subscribe(setStatus), []);

  if (status.state === "idle") return null;

  if (status.state === "downloading") {
    const ratio = status.total ? status.received / status.total : null;
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-sm" role="status" data-testid="engine-status">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-medium">
            <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
            Lade FFmpeg-Engine (einmalig, wird danach im Browser-Cache gehalten)
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatBytes(status.received)}
            {status.total ? ` / ${formatBytes(status.total)}` : ""}
          </span>
        </div>
        <ProgressBar value={ratio} label="Download der FFmpeg-Engine" />
      </div>
    );
  }

  if (status.state === "initializing") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm" role="status" data-testid="engine-status">
        <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
        Starte FFmpeg ({status.mode === "mt" ? "Multi-Thread" : "Single-Thread"})…
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm text-danger" role="alert">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {status.message}
      </div>
    );
  }

  return (
    <p className="inline-flex items-center gap-2 text-xs text-muted-foreground" data-testid="engine-status">
      {status.mode === "mt" ? <Zap className="size-3.5 text-warning" aria-hidden /> : <Cpu className="size-3.5" aria-hidden />}
      FFmpeg-Engine bereit · {status.mode === "mt" ? "Multi-Thread (SharedArrayBuffer aktiv)" : "Single-Thread-Modus"}
    </p>
  );
}
