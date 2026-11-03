import { Coffee } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

export function DonateButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <a
      href={siteConfig.kofiUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-kofi px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-kofi-hover",
        className,
      )}
      aria-label="Buy Me a Coffee – SnapMedia auf Ko-fi unterstützen"
    >
      <Coffee className="size-4" aria-hidden />
      {compact ? (
        <span>Ko-fi</span>
      ) : (
        <span>
          <span aria-hidden>☕ </span>Buy Me a Coffee<span className="hidden sm:inline"> / Support on Ko-fi</span>
        </span>
      )}
    </a>
  );
}
