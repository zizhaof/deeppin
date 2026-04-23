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

      {/* ── 移动端底部 action bar 已删除 —— MessageBubble 在 mobile select-mode
           下用就地 portal 渲染 Copy/Pin 弹层，触发 onSelect 时 PinMenu 也会被
           Chat page 拉起，但 md:hidden 这条路径不再渲染任何东西，避免出现
           「就地一个 + 底部一个」两套 action sheet 的重复。
           Mobile bottom action bar removed — MessageBubble in mobile select-
           mode already renders its own inline portal sheet (Copy / Pin /
           Cancel) right next to the selection. PinMenu is still mounted by
           the chat page when onSelect fires, but its mobile branch is now
           a no-op so the user doesn't see two duplicate sheets. ── */}
    </>,
    document.body
  );
}
