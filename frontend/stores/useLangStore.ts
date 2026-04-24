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
      // Default en. The inline script in app/layout.tsx primes localStorage from
      // navigator.languages on first visit, so hydration picks up the browser lang.
      lang: "en" as Lang,
      setLang: (lang) => set({ lang }),
    }),
    { name: "deeppin:lang" },
  ),
);

/** Component hook returning the current locale's translations with en fallback for missing keys. */
export function useT(): T {
  const lang = useLangStore((s) => s.lang);
  // Spread en first, then override with current locale: missing keys fall back to English
  // instead of displaying undefined.
  return { ...translations.en, ...translations[lang] };
}
