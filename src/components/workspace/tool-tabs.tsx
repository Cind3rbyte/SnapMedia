"use client";

import { useI18n } from "@/i18n/provider";
import type { ToolId } from "@/lib/file-types";
import { cn } from "@/lib/utils";
import { TOOL_ICONS, TOOL_ORDER } from "./tool-meta";

interface ToolTabsProps {
  available: Record<ToolId, number>;
  active: ToolId | null;
  onSelect: (tool: ToolId) => void;
}

export function ToolTabs({ available, active, onSelect }: ToolTabsProps) {
  const { t } = useI18n();
  const tools = TOOL_ORDER.filter((tool) => available[tool] > 0);
  return (
    <div role="tablist" aria-label={t.tools.tablist} className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {tools.map((tool) => {
        const meta = t.tools[tool];
        const Icon = TOOL_ICONS[tool];
        const selected = tool === active;
        return (
          <button
            key={tool}
            type="button"
            role="tab"
            id={`tab-${tool}`}
            aria-selected={selected}
            aria-controls={`panel-${tool}`}
            onClick={() => onSelect(tool)}
            data-testid={`tool-${tool}`}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition",
              selected
                ? "border-primary bg-primary-soft/70 shadow-sm"
                : "border-border bg-card hover:border-primary/50 hover:bg-primary-soft/25",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {meta.label}
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
                  {available[tool]}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{meta.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
