// stores/useThemeStore.ts — 主题状态，持久化到 localStorage

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** light ↔ dark 循环切换（跳过 system） */
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system" as Theme,
      setTheme: (theme) => set({ theme }),
      toggle: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    { name: "deeppin:theme" }
  )
);
