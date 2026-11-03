"use client";

import { Coffee } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

export function DonateButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <a
      href={siteConfig.kofiUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-kofi px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-kofi-hover",
        className,
      )}
      aria-label={t.donate.aria}
      data-testid={compact ? "donate-compact" : "donate"}
    >
      <Coffee className="size-4" aria-hidden />
      {compact ? (
        <span>{t.donate.short}</span>
      ) : (
        <span>
          <span aria-hidden>☕ </span>
          {t.donate.label}
          <span className="hidden sm:inline">{t.donate.labelSuffix}</span>
        </span>
      )}
    </a>
  );
}
