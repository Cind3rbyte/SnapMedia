export const siteConfig = {
  name: "SnapMedia",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://snapmedia.vercel.app",
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/cind3rbyte/SnapMedia",
  kofiUrl: process.env.NEXT_PUBLIC_KOFI_URL ?? "https://ko-fi.com/cind3rbyte",
} as const;
