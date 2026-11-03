"use client";

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { clamp, cn, formatTimecode } from "@/lib/utils";

interface TimelineProps {
  duration: number;
  start: number;
  end: number;
  current: number;
  thumbnails: string[];
  waveform: number[] | null;
  onChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  /** Accessible names of the two handles. */
  labels: { start: string; end: string };
}

const MIN_LENGTH = 0.1;
type DragTarget = "start" | "end" | "range" | "seek";

/**
 * Visual timeline with thumbnails, two draggable handles and a draggable selection.
 * Keyboard: ←/→ move a focused handle by 0.1 s, with Shift by 1 s.
 */
export function Timeline({ duration, start, end, current, thumbnails, waveform, onChange, onSeek, labels }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ target: DragTarget; offset: number; length: number } | null>(null);

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
    },
    [duration],
  );

  const snap = (time: number) => Math.round(time * 10) / 10;

  const onPointerDown = (target: DragTarget) => (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const time = timeAt(event.clientX);
    // Remember where inside the handle/selection the pointer grabbed, so nothing jumps on the first move.
    const anchor = target === "end" ? end : target === "seek" ? time : start;
    drag.current = { target, offset: time - anchor, length: end - start };
    if (target === "seek") onSeek(time);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state) return;
    const pointerTime = timeAt(event.clientX);
    const time = state.target === "seek" ? pointerTime : pointerTime - state.offset;
    if (state.target === "start") {
      const next = clamp(snap(time), 0, end - MIN_LENGTH);
      onChange(next, end);
      onSeek(next);
    } else if (state.target === "end") {
      const next = clamp(snap(time), start + MIN_LENGTH, duration);
      onChange(start, next);
      onSeek(next);
    } else if (state.target === "range") {
      const nextStart = clamp(snap(time), 0, duration - state.length);
      onChange(nextStart, Math.min(duration, nextStart + state.length));
    } else {
      onSeek(time);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    drag.current = null;
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
  };

  const onHandleKey = (which: "start" | "end") => (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 1 : 0.1;
    let delta = 0;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") delta = -step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") delta = step;
    else if (event.key === "Home") delta = -duration;
    else if (event.key === "End") delta = duration;
    else return;
    event.preventDefault();
    if (which === "start") {
      const next = clamp(snap(start + delta), 0, end - MIN_LENGTH);
      onChange(next, end);
      onSeek(next);
    } else {
      const next = clamp(snap(end + delta), start + MIN_LENGTH, duration);
      onChange(start, next);
      onSeek(next);
    }
  };

  const pct = (time: number) => `${duration > 0 ? (time / duration) * 100 : 0}%`;
  const ticks = Array.from({ length: 6 }, (_, index) => (duration * index) / 5);

  return (
    <div className="space-y-1.5 select-none">
      <div
        ref={trackRef}
        className="relative h-20 touch-none overflow-hidden rounded-xl border border-border bg-muted"
        onPointerDown={onPointerDown("seek")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="timeline"
      >
        {thumbnails.length > 0 ? (
          <div className="absolute inset-0 flex">
            {thumbnails.map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- generated frame previews
              <img key={index} src={src} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover opacity-90" />
            ))}
          </div>
        ) : waveform ? (
          <div className="absolute inset-0 flex items-center gap-px px-1">
            {waveform.map((value, index) => (
              <span key={index} className="flex-1 rounded-full bg-primary/50" style={{ height: `${Math.max(4, value * 92)}%` }} />
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_11px,color-mix(in_oklab,var(--border)_80%,transparent)_11px_12px)]" />
        )}

        {/* dimmed areas outside the selection */}
        <div className="absolute inset-y-0 left-0 bg-background/75" style={{ width: pct(start) }} />
        <div className="absolute inset-y-0 right-0 bg-background/75" style={{ left: pct(end) }} />

        {/* selection */}
        <div
          className="absolute inset-y-0 cursor-grab border-y-2 border-primary active:cursor-grabbing"
          style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }}
          onPointerDown={onPointerDown("range")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-hidden
        />

        {/* handles */}
        {(["start", "end"] as const).map((which) => {
          const time = which === "start" ? start : end;
          return (
            <div
              key={which}
              role="slider"
              tabIndex={0}
              aria-label={which === "start" ? labels.start : labels.end}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration * 10) / 10}
              aria-valuenow={Math.round(time * 10) / 10}
              aria-valuetext={formatTimecode(time)}
              onKeyDown={onHandleKey(which)}
              onPointerDown={onPointerDown(which)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              data-testid={`handle-${which}`}
              className={cn(
                // Handles sit inside the selection so they stay fully grabbable at 0:00 and at the very end.
                "group absolute inset-y-0 z-10 flex w-4 cursor-ew-resize items-center justify-center focus-visible:outline-none",
                which === "end" && "-translate-x-full",
              )}
              style={{ left: pct(time) }}
            >
              <span className="flex h-full w-3.5 items-center justify-center rounded-md bg-primary shadow-md ring-offset-2 ring-offset-card group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <span className="h-6 w-0.5 rounded-full bg-primary-foreground/80" />
              </span>
            </div>
          );
        })}

        {/* playhead */}
        <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-warning shadow" style={{ left: pct(current) }} aria-hidden />
      </div>
      <div className="relative h-4 text-[10px] text-muted-foreground" aria-hidden>
        {ticks.map((tick, index) => (
          <span
            key={index}
            className={cn("absolute font-mono", index === 0 ? "" : index === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")}
            style={{ left: pct(tick) }}
          >
            {formatTimecode(tick, 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
