"use client";
// Thread-selection graph for the Merge modal. Same visual language as
// ThreadGraph (pigment circles, bezier edges, Fraunces labels) but with
// selected-state semantics: checked = filled pigment, unchecked = hollow
// outline only. Replaces the old dark-mode MergeTreeCanvas inside Merge.

import React, { useMemo } from "react";
import type { Thread, Message } from "@/lib/api";
import { useGraphZoomPan } from "@/lib/useGraphZoomPan";

const PIG_VAR = ["var(--pig-1)", "var(--pig-2)", "var(--pig-3)", "var(--pig-4)", "var(--pig-5)"];

const ROW_H = 92;
const PAD = 46;

interface Positioned {
  thread: Thread;
  x: number;
  y: number;
  pigmentIdx: number;
}

interface Props {
  threads: Thread[];
  selected: Set<string>;
  activeThreadId?: string | null;
  onToggle: (threadId: string) => void;
  messagesByThread?: Record<string, Message[] | undefined>;
  compact?: boolean;
}

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

function layoutNodes(
  threads: Thread[],
  messagesByThread: Record<string, Message[] | undefined> | undefined,
  width: number,
): { nodes: Positioned[]; height: number } {
  // Leaf-count-weighted recursive layout (matches ThreadGraph). Each subtree
  // claims horizontal space proportional to its leaves; children stay within
  // the parent's [xLeft, xRight] range — so parent→child edges never cross.
  const byParent = new Map<string | null, Thread[]>();
  for (const thr of threads) {
    const list = byParent.get(thr.parent_thread_id) ?? [];
    list.push(thr);
    byParent.set(thr.parent_thread_id, list);
  }

  const pigIdxMap = new Map<string, number>();
  for (const [parentId, siblings] of byParent) {
    if (parentId === null) continue;
    const sorted = sortSiblings(siblings, messagesByThread?.[parentId] ?? []);
    sorted.forEach((thr, i) => pigIdxMap.set(thr.id, i % PIG_VAR.length));
    byParent.set(parentId, sorted);
  }

  const mainThread = threads.find((t) => t.parent_thread_id === null);
  const positions = new Map<string, { x: number; y: number }>();
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
    positions.set(id, { x: (xLeft + xRight) / 2, y: 40 + depth * ROW_H });
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

  if (mainThread) place(mainThread.id, 0, PAD, width - PAD);

  for (const thr of threads) {
    if (!positions.has(thr.id)) {
      positions.set(thr.id, { x: width / 2, y: 40 + thr.depth * ROW_H });
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

  const height = Math.max(240, (maxDepth + 1) * ROW_H + 60);
  return { nodes, height };
}

function wrapLabel(text: string, maxPx: number): string[] {
  const charPx = 6.6;
  const maxChars = Math.max(6, Math.floor(maxPx / charPx));
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) {
      cur = (cur + " " + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === 1) break;
    }
  }
  if (cur && lines.length < 2) lines.push(cur);
  if (lines.length === 2 && lines[1].length > maxChars) {
    lines[1] = lines[1].slice(0, maxChars - 1) + "…";
  } else if (lines.length === 1 && lines[0].length > maxChars) {
    lines[0] = lines[0].slice(0, maxChars - 1) + "…";
  }
  return lines.slice(0, 2);
}

export default function MergeGraph({
  threads,
  selected,
  activeThreadId,
  onToggle,
  messagesByThread,
  compact,
}: Props) {
  // Container width: compact = inline right rail (~300); otherwise ~460 inside the merge modal.
  // Container width — compact uses ~300 (rail embed), otherwise ~460 (modal).
  const width = compact ? 300 : 460;
  const { nodes, height } = useMemo(
    () => layoutNodes(threads, messagesByThread, width),
    [threads, messagesByThread, width],
  );

  if (nodes.length === 0) return null;

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
      labelBudget.set(n.thread.id, Math.max(56, 2 * Math.min(leftClear, rightClear)));
    });
  }

  const posById = new Map(nodes.map((n) => [n.thread.id, n]));

  // Shared zoom/pan — wheel = cursor-anchored zoom, drag = pan, auto-fit.
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
        {/* edges */}
        {nodes
          .filter((n) => n.thread.parent_thread_id)
          .map((n) => {
            const parent = posById.get(n.thread.parent_thread_id!);
            if (!parent) return null;
            const dy = n.y - parent.y;
            // If either endpoint isn't selected, fade the edge; otherwise use the main rule color.
            const bothSelected = selected.has(n.thread.id) && selected.has(parent.thread.id);
            const d = `M ${parent.x} ${parent.y} C ${parent.x} ${parent.y + dy * 0.45}, ${n.x} ${n.y - dy * 0.45}, ${n.x} ${n.y}`;
            return (
              <path
                key={`edge-${n.thread.id}`}
                d={d}
                fill="none"
                stroke={bothSelected ? "var(--rule-strong)" : "var(--rule)"}
                strokeWidth={1}
                strokeDasharray={bothSelected ? undefined : "3 3"}
              />
            );
          })}

        {/* nodes */}
        {nodes.map((n) => {
          const isActive = n.thread.id === activeThreadId;
          const isRoot = n.thread.parent_thread_id === null;
          const isSelected = selected.has(n.thread.id);
          const color = isRoot
            ? "var(--ink)"
            : n.pigmentIdx >= 0
              ? PIG_VAR[n.pigmentIdx]
              : "var(--ink-3)";
          const r = isActive ? 6.5 : 5;
          const lines = wrapLabel(
            n.thread.title ?? n.thread.anchor_text?.slice(0, 28) ?? "thread",
            labelBudget.get(n.thread.id) ?? 60,
          );
          return (
            <g
              key={`node-${n.thread.id}`}
              style={{ cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); onToggle(n.thread.id); }}
            >
              {/* Glow halo when selected. */}
              {isSelected && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r + 4}
                  fill={color}
                  opacity={0.15}
                />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={isSelected ? color : "var(--paper-2)"}
                stroke={color}
                strokeWidth={isSelected ? 0 : 1.5}
              />
              {/* Selected check mark. */}
              {isSelected && !isRoot && (
                <path
                  d={`M ${n.x - 2.5} ${n.y + 0.3} L ${n.x - 0.5} ${n.y + 2.3} L ${n.x + 2.8} ${n.y - 1.7}`}
                  fill="none"
                  stroke="var(--paper)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text
                x={n.x}
                y={n.y + 20}
                fontSize={11}
                fill={isSelected ? "var(--ink)" : "var(--ink-4)"}
                style={{ fontFamily: "var(--font-serif)" }}
                textAnchor="middle"
                fontWeight={isSelected ? 500 : 400}
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
