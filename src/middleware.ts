import { NextResponse, type NextRequest } from "next/server";
import { GERMAN_SPEAKING_COUNTRIES, LOCALE_COOKIE, defaultLocale, isLocale, locales, type Locale } from "./i18n/config";

/** Parses an Accept-Language header into primary language codes, ordered by preference. */
function preferredLanguages(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((entry) => entry.lang && entry.lang !== "*" && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.lang);
}

/**
 * Language detection, in this order:
 * 1. an explicit choice from the language toggle (cookie),
 * 2. the browser language (German first → German, English first → English),
 * 3. the visitor's country as a hint (Vercel sets `x-vercel-ip-country`): visitors from
 *    Germany, Austria, Switzerland, Liechtenstein or Luxembourg get German if their browser
 *    accepts German at all – or if it names no supported language,
 * 4. English.
 * No external service is contacted; the country header is added by the hosting platform.
 */
export function detectLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;

  const languages = preferredLanguages(request.headers.get("accept-language"));
  const firstSupported = languages.find((lang) => isLocale(lang));
  const country = (request.headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  const germanSpeakingCountry = GERMAN_SPEAKING_COUNTRIES.includes(country);

  if (firstSupported === "de") return "de";
  if (germanSpeakingCountry && (languages.includes("de") || !firstSupported)) return "de";
  if (firstSupported === "en") return "en";
  return defaultLocale;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (hasLocale) return NextResponse.next();

  // Paths without a language prefix (e.g. "/") redirect to the detected language. The redirect itself is never
  // cached, while /en and /de stay fully cacheable static pages – safe behind any CDN.
  const locale = detectLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}

export const config = {
  // Skip Next.js internals, the WebAssembly engines and every file with an extension.
  matcher: ["/((?!_next/|ffmpeg/|vendor/|.*\\..*).*)"],
};
