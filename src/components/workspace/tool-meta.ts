import { RefreshCw, Scissors, ShieldCheck, Shrink, type LucideIcon } from "lucide-react";
import type { ToolId } from "@/lib/file-types";

export const TOOL_ORDER: ToolId[] = ["compress", "convert", "trim", "privacy"];

export const TOOL_META: Record<ToolId, { label: string; description: string; icon: LucideIcon }> = {
  compress: {
    label: "Komprimieren",
    description: "Für Discord, E-Mail & Web verkleinern",
    icon: Shrink,
  },
  convert: {
    label: "Konvertieren",
    description: "HEIC/WebP/SVG → JPG/PNG · Video → MP3/AAC",
    icon: RefreshCw,
  },
  trim: {
    label: "Schneiden",
    description: "Video & Audio sekundengenau kürzen",
    icon: Scissors,
  },
  privacy: {
    label: "Privatsphäre",
    description: "GPS-, Kamera- & Gerätedaten entfernen",
    icon: ShieldCheck,
  },
};
