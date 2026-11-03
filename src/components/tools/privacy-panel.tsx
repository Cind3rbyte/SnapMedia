"use client";

import { Calendar, LoaderCircle, MapPin, ShieldCheck, Smartphone, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/field";
import { useI18n } from "@/i18n/provider";
import type { ImageMetadataReport } from "@/lib/image/metadata";
import { inspectImage } from "@/lib/image/tasks";
import { cn } from "@/lib/utils";
import type { InputItem } from "../workspace/types";
import type { PrivacySettings } from "./settings";

interface PrivacyPanelProps {
  items: InputItem[];
  settings: PrivacySettings;
  onChange: (settings: PrivacySettings) => void;
  onStart: () => void;
}

type ScanState = Record<string, ImageMetadataReport | "loading" | "error">;

function Badge({ active, icon: Icon, label, danger }: { active: boolean; icon: typeof MapPin; label: string; danger?: boolean }) {
  if (!active) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        danger ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

export function PrivacyPanel({ items, settings, onChange, onStart }: PrivacyPanelProps) {
  const { t } = useI18n();
  const [scans, setScans] = useState<ScanState>({});
  const images = items.filter((item) => item.type.kind === "image");
  const media = items.filter((item) => item.type.kind !== "image");

  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Scan images in the worker right away so users see what would be shared.
  useEffect(() => {
    for (const item of images) {
      if (requested.current.has(item.id)) continue;
      requested.current.add(item.id);
      setScans((current) => ({ ...current, [item.id]: "loading" }));
      inspectImage(item.file, item.type)
        .then((report) => mounted.current && setScans((current) => ({ ...current, [item.id]: report })))
        .catch(() => mounted.current && setScans((current) => ({ ...current, [item.id]: "error" })));
    }
  }, [images]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {t.privacy.intro.map(([text, bold], index) =>
          bold ? (
            <strong key={index} className="text-foreground">
              {text}
            </strong>
          ) : (
            <span key={index}>{text}</span>
          ),
        )}
      </p>

      {images.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card" data-testid="privacy-scan">
          {images.map((item) => {
            const scan = scans[item.id];
            const report = typeof scan === "object" ? scan : null;
            const device = report?.findings.some((f) => f.category === "device") ?? false;
            const date = report?.findings.some((f) => f.category === "datetime") ?? false;
            const author = report?.findings.some((f) => f.category === "author") ?? false;
            const clean = report && report.findings.length === 0 && !report.hasXmp;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate" title={item.file.name}>
                  {item.file.name}
                </span>
                {scan === "loading" && (
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label={t.privacy.checking} data-testid="scan-loading" />
                )}
                {scan === "error" && <span className="text-xs text-muted-foreground">{t.privacy.unreadable}</span>}
                {report && (
                  <span className="flex flex-wrap gap-1">
                    <Badge active={report.hasGps} icon={MapPin} label={t.privacy.location} danger />
                    <Badge active={device} icon={Smartphone} label={t.privacy.device} />
                    <Badge active={date} icon={Calendar} label={t.privacy.date} />
                    <Badge active={author} icon={User} label={t.privacy.person} />
                    {clean && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">
                        <ShieldCheck className="size-3" aria-hidden /> {t.privacy.clean}
                      </span>
                    )}
                    {!clean && !report.hasGps && !device && !date && !author && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {t.privacy.entries(report.findings.length || 1)}
                      </span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {media.length > 0 && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t.privacy.media(media.length)}</p>}

      <CheckboxField
        label={t.privacy.keepIcc}
        description={t.privacy.keepIccHint}
        checked={settings.keepIcc}
        onChange={(keepIcc) => onChange({ ...settings, keepIcc })}
      />

      <Button size="lg" className="w-full sm:w-auto" onClick={onStart} data-testid="start-privacy">
        <ShieldCheck className="size-5" aria-hidden />
        {t.privacy.start(items.length)}
      </Button>
    </div>
  );
}
