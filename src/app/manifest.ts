import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} – Media toolbox without uploads`,
    short_name: siteConfig.name,
    description:
      "Compress, convert and trim videos and images and remove EXIF/GPS data – 100% locally in your browser, no upload.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0b12",
    theme_color: "#6d28d9",
    lang: "en",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
