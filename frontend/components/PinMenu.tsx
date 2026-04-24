"use client";
// Action menu shown after the user selects text.
// Desktop: floating popup directly above the selection.
// Mobile: rendered inline by MessageBubble (this component is a no-op on mobile).

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/stores/useLangStore";

export interface SelectionInfo {
  text: string;
  messageId: string;
  rect: DOMRect;
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

  // Desktop: close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Auto-close when the selection collapses, with two safeguards:
  //  1. Ignore collapses within 800ms of mount (transient clears caused by React re-render).
  //  2. After that, defer each collapse check by 400ms to avoid closing on
  //     transient empty selections during drag-handle adjustments.
  useEffect(() => {
    if (!selection) return;
    const mountedAt = Date.now();
    let closeTimer: ReturnType<typeof setTimeout>;
    const handler = () => {
      // Ignore early after mount: handleSelection → setState → re-render often makes the native selection blink out.
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

  // Desktop floating position.
  const floatTop = rect.top + window.scrollY - 48;
  const floatLeft = rect.left + window.scrollX + rect.width / 2;

  return createPortal(
    <>
      {/* ── Desktop floating popover — ink background with a downward-pointing
           tail, accent-highlighted Pin segment (matches the design's .selpop). ── */}
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
        {/* Downward-pointing tail — rendered as a rotated square. */}
        <span
          aria-hidden
          className="absolute left-1/2 -bottom-1 w-2 h-2 rotate-45 -translate-x-1/2"
          style={{ background: "var(--ink)" }}
        />
      </div>

      {/* ── Mobile bottom action bar removed — MessageBubble in mobile
           select-mode already renders its own inline portal sheet (Copy /
           Pin / Cancel) right next to the selection. PinMenu is still
           mounted by the chat page when onSelect fires, but its mobile
           branch is now a no-op so the user doesn't see two duplicate
           sheets. ── */}
    </>,
    document.body
  );
}
