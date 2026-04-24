"use client";
// Right-rail graph view — pigment-filled circle nodes + smooth bezier edges
// + Fraunces labels + pulsing unread indicator.

import React, { useMemo } from "react";
import type { Thread, Message } from "@/lib/api";
import { useT } from "@/stores/useLangStore";
import { useGraphZoomPan } from "@/lib/useGraphZoomPan";

const PIG_VAR = ["var(--pig-1)", "var(--pig-2)", "var(--pig-3)", "var(--pig-4)", "var(--pig-5)"];

const ROW_H = 96;
const PAD = 46;

interface Positioned {
  thread: Thread;
  x: number;
  y: number;
  pigmentIdx: number;
}

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  unreadCounts: Record<string, number>;
  messagesByThread: Record<string, Message[]>;
  onSelect: (threadId: string) => void;
  /** Node hover — reuses the onAnchorHover contract so the chat page's
   *  AnchorPreviewPopover (Q + A) handles graph hover too. */
  onNodeHover?: (threadIds: string[], rect: DOMRect | null) => void;
  /** Render width, usually the parent's clientWidth. Defaults to 268. */
  width?: number;
}

/** Same as ThreadTree.sortSiblings — keeps the two views' pigment order in sync. */
function sortSiblings(siblings: Thread[], parentMessages: Message[]): Thread[] {
  const msgOrder: Record<string, number> = {};
  parentMessages.forEach((m, i) => { msgOrder[m.id.toLowerCase()] = i; });
  return [...siblings].sort((a, b) => {
    const ai = a.anchor_message_id != null ? (msgOrder[a.anchor_message_id.toLowerCase()] ?? 9999) : 9999;
    const bi = b.anchor_message_id != null ? (msgOrder[b.anchor_message_id.toLowerCase()] ?? 9999) : 9999;
    if (ai !== bi) return ai - bi;
    const aStart = a.anchor_start_offset;
    const bStart = b.anchor_start_offset;
    if (aStart != null && bStart != null && aStart !== bStart) return aStart - bStart;
    if (aStart != null && bStart == null) return -1;
    if (aStart == null && bStart != null) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

/** Compute each node's position.
 *
 *  Old version laid out each depth across the full width, so 2 depth-2 nodes
 *  got slammed to the edges with no visual relationship to their parent. This
 *  replacement is a classic leaf-count-weighted tree layout: each subtree
 *  claims horizontal space proportional to its leaves, and each node sits at
 *  the center of its allocated slice. Children cluster under their parent at
 *  any depth. */
function layoutNodes(
  threads: Thread[],
  messagesByThread: Record<string, Message[]>,
  width: number,
): { nodes: Positioned[]; height: number; pigIdxMap: Map<string, number> } {
  const byParent = new Map<string | null, Thread[]>();
  for (const thr of threads) {
    const list = byParent.get(thr.parent_thread_id) ?? [];
    list.push(thr);
    byParent.set(thr.parent_thread_id, list);
  }

  // Assign each non-main thread a pigment index (by anchor order) and pre-sort
  // each parent's children in-place so recursion walks them in that order —
  // this also fixes the visual left-to-right sibling layout.
  const pigIdxMap = new Map<string, number>();
  for (const [parentId, siblings] of byParent) {
    if (parentId === null) continue;
    const sorted = sortSiblings(siblings, messagesByThread[parentId] ?? []);
    sorted.forEach((thr, i) => pigIdxMap.set(thr.id, i % PIG_VAR.length));
    byParent.set(parentId, sorted);
  }

  const mainThread = threads.find((t) => t.parent_thread_id === null);
  const positions = new Map<string, { x: number; y: number }>();

  // Recursive: each node sits at the center of [xLeft, xRight]; children split
  // the range proportional to their leaf counts.
  const leafCountCache = new Map<string, number>();
  function leafCount(id: string): number {
    const cached = leafCountCache.get(id);
    if (cached != null) return cached;
    const kids = byParent.get(id) ?? [];
    const n = kids.length === 0 ? 1 : kids.reduce((acc, k) => acc + leafCount(k.id), 0);
    leafCountCache.set(id, n);
    return n;
  }

  let maxDepth = 0;
  function place(id: string, depth: number, xLeft: number, xRight: number) {
    const thr = threads.find((t) => t.id === id);
    if (!thr) return;
    if (depth > maxDepth) maxDepth = depth;
    positions.set(id, { x: (xLeft + xRight) / 2, y: 36 + depth * ROW_H });
    const kids = byParent.get(id) ?? [];
    if (kids.length === 0) return;
    const totalLeaves = kids.reduce((acc, k) => acc + leafCount(k.id), 0);
    let cursor = xLeft;
    for (const k of kids) {
      const w = ((xRight - xLeft) * leafCount(k.id)) / totalLeaves;
      place(k.id, depth + 1, cursor, cursor + w);
      cursor += w;
    }
  }

  if (mainThread) {
    place(mainThread.id, 0, PAD, width - PAD);
  }

  // Fallback for orphan threads (parent_thread_id points to a missing thread).
  for (const thr of threads) {
    if (!positions.has(thr.id)) {
      positions.set(thr.id, { x: width / 2, y: 36 + thr.depth * ROW_H });
      if (thr.depth > maxDepth) maxDepth = thr.depth;
    }
  }

  const nodes: Positioned[] = threads.map((thr) => {
    const p = positions.get(thr.id)!;
    return {
      thread: thr,
      x: p.x,
      y: p.y,
      pigmentIdx: pigIdxMap.get(thr.id) ?? -1,
    };
  });

  const height = Math.max(260, (maxDepth + 1) * ROW_H + 56);
  return { nodes, height, pigIdxMap };
}

/** Wrap a title into up to `maxLines` lines, ellipsizing the last line if the
 *  text still doesn't fit. Latin: greedy word-wrap with hard-break for tokens
 *  longer than one line. CJK / no-whitespace input: hard-break by character. */
function wrapLabel(text: string, maxPx: number, maxLines = 3): string[] {
  const charPx = 6.6; // estimated average glyph width for ~11px Fraunces
  const maxChars = Math.max(6, Math.floor(maxPx / charPx));
  if (text.length <= maxChars) return [text];

  const lines: string[] = [];

  if (!/\s/.test(text)) {
    // CJK / no-space path
    for (let i = 0; i < maxLines && i * maxChars < text.length; i++) {
      lines.push(text.slice(i * maxChars, (i + 1) * maxChars));
    }
  } else {
    const words = text.split(/\s+/);
    let cur = "";
    for (const w of words) {
      if (lines.length >= maxLines) break;
      const candidate = cur ? cur + " " + w : w;
      if (candidate.length <= maxChars) { cur = candidate; continue; }
      if (cur) {
        lines.push(cur);
        cur = "";
        if (lines.length >= maxLines) break;
      }
      // Token longer than one line — hard-break across remaining lines.
      let rest = w;
      while (rest.length > maxChars && lines.length < maxLines - 1) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      cur = rest;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
  }

  // Ellipsize last line if any non-whitespace tail was dropped.
  const stripped = text.replace(/\s+/g, "").length;
  const visible = lines.reduce((a, l) => a + l.length, 0);
  if (visible < stripped) {
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] =
      last.length >= maxChars
        ? last.slice(0, maxChars - 1) + "…"
        : last + "…";
  }
  return lines.slice(0, maxLines);
}

export default function ThreadGraph({
  threads,
  activeThreadId,
  unreadCounts,
  messagesByThread,
  onSelect,
  onNodeHover,
  width = 268,
}: Props) {
  const t = useT();

  const { nodes, height } = useMemo(
    () => layoutNodes(threads, messagesByThread, width),
    [threads, messagesByThread, width],
  );

  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[10px] text-ph select-none tracking-wider">{t.noThreads}</p>
      </div>
    );
  }

  // Compute each node's available label width (half the distance to its
  // nearest neighbor on each side, take the smaller).
  const nodesByDepth = new Map<number, Positioned[]>();
  for (const n of nodes) {
    const list = nodesByDepth.get(n.thread.depth) ?? [];
    list.push(n);
    nodesByDepth.set(n.thread.depth, list);
  }
  const labelBudget = new Map<string, number>();
  for (const [, arr] of nodesByDepth) {
    arr.sort((a, b) => a.x - b.x);
    arr.forEach((n, i) => {
      const leftClear = i === 0 ? n.x - 4 : (n.x - arr[i - 1].x) / 2 - 3;
      const rightClear = i === arr.length - 1 ? (width - n.x) - 4 : (arr[i + 1].x - n.x) / 2 - 3;
      labelBudget.set(n.thread.id, Math.max(48, 2 * Math.min(leftClear, rightClear)));
    });
  }

  const posById = new Map(nodes.map((n) => [n.thread.id, n]));

  // Shared zoom/pan — wheel = cursor-anchored zoom, drag = pan, auto-fit on mount.
  const zp = useGraphZoomPan({
    contentWidth: width,
    contentHeight: height,
    refitOn: `${threads.length}:${height}:${width}`,
  });

  return (
    <div
      ref={zp.containerRef}
      {...zp.pointerHandlers}
      className="h-full w-full overflow-hidden relative select-none touch-none"
      style={{ cursor: zp.dragging ? "grabbing" : "grab" }}
    >
      <svg
        width={zp.viewport.w || 1}
        height={zp.viewport.h || 1}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <g transform={zp.transformString}>
        {/* edges — smooth bezier, rule gray as the base color */}
        {nodes
          .filter((n) => n.thread.parent_thread_id)
          .map((n) => {
            const parent = posById.get(n.thread.parent_thread_id!);
            if (!parent) return null;
            const dy = n.y - parent.y;
            const d = `M ${parent.x} ${parent.y} C ${parent.x} ${parent.y + dy * 0.45}, ${n.x} ${n.y - dy * 0.45}, ${n.x} ${n.y}`;
            return (
              <path
                key={`edge-${n.thread.id}`}
                d={d}
                fill="none"
                stroke="var(--rule)"
                strokeWidth={1}
              />
            );
          })}

        {/* nodes */}
        {nodes.map((n) => {
          const isActive = n.thread.id === activeThreadId;
          const isRoot = n.thread.parent_thread_id === null;
          const color = isRoot
            ? "var(--ink)"
            : n.pigmentIdx >= 0
              ? PIG_VAR[n.pigmentIdx]
              : "var(--ink-3)";
          const hasAi = (messagesByThread[n.thread.id] ?? []).some((m) => m.role === "assistant");
          const unread = hasAi && (unreadCounts[n.thread.id] ?? 0) > 0 && !isActive;
          const r = isActive ? 6 : 4.5;
          const lines = wrapLabel(
            n.thread.title ?? n.thread.anchor_text?.slice(0, 24) ?? t.subThread,
            labelBudget.get(n.thread.id) ?? 48,
          );
          return (
            <g
              key={`node-${n.thread.id}`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(n.thread.id)}
              onMouseEnter={(e) => {
                // Use the <g>'s bbox (node label + circle) so the popover sits right under the node.
                const rect = (e.currentTarget as SVGGElement).getBoundingClientRect();
                onNodeHover?.([n.thread.id], rect);
              }}
              onMouseLeave={() => onNodeHover?.([], null)}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={isActive ? color : "var(--paper-2)"}
                stroke={color}
                strokeWidth={isActive ? 0 : 1.25}
              />
              {unread && (
                <circle cx={n.x + 7} cy={n.y - 5} r={3.5} fill="var(--accent)" stroke="var(--paper)" strokeWidth={1.25}>
                  <animate attributeName="r" values="3.5;4.5;3.5" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <text
                x={n.x}
                y={n.y + 18}
                fontSize={10.5}
                fill={isActive ? "var(--ink)" : "var(--ink-3)"}
                style={{ fontFamily: "var(--font-serif)" }}
                textAnchor="middle"
                fontWeight={isActive ? 500 : 400}
              >
                {lines.map((ln, i) => (
                  <tspan key={i} x={n.x} dy={i === 0 ? 0 : 12}>
                    {ln}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        </g>
      </svg>
    </div>
  );
}
