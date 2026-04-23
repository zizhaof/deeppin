"use client";
// components/PinMenu.tsx — 选中文字后出现的操作菜单
// 桌面端：浮动 popup（选区正上方）
// 移动端：底部 action bar（不遮挡原生 Copy/Search 菜单，二者共存）

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/stores/useLangStore";

export interface SelectionInfo {
  text: string;
  messageId: string;
  rect: DOMRect;
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

  // 桌面端：点击菜单外关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // 选区消失时自动关闭
  // 加双重保护：
  //  1. 挂载后 800ms 内忽略 collapse（React re-render 导致的瞬态清除）
  //  2. 之后每次 collapse 延迟 400ms 再验证，防止拖动 handle 短暂空选区
  useEffect(() => {
    if (!selection) return;
    const mountedAt = Date.now();
    let closeTimer: ReturnType<typeof setTimeout>;
    const handler = () => {
      // 挂载初期忽略：handleSelection → setState → re-render 常导致原生选区瞬间消失
      if (Date.now() - mountedAt < 800) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        closeTimer = setTimeout(() => {
          const s = window.getSelection();
          if (!s || s.isCollapsed) onClose();
        }, 400);
      } else {
        clearTimeout(closeTimer);
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => {
      clearTimeout(closeTimer);
      document.removeEventListener("selectionchange", handler);
    };
  }, [selection, onClose]);

  if (!selection) return null;

  const { rect } = selection;

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

  // 桌面端浮动位置
  const floatTop = rect.top + window.scrollY - 48;
  const floatLeft = rect.left + window.scrollX + rect.width / 2;

  return createPortal(
    <>
      {/* ── 桌面端：浮动 popup — ink 底 + 朝下小三角 + accent Pin seg
           Desktop floating popover — ink background with a downward-pointing
           tail, accent-highlighted Pin segment (matches design's .selpop). ── */}
      <div
        ref={menuRef}
        style={{
          top: floatTop,
          left: floatLeft,
          background: "var(--ink)",
          color: "var(--paper)",
        }}
        onMouseDown={e => e.preventDefault()}
        className="pin-menu-desktop hidden md:flex fixed z-50 -translate-x-1/2 items-center gap-0.5 rounded-md px-[3px] py-[3px] shadow-[0_6px_20px_rgba(27,26,23,0.2)] text-sm select-none"
      >
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors whitespace-nowrap text-[12px] hover:bg-white/10"
          style={{ color: "var(--paper)" }}
        >
          <svg className="w-3 h-3" style={{ opacity: 0.75 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          <span>{t.copy}</span>
        </button>
        <button
          onClick={() => onPin(selection)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors whitespace-nowrap text-[12px] font-medium"
          style={{ background: "var(--accent)", color: "var(--paper)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--accent-2)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--accent)")}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
          </svg>
          <span>{t.pinAction}</span>
        </button>
        {/* 朝下小三角 — 用旋转的方形 */}
        <span
          aria-hidden
          className="absolute left-1/2 -bottom-1 w-2 h-2 rotate-45 -translate-x-1/2"
          style={{ background: "var(--ink)" }}
        />
      </div>

      {/* ── 移动端：底部 action bar（与浏览器原生 Copy 菜单共存，不冲突） ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-2 duration-150">
        {/* 选中文字预览 — ink 底 paper 字，跟桌面端 selpop 同一语言
            Selected-text preview — ink bg + paper text (mirrors desktop selpop). */}
        <div
          className="mx-3 mb-1 px-3 py-1.5 rounded-xl"
          style={{ background: "var(--ink)", border: "1px solid var(--accent-ink)" }}
        >
          <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "var(--ink-5)" }}>
            <span className="mr-1" style={{ color: "var(--ink-4)" }}>&quot;</span>
            {selection.text.length > 80 ? selection.text.slice(0, 80) + "…" : selection.text}
          </p>
        </div>
        {/* 操作按钮行 */}
        <div className="flex items-center gap-2 px-3 pb-safe pb-4 bg-surface/95 backdrop-blur-xl border-t border-subtle">
          {/* 关闭 */}
          <button
            onPointerDown={e => { e.preventDefault(); onClose(); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-ph active:bg-glass transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="flex-1" />

          {/* 复制 */}
          <button
            onPointerDown={e => { e.preventDefault(); handleCopy(); }}
            className="flex items-center gap-2 px-4 h-10 rounded-xl border border-subtle bg-glass text-hi active:bg-surface transition-colors"
          >
            <svg className="w-4 h-4 text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            <span className="text-sm">{t.copy ?? "复制"}</span>
          </button>

          {/* 插针 */}
          <button
            onPointerDown={e => { e.preventDefault(); onPin(selection); }}
            className="flex items-center gap-2 px-4 h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white transition-colors font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
            </svg>
            <span className="text-sm">{t.pinAction}</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
