// stores/useLangStore.ts — 语言状态，持久化到 localStorage
// Language state, persisted to localStorage.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { translations, type Lang, type T } from "@/lib/i18n";

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      // 默认 en；首屏前的 inline script（见 app/layout.tsx）会在无存储值时
      // 根据 navigator.languages 预填 localStorage，zustand 水合后即为浏览器语言。
      // Default en. The inline script in app/layout.tsx primes localStorage from
      // navigator.languages on first visit, so hydration picks up the browser lang.
      lang: "en" as Lang,
      setLang: (lang) => set({ lang }),
    }),
    { name: "deeppin:lang" },
  ),
);

/** 组件内调用，返回当前语言的翻译对象；缺 key 自动回退 en */
/** Component hook returning the current locale's translations with en fallback for missing keys. */
export function useT(): T {
  const lang = useLangStore((s) => s.lang);
  // 展开 en 再覆盖当前 locale：缺翻译的 key 会回退到英文而非显示 undefined
  // Spread en first, then override with current locale: missing keys fall back to English
  // instead of displaying undefined.
  return { ...translations.en, ...translations[lang] };
}
