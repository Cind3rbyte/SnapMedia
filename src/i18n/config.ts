export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Cookie that remembers an explicit language choice (set by the language toggle). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Countries where German is an official language – used as a hint for automatic detection. */
export const GERMAN_SPEAKING_COUNTRIES = ["DE", "AT", "CH", "LI", "LU"];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
