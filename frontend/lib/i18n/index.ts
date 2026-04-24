// Barrel export for the i18n module.
//
// External consumers keep importing from "@/lib/i18n" — unchanged.

export { en } from "./en";
export { zh } from "./zh";
export { ja } from "./ja";
export { ko } from "./ko";
export { es } from "./es";
export { fr } from "./fr";
export { de } from "./de";
export { pt } from "./pt";
export { ru } from "./ru";
export type { T } from "./en";

export {
  translations,
  SUPPORTED_LOCALES,
  LOCALE_DISPLAY_NAMES,
} from "./locales";
export type { Lang } from "./locales";

export {
  detectLangFromText,
  detectBrowserLang,
  narrowToContentLang,
} from "./detect";
export type { ContentLang } from "./detect";

// Backend SSE status messages currently ship as "Chinese / English" bilingual
// strings (see backend/services/stream_manager.py). Pick the half that matches
// the active locale: zh → left, all other locales → right (English is the most
// universal fallback).
import type { Lang } from "./locales";
export function localizeStatusText(text: string, lang: Lang): string {
  if (!text) return text;
  // Handles both "Chinese… / English…" and "Chinese / English (with parens)" forms.
  // Only splits when there is exactly one " / " separator and both halves are
  // non-empty; otherwise returns the original text unchanged.
  const parts = text.split(" / ");
  if (parts.length !== 2) return text;
  const [left, right] = parts;
  if (!left.trim() || !right.trim()) return text;
  return lang === "zh" ? left : right;
}
