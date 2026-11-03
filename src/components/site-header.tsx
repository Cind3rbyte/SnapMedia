import Link from "next/link";
import { GithubIcon, LogoMark } from "@/components/brand-icons";
import { DonateButton } from "@/components/donate-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { siteConfig } from "@/lib/site-config";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="SnapMedia Startseite">
          <LogoMark className="size-8" />
          <span className="text-lg">{siteConfig.name}</span>
        </Link>
        <span className="hidden rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success md:inline-flex">
          🔒 100% lokal
        </span>
        <nav className="ml-auto flex items-center gap-2" aria-label="Hauptnavigation">
          <a
            href="#werkzeuge"
            className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground lg:inline-flex"
          >
            Werkzeuge
          </a>
          <a
            href="#datenschutz"
            className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground lg:inline-flex"
          >
            Datenschutz
          </a>
          <a
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground sm:w-auto sm:gap-2 sm:px-3"
            aria-label="Quellcode auf GitHub"
          >
            <GithubIcon className="size-4" />
            <span className="hidden text-sm sm:inline">GitHub</span>
          </a>
          <ThemeToggle />
          <DonateButton className="hidden sm:inline-flex" />
          <DonateButton compact className="sm:hidden" />
        </nav>
      </div>
    </header>
  );
}
