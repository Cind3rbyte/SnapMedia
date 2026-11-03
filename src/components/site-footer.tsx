import { Heart, ShieldCheck } from "lucide-react";
import { GithubIcon, LogoMark } from "@/components/brand-icons";
import { DonateButton } from "@/components/donate-button";
import { siteConfig } from "@/lib/site-config";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-card/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 font-semibold">
            <LogoMark className="size-7" />
            {siteConfig.name}
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Kostenlose, quelloffene Medien-Toolbox. Alle Berechnungen laufen per WebAssembly direkt in deinem Browser –
            keine Uploads, keine Konten, kein Tracking.
          </p>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-success">
            <ShieldCheck className="size-4" aria-hidden />
            Deine Dateien verlassen niemals dein Gerät.
          </p>
        </div>
        <div className="space-y-4 md:justify-self-end">
          <p className="text-sm text-muted-foreground">
            Gefällt dir SnapMedia? Ein Kaffee hält das Projekt werbefrei:
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <DonateButton />
            <a
              href={siteConfig.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:bg-muted"
            >
              <GithubIcon className="size-4" />
              Star auf GitHub
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {siteConfig.name} · Open Source unter MIT-Lizenz ·{" "}
            <a
              href={`${siteConfig.githubUrl}#-lizenzen`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              Drittanbieter-Lizenzen (u. a. FFmpeg, GPL-2.0)
            </a>
          </p>
          <p className="inline-flex items-center gap-1">
            Gebaut mit <Heart className="size-3 fill-current text-kofi" aria-label="Liebe" /> , FFmpeg.wasm & Next.js
          </p>
        </div>
      </div>
    </footer>
  );
}
