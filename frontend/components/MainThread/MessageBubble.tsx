"use client";
// components/MainThread/MessageBubble.tsx

import { useRef, useState } from "react";
import MarkdownContent from "@/components/MarkdownContent";

const COLLAPSE_THRESHOLD = 300; // 超过此字符数的用户消息默认折叠

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
  /** 选中文字时触发，仅 assistant 消息 */
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

// 每个线程对应一条下划线颜色
const ANCHOR_COLORS = ["#818cf8", "#a78bfa", "#67e8f9", "#f9a8d4", "#fbbf24"];

function renderWithHighlights(
  content: string,
  anchors: AnchorRange[],
  onAnchorClick?: (threadId: string) => void,
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void,
): React.ReactNode {
  if (!anchors.length) return content;

  // 找出每个 anchor 在文本中的位置
  type Span = { start: number; end: number; threadId: string; side?: "left" | "right" };
  const spans: Span[] = [];
  for (const { text, threadId, side } of anchors) {
    const pos = content.indexOf(text);
    if (pos !== -1) spans.push({ start: pos, end: pos + text.length, threadId, side });
  }
  if (!spans.length) return content;

  // 所有 anchor 的边界点，将文本切成若干 segment
  const points = new Set<number>([0, content.length]);
  for (const { start, end } of spans) { points.add(start); points.add(end); }
  const sorted = [...points].sort((a, b) => a - b);

  // 为每个线程分配固定颜色（按首次出现顺序）
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

    // 覆盖此 segment 的所有 thread
    const covering = spans.filter(s => s.start <= segStart && s.end >= segEnd);
    if (!covering.length) {
      nodes.push(segText);
      continue;
    }

    // 嵌套 span：每层加一条 border-bottom，padding-bottom=3px 撑开间距
    let inner: React.ReactNode = segText;
    for (let i = covering.length - 1; i >= 0; i--) {
      const color = colorMap.get(covering[i].threadId)!;
      inner = (
        <span key={covering[i].threadId} style={{ borderBottom: `2px solid ${color}`, paddingBottom: "3px" }}>
          {inner}
        </span>
      );
    }

    const allThreadIds = covering.map(c => c.threadId);
    nodes.push(
      <span
        key={segStart}
        data-anchor-thread-ids={allThreadIds.join(" ")}
        className="bg-indigo-900/40 text-indigo-200 rounded-sm px-0.5 not-italic cursor-pointer transition-colors hover:bg-indigo-800/50"
        onClick={(e) => {
          e.stopPropagation();
          // 有文字被选中时（拖拽选择）不触发跳转，只有纯单击才跳转
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
    if (!onSelect || isUser) return; // 只对 AI 消息插针
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
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      {/* AI 头像：简洁火花图标 */}
      {!isUser && (
        <div className="w-6 h-6 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
          <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
          </svg>
        </div>
      )}

      <div
        onMouseUp={handleMouseUp}
        className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed select-text ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm whitespace-pre-wrap"
            : "bg-zinc-800 border border-zinc-700/60 text-zinc-100 rounded-tl-sm"
        }`}
      >
        {isUser ? (
          // 用户消息：纯文本，保留换行 / User messages: plain text, preserve newlines
          <>
            {renderWithHighlights(displayContent, anchors, onAnchorClick, onAnchorHover)}
            {needsCollapse && !expanded && (
              <span className="text-blue-200 select-none">…</span>
            )}
          </>
        ) : (
          // AI 消息：渲染 Markdown，锚点高亮由 MarkdownContent 内部处理
          // AI messages: render Markdown; anchor highlighting is handled inside MarkdownContent
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
          <div className="mt-1.5">
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
