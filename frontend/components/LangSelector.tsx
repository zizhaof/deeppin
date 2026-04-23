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
        // 手机视口下整体收紧：图标 + 单字符语言代号显示，不显示完整名
        // Mobile (< md): tighter shell + just the locale code (no full name)
        "relative inline-flex items-center gap-1 md:gap-1.5 pl-1.5 md:pl-2.5 pr-5 md:pr-7 h-[26px] md:h-[30px] rounded-md transition-colors flex-shrink-0"
      }
      style={!className ? { border: "1px solid var(--rule)", color: "var(--ink-3)" } : undefined}
      onMouseEnter={(e) => { if (!className) { (e.currentTarget as HTMLElement).style.borderColor = "var(--ink-5)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; } }}
      onMouseLeave={(e) => { if (!className) { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule)"; (e.currentTarget as HTMLElement).style.color = "var(--ink-3)"; } }}
    >
      {/* 地球仪图标 / Globe icon — signals "language" at a glance */}
      <svg
        className="w-3 md:w-3.5 h-3 md:h-3.5 flex-shrink-0 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>

      {/* 桌面：原生 select 显示完整语言名（"English", "中文"）
          手机：原生 select 透明覆盖，外面叠一个 mono 大写 lang code（"EN", "ZH"）
          —— 点开仍是 native dropdown，全名照显示。
          Desktop shows the native select with full names; mobile overlays a
          short mono code on top of an invisible select so the picker still
          opens with full names but the collapsed label fits the topbar. */}
      <span
        aria-hidden
        className="md:hidden font-mono text-[10px] uppercase tracking-wider pointer-events-none"
      >
        {lang}
      </span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label="Language"
        className="hidden md:inline-flex font-mono text-[11px] bg-transparent appearance-none cursor-pointer focus:outline-none pr-1 uppercase"
        style={{ color: "currentColor" }}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} style={{ background: "var(--card)", color: "var(--ink)" }}>
            {LOCALE_DISPLAY_NAMES[l]}
          </option>
        ))}
      </select>
      {/* 手机端：透明 native select 覆盖整个 wrapper，撑开点击区 */}
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label="Language"
        className="md:hidden absolute inset-0 opacity-0 cursor-pointer"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} style={{ background: "var(--card)", color: "var(--ink)" }}>
            {LOCALE_DISPLAY_NAMES[l]}
          </option>
        ))}
      </select>

      {/* 自定义下拉箭头 / Custom chevron */}
      <svg
        className="absolute right-2 w-3 h-3 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}
