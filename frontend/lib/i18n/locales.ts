// lib/i18n/locales.ts — 支持的 locale 清单 + display name
// Supported locales + their display names.
//
// 加新语言的步骤 / To add a new language:
//   1. 新建 lib/i18n/<code>.ts，导出 `export const <code>: T = {...}`
//   2. 在此文件下方 import 并加进 `translations` 和 `SUPPORTED_LOCALES`
//   3. 在 `LOCALE_DISPLAY_NAMES` 加 native 名称（用目标语言，不用翻译）
//   4. 可选：在 detect.ts 加 Unicode 脚本范围用于自动检测
//
//   1. Create lib/i18n/<code>.ts exporting `export const <code>: T = {...}`
//   2. Import it here and add to `translations` + `SUPPORTED_LOCALES`
//   3. Add its native name to `LOCALE_DISPLAY_NAMES`
//   4. Optional: add Unicode script range to detect.ts for auto-detection

import { en } from "./en";
import { zh } from "./zh";
import { ja } from "./ja";
import { ko } from "./ko";
import { es } from "./es";
import { fr } from "./fr";
import { de } from "./de";
import { pt } from "./pt";
import { ru } from "./ru";

export const translations = { en, zh, ja, ko, es, fr, de, pt, ru } as const;

export type Lang = keyof typeof translations;

export const SUPPORTED_LOCALES: readonly Lang[] = [
  "en",
  "zh",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt",
  "ru",
] as const;

/** 每种语言用它自己的文字显示名，便于用户识别 / Each locale's name written in its own script */
export const LOCALE_DISPLAY_NAMES: Record<Lang, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ru: "Русский",
};
