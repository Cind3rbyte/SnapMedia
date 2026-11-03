"use client";

import { FileAudio, FileQuestion, FileVideo, ImageIcon, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { formatBytes } from "@/lib/utils";
import type { InputItem } from "./types";

function Thumbnail({ item }: { item: InputItem }) {
  const { kind } = item.type;
  if (item.previewUrl && kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
      <img src={item.previewUrl} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
    );
  }
  if (item.previewUrl && kind === "video") {
    return <video src={`${item.previewUrl}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />;
  }
  const Icon = kind === "video" ? FileVideo : kind === "audio" ? FileAudio : kind === "image" ? ImageIcon : FileQuestion;
  return (
    <div className="flex size-full items-center justify-center bg-primary-soft text-primary-soft-foreground">
      <Icon className="size-6" aria-hidden />
    </div>
  );
}

interface FileListProps {
  items: InputItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function FileList({ items, onRemove, onClear }: FileListProps) {
  const { t } = useI18n();
  const counts = {
    image: items.filter((item) => item.type.kind === "image").length,
    video: items.filter((item) => item.type.kind === "video").length,
    audio: items.filter((item) => item.type.kind === "audio").length,
    unsupported: items.filter((item) => item.type.kind === "unsupported").length,
  };
  const summary = [
    counts.image && t.files.images(counts.image),
    counts.video && t.files.videos(counts.video),
    counts.audio && t.files.audios(counts.audio),
    counts.unsupported && t.files.unsupported(counts.unsupported),
  ].filter(Boolean);

  return (
    <section aria-labelledby="files-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="files-heading" className="text-sm font-semibold">
          {t.files.detected} <span className="font-normal text-muted-foreground">{summary.join(" · ")}</span>
        </h2>
        <button type="button" onClick={onClear} className="text-xs text-muted-foreground transition hover:text-danger">
          {t.files.removeAll}
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="file-list">
        {items.map((item) => (
          <li key={item.id} className="card-surface flex items-center gap-3 rounded-xl p-2 pr-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              <Thumbnail item={item} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={item.file.name}>
                {item.file.name}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={
                    item.type.kind === "unsupported"
                      ? "rounded bg-danger-soft px-1.5 py-0.5 font-medium text-danger"
                      : "rounded bg-muted px-1.5 py-0.5 font-medium text-foreground"
                  }
                >
                  {item.type.kind === "unsupported" ? t.files.unsupportedBadge : item.type.label}
                </span>
                {formatBytes(item.file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={t.files.remove(item.file.name)}
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
