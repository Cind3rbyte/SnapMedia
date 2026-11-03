import type { Locale } from "../config";
import { de } from "./de";
import { en, type Dictionary } from "./en";

export type { Dictionary };

export const dictionaries: Record<Locale, Dictionary> = { en, de };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
