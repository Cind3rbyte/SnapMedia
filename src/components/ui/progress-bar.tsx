import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0…1, or null for an indeterminate bar. */
  value: number | null;
  label: string;
  tone?: "primary" | "success" | "danger";
  className?: string;
}

const TONES = {
  primary: "bg-primary",
  success: "bg-success",
  danger: "bg-danger",
};

export function ProgressBar({ value, label, tone = "primary", className }: ProgressBarProps) {
  const percent = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          TONES[tone],
          percent === null && "progress-indeterminate w-full opacity-70",
        )}
        style={percent === null ? undefined : { width: `${Math.max(percent, 2)}%` }}
      />
    </div>
  );
}
