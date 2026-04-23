"use client";
// components/MainThread/MessageBubble.tsx

import { useRef, useState, useEffect, memo } from "react";
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
  /** 字符偏移量（来自后端），用于精确定位，避免相同文字多次高亮 */
  startOffset?: number;
  endOffset?: number;
}

interface Props {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  anchors?: AnchorRange[];
  /** 有未读回复的 thread id 集合，锚点据此切换呼吸动画
   *  Set of thread IDs with unread replies — anchors opt into the breathing animation when included. */
  unreadThreadIds?: Set<string>;
  userAvatarUrl?: string | null;
  /** 生成该回复的 LLM 模型名（如 "groq/llama-3.3-70b-versatile"） */
  model?: string | null;
  onSelect?: (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => void;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
  onMessageRef?: (messageId: string, el: HTMLDivElement | null) => void;
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
  unreadThreadIds?: Set<string>,
): React.ReactNode {
  if (!anchors.length) return content;

  type Span = { start: number; end: number; threadId: string };
  const spans: Span[] = [];
  for (const { text, threadId, startOffset, endOffset } of anchors) {
    // 优先使用后端存储的字符偏移量，精确定位唯一锚点位置
    if (startOffset != null && endOffset != null && startOffset < endOffset && endOffset <= content.length) {
      spans.push({ start: startOffset, end: endOffset, threadId });
      continue;
    }
    // 降级：按文本搜索第一个匹配位置（旧数据兼容）
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
    const isUnread = !!unreadThreadIds && allThreadIds.some((id) => unreadThreadIds.has(id));
    nodes.push(
      <span
        key={segStart}
        data-anchor-thread-ids={allThreadIds.join(" ")}
        data-unread={isUnread ? "1" : undefined}
        className={`anchor-span rounded-sm px-0.5 cursor-pointer transition-colors text-indigo-200 ${
          isUnread ? "anchor-unread" : "bg-indigo-500/10 hover:bg-indigo-500/25"
        }`}
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

/** 选区高亮矩形，相对于内容 div 的坐标 */
interface SelRect { top: number; left: number; width: number; height: number; }

function MessageBubble({
  messageId,
  role,
  content,
  streaming,
  anchors = [],
  unreadThreadIds,
  userAvatarUrl,
  model,
  onSelect,
  onAnchorClick,
  onAnchorHover,
  onMessageRef,
}: Props) {
  const t = useT();
  const isUser = role === "user";
  const divRef = useRef<HTMLDivElement>(null);
  // 内容区 div，用于计算选区覆盖层的相对坐标
  const contentRef = useRef<HTMLDivElement>(null);
  // 记录最近一次 touchend 时间，防止移动端浏览器模拟的 mouseup 重复触发
  const lastTouchEndRef = useRef(0);
  const [expanded, setExpanded] = useState(false);
  /** AI 消息的原始/渲染模式切换 */
  const [rawMode, setRawMode] = useState(false);
  /** 选区覆盖层矩形列表（移动端指离后 OS 选区消失，但此层持续显示） */
  const [selRects, setSelRects] = useState<SelRect[]>([]);

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

  // 桌面端：mouseup 直接触发（跳过移动端模拟的 mouseup）
  const handleMouseUp = () => {
    if (Date.now() - lastTouchEndRef.current < 600) return;
    handleSelection();
  };

  // 将当前选区转换为相对内容 div 的矩形列表，存入 selRects
  // 移动端指离后 OS 选区消失，但 React 状态驱动的覆盖层仍留存
  const captureSelRects = () => {
    const sel = window.getSelection();
    const bubble = divRef.current;
    const content = contentRef.current;
    if (!sel || sel.isCollapsed || !bubble || !content || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!bubble.contains(range.commonAncestorContainer)) return;
    const base = content.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .map((r) => ({
        top: r.top - base.top,
        left: r.left - base.left,
        width: r.width,
        height: r.height,
      }))
      .filter((r) => r.width > 0 && r.height > 0);
    if (rects.length > 0) setSelRects(rects);
  };

  // 移动端：selectionchange 防抖 600ms（显示 action bar）
  // + touchend 立即捕获选区矩形（在 OS 清空选区之前保存覆盖层）
  // - 长按选词 → 选区稳定 600ms 后弹出底部 action bar
  // - 拖动 handle 扩选 → 每次变化重置计时器，停止拖动 600ms 后弹出
  // - 原生 Copy/Search 菜单正常显示，不干扰
  useEffect(() => {
    if (!onSelect || isUser) return;
    let actionTimer: ReturnType<typeof setTimeout>;
    let clearTimer: ReturnType<typeof setTimeout>;

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        // 选区存在：立即更新覆盖层 + 防抖触发 action bar
        clearTimeout(clearTimer);
        captureSelRects();
        clearTimeout(actionTimer);
        actionTimer = setTimeout(() => {
          const s = window.getSelection();
          if (s && !s.isCollapsed && s.toString().trim()) handleSelection();
        }, 600);
      } else {
        // 选区消失后清理。但 touchend 后 React re-render 会导致
        // 原生选区短暂消失，这不是用户主动取消——忽略这个瞬态。
        const sinceTouchEnd = Date.now() - lastTouchEndRef.current;
        if (sinceTouchEnd < 500) return; // touchend 已处理过，忽略瞬态 collapse
        clearTimeout(actionTimer);
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => setSelRects([]), 400);
      }
    };

    // touchend：在 OS 清空选区之前立即捕获矩形 + 触发 action bar
    // captureSelRects → setSelRects → re-render 会导致 DOM 节点替换、原生选区丢失，
    // 所以必须在同一帧里先完成 handleSelection（锁定选区数据），再保存覆盖层。
    const onTouchEnd = () => {
      lastTouchEndRef.current = Date.now();
      // 先锁定选区数据（触发 PinMenu），再保存视觉覆盖层
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        clearTimeout(actionTimer);
        handleSelection();
      }
      captureSelRects();
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      clearTimeout(actionTimer);
      clearTimeout(clearTimer);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect, isUser, messageId]);

  return (
    <div
      data-message-id={messageId}
      ref={(el) => {
        (divRef as { current: HTMLDivElement | null }).current = el;
        onMessageRef?.(messageId, el);
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
          ref={contentRef}
          onMouseUp={handleMouseUp}
          className={`relative rounded-2xl px-4 py-3 text-sm leading-relaxed select-text ${
            isUser
              ? "bg-indigo-600 text-white whitespace-pre-wrap shadow-md shadow-indigo-950/30"
              : "bg-surface text-hi border border-subtle"
          }`}
        >
          {/* 选区持久化覆盖层：移动端指离后 OS 选区消失，此层仍保持高亮 */}
          {selRects.map((r, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
                background: "rgba(99,102,241,0.28)",
                borderRadius: 3,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          ))}
          {isUser ? (
            <>
              {renderWithHighlights(displayContent, anchors, onAnchorClick, onAnchorHover, unreadThreadIds)}
              {needsCollapse && !expanded && (
                <span className="text-indigo-300 select-none">…</span>
              )}
            </>
          ) : rawMode ? (
            <pre className="whitespace-pre-wrap text-sm text-md font-mono leading-relaxed">
              {renderWithHighlights(displayContent, anchors, onAnchorClick, onAnchorHover, unreadThreadIds)}
            </pre>
          ) : (
            <MarkdownContent
              content={displayContent}
              anchors={anchors}
              unreadThreadIds={unreadThreadIds}
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

        {/* 模型标签 + Markdown 切换按钮 — AI 消息底部 */}
        {!isUser && !streaming && (
          <div className="absolute -bottom-5 left-0 right-0 flex items-center justify-between opacity-0 group-hover/bubble:opacity-100 transition-opacity select-none">
            {model ? (
              <span className="text-[10px] text-faint truncate max-w-[60%]" title={model}>
                {model}
              </span>
            ) : <span />}
            <button
              onClick={(e) => { e.stopPropagation(); setRawMode((r) => !r); }}
              className="text-[10px] text-ph hover:text-lo flex items-center gap-1"
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
          </div>
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

export default memo(MessageBubble);
