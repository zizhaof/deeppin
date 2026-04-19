// lib/i18n/detect.ts — 语言检测工具
// Language detection utilities.

import type { Lang } from "./locales";
import { SUPPORTED_LOCALES } from "./locales";

/**
 * 基于 Unicode 脚本启发式检测文本语言，仅在支持的 locale 范围内返回。
 * Heuristic text-language detection via Unicode script, returning only a supported locale.
 *
 * 不在支持列表的语言（或无法识别）→ 回退到 fallback（通常为 UI 当前 lang）
 * Languages outside the supported set (or unrecognized) → fallback (usually UI's current lang).
 */
export function detectLangFromText(text: string, fallback: Lang): Lang {
  if (!text) return fallback;
  // 日文优先检查：假名（Hiragana + Katakana）是日文独有，避免被下面的 CJK 统一汉字覆盖
  // Check Japanese first: kana (Hiragana + Katakana) is Japanese-exclusive, otherwise
  // shared CJK ideographs below would misclassify Japanese text as Chinese.
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
    return isSupported("ja") ? "ja" : fallback;
  }
  // CJK 统一汉字 → 中文
  // CJK unified ideographs → Chinese.
  if (/[\u4e00-\u9fff]/.test(text)) {
    return isSupported("zh") ? "zh" : fallback;
  }
  // 韩文谚文 → 韩文
  // Hangul → Korean.
  if (/[\uac00-\ud7af]/.test(text)) {
    return isSupported("ko") ? "ko" : fallback;
  }
  // 西里尔字母 → 俄文
  // Cyrillic → Russian.
  if (/[\u0400-\u04ff]/.test(text)) {
    return isSupported("ru") ? "ru" : fallback;
  }
  // 拉丁字母语言（es/fr/de/pt/en）仅靠 Unicode 脚本无法区分，直接用 fallback（UI lang）
  // Latin-script locales (es/fr/de/pt/en) are indistinguishable by script alone — use fallback.
  return fallback;
}

/**
 * 基于 navigator.languages 选最接近的支持 locale；失败时返回 fallback。
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
 * 把完整 Lang 收窄为双语内容可索引的语言；第三方 locale（ja 等）回落到 en。
 * Narrow a full Lang down to bilingual-content indexing keys; third locales fall back to en.
 *
 * 用途：articles/data.ts、demo CONTENT 字典等历史 bilingual 资产尚未扩展到多语种
 * Used by legacy bilingual assets (articles/data.ts, demo CONTENT dicts) that have not
 * yet been expanded to the full locale set.
 */
export type ContentLang = "zh" | "en";
export function narrowToContentLang(lang: Lang): ContentLang {
  return lang === "zh" ? "zh" : "en";
}
