"use client";

import { Check, CloudOff, Cpu, RefreshCw, Scissors, ShieldCheck, Shrink, X, Zap } from "lucide-react";
import { MediaWorkspace } from "@/components/workspace/media-workspace";
import { useI18n } from "@/i18n/provider";

const TOOL_ICONS = [Shrink, RefreshCw, Scissors, ShieldCheck];
const POINT_ICONS = [CloudOff, Cpu, Zap];

function Cell({ value, yes, no }: { value: string | boolean; yes: string; no: string }) {
  if (value === true) return <Check className="mx-auto size-4 text-success" aria-label={yes} />;
  if (value === false) return <X className="mx-auto size-4 text-muted-foreground" aria-label={no} />;
  return <span className="text-xs">{value}</span>;
}

export function HomePage() {
  const { t } = useI18n();
  const { comparison } = t.home;

  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
        <section className="mx-auto max-w-3xl space-y-5 text-center">
          <p
            className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-soft px-4 py-1.5 text-sm font-medium text-success"
            data-testid="privacy-badge"
          >
            {t.hero.badge}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {t.hero.title}{" "}
            <span className="bg-gradient-to-r from-violet-600 to-pink-500 bg-clip-text text-transparent dark:from-violet-400 dark:to-pink-400">
              {t.hero.titleAccent}
            </span>
          </h1>
          <p className="text-lg text-pretty text-muted-foreground">{t.hero.subtitle}</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {t.hero.points.map((point, index) => {
              const Icon = POINT_ICONS[index] ?? Zap;
              return (
                <li key={point} className="inline-flex items-center gap-1.5">
                  <Icon className="size-4 text-primary" aria-hidden /> {point}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="mt-10">
          <MediaWorkspace />
        </div>

        <section className="mt-20 space-y-6" aria-labelledby="tools-heading">
          <div className="space-y-2 text-center">
            <h2 id="tools-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t.home.toolsTitle}
            </h2>
            <p className="text-muted-foreground">{t.home.toolsSubtitle}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {t.home.tools.map((tool, index) => {
              const Icon = TOOL_ICONS[index] ?? Shrink;
              return (
                <article key={tool.title} className="card-surface space-y-3 rounded-2xl p-5">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="font-semibold">{tool.title}</h3>
                  <p className="text-sm text-muted-foreground">{tool.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="privacy" className="mt-20 scroll-mt-24 space-y-6" aria-labelledby="privacy-heading">
          <div className="space-y-2 text-center">
            <h2 id="privacy-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t.home.privacyTitle}
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">{t.home.privacySubtitle}</p>
          </div>
          <div className="card-surface overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">{comparison.caption}</caption>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    {comparison.feature}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-semibold text-primary">
                    SnapMedia
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">
                    {comparison.others}
                    <span className="block text-xs font-normal text-muted-foreground">{comparison.othersExamples}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      {row.label}
                    </th>
                    <td className="px-4 py-3 text-center">
                      <Cell value={row.snap} yes={comparison.yes} no={comparison.no} />
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      <Cell value={row.others} yes={comparison.yes} no={comparison.no} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-3xl space-y-4" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            {t.home.faqTitle}
          </h2>
          <div className="space-y-2">
            {t.home.faq.map((entry) => (
              <details key={entry.q} className="card-surface group rounded-xl px-5 py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {entry.q}
                    <span className="text-muted-foreground transition group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{entry.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
