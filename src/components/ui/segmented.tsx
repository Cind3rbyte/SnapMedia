"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/** Accessible radio group rendered as a segmented control. */
export function Segmented<T extends string>({ label, value, options, onChange, className }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex min-w-0 flex-1 cursor-pointer flex-col items-center rounded-lg px-3 py-1.5 text-center text-sm transition",
                active ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                option.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="truncate">{option.label}</span>
              {option.hint && <span className="truncate text-[11px] text-muted-foreground">{option.hint}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
