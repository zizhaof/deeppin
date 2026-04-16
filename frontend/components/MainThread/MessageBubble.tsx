"use client";
// components/MainThread/MessageBubble.tsx

import { useRef, useState, useEffect } from "react";
import MarkdownContent from "@/components/MarkdownContent";
import { useT } from "@/stores/useLangStore";

/** 供外部（PinMenu onClose / handlePin）调用，清除原生文字选区 */
export function clearActiveHighlight() {
  window.getSelection()?.removeAllRanges();
}

const COLLAPSE_THRESHOLD = 300;

export interface AnchorRange {
  text: string;
  threadId: string;
}

interface Props {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  anchors?: AnchorRange[];
  userAvatarUrl?: string | null;
  onSelect?: (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => void;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
  onRef?: (el: HTMLDivElement | null) => void;
}

/**
 * React re-render 后 cloneRange 引用的 DOM 节点可能已被替换，导致
 * addRange 静默失败。此函数在当前 DOM 里用文本搜索重新定位并恢复选区。
 * 多段落选中时取第一段作为恢复目标（与 highlightStr 策略一致）。
 */
function restoreSelectionByText(container: Element, selectedText: string): void {
  const searchText = selectedText.includes("\n")
    ? (selectedText.split("\n").find((s) => s.trim()) ?? selectedText)
    : selectedText;
  if (!searchText.trim()) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let fullText = "";
  const segments: { node: Text; start: number; end: number }[] = [];

  let node = walker.nextNode() as Text | null;
  while (node) {
    const t = node.textContent ?? "";
    segments.push({ node, start: fullText.length, end: fullText.length + t.length });
    fullText += t;
    node = walker.nextNode() as Text | null;
  }

  const matchIdx = fullText.indexOf(searchText);
  if (matchIdx === -1) return;
  const matchEnd = matchIdx + searchText.length;

  let startNode: Text | null = null, startOffset = 0;
  let endNode: Text | null = null, endOffset = 0;

  for (const seg of segments) {
    if (!startNode && matchIdx < seg.end && matchIdx >= seg.start) {
      startNode = seg.node;
      startOffset = matchIdx - seg.start;
    }
    if (matchEnd <= seg.end && matchEnd > seg.start) {
      endNode = seg.node;
      endOffset = matchEnd - seg.start;
      break;
    }
  }

  if (!startNode || !endNode) return;
  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* ignore */ }
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

