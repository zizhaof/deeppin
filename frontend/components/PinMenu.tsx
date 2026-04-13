"use client";
// components/PinMenu.tsx — 选中文字后出现的浮动工具栏

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/stores/useLangStore";

export interface SelectionInfo {
  text: string;
  messageId: string;
  rect: DOMRect;
  side: "left" | "right";
  anchorContentY: number;
  startOffset: number;
  endOffset: number;
}

interface Props {
  selection: SelectionInfo | null;
  onPin: (info: SelectionInfo) => void;
  onClose: () => void;
}

export default function PinMenu({ selection, onPin, onClose }: Props) {
  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  if (!selection) return null;

  const { rect } = selection;
  const top = rect.top + window.scrollY - 48;
  const left = rect.left + window.scrollX + rect.width / 2;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selection.text);
    } catch {
      const el = document.createElement("textarea");
      el.value = selection.text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      style={{ top, left }}
      className="fixed z-50 -translate-x-1/2 flex items-center gap-0.5 bg-zinc-900/95 backdrop-blur-md border border-white/10 text-zinc-100 rounded-xl px-1.5 py-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.03)] text-sm select-none"
    >
      {/* 复制 */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors whitespace-nowrap"
        title="复制选中文字"
      >
        <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
        <span className="text-xs text-zinc-500">{t.copy ?? "复制"}</span>
      </button>

      <div className="w-px h-4 bg-white/8 mx-0.5" />

      {/* 插针 */}
      <button
        onClick={() => onPin(selection)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
        </svg>
        <span className="text-xs text-indigo-300 font-medium">{t.pinAction}</span>
      </button>
    </div>,
    document.body
  );
}
