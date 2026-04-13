"use client";
// components/MainThread/MessageBubble.tsx

import { useRef, useState } from "react";
import MarkdownContent from "@/components/MarkdownContent";

const COLLAPSE_THRESHOLD = 300;

export interface AnchorRange {
  text: string;
  threadId: string;
  side?: "left" | "right";
}

interface Props {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  anchors?: AnchorRange[];
  onSelect?: (text: string, messageId: string, rect: DOMRect, side: "left" | "right", startOffset: number, endOffset: number) => void;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
  onRef?: (el: HTMLDivElement | null) => void;
}

function getCharOffset(container: Element, targetNode: Node, targetOffset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === targetNode) return offset + targetOffset;
    offset += (node as Text).length;
    node = walker.nextNode();
  }
  return offset;
}

const ANCHOR_COLORS = ["#818cf8", "#a78bfa", "#67e8f9", "#f9a8d4", "#fbbf24"];

function renderWithHighlights(
  content: string,
  anchors: AnchorRange[],
  onAnchorClick?: (threadId: string) => void,
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void,
): React.ReactNode {
  if (!anchors.length) return content;

  type Span = { start: number; end: number; threadId: string; side?: "left" | "right" };
  const spans: Span[] = [];
  for (const { text, threadId, side } of anchors) {
    const pos = content.indexOf(text);
    if (pos !== -1) spans.push({ start: pos, end: pos + text.length, threadId, side });
  }
  if (!spans.length) return content;

  const points = new Set<number>([0, content.length]);
  for (const { start, end } of spans) { points.add(start); points.add(end); }
  const sorted = [...points].sort((a, b) => a - b);

  const colorMap = new Map<string, string>();
  let colorIdx = 0;
  for (const { threadId } of anchors) {
    if (!colorMap.has(threadId)) {
      colorMap.set(threadId, ANCHOR_COLORS[colorIdx++ % ANCHOR_COLORS.length]);
    }
  }

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    const segText = content.slice(segStart, segEnd);
    if (!segText) continue;

    const covering = spans.filter(s => s.start <= segStart && s.end >= segEnd);
    if (!covering.length) {
      nodes.push(segText);
      continue;
    }

    let inner: React.ReactNode = segText;
    for (let j = covering.length - 1; j >= 0; j--) {
      const color = colorMap.get(covering[j].threadId)!;
      inner = (
        <span key={covering[j].threadId} style={{ borderBottom: `2px solid ${color}`, paddingBottom: "2px" }}>
          {inner}
        </span>
      );
    }

    const allThreadIds = covering.map(c => c.threadId);
    nodes.push(
      <span
        key={segStart}
        data-anchor-thread-ids={allThreadIds.join(" ")}
        className="bg-indigo-500/15 text-indigo-200 rounded-sm px-0.5 cursor-pointer transition-colors hover:bg-indigo-500/25"
        onClick={(e) => {
          e.stopPropagation();
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
          onAnchorClick?.(covering[0].threadId);
        }}
        onMouseEnter={(e) => {
          onAnchorHover?.(allThreadIds, (e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
        onMouseLeave={() => onAnchorHover?.([], null)}
      >
        {inner}
      </span>
    );
  }

  return <>{nodes}</>;
}

export default function MessageBubble({
  messageId,
  role,
  content,
  streaming,
  anchors = [],
  onSelect,
  onAnchorClick,
  onAnchorHover,
  onRef,
}: Props) {
  const isUser = role === "user";
  const divRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = isUser && !streaming && content.length > COLLAPSE_THRESHOLD;
  const displayContent = needsCollapse && !expanded ? content.slice(0, COLLAPSE_THRESHOLD) : content;

  const handleMouseUp = () => {
    if (!onSelect || isUser) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const bubble = divRef.current;
    if (!bubble) return;
    const range = sel.getRangeAt(0);
    if (!bubble.contains(range.commonAncestorContainer)) return;

    const startOffset = getCharOffset(bubble, range.startContainer, range.startOffset);
    const endOffset = getCharOffset(bubble, range.endContainer, range.endOffset);

    const rect = range.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const side: "left" | "right" = centerX < window.innerWidth / 2 ? "left" : "right";
    onSelect(sel.toString().trim(), messageId, rect, side, startOffset, endOffset);
  };

  return (
    <div
      data-message-id={messageId}
      ref={(el) => {
        (divRef as { current: HTMLDivElement | null }).current = el;
        onRef?.(el);
      }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}
    >
      {/* AI 图标 */}
      {!isUser && (
        <div className="w-6 h-6 flex items-center justify-center mr-2.5 mt-0.5 flex-shrink-0 rounded-md bg-zinc-800 border border-zinc-700/50">
          <svg className="w-3 h-3 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
          </svg>
        </div>
      )}

      <div
        onMouseUp={handleMouseUp}
        className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed select-text ${
          isUser
            ? "bg-indigo-600 text-white rounded-tr-sm whitespace-pre-wrap"
            : "bg-zinc-900 text-zinc-100 rounded-tl-sm"
        }`}
      >
        {isUser ? (
          <>
            {renderWithHighlights(displayContent, anchors, onAnchorClick, onAnchorHover)}
            {needsCollapse && !expanded && (
              <span className="text-indigo-300 select-none">…</span>
            )}
          </>
        ) : (
          <MarkdownContent
            content={displayContent}
            anchors={anchors}
            onAnchorClick={onAnchorClick}
            onAnchorHover={onAnchorHover}
          />
        )}
        {streaming && (
          <span className="inline-block w-0.5 h-3.5 bg-zinc-400 ml-0.5 align-middle animate-pulse" />
        )}
        {needsCollapse && (
          <div className="mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors select-none"
            >
              {expanded ? "收起" : `展开全文（共 ${content.length} 字）`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
