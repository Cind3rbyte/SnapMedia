import { RefreshCw, Scissors, ShieldCheck, Shrink, type LucideIcon } from "lucide-react";
import type { ToolId } from "@/lib/file-types";

export const TOOL_ORDER: ToolId[] = ["compress", "convert", "trim", "privacy"];

export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  compress: Shrink,
  convert: RefreshCw,
  trim: Scissors,
  privacy: ShieldCheck,
};
