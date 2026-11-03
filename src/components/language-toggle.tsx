"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/i18n/provider";

/** Switches between English and German in place – files and running jobs are kept. */
export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const next = locale === "en" ? "de" : "en";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
      aria-label={t.language.switchAria}
      title={t.language.switchName}
      lang={next}
      data-testid="language-toggle"
    >
      <Languages className="hidden size-4 sm:block" aria-hidden />
      {t.language.switchShort}
    </button>
  );
}
