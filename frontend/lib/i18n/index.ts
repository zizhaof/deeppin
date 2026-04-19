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
