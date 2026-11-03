"use client";

import Link from "next/link";
import { GithubIcon, LogoMark } from "@/components/brand-icons";
import { DonateButton } from "@/components/donate-button";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useI18n } from "@/i18n/provider";
import { siteConfig } from "@/lib/site-config";

export function SiteHeader() {
  const { t, locale } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label={t.header.homeAria}>
          <LogoMark className="size-8" />
          <span className="hidden text-lg min-[360px]:inline">{siteConfig.name}</span>
        </Link>
        <span className="hidden rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success md:inline-flex">
          {t.header.localBadge}
        </span>
        <nav className="ml-auto flex items-center gap-1.5 sm:gap-2" aria-label={t.header.nav}>
          <a href="#tools" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground lg:inline-flex">
            {t.header.tools}
          </a>
          <a href="#privacy" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground lg:inline-flex">
            {t.header.privacy}
          </a>
          <a
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground min-[420px]:inline-flex sm:w-auto sm:gap-2 sm:px-3"
            aria-label={t.header.githubAria}
            data-testid="github-link"
          >
            <GithubIcon className="size-4" />
            <span className="hidden text-sm sm:inline">GitHub</span>
          </a>
          <LanguageToggle />
          <ThemeToggle />
          <DonateButton className="hidden sm:inline-flex" />
          <DonateButton compact className="sm:hidden" />
        </nav>
      </div>
    </header>
  );
}
