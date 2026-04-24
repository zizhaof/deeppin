"use client";
// components/MainThread/MessageBubble.tsx

import { useRef, useState, useEffect, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import MarkdownContent from "@/components/MarkdownContent";
import { useT } from "@/stores/useLangStore";

/** Called externally (PinMenu onClose / handlePin) to clear the native text selection. */
export function clearActiveHighlight() {
  window.getSelection()?.removeAllRanges();
}

const COLLAPSE_THRESHOLD = 300;

export interface AnchorRange {
  text: string;
  threadId: string;
  /** Character offsets (from the backend) for precise placement so identical text isn't highlighted multiple times. */
  startOffset?: number;
  endOffset?: number;
}

interface Props {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  anchors?: AnchorRange[];
  /** Set of thread IDs with unread replies — anchors opt into the breathing animation when included. */
  unreadThreadIds?: Set<string>;
  userAvatarUrl?: string | null;
  /** LLM model name that produced this reply (e.g. "groq/llama-3.3-70b-versatile"). */
  model?: string | null;
  /** Mobile-only "select mode" toggle:
   *    undefined → desktop behavior (mouseup + native long-press selection)
   *    false → mobile, user-select:none, no selection at all
   *    true  → mobile, custom touch tracking via caretRangeFromPoint/Position;
   *            release fires onSelect immediately. */
  mobileSelectActive?: boolean;
  onSelect?: (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => void;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
}

/**
 * After a React re-render, the DOM nodes a cloned Range points at may have
 * been replaced, causing addRange to silently fail. This function re-locates
 * the selection in the current DOM by searching for its text. When the
 * selection spans paragraphs, only the first paragraph is restored (matches
 * the highlightStr strategy).
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
    // Prefer backend-stored char offsets for exact placement of a unique anchor.
    if (startOffset != null && endOffset != null && startOffset < endOffset && endOffset <= content.length) {
      spans.push({ start: startOffset, end: endOffset, threadId });
      continue;
    }
    // Fallback: search for the first matching position by text (legacy data).
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

    // Read = static 1px border-bottom. Unread = breathing underline driven by
    // the .anchor-breathing CSS class (box-shadow + opacity loop), with the
    // pigment color piped in via the --anchor-color custom property. When
    // multiple anchors stack, they nest as multiple pigment-colored underlines.
    let inner: React.ReactNode = segText;
    for (let j = covering.length - 1; j >= 0; j--) {
      const color = colorMap.get(covering[j].threadId)!;
      inner = (
        <span
          key={covering[j].threadId}
          className={isUnread ? "anchor-breathing" : undefined}
          style={
            isUnread
              ? ({ "--anchor-color": color } as React.CSSProperties)
              : { borderBottom: `1px solid ${color}`, paddingBottom: "1px" }
          }
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

/** Selection-highlight rectangle in coordinates relative to the content div. */
interface SelRect { top: number; left: number; width: number; height: number; }

/** Mobile persistent selection — a pair of text-node carets. */
export interface MBCaret { node: Text; offset: number; }
export interface MBSelection { start: MBCaret; end: MBCaret; }

/** Build a forward Range from a caret pair in DOM order (reverse pairs don't throw). */
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
}: Props) {
  const t = useT();
  const isUser = role === "user";
  const divRef = useRef<HTMLDivElement>(null);
  // Content-area div used to compute selection-overlay coords.
  const contentRef = useRef<HTMLDivElement>(null);
  // Last touchend timestamp — prevents mobile browsers' synthesized mouseup from firing twice.
  const lastTouchEndRef = useRef(0);
  const [expanded, setExpanded] = useState(false);
  /** Toggle for raw-vs-rendered mode on AI messages. */
  const [rawMode, setRawMode] = useState(false);
  /** Selection-overlay rectangle list (mobile: OS selection vanishes after touchend but this overlay persists). */
  const [selRects, setSelRects] = useState<SelRect[]>([]);
  /** Mobile persistent selection — ref changes on every touch move;
   *  a paired state tick triggers re-renders so the action-sheet position
   *  recomputes from the latest range. */
  const pendingSelRef = useRef<MBSelection | null>(null);
  const [selectionTick, setSelectionTick] = useState(0);
  /** Dragging — hide the action sheet so it doesn't float under the user's finger. */
  const [dragging, setDragging] = useState(false);
  /** Exposes the internal setPending to touch handlers + the action sheet. */
  const overlayUpdaterRef = useRef<(() => void) | null>(null);

  const needsCollapse = isUser && !streaming && content.length > COLLAPSE_THRESHOLD;
  const displayContent = needsCollapse && !expanded ? content.slice(0, COLLAPSE_THRESHOLD) : content;

  // Shared selection logic for desktop mouseup and mobile selectionchange.
  const handleSelection = () => {
    if (!onSelect || isUser) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const bubble = divRef.current;
    if (!bubble) return;
    const range = sel.getRangeAt(0);
    if (!bubble.contains(range.commonAncestorContainer)) return;

    // Snapshot the selection before onSelect triggers a re-render.
    const savedRange = range.cloneRange();
    const startOffset = getCharOffset(bubble, range.startContainer, range.startOffset);
    const endOffset = getCharOffset(bubble, range.endContainer, range.endOffset);
    const rect = range.getBoundingClientRect();
    const selectedText = sel.toString().trim();

    onSelect(selectedText, messageId, rect, startOffset, endOffset);

    // onSelect → parent setState → React re-render → browser drops the selection.
    // Restore on the next frame: try cloneRange first (fast); if that fails, re-locate by text search.
    requestAnimationFrame(() => {
      const s = window.getSelection();
      if (!s || !s.isCollapsed) return; // selection survived — nothing to restore

      // 1. Try the cloned Range directly (works when the DOM nodes weren't replaced).
      try {
        s.removeAllRanges();
        s.addRange(savedRange);
      } catch { /* ignore */ }

      // 2. If still collapsed (DOM nodes were replaced), re-locate in the current DOM by text.
      if (s.isCollapsed) {
        const bubble = divRef.current;
        if (bubble) restoreSelectionByText(bubble, selectedText);
      }
    });
  };

  // Desktop: mouseup fires directly (skip the mobile-synthesized mouseup).
  const handleMouseUp = () => {
    if (Date.now() - lastTouchEndRef.current < 600) return;
    handleSelection();
  };

  // Convert the current selection to a list of rects (relative to the content
  // div) and store them in selRects. On mobile the OS selection vanishes after
  // touchend, but the React-driven overlay persists.
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

  // Desktop native selection: long-press + debounced selectionchange.
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

  // Clear stale overlay + pending ref when select mode toggles off.
  useEffect(() => {
    if (mobileSelectActive === false) {
      setSelRects([]);
      pendingSelRef.current = null;
      setSelectionTick((n) => n + 1);
    }
  }, [mobileSelectActive]);

  // ── Mobile select-mode custom touch tracking ──
  //
  // Behavior:
  //  touch-down on nothing → fresh selection (start = end = touch)
  //  touch-down inside an existing selection (or within 16px grace) → figure
  //    out which edge is closer (by pixel distance), release that edge at the
  //    touch point, keep the other side — the finger now drags that edge
  //  touch-down clearly outside → discard the old selection, start fresh
  //  touch-up → stop dragging; the highlight stays; the user taps Pin in the
  //    action sheet to commit (onSelect doesn't fire on touchend)
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

    /** Get the page (x, y) of a single caret — used to find the nearest edge by pixel distance. */
    const caretPoint = (c: MBCaret): { x: number; y: number } | null => {
      try {
        const r = document.createRange();
        r.setStart(c.node, c.offset);
        r.setEnd(c.node, c.offset);
        const rect = r.getBoundingClientRect();
        if (!rect.height && !rect.width) {
          // Zero-width ranges sometimes don't return a rect — fall back to the parent rect's start.
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

    /** Whether the touch point falls inside (or within a 16px grace zone of) the current pendingSel. */
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

    // Expose the update function to edge-adjust drag handlers + the action sheet.
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
        // No existing selection → start fresh.
        dragMode = "fresh";
        pendingSelRef.current = { start: c, end: c };
        updateOverlay();
        return;
      }

      // Existing selection → check where the touch landed.
      const inside = touchOnSelection(touch.clientX, touch.clientY, cur);
      if (!inside) {
        // Touch landed clearly outside the selection → discard it and start fresh.
        dragMode = "fresh";
        pendingSelRef.current = { start: c, end: c };
        updateOverlay();
        return;
      }

      // Touch inside or near the selection → release the edge whose caret is
      // closest (by pixel distance) and let the finger drag that edge.
      const sp = caretPoint(cur.start);
      const ep = caretPoint(cur.end);
      const dist = (p: { x: number; y: number } | null) =>
        p ? Math.hypot(p.x - touch.clientX, p.y - touch.clientY) : Infinity;
      const distStart = dist(sp);
      const distEnd = dist(ep);

      if (distStart <= distEnd) {
        // Closer to start → start edge is draggable, end stays; selection collapses to [touch..end].
        dragMode = "adjust-start";
        pendingSelRef.current = { start: c, end: cur.end };
      } else {
        // Closer to end → end edge is draggable.
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
      // Don't auto-fire onSelect; keep the highlight visible so user can tap
      // the inline action sheet or touch again to adjust.
      dragMode = null;
      setDragging(false);
      // Tick state so the action sheet's position recomputes from the latest selection.
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

  // ── Inline action sheet (Copy / Pin / Cancel) ───────────────────────
  // Pinned below the selection; hidden during drag; Pin tap is the only
  // thing that fires onSelect.
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

    // Default position is below the selection; flip above when it would clip the viewport.
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
  // selectionTick is bumped on touchend so the action sheet repositions.
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
    // Keep the pending selection; the parent clears it by toggling mobileSelectActive → false after PinDialog finishes.
  };

  const commitCopy = async () => {
    if (!sheet) return;
    try { await navigator.clipboard.writeText(sheet.text); }
    catch { /* silent */ }
    // Copy is committed — clear the selection.
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
      }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4 group/bubble`}
    >
      <div className={`flex flex-col max-w-[78%] min-w-0 ${isUser ? "items-end" : "items-start"}`}>
        {/* WHO row — mono uppercase label + pigment dot + optional model label (AI only). */}
        <div
          className="flex items-center gap-[7px] mb-[5px] select-none"
          style={{ color: "var(--ink-4)", userSelect: "none" }}
        >
          {/* The WHO row is metadata — pigment dot / YOU·Deeppin / model name
              shouldn't get selected and pinned. User label stays mono-caps
              ("YOU") for the chat-log aesthetic; AI label is the Deeppin
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
            // Asymmetric corner radius: user bubble tightens its bottom-right, AI bubble its bottom-left — gives each a "tail" direction.
            ...(isUser
              ? { borderBottomRightRadius: 4 }
              : { borderBottomLeftRadius: 4 }),
          }}
        >
          {/* Persistent selection overlay: on mobile the OS selection vanishes after touchend, but this layer keeps the highlight visible. */}
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

        {/* Markdown/raw toggle — appears on hover at the bottom of AI bubbles (model name moved to the WHO row). */}
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

      {/* Mobile inline action sheet pinned next to the selection (below,
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
          {/* Down-pointing arrow — only shown when the sheet sits below the selection (inferred from `top`). */}
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
