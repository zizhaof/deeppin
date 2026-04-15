"use client";
// components/ThemeToggle.tsx — 日间/夜间模式手动切换按钮

import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

export default function ThemeToggle() {
  const { theme, toggle } = useThemeStore();

  // 将主题状态同步到 html element 的 class
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme !== "system") root.classList.add(theme);
  }, [theme]);

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <button
      onClick={toggle}
      className="w-7 h-7 flex items-center justify-center rounded-lg border border-subtle hover:border-base hover:bg-glass transition-all cursor-pointer"
      title={isDark ? "切换到亮色模式" : "切换到暗色模式"}
    >
      {isDark ? (
        /* 太阳图标 — 当前暗色，点击切换到亮色 */
        <svg
          className="w-3.5 h-3.5 text-faint hover:text-md"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        /* 月亮图标 — 当前亮色，点击切换到暗色 */
        <svg
          className="w-3.5 h-3.5 text-faint hover:text-md"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      )}
    </button>
  );
}
