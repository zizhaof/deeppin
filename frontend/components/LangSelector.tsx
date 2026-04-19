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
  className?: string;
}

export default function LangSelector({ className }: Props) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);

  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label="Language"
      className={
        className ??
        // 默认样式跟原 toggle 按钮视觉一致；appearance-none 去掉浏览器默认箭头
        // Default styling matches the old toggle button; appearance-none removes
        // the browser's native dropdown arrow.
        "text-[11px] font-medium text-faint hover:text-md px-2 py-1 rounded-lg border border-subtle hover:border-base transition-colors bg-transparent appearance-none cursor-pointer"
      }
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_DISPLAY_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
