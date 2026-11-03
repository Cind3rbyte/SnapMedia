"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALE_COOKIE, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";
import { setActiveLocale } from "./runtime";

interface I18nContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Provides the UI language. Switching happens in place (no reload), so dropped files and
 * running jobs survive a language change; the URL and a cookie are updated for the next visit.
 */
export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Media tasks run outside React and read the language from the runtime module.
  if (typeof window !== "undefined") setActiveLocale(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = dictionaries[locale].meta.title;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setActiveLocale(next);
    setLocaleState(next);
    const url = new URL(window.location.href);
    url.pathname = `/${next}`;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const value = useMemo(() => ({ locale, t: dictionaries[locale], setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>.");
  return context;
}
