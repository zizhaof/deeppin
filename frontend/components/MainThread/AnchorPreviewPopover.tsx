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
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

// 与 MessageBubble 中 ANCHOR_COLORS 保持一致（按 threadId 在同一消息里的出现顺序上色）
// 5 个值都是 CSS var()，随 light/dark 自动切换。
// Same palette as MessageBubble's ANCHOR_COLORS (CSS vars — theme-aware).
const ANCHOR_COLORS = [
  "var(--pig-1)",
  "var(--pig-2)",
  "var(--pig-3)",
  "var(--pig-4)",
  "var(--pig-5)",
];

const POPOVER_WIDTH = 320;

/**
 * 锚点 hover 预览 popover — 取代旧的左栏卡片入口。
 * 鼠标悬浮到带下划线的锚点 span 上 → 在锚点下方弹出预览卡；
 * 显示子线程标题、锚点原文、最新一句 AI 回答、是否未读，点击进入。
 *
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
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const t = useT();
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 仅显示第一个匹配到的 thread（同一 span 上多个 thread 堆叠时以首个为主）
  // Show the first matching thread only — multi-thread overlaps are rare; first one wins.
  const thread = hover?.threadIds.map((id) => threads.find((th) => th.id === id)).find(Boolean) as
    | Thread
    | undefined;
  const threadIndex = hover && thread
    ? hover.threadIds.indexOf(thread.id)
    : 0;
  const color = ANCHOR_COLORS[Math.max(0, threadIndex) % ANCHOR_COLORS.length];

  // 位置计算：优先放在锚点下方，超出视口底则翻到上方；水平居中并夹紧到视口内。
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

  // ESC 关闭：popover 一旦可见就挂监听，离开时卸载
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
  const lastAi = [...msgs].reverse().find((m) => m.role === "assistant");
  const unread = (unreadCounts[thread.id] ?? 0) > 0;
  const title = thread.title ?? thread.anchor_text?.slice(0, 40) ?? t.subQuestions;

  const preview = lastAi?.content.trim();
  const previewText = preview
    ? preview.slice(0, 160) + (preview.length > 160 ? "…" : "")
    : t.generatingSuggestions;

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
      className="rounded-xl border border-base bg-surface-95 backdrop-blur-md shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
    >
      {/* 标题条 */}
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: color }}
          aria-hidden
        />
        <span className="flex-1 font-serif text-[15px] font-medium text-md truncate">{title}</span>
        {unread && (
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-indigo-300 bg-indigo-500/15 px-1.5 py-0.5 rounded-sm">
            {t.newReply}
          </span>
        )}
      </div>

      {/* 锚点原文 */}
      {thread.anchor_text && (
        <div className="px-3.5 pb-2 text-[11px] text-dim italic leading-relaxed line-clamp-2 border-t border-subtle pt-2">
          “{thread.anchor_text}”
        </div>
      )}

      {/* AI 最新回复预览 */}
      <div className="px-3.5 py-2.5 text-xs text-lo leading-relaxed line-clamp-4 border-t border-subtle">
        {previewText}
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-elevated-80 border-t border-subtle">
        <span className="text-[10px] font-mono text-ph tracking-wider">
          depth {thread.depth}
        </span>
        <button
          onClick={() => onEnter(thread.id)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
        >
          {t.enterThread}
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
