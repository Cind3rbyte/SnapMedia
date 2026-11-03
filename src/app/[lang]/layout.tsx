import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { siteConfig } from "@/lib/site-config";
import "../globals.css";

type LayoutParams = { params: Promise<{ lang: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutParams): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  return {
    metadataBase: new URL(siteConfig.url),
    title: { default: t.meta.title, template: `%s · ${siteConfig.name}` },
    description: t.meta.description,
    applicationName: siteConfig.name,
    keywords: t.meta.keywords,
    authors: [{ name: "SnapMedia Contributors", url: siteConfig.githubUrl }],
    alternates: {
      canonical: `/${lang}`,
      languages: { en: "/en", de: "/de", "x-default": "/" },
    },
    openGraph: {
      type: "website",
      locale: t.meta.ogLocale,
      url: `${siteConfig.url}/${lang}`,
      siteName: siteConfig.name,
      title: t.meta.ogTitle,
      description: t.meta.description,
    },
    twitter: { card: "summary", title: t.meta.ogTitle, description: t.meta.description },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0b12" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children, params }: Readonly<LayoutParams & { children: React.ReactNode }>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <I18nProvider initialLocale={lang}>
            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </div>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
