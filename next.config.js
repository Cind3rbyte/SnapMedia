// @ts-check

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy: enforces the privacy promise at browser level.
 * `connect-src 'self' blob: data:` means the page cannot send data to any other
 * server – even if a dependency tried to, the browser would block the request.
 *
 * - 'wasm-unsafe-eval' / 'unsafe-eval': required to compile FFmpeg and libheif (WebAssembly + embind).
 * - blob: for the FFmpeg core and the Web Workers created from Blob URLs.
 * - 'unsafe-inline' for scripts: required by the inline hydration scripts of the Next.js App Router.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join("; ");

/**
 * Cross-Origin isolation (COOP + COEP) unlocks SharedArrayBuffer,
 * which the multi-threaded FFmpeg WebAssembly core needs for its thread pool.
 */
const isolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // In development the CSP is skipped so that React Refresh / HMR keep working without friction.
  ...(isDev ? [] : [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...isolationHeaders, ...securityHeaders],
      },
      {
        // The WebAssembly engines are large (~32 MB) – let browsers cache them for a day
        // and revalidate in the background afterwards.
        source: "/ffmpeg/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/vendor/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
  webpack(config) {
    // @ffmpeg/ffmpeg contains a fallback `import(coreURL)` for module workers that webpack
    // cannot (and does not need to) resolve statically. We always load the UMD core via
    // importScripts, so the "request of a dependency is an expression" warning is noise.
    config.module.parser = {
      ...config.module.parser,
      javascript: {
        ...(config.module.parser?.javascript ?? {}),
        exprContextCritical: false,
      },
    };
    return config;
  },
};

module.exports = nextConfig;
