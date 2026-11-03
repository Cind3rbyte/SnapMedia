import { defaultLocale, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

/**
 * Active UI language for code that runs outside React (media tasks, engine, formatting helpers).
 * The I18nProvider keeps it in sync with the language the user sees.
 */
let activeLocale: Locale = defaultLocale;

export function setActiveLocale(locale: Locale) {
  activeLocale = locale;
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

/** Messages of the active language. */
export function msg(): Dictionary {
  return dictionaries[activeLocale];
}