  type Span = { start: number; end: number; threadId: string };
  const spans: Span[] = [];
  for (const { text, threadId } of anchors) {
    const searchText = text.includes("\n")
      ? (text.split("\n").find((s) => s.trim()) ?? text)
      : text;
    const pos = content.indexOf(searchText);
    if (pos !== -1) spans.push({ start: pos, end: pos + searchText.length, threadId });
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
  userAvatarUrl,
  onSelect,
  onAnchorClick,
  onAnchorHover,
  onRef,
}: Props) {
  const t = useT();
  const isUser = role === "user";
  const divRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  /** AI 消息的原始/渲染模式切换 */
  const [rawMode, setRawMode] = useState(false);
  const needsCollapse = isUser && !streaming && content.length > COLLAPSE_THRESHOLD;
  const displayContent = needsCollapse && !expanded ? content.slice(0, COLLAPSE_THRESHOLD) : content;

  // 抽取选区处理逻辑，mouseup（桌面）和 selectionchange（移动端）共用
  const handleSelection = () => {
    if (!onSelect || isUser) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const bubble = divRef.current;
    if (!bubble) return;
    const range = sel.getRangeAt(0);
    if (!bubble.contains(range.commonAncestorContainer)) return;

    // 在 onSelect 触发 re-render 之前保存选区快照
    const savedRange = range.cloneRange();
    const startOffset = getCharOffset(bubble, range.startContainer, range.startOffset);
    const endOffset = getCharOffset(bubble, range.endContainer, range.endOffset);
    const rect = range.getBoundingClientRect();
    const selectedText = sel.toString().trim();

    onSelect(selectedText, messageId, rect, startOffset, endOffset);

    // onSelect 触发父组件 setState → React re-render → 浏览器选区丢失
    // 在下一帧恢复：先试 cloneRange（快），失败则用文本搜索重新定位（鲁棒）
    requestAnimationFrame(() => {
      const s = window.getSelection();
      if (!s || !s.isCollapsed) return; // 选区仍在，无需恢复

      // 1. 先尝试直接恢复 cloneRange（DOM 节点未被替换时有效）
      try {
        s.removeAllRanges();
        s.addRange(savedRange);
      } catch { /* ignore */ }

      // 2. 若仍为空（DOM 节点已被替换），在当前 DOM 里按文本重新定位
      if (s.isCollapsed) {
        const bubble = divRef.current;
        if (bubble) restoreSelectionByText(bubble, selectedText);
      }
    });
  };

  const handleMouseUp = handleSelection;

  // 移动端：长按选文触发 selectionchange 而非 mouseup，用防抖监听
  useEffect(() => {
    if (!onSelect || isUser) return;
    let timer: ReturnType<typeof setTimeout>;
    const onSelectionChange = () => {
      clearTimeout(timer);
      timer = setTimeout(handleSelection, 300);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect, isUser, messageId]);

  return (
    <div
      data-message-id={messageId}
      ref={(el) => {
        (divRef as { current: HTMLDivElement | null }).current = el;
        onRef?.(el);
      }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-5 group/bubble`}
    >
      {/* AI 头像 */}
      {!isUser && (
        <div className="w-6 h-6 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0 rounded-lg bg-surface border border-indigo-500/15 shadow-sm">
          <svg className="w-3 h-3 text-indigo-400/80" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
          </svg>
        </div>
      )}

      <div className="relative max-w-[72%]">
        <div
          onMouseUp={handleMouseUp}
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed select-text ${
            isUser
              ? "bg-indigo-600 text-white whitespace-pre-wrap shadow-md shadow-indigo-950/30"
              : "bg-surface text-hi border border-subtle"
          }`}
        >
          {isUser ? (
            <>
              {renderWithHighlights(displayContent, anchors, onAnchorClick, onAnchorHover)}
              {needsCollapse && !expanded && (
                <span className="text-indigo-300 select-none">…</span>
              )}
            </>
          ) : rawMode ? (
            <pre className="whitespace-pre-wrap text-sm text-md font-mono leading-relaxed">
              {renderWithHighlights(displayContent, anchors, onAnchorClick, onAnchorHover)}
            </pre>
          ) : (
            <MarkdownContent
              content={displayContent}
              anchors={anchors}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
            />
          )}
          {streaming && (
            <span className="inline-block w-0.5 h-3.5 bg-dim ml-0.5 align-middle animate-pulse" />
          )}
          {needsCollapse && (
            <div className="mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="text-[11px] text-dim hover:text-md transition-colors select-none"
              >
                {expanded ? t.collapse : `${t.expandFull}（共 ${content.length} ${t.chars}）`}
              </button>
            </div>
          )}
        </div>

        {/* Markdown 切换按钮 — AI 消息 hover 时显示 */}
        {!isUser && !streaming && (
          <button
            onClick={(e) => { e.stopPropagation(); setRawMode((r) => !r); }}
            className="absolute -bottom-5 right-0 opacity-0 group-hover/bubble:opacity-100 transition-opacity text-[10px] text-ph hover:text-lo flex items-center gap-1 select-none"
            title={rawMode ? t.showMd : t.showRaw}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              {rawMode ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              )}
            </svg>
            <span>{rawMode ? t.mdMode : t.rawMode}</span>
          </button>
        )}
      </div>

      {/* 用户头像 */}
      {isUser && (
        <div className="w-8 h-8 ml-3 mt-0.5 flex-shrink-0 rounded-full overflow-hidden border border-base">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full bg-indigo-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
