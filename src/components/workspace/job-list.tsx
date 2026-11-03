"use client";

import {
  Archive,
  AudioLines,
  Ban,
  Calendar,
  CircleCheck,
  CircleX,
  Clock,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileText,
  Film,
  Info,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Smartphone,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useI18n } from "@/i18n/provider";
import { downloadFile, downloadZip } from "@/lib/download";
import type { FindingCategory, MetadataFinding } from "@/lib/image/metadata";
import { cn, errorMessage, formatBytes, formatDuration, percentSaved } from "@/lib/utils";
import type { Job } from "./types";

const FINDING_ICONS: Record<FindingCategory, typeof MapPin> = {
  gps: MapPin,
  device: Smartphone,
  datetime: Calendar,
  author: User,
  software: Cpu,
  other: Info,
};

function useObjectUrl(blob: Blob | null | undefined, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || !enabled) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, enabled]);
  return url;
}

function Findings({ removed, remaining }: { removed: MetadataFinding[]; remaining: MetadataFinding[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-xs" data-testid="privacy-report">
      {removed.length > 0 ? (
        <>
          <p className="font-semibold">{t.results.removed(removed.length)}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {removed.map((finding, index) => {
              const Icon = FINDING_ICONS[finding.category];
              return (
                <li key={`${finding.label}-${index}`} className="flex min-w-0 items-start gap-1.5">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", finding.category === "gps" ? "text-danger" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium">{finding.label}:</span>{" "}
                    <span className="break-words text-muted-foreground line-through decoration-danger/60">{finding.value}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-muted-foreground">{t.results.noneFound}</p>
      )}
      {remaining.length === 0 ? (
        <p className="inline-flex items-center gap-1.5 font-medium text-success">
          <ShieldCheck className="size-3.5" aria-hidden /> {t.results.verified}
        </p>
      ) : (
        <p className="text-warning">{t.results.remaining(remaining.map((finding) => finding.label).join(", "))}</p>
      )}
    </div>
  );
}

/** Small square next to the result name: image thumbnail, or an icon for video/audio. */
function ResultThumbnail({ job }: { job: Job }) {
  const { t } = useI18n();
  const blob = job.result?.blob;
  const isImage = blob?.type.startsWith("image/") ?? false;
  const url = useObjectUrl(blob, isImage);
  if (!blob) return null;
  if (isImage && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
      <img src={url} alt={t.results.previewAlt(job.result?.name ?? "")} className="size-14 shrink-0 rounded-lg border border-border object-cover" />
    );
  }
  const Icon = blob.type.startsWith("video/") ? Film : blob.type.startsWith("audio/") ? AudioLines : FileText;
  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
      <Icon className="size-6" aria-hidden />
    </div>
  );
}

/** Collapsible player for video/audio results (object URL is only created while open). */
function MediaPreview({ job }: { job: Job }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const blob = job.result?.blob;
  const url = useObjectUrl(blob, open);
  if (!blob || blob.type.startsWith("image/")) return null;
  const isVideo = blob.type.startsWith("video/");
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        aria-expanded={open}
        data-testid="media-preview-toggle"
      >
        {open ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        {open ? t.results.closePreview : isVideo ? t.results.watchVideo : t.results.listen}
      </button>
      {open && url && (
        <div className="mt-2">
          {isVideo ? (
            <video src={url} controls playsInline className="max-h-72 w-full rounded-lg bg-black" />
          ) : (
            <audio src={url} controls className="w-full" />
          )}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, onCancel, onRemove }: { job: Job; onCancel: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  const meta = t.tools[job.tool];
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const save = async () => {
    if (!job.result) return;
    setDownloadError(null);
    try {
      await downloadFile(job.result);
    } catch (error) {
      setDownloadError(errorMessage(error));
    }
  };
  const result = job.result;
  const sizeDelta = result ? percentSaved(job.inputSize, result.blob.size) : 0;
  const elapsed = job.startedAt && job.finishedAt ? (job.finishedAt - job.startedAt) / 1000 : null;

  return (
    <li className="card-surface rounded-xl p-4" data-testid="job" data-status={job.status}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {job.status === "running" && <LoaderCircle className="size-5 animate-spin text-primary" aria-label={t.results.running} />}
          {job.status === "queued" && <Clock className="size-5 text-muted-foreground" aria-label={t.results.waiting} />}
          {job.status === "done" && <CircleCheck className="size-5 text-success" aria-label={t.results.done} />}
          {job.status === "error" && <CircleX className="size-5 text-danger" aria-label={t.results.failed} />}
          {job.status === "cancelled" && <Ban className="size-5 text-muted-foreground" aria-label={t.results.cancelledShort} />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 text-sm font-semibold">
              <span className="text-muted-foreground">{meta.label} · </span>
              {job.title}
            </p>
            {elapsed !== null && job.status === "done" && (
              <span className="text-xs text-muted-foreground">{t.results.doneIn(formatDuration(elapsed))}</span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground" title={job.fileName}>
            {job.fileName} · {formatBytes(job.inputSize)}
          </p>

          {(job.status === "running" || job.status === "queued") && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground" aria-live="polite">
                  {job.status === "queued" ? t.results.queued : (job.stage ?? t.results.processing)}
                </span>
                {job.status === "running" && job.progress !== null && (
                  <span className="font-mono font-medium" data-testid="job-percent">
                    {Math.round(job.progress * 100)} %
                  </span>
                )}
              </div>
              <ProgressBar value={job.status === "queued" ? 0 : job.progress} label={t.results.progressLabel(job.fileName)} />
            </div>
          )}

          {job.status === "error" && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
              {job.error}
            </p>
          )}
          {job.status === "cancelled" && <p className="text-xs text-muted-foreground">{t.results.cancelled}</p>}

          {job.status === "done" && result && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <ResultThumbnail job={job} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium" title={result.name} data-testid="result-name">
                    {result.name}
                  </p>
                  <p className="text-xs">
                    <span className="text-muted-foreground">{formatBytes(job.inputSize)} → </span>
                    <span className="font-semibold" data-testid="result-size" data-bytes={result.blob.size}>
                      {formatBytes(result.blob.size)}
                    </span>
                    {result.blob !== undefined && sizeDelta !== 0 && (
                      <span className={cn("ml-2 rounded px-1.5 py-0.5 font-medium", sizeDelta > 0 ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
                        {sizeDelta > 0 ? `−${sizeDelta} %` : `+${Math.abs(sizeDelta)} %`}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {result.details && result.details.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.details.map((detail) => (
                    <span key={detail} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {detail}
                    </span>
                  ))}
                </div>
              )}
              {result.note && <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">{result.note}</p>}
              {result.removed && <Findings removed={result.removed} remaining={result.remaining ?? []} />}
              {downloadError && (
                <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
                  {t.results.downloadFailed(downloadError)}
                </p>
              )}
              <MediaPreview job={job} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {job.status === "done" && result && (
            <Button size="sm" onClick={() => void save()} data-testid="download">
              <Download className="size-3.5" aria-hidden /> {t.results.download}
            </Button>
          )}
          {(job.status === "running" || job.status === "queued") && (
            <Button size="sm" variant="secondary" onClick={onCancel} data-testid="cancel-job">
              <X className="size-3.5" aria-hidden /> {t.results.cancel}
            </Button>
          )}
          {job.status !== "running" && job.status !== "queued" && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={t.results.remove}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

interface JobListProps {
  jobs: Job[];
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
}

export function JobList({ jobs, onCancel, onRemove, onClearFinished }: JobListProps) {
  const { t } = useI18n();
  const done = useMemo(() => jobs.filter((job) => job.status === "done" && job.result), [jobs]);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  const zipAll = async () => {
    setZipError(null);
    setZipProgress(0);
    try {
      await downloadZip(
        done.map((job) => ({ blob: job.result!.blob, name: job.result!.name })),
        (ratio) => setZipProgress(ratio),
      );
    } catch (error) {
      setZipError(errorMessage(error));
    } finally {
      setZipProgress(null);
    }
  };

  const totalBefore = done.reduce((sum, job) => sum + job.inputSize, 0);
  const totalAfter = done.reduce((sum, job) => sum + job.result!.blob.size, 0);

  return (
    <section aria-labelledby="results-heading" className="space-y-3" data-testid="results">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="results-heading" className="text-lg font-semibold tracking-tight">
            {t.results.heading}
          </h2>
          {done.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {t.results.summary(done.length, formatBytes(totalBefore), formatBytes(totalAfter))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {done.length > 1 && (
            <Button onClick={() => void zipAll()} disabled={zipProgress !== null} data-testid="download-zip">
              {zipProgress !== null ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.results.zipping(Math.round(zipProgress * 100))}
                </>
              ) : (
                <>
                  <Archive className="size-4" aria-hidden /> {t.results.zip}
                </>
              )}
            </Button>
          )}
          <Button variant="ghost" onClick={onClearFinished} data-testid="clear-finished">
            {t.results.clearFinished}
          </Button>
        </div>
      </div>
      {zipError && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {t.results.zipError(zipError)}
        </p>
      )}
      <ul className="space-y-2">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onCancel={() => onCancel(job.id)} onRemove={() => onRemove(job.id)} />
        ))}
      </ul>
    </section>
  );
}
