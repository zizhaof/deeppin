"use client";
// components/MainThread/AnchorPreviewPopover.tsx

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Thread, Message } from "@/lib/api";
import { useT } from "@/stores/useLangStore";

interface Hover {
  threadIds: string[];
  rect: DOMRect;
}

interface Props {
  hover: Hover | null;
  threads: Thread[];
  messagesByThread: Record<string, Message[] | undefined>;
  unreadCounts: Record<string, number>;
  onEnter: (threadId: string) => void;
  /** Request to delete this thread (and its entire subtree) — parent opens the
   *  DeleteThreadDialog to confirm. */
  onDelete?: (threadId: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

// Same palette as MessageBubble's ANCHOR_COLORS — colors anchors by their order
// of appearance within a message. All five values are CSS vars and auto-switch
// with light/dark theme.
const ANCHOR_COLORS = [
  "var(--pig-1)",
  "var(--pig-2)",
  "var(--pig-3)",
  "var(--pig-4)",
  "var(--pig-5)",
];

const POPOVER_WIDTH = 320;

/**
 * Anchor-hover preview popover — replaces the old left-rail card entry point.
 * Hovering an underlined anchor span pops this preview below it: title,
 * anchor source text, latest AI reply, unread indicator, enter button.
 */
export default function AnchorPreviewPopover({
  hover,
  threads,
  messagesByThread,
  unreadCounts,
  onEnter,
  onDelete,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const t = useT();
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Show the first matching thread only — multi-thread overlaps are rare; first one wins.
  const thread = hover?.threadIds.map((id) => threads.find((th) => th.id === id)).find(Boolean) as
    | Thread
    | undefined;
  const threadIndex = hover && thread
    ? hover.threadIds.indexOf(thread.id)
    : 0;
  const color = ANCHOR_COLORS[Math.max(0, threadIndex) % ANCHOR_COLORS.length];

  // Position: below the anchor by default, flip above if clipped; center horizontally, clamp to viewport.
  useLayoutEffect(() => {
    if (!hover || !thread) {
      setPos(null);
      return;
    }
    const r = hover.rect;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popH = popRef.current?.offsetHeight ?? 180;

    let top = r.bottom + 6;
    if (top + popH > vh - margin) top = Math.max(margin, r.top - popH - 6);

    let left = r.left + r.width / 2 - POPOVER_WIDTH / 2;
    left = Math.max(margin, Math.min(left, vw - POPOVER_WIDTH - margin));

    setPos({ top, left });
  }, [hover, thread]);

  // ESC closes: attach the listener whenever the popover is visible; detach when it isn't.
  useEffect(() => {
    if (!hover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMouseLeave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hover, onMouseLeave]);

  if (!hover || !thread || !pos) return null;

  const msgs = messagesByThread[thread.id] ?? [];
  const firstUser = msgs.find((m) => m.role === "user");
  const lastAi = [...msgs].reverse().find((m) => m.role === "assistant");
  const unread = (unreadCounts[thread.id] ?? 0) > 0;
  const title = thread.title ?? thread.anchor_text?.slice(0, 40) ?? t.subQuestions;

  const questionText = firstUser?.content.trim();
  const replyText = lastAi?.content.trim();

  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

  return (
    <div
      ref={popRef}
      role="dialog"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: POPOVER_WIDTH,
        zIndex: 60,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="rounded-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--rule)",
          boxShadow: "0 10px 32px rgba(27,26,23,0.12), 0 2px 6px rgba(27,26,23,0.06)",
          borderRadius: 12,
        }}
      >
        {/* Title bar — pigment dot + index + title + unread chip. */}
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} aria-hidden />
          <span className="flex-1 font-serif text-[14px] font-medium truncate" style={{ color: "var(--ink)" }}>
            {title}
          </span>
          {unread && (
            <span
              className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-[1px] rounded-sm"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {t.newReply}
            </span>
          )}
        </div>

        {/* Question — the actual question the user asked in this sub-thread. */}
        <div className="px-3.5 py-2.5" style={{ borderTop: "1px solid var(--rule-soft)" }}>
          <div
            className="font-mono text-[9px] uppercase tracking-[0.12em] mb-1.5"
            style={{ color: "var(--ink-4)" }}
          >
            <span className="inline-block w-[5px] h-[5px] rounded-full mr-1.5 align-middle" style={{ background: "var(--ink-3)" }} />
            {t.you}
          </div>
          <p className="text-[12.5px] leading-snug line-clamp-3" style={{ color: "var(--ink-2)" }}>
            {questionText ? truncate(questionText, 180) : <span style={{ color: "var(--ink-4)", fontStyle: "italic" }}>{t.generatingSuggestions}</span>}
          </p>
        </div>

        {/* Answer — latest Deeppin reply. */}
        <div className="px-3.5 py-2.5" style={{ borderTop: "1px solid var(--rule-soft)" }}>
          <div
            className="font-mono text-[9px] uppercase tracking-[0.12em] mb-1.5"
            style={{ color: "var(--ink-4)" }}
          >
            <span className="inline-block w-[5px] h-[5px] rounded-full mr-1.5 align-middle" style={{ background: "var(--accent)" }} />
            <span style={{ fontFamily: "var(--font-serif)", textTransform: "none", letterSpacing: 0, fontSize: 11, color: "var(--ink-3)" }}>{t.ai}</span>
          </div>
          <p className="text-[12.5px] leading-snug line-clamp-4" style={{ color: "var(--ink-2)" }}>
            {replyText ? truncate(replyText, 200) : <span style={{ color: "var(--ink-4)", fontStyle: "italic" }}>{t.generatingSuggestions}</span>}
          </p>
        </div>

        {/* Action bar. */}
        <div
          className="flex items-center justify-between gap-2 px-3.5 py-2"
          style={{ background: "var(--paper-2)", borderTop: "1px solid var(--rule-soft)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--ink-4)" }}>
              depth {thread.depth}
            </span>
            {onDelete && (
              <button
                onClick={() => onDelete(thread.id)}
                aria-label={t.deleteThread}
                title={t.deleteThread}
                className="inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors"
                style={{ color: "var(--ink-4)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--danger, #dc2626)";
                  (e.currentTarget as HTMLElement).style.background = "color-mix(in oklch, var(--danger, #dc2626) 10%, transparent)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--ink-4)";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => onEnter(thread.id)}
            className="inline-flex items-center gap-1 font-medium text-[12px] transition-colors"
            style={{ color: "var(--accent)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent-ink)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent)")}
          >
            {t.enterThread}
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
