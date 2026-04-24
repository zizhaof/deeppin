// Language detection utilities.

import type { Lang } from "./locales";
import { SUPPORTED_LOCALES } from "./locales";

/**
 * Heuristic text-language detection via Unicode script, returning only a supported locale.
 *
 * Languages outside the supported set (or unrecognized) → fallback (usually UI's current lang).
 */
export function detectLangFromText(text: string, fallback: Lang): Lang {
  if (!text) return fallback;
  // Check Japanese first: kana (Hiragana + Katakana) is Japanese-exclusive, otherwise
  // shared CJK ideographs below would misclassify Japanese text as Chinese.
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
    return isSupported("ja") ? "ja" : fallback;
  }
  // CJK unified ideographs → Chinese.
  if (/[\u4e00-\u9fff]/.test(text)) {
    return isSupported("zh") ? "zh" : fallback;
  }
  // Hangul → Korean.
  if (/[\uac00-\ud7af]/.test(text)) {
    return isSupported("ko") ? "ko" : fallback;
  }
  // Cyrillic → Russian.
  if (/[\u0400-\u04ff]/.test(text)) {
    return isSupported("ru") ? "ru" : fallback;
  }
  // Latin-script locales (es/fr/de/pt/en) are indistinguishable by script alone — use fallback.
  return fallback;
}

/**
 * Pick the closest supported locale from navigator.languages; return fallback on miss.
 */
export function detectBrowserLang(fallback: Lang = "en"): Lang {
  if (typeof navigator === "undefined") return fallback;
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || ""];
  for (const pref of prefs) {
    if (!pref) continue;
    const code = pref.toLowerCase().split("-")[0];
    if (isSupported(code)) return code as Lang;
  }
  return fallback;
}

function isSupported(code: string): code is Lang {
  return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

/**
 * Narrow a full Lang down to bilingual-content indexing keys; third locales fall back to en.
 *
 * Used by legacy bilingual assets (articles/data.ts, demo CONTENT dicts) that have not
 * yet been expanded to the full locale set.
 */
export type ContentLang = "zh" | "en";
export function narrowToContentLang(lang: Lang): ContentLang {
  return lang === "zh" ? "zh" : "en";
}
