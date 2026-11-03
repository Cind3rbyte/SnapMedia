"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";

const ORDER = ["system", "light", "dark"] as const;
type ThemeName = (typeof ORDER)[number];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (mounted && ORDER.includes(theme as ThemeName) ? theme : "system") as ThemeName;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground"
      aria-label={t.theme.aria(t.theme[current], t.theme[next])}
      title={t.theme.title(t.theme[current])}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
