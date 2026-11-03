"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export default function NotFound() {
  const { t, locale } = useI18n();
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">{t.notFound.title}</h1>
      <p className="text-muted-foreground">{t.notFound.text}</p>
      <Link
        href={`/${locale}`}
        className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover"
      >
        {t.notFound.back}
      </Link>
    </div>
  );
}
