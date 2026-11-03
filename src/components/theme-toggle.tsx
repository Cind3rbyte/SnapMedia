"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const ORDER = ["system", "light", "dark"] as const;
const LABELS: Record<(typeof ORDER)[number], string> = {
  system: "Systemeinstellung",
  light: "Hell",
  dark: "Dunkel",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (mounted && ORDER.includes(theme as (typeof ORDER)[number]) ? theme : "system") as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground"
      aria-label={`Farbschema: ${LABELS[current]} – wechseln zu ${LABELS[next]}`}
      title={`Farbschema: ${LABELS[current]}`}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
