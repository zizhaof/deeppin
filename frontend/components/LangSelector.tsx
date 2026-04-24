"use client";
// Language dropdown selector.
//
// Reads/writes useLangStore directly; drop this component wherever a language
// switcher is needed, no props required.

import { useLangStore } from "@/stores/useLangStore";
import {
  LOCALE_DISPLAY_NAMES,
  SUPPORTED_LOCALES,
  type Lang,
} from "@/lib/i18n";

interface Props {
  /** Override wrapper styles; default is a prominent indigo-tinted pill. */
  className?: string;
}

export default function LangSelector({ className }: Props) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);

  return (
    <div
      className={
        className ??
        // Mobile (< md): tighter shell + just the locale code (no full name).
        "relative inline-flex items-center gap-1 md:gap-1.5 pl-1.5 md:pl-2.5 pr-5 md:pr-7 h-[26px] md:h-[30px] rounded-md transition-colors flex-shrink-0"
      }
      style={!className ? { border: "1px solid var(--rule)", color: "var(--ink-3)" } : undefined}
      onMouseEnter={(e) => { if (!className) { (e.currentTarget as HTMLElement).style.borderColor = "var(--ink-5)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; } }}
      onMouseLeave={(e) => { if (!className) { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule)"; (e.currentTarget as HTMLElement).style.color = "var(--ink-3)"; } }}
    >
      {/* Globe icon — signals "language" at a glance. */}
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

      {/* Desktop shows the native select with full language names; mobile
          overlays a short mono uppercase code (e.g. "EN", "ZH") on top of an
          invisible select so the dropdown still opens with full names but the
          collapsed label fits the topbar. */}
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
      {/* Mobile: a transparent native select covers the wrapper to expand the tap target. */}
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

      {/* Custom chevron. */}
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
