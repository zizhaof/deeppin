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
  const top = rect.top + window.scrollY - 44;
  const left = rect.left + window.scrollX + rect.width / 2;

  return createPortal(
    <div
      ref={menuRef}
      style={{ top, left }}
      className="fixed z-50 -translate-x-1/2 flex items-center bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-1.5 py-1 shadow-2xl text-sm select-none"
    >
      <button
        onClick={() => onPin(selection)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700 transition-colors whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
        </svg>
        <span className="text-xs">{t.pinAction}</span>
      </button>
    </div>,
    document.body
  );
}
