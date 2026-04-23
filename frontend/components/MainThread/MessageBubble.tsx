"use client";
// components/MainThread/MessageBubble.tsx

import { useRef, useState, useEffect, useMemo, memo } from "react";
import { createPortal } from "react-dom";
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
  /** 移动端「选区模式」开关。
   *  - undefined（桌面）：保留原行为（鼠标 mouseup + 长按 selectionchange）
   *  - false（移动端关）：禁用所有 native text selection，气泡纯粹是只读
   *  - true（移动端开）：用自定义 touch handlers 实时追踪手指位置，建 Range，
   *    抬手即调 onSelect。不依赖系统长按。
   *  Mobile-only "select mode" toggle:
   *    undefined → desktop behavior (mouseup + native long-press selection)
   *    false → mobile, user-select:none, no selection at all
   *    true  → mobile, custom touch tracking via caretRangeFromPoint/Position;
   *            release fires onSelect immediately. */
  mobileSelectActive?: boolean;
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

// 5 色锚点颜料 — 读 globals.css 的 --pig-1..5（light=muted pigments，dark=老的亮色）
// Anchor pigments — pulled from --pig-1..5 so the palette auto-switches with theme.
const ANCHOR_COLORS = [
  "var(--pig-1)",
  "var(--pig-2)",
  "var(--pig-3)",
  "var(--pig-4)",
  "var(--pig-5)",
];

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

    const allThreadIds = covering.map(c => c.threadId);
    const isUnread = !!unreadThreadIds && allThreadIds.some((id) => unreadThreadIds.has(id));

    // 锚点视觉只用下划线粗细区分：未读 3px 粗，已读 1px 细。
    // 不再做背景高亮。多锚点叠加时按颜料色画多条嵌套下划线。
    // Anchors signal state via underline thickness only — 3px when unread,
    // 1px when read. No background highlight. Stacked anchors get nested
    // pigment underlines.
    let inner: React.ReactNode = segText;
    for (let j = covering.length - 1; j >= 0; j--) {
      const color = colorMap.get(covering[j].threadId)!;
      inner = (
        <span
          key={covering[j].threadId}
          style={{ borderBottom: `${isUnread ? 3 : 1}px solid ${color}`, paddingBottom: "1px" }}
        >
          {inner}
        </span>
      );
    }

    nodes.push(
      <span
        key={segStart}
        data-anchor-thread-ids={allThreadIds.join(" ")}
        data-unread={isUnread ? "1" : undefined}
        className="anchor-span cursor-pointer"
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

/** 移动端持久选区：一对 text-node caret 位置
 *  Mobile persistent selection — pair of text-node carets. */
export interface MBCaret { node: Text; offset: number; }
export interface MBSelection { start: MBCaret; end: MBCaret; }

/** 把一对 caret 按 DOM 顺序建成 forward Range（反向不会抛错） */
function buildRangeFromSel(sel: MBSelection): Range | null {
  try {
    const range = document.createRange();
    const { start, end } = sel;
    const sameNode = start.node === end.node;
    if (sameNode && start.offset > end.offset) {
      range.setStart(end.node, end.offset);
      range.setEnd(start.node, start.offset);
      return range;
    }
    const cmp = start.node.compareDocumentPosition(end.node);
    if (cmp & Node.DOCUMENT_POSITION_PRECEDING) {
      range.setStart(end.node, end.offset);
      range.setEnd(start.node, start.offset);
    } else {
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
    }
    return range;
  } catch { return null; }
}

function MessageBubble({
  messageId,
  role,
  content,
  streaming,
  anchors = [],
  unreadThreadIds,
  userAvatarUrl,
  model,
  mobileSelectActive,
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
  /** 移动端持久选区 —— ref 里实时改动，state tick 触发 re-render 更新 action sheet 位置 */
  /** Mobile persistent selection — ref changes on every touch move;
   *  a paired state tick triggers re-renders so the action-sheet position
   *  recomputes from the latest range. */
  const pendingSelRef = useRef<MBSelection | null>(null);
  const [selectionTick, setSelectionTick] = useState(0);
  /** 拖动中 —— 隐藏 action sheet，避免手指下面飘浮按钮 */
  const [dragging, setDragging] = useState(false);
  /** 给内部 setPending 暴露给 touch handler + action sheet */
  const overlayUpdaterRef = useRef<(() => void) | null>(null);

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

  // 桌面端原生选区：长按 + selectionchange 防抖 / Desktop native selection
  // 仅在 mobileSelectActive === undefined（即非移动端布局）时启用。
  // Only active on desktop (when mobileSelectActive is undefined).
  useEffect(() => {
    if (!onSelect || isUser || mobileSelectActive !== undefined) return;
    let actionTimer: ReturnType<typeof setTimeout>;
    let clearTimer: ReturnType<typeof setTimeout>;

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        clearTimeout(clearTimer);
        captureSelRects();
        clearTimeout(actionTimer);
        actionTimer = setTimeout(() => {
          const s = window.getSelection();
          if (s && !s.isCollapsed && s.toString().trim()) handleSelection();
        }, 600);
      } else {
        const sinceTouchEnd = Date.now() - lastTouchEndRef.current;
        if (sinceTouchEnd < 500) return;
        clearTimeout(actionTimer);
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => setSelRects([]), 400);
      }
    };

    const onTouchEnd = () => {
      lastTouchEndRef.current = Date.now();
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
  }, [onSelect, isUser, messageId, mobileSelectActive]);

  // 选区模式关闭 → 清掉残留的高亮覆盖层 + 选区 ref
  // Clear stale overlay + pending ref when select mode toggles off
  useEffect(() => {
    if (mobileSelectActive === false) {
      setSelRects([]);
      pendingSelRef.current = null;
      setSelectionTick((n) => n + 1);
    }
  }, [mobileSelectActive]);

  // ── 移动端「选区模式」自定义 touch 追踪 / Mobile select-mode custom touch tracking ──
  //
  // 行为 / Behavior:
  //  - 没有 pendingSel → touch-down 开启新选区，start=end=touch
  //  - 有 pendingSel + touch 落在选区内（或离选区 ≤16px）
  //      → 判定手指离 start 边近还是 end 边近（几何距离）
  //      → 近端变为可拖动侧；远端保持；选区保留较大的一半（start..touch 或 touch..end）
  //      → 手指移动继续更新该端
  //  - 有 pendingSel + touch 落在选区外很远 → 丢弃旧选区，开新的
  //  - touchend：不自动 fire onSelect，只停止拖动；选区高亮保留
  //  - 用户点 action sheet 里的 Pin 按钮才真正 fire onSelect
  //
  //  touch-down on nothing → fresh selection
  //  touch-down inside existing selection (or within 16px grace) → figure out
  //    which edge is closer (by pixel distance), release that edge at touch,
  //    keep the other side — finger now drags that released edge
  //  touch-down clearly outside → restart fresh
  //  touch-up → stop dragging; highlight stays; user taps Pin in action sheet
  //    to commit
  useEffect(() => {
    if (!onSelect || isUser || !mobileSelectActive) return;
    const bubble = divRef.current;
    const content = contentRef.current;
    if (!bubble || !content) return;

    const caretAt = (x: number, y: number): MBCaret | null => {
      type CaretPosFn = (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      type CaretRangeFn = (x: number, y: number) => Range | null;
      const doc = document as unknown as {
        caretPositionFromPoint?: CaretPosFn;
        caretRangeFromPoint?: CaretRangeFn;
      };
      try {
        if (doc.caretPositionFromPoint) {
          const cp = doc.caretPositionFromPoint(x, y);
          if (cp?.offsetNode?.nodeType === Node.TEXT_NODE && bubble.contains(cp.offsetNode)) {
            return { node: cp.offsetNode as Text, offset: cp.offset };
          }
        }
        if (doc.caretRangeFromPoint) {
          const r = doc.caretRangeFromPoint(x, y);
          if (r?.startContainer?.nodeType === Node.TEXT_NODE && bubble.contains(r.startContainer)) {
            return { node: r.startContainer as Text, offset: r.startOffset };
          }
        }
      } catch { /* ignore */ }
      return null;
    };

    /** 取单个 caret 在页面上的 (x,y)，用于「几何距离」判断哪端更近 */
    const caretPoint = (c: MBCaret): { x: number; y: number } | null => {
      try {
        const r = document.createRange();
        r.setStart(c.node, c.offset);
        r.setEnd(c.node, c.offset);
        const rect = r.getBoundingClientRect();
        if (!rect.height && !rect.width) {
          // 零宽 range 有时 rect 取不到；取父节点 rect 的起点
          const parent = c.node.parentElement;
          if (parent) {
            const pr = parent.getBoundingClientRect();
            return { x: pr.left, y: pr.top + pr.height / 2 };
          }
          return null;
        }
        return { x: rect.left, y: rect.top + rect.height / 2 };
      } catch { return null; }
    };

    /** 触点是否落在当前 pendingSel 内部或边缘（16px grace zone） */
    const touchOnSelection = (x: number, y: number, sel: MBSelection): boolean => {
      const range = buildRangeFromSel(sel);
      if (!range) return false;
      const grace = 16;
      for (const r of Array.from(range.getClientRects())) {
        if (
          x >= r.left - grace &&
          x <= r.right + grace &&
          y >= r.top - grace &&
          y <= r.bottom + grace
        ) return true;
      }
      return false;
    };

    const updateOverlay = () => {
      const sel = pendingSelRef.current;
      const range = sel ? buildRangeFromSel(sel) : null;
      if (!range) { setSelRects([]); return; }
      const base = content.getBoundingClientRect();
      const rects = Array.from(range.getClientRects())
        .map((r) => ({
          top: r.top - base.top,
          left: r.left - base.left,
          width: r.width,
          height: r.height,
        }))
        .filter((r) => r.width > 0 && r.height > 0);
      setSelRects(rects);
    };

    // 暴露更新函数给「调整端」拖动 & action sheet 用
    overlayUpdaterRef.current = updateOverlay;

    type DragMode = "fresh" | "adjust-start" | "adjust-end" | null;
    let dragMode: DragMode = null;

    const onTouchStart = (e: TouchEvent) => {
      if (!bubble.contains(e.target as Node)) return;
      const touch = e.touches[0];
      const c = caretAt(touch.clientX, touch.clientY);
      if (!c) return;
      e.preventDefault();
      setDragging(true);

      const cur = pendingSelRef.current;
      if (!cur) {
        // 无已有选区 → 新开
        dragMode = "fresh";
        pendingSelRef.current = { start: c, end: c };
        updateOverlay();
        return;
      }

      // 有已有选区 → 判断落点位置
      const inside = touchOnSelection(touch.clientX, touch.clientY, cur);
      if (!inside) {
        // 落点在选区外（远）→ 丢弃旧的，开新选区
        dragMode = "fresh";
        pendingSelRef.current = { start: c, end: c };
        updateOverlay();
        return;
      }

      // 落点在选区内部或边缘 → 选离触点最近的一端作为「可移动侧」
      // Release the edge whose caret is closer (in pixels) to the touch.
      const sp = caretPoint(cur.start);
      const ep = caretPoint(cur.end);
      const dist = (p: { x: number; y: number } | null) =>
        p ? Math.hypot(p.x - touch.clientX, p.y - touch.clientY) : Infinity;
      const distStart = dist(sp);
      const distEnd = dist(ep);

      if (distStart <= distEnd) {
        // 近 start → start 侧可拖，end 保持；选区立即收缩到 [touch..end]
        dragMode = "adjust-start";
        pendingSelRef.current = { start: c, end: cur.end };
      } else {
        // 近 end → end 侧可拖
        dragMode = "adjust-end";
        pendingSelRef.current = { start: cur.start, end: c };
      }
      updateOverlay();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragMode) return;
      const cur = pendingSelRef.current;
      if (!cur) return;
      e.preventDefault();
      const touch = e.touches[0];
      const c = caretAt(touch.clientX, touch.clientY);
      if (!c) return;
      if (dragMode === "fresh" || dragMode === "adjust-end") {
        pendingSelRef.current = { start: cur.start, end: c };
      } else {
        pendingSelRef.current = { start: c, end: cur.end };
      }
      updateOverlay();
    };

    const onTouchEnd = () => {
      // 不自动 commit 选区；保留高亮让用户点 action sheet 的 Pin
      // Don't auto-fire onSelect; keep the highlight visible so user can tap
      // the inline action sheet or touch again to adjust.
      dragMode = null;
      setDragging(false);
      // 触发 re-render 让 action sheet 位置根据最新选区计算
      setSelectionTick((n) => n + 1);
    };

    bubble.addEventListener("touchstart", onTouchStart, { passive: false });
    bubble.addEventListener("touchmove", onTouchMove, { passive: false });
    bubble.addEventListener("touchend", onTouchEnd);
    bubble.addEventListener("touchcancel", onTouchEnd);
    return () => {
      bubble.removeEventListener("touchstart", onTouchStart);
      bubble.removeEventListener("touchmove", onTouchMove);
      bubble.removeEventListener("touchend", onTouchEnd);
      bubble.removeEventListener("touchcancel", onTouchEnd);
      overlayUpdaterRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileSelectActive, isUser, messageId, onSelect]);

  // ── 行内 action sheet（Copy / Pin / Cancel）─────────────────────────
  // 挂在选区右下方；拖动中隐藏；点 Pin 后才 fire onSelect
  // Inline action sheet pinned below the selection; hides during drag;
  // Pin tap is the only thing that fires onSelect.
  const sheet = useMemo(() => {
    if (!mobileSelectActive || dragging) return null;
    const sel = pendingSelRef.current;
    if (!sel) return null;
    const range = buildRangeFromSel(sel);
    if (!range) return null;
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    const text = range.toString().trim();
    if (!text) return null;

    // Default: 选区下方；若会被屏幕底遮住，放到选区上方
    // Default below selection; flip above if it would clip.
    const SHEET_W = 176;
    const SHEET_H = 44;
    const margin = 8;
    let top = rect.bottom + 8;
    if (top + SHEET_H > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - SHEET_H - 8);
    }
    let left = rect.left + rect.width / 2 - SHEET_W / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - SHEET_W - margin));

    return { top, left, text, rect, range };
  // selectionTick 的作用：touchend 时 bump，让 action sheet 位置重算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileSelectActive, dragging, selectionTick]);

  const commitPin = () => {
    const bubble = divRef.current;
    const sel = pendingSelRef.current;
    if (!bubble || !sel || !onSelect) return;
    const range = buildRangeFromSel(sel);
    if (!range) return;
    const text = range.toString().trim();
    if (!text) return;
    const startOffset = getCharOffset(bubble, range.startContainer, range.startOffset);
    const endOffset = getCharOffset(bubble, range.endContainer, range.endOffset);
    const rect = range.getBoundingClientRect();
    onSelect(text, messageId, rect, startOffset, endOffset);
    // 保留选区（pending），父组件处理完 PinDialog 再通过 mobileSelectActive→false 清掉
    // Keep the pending selection until parent toggles mobileSelectActive off.
  };

  const commitCopy = async () => {
    if (!sheet) return;
    try { await navigator.clipboard.writeText(sheet.text); }
    catch { /* silent */ }
    // 复制完清掉选区
    pendingSelRef.current = null;
    setSelRects([]);
    setSelectionTick((n) => n + 1);
  };

  const cancelSelection = () => {
    pendingSelRef.current = null;
    setSelRects([]);
    setSelectionTick((n) => n + 1);
  };

  return (
    <div
      data-message-id={messageId}
      ref={(el) => {
        (divRef as { current: HTMLDivElement | null }).current = el;
        onMessageRef?.(messageId, el);
      }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4 group/bubble`}
    >
      <div className={`flex flex-col max-w-[78%] min-w-0 ${isUser ? "items-end" : "items-start"}`}>
        {/* WHO 行 — mono uppercase + pigment dot + 可选 model 名
            WHO row — mono uppercase label + pigment dot + optional model label (AI only). */}
        <div
          className="flex items-center gap-[7px] mb-[5px] select-none"
          style={{ color: "var(--ink-4)", userSelect: "none" }}
        >
          {/* WHO 行是 metadata —— 颜料点 / YOU·Deeppin / model 名都不该被框选成锚点
              The WHO row is metadata — pigment dot / YOU·Deeppin / model name
              shouldn't get selected and pinned. User label stays mono-caps
              ("YOU") for that chat-log aesthetic; AI label is the Deeppin
              brand in its natural case (not uppercased to "DEEPPIN"). */}
          <span
            className="w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{ background: isUser ? "var(--ink-3)" : "var(--accent)" }}
            aria-hidden
          />
          {isUser && userAvatarUrl && (
            <img
              src={userAvatarUrl}
              alt=""
              className="w-3.5 h-3.5 rounded-full -ml-0.5 object-cover"
              referrerPolicy="no-referrer"
              draggable={false}
            />
          )}
          {isUser ? (
            <span className="font-mono text-[9.5px] uppercase" style={{ letterSpacing: "0.12em" }}>
              {t.you}
            </span>
          ) : (
            <span className="font-serif text-[12px] font-medium" style={{ color: "var(--ink-2)", letterSpacing: "-0.005em" }}>
              {t.ai}
            </span>
          )}
          {!isUser && model && (
            <span
              className="font-mono lowercase tracking-normal truncate max-w-[160px]"
              style={{ color: "var(--ink-5)", fontSize: "9.5px" }}
              title={model}
            >
              · {model}
            </span>
          )}
        </div>
        <div
          ref={contentRef}
          onMouseUp={handleMouseUp}
          className={`relative px-[14px] py-[11px] text-[14.5px] leading-[1.6] ${
            // 移动端布局：永远 user-select: none —— 启用「Select 模式」时
            // 由 useEffect 里的 caretRangeFromPoint 接管，不依赖 native selection。
            // 桌面端保持原行为：select-text 让鼠标圈选生效。
            // Mobile: user-select stays off; the caretRangeFromPoint touch
            // handlers in select-mode build the Range manually. Desktop keeps
            // native select-text so mouse-drag selection works.
            mobileSelectActive !== undefined ? "select-none [touch-action:pan-y]" : "select-text"
          } ${
            isUser
              ? "bg-indigo-600 text-white whitespace-pre-wrap shadow-md shadow-indigo-950/20"
              : "bg-surface text-hi border border-subtle"
          }`}
          style={{
            borderRadius: 14,
            // 非对称圆角：user 的右下收 4，AI 的左下收 4 —— 给气泡一个「尾巴」方向
            ...(isUser
              ? { borderBottomRightRadius: 4 }
              : { borderBottomLeftRadius: 4 }),
          }}
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

        {/* Markdown/raw 切换 — AI 气泡底部 hover 显示（model 名已移到 WHO 行） */}
        {!isUser && !streaming && (
          <div className="mt-1 h-0 group-hover/bubble:h-4 overflow-hidden transition-[height] select-none">
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

      {/* 移动端行内 action sheet — 固定定位到选区下方（或上方，若空间不够）
          Mobile inline action sheet pinned next to the selection (below,
          or above if it would clip). Only rendered when there's a pending
          selection and we're not actively dragging. */}
      {sheet && typeof document !== "undefined" && createPortal(
        <div
          role="menu"
          style={{
            position: "fixed",
            top: sheet.top,
            left: sheet.left,
            zIndex: 60,
            background: "var(--ink)",
            color: "var(--paper)",
            borderRadius: 10,
            padding: 3,
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            boxShadow: "0 8px 24px rgba(27,26,23,0.22)",
          }}
        >
          <button
            type="button"
            onClick={commitCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-[12px] active:bg-white/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" style={{ opacity: 0.8 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            {t.copy}
          </button>
          <button
            type="button"
            onClick={commitPin}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors"
            style={{ background: "var(--accent)" }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
            </svg>
            {t.pinAction}
          </button>
          <button
            type="button"
            onClick={cancelSelection}
            aria-label="cancel"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md active:bg-white/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" style={{ opacity: 0.7 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          {/* 下三角 —— 仅当 sheet 在选区下方时显示（用 top 推断） */}
          {sheet.top > sheet.rect.bottom && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: -4,
                left: sheet.rect.left + sheet.rect.width / 2 - sheet.left - 4,
                width: 8,
                height: 8,
                background: "var(--ink)",
                transform: "rotate(45deg)",
              }}
            />
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default memo(MessageBubble);
