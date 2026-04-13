// stores/useLangStore.ts — 语言状态，持久化到 localStorage

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { translations, type Lang, type T } from "@/lib/i18n";

interface LangState {
  lang: Lang;
  toggle: () => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: "zh" as Lang,
      toggle: () => set((s) => ({ lang: s.lang === "zh" ? "en" : "zh" })),
    }),
    { name: "deeppin:lang" }
  )
);

/** 在组件内调用，返回当前语言的翻译对象 */
export function useT(): T {
  const lang = useLangStore((s) => s.lang);
  return translations[lang];
}
