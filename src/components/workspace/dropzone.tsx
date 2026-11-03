"use client";

import { FileAudio, FileImage, FileVideo, Lock, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useI18n } from "@/i18n/provider";
import { ACCEPT_ATTRIBUTE } from "@/lib/file-types";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

function filesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  if (data.items?.length) {
    return Array.from(data.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
  }
  return Array.from(data.files ?? []);
}

export function Dropzone({ onFiles, compact = false }: DropzoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [windowDrag, setWindowDrag] = useState(false);
  const dragDepth = useRef(0);

  const open = () => inputRef.current?.click();

  // Files can be dropped anywhere on the page and pasted from the clipboard (Strg+V).
  useEffect(() => {
    const hasFiles = (event: globalThis.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setWindowDrag(true);
    };
    const onLeave = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setWindowDrag(false);
    };
    const onOver = (event: globalThis.DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setWindowDrag(false);
      const files = filesFromDataTransfer(event.dataTransfer);
      if (files.length) onFiles(files);
    };
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const files = filesFromDataTransfer(event.clipboardData);
      if (files.length) {
        event.preventDefault();
        onFiles(files);
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [onFiles]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current = 0;
      setOver(false);
      setWindowDrag(false);
      const files = filesFromDataTransfer(event.dataTransfer);
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={t.dropzone.aria}
        onClick={open}
        onKeyDown={onKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        data-testid="dropzone"
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition",
          compact ? "gap-1 px-4 py-5 sm:flex-row sm:gap-3" : "gap-4 px-6 py-14 sm:py-20",
          over
            ? "border-primary bg-primary-soft/60"
            : "border-border bg-card/70 hover:border-primary/60 hover:bg-primary-soft/30",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground transition group-hover:scale-105",
            compact ? "size-10" : "size-16",
          )}
        >
          <Upload className={compact ? "size-5" : "size-8"} aria-hidden />
        </div>
        {compact ? (
          <p className="text-sm">
            <span className="font-semibold text-foreground">{t.dropzone.addMore}</span>
            <span className="text-muted-foreground">{t.dropzone.addMoreHint}</span>
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-xl font-semibold tracking-tight sm:text-2xl">{t.dropzone.title}</p>
              <p className="text-sm text-muted-foreground">
                {t.dropzone.or}{" "}
                <span className="font-medium text-primary underline-offset-4 group-hover:underline">{t.dropzone.choose}</span> ·{" "}
                {t.dropzone.paste}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
                <FileImage className="size-3.5" aria-hidden /> JPG · PNG · WebP · HEIC · SVG · GIF · AVIF
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
                <FileVideo className="size-3.5" aria-hidden /> MP4 · MOV · WebM · MKV · AVI
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
                <FileAudio className="size-3.5" aria-hidden /> MP3 · WAV · M4A · FLAC · OGG
              </span>
            </div>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <Lock className="size-3.5" aria-hidden /> {t.dropzone.noUpload}
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          data-testid="file-input"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) onFiles(files);
            event.target.value = "";
          }}
        />
      </div>
      {windowDrag && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center shadow-2xl">
            <Upload className="mx-auto mb-3 size-10 text-primary" aria-hidden />
            <p className="text-lg font-semibold">{t.dropzone.overlayTitle}</p>
            <p className="text-sm text-muted-foreground">{t.dropzone.overlayHint}</p>
          </div>
        </div>
      )}
    </>
  );
}
