"use client";
// components/LangSelector.tsx — 语言下拉选择器
// Language dropdown selector.
//
// 直接读写 useLangStore，无需 props；任何布局需要切语言，插一个本组件即可。
// Reads/writes useLangStore directly; drop this component wherever a language
// switcher is needed, no props required.

import { useLangStore } from "@/stores/useLangStore";
import {
  LOCALE_DISPLAY_NAMES,
  SUPPORTED_LOCALES,
  type Lang,
} from "@/lib/i18n";

interface Props {
  /** 可覆盖外层 wrapper 样式；默认是醒目的 indigo 着色按钮
   *  Override wrapper styles; default is a prominent indigo-tinted pill. */
  className?: string;
}

export default function LangSelector({ className }: Props) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);

  return (
    <div
      className={
        className ??
        "relative inline-flex items-center gap-1.5 pl-2 pr-6 py-1 rounded-lg border border-indigo-500/40 hover:border-indigo-400/70 bg-indigo-500/10 hover:bg-indigo-500/15 transition-colors flex-shrink-0"
      }
    >
      {/* 地球仪图标 / Globe icon — signals "language" at a glance */}
      <svg
        className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>

      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label="Language"
        className="text-[11px] font-medium text-indigo-200 bg-transparent appearance-none cursor-pointer focus:outline-none pr-1"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} className="bg-surface text-md">
            {LOCALE_DISPLAY_NAMES[l]}
          </option>
        ))}
      </select>

      {/* 自定义下拉箭头 / Custom chevron (native arrow is hidden via appearance-none) */}
      <svg
        className="absolute right-1.5 w-3 h-3 text-indigo-400 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}
