export const siteConfig = {
  name: "SnapMedia",
  tagline: "Medien komprimieren, konvertieren & schneiden – 100% lokal im Browser.",
  description:
    "Kostenlose, private Alternative zu Convertio, Ezgif und CloudConvert: Videos und Bilder für Discord & E-Mail komprimieren, HEIC/WebP/SVG konvertieren, Videos schneiden und EXIF-/GPS-Daten entfernen – ohne Upload, alles läuft per WebAssembly auf deinem Gerät.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://snapmedia.vercel.app",
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/Cind3rbyte/SnapMedia",
  kofiUrl: process.env.NEXT_PUBLIC_KOFI_URL ?? "https://ko-fi.com/cind3rbyte",
} as const;
