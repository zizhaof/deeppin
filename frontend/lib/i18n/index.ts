// lib/i18n/index.ts — barrel，聚合导出所有 i18n 模块
// Barrel export for the i18n module.
//
// 外部消费者保持 `import { ... } from "@/lib/i18n"` 的路径不变
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

// 后端 SSE status 文本目前是 "中文 / English" 双语合并字符串(看
// backend/services/stream_manager.py)。前端按当前 locale 挑一半显示,
// 中文用左半,其他 8 种 locale 用英文(更通用)。
// Backend SSE status messages currently ship as "中文 / English" bilingual
// strings. Pick the half that matches the active locale: zh → left, all
// other locales → right (English is the most universal fallback).
import type { Lang } from "./locales";
export function localizeStatusText(text: string, lang: Lang): string {
  if (!text) return text;
  // 兼容 "中文… / English…" 和 "中文 / English (with parens)" 两种形式
  // 只在恰好 1 次 " / " 分隔且左右都不空时才裁剪,其他情况原样返回。
  const parts = text.split(" / ");
  if (parts.length !== 2) return text;
  const [left, right] = parts;
  if (!left.trim() || !right.trim()) return text;
  return lang === "zh" ? left : right;
}
