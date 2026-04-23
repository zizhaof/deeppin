"use client";
// components/MergeGraph.tsx
// Merge 模态框里的线程选择图 —— 与 ThreadGraph 同一视觉语言：
// 颜料色圆点 + bezier 连线 + Fraunces 标签。加上 "selected" 语义：
// 勾选的节点实心填充对应 pigment，不勾选的空心只有描边。
//
// Thread-selection graph for the Merge modal. Same visual language as
// ThreadGraph (pigment circles, bezier edges, Fraunces labels) but with
// selected-state semantics: checked = filled pigment, unchecked = hollow
// outline only. Replaces the old dark-mode MergeTreeCanvas inside Merge.

import React, { useMemo } from "react";
import type { Thread, Message } from "@/lib/api";

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
  }

  const byDepth = new Map<number, Thread[]>();
  for (const thr of threads) {
    const list = byDepth.get(thr.depth) ?? [];
    list.push(thr);
    byDepth.set(thr.depth, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const maxDepth = Math.max(0, ...Array.from(byDepth.keys()));

  for (const [depth, arr] of byDepth) {
    arr.sort((a, b) => {
      if (a.parent_thread_id !== b.parent_thread_id) {
        return (a.parent_thread_id ?? "").localeCompare(b.parent_thread_id ?? "");
      }
      return (a.anchor_start_offset ?? 0) - (b.anchor_start_offset ?? 0);
    });
    const y = 40 + depth * ROW_H;
    const usable = width - PAD * 2;
    const gap = arr.length === 1 ? 0 : usable / (arr.length - 1);
    arr.forEach((thr, i) => {
      const x = arr.length === 1 ? width / 2 : PAD + i * gap;
      positions.set(thr.id, { x, y });
    });
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
  // 容器宽度：compact=内嵌右栏 (~300)，否则 merge modal 里给 ~460
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

  return (
    <div className="h-full w-full overflow-auto scrollbar-thin flex items-center justify-center p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", maxWidth: width, height: "auto" }}
      >
        {/* edges */}
        {nodes
          .filter((n) => n.thread.parent_thread_id)
          .map((n) => {
            const parent = posById.get(n.thread.parent_thread_id!);
            if (!parent) return null;
            const dy = n.y - parent.y;
            // 父→子任一不选 → 连线变浅；否则用 rule 主色
            // If either endpoint isn't selected, fade the edge.
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
              {/* 选中时额外的 glow 圈 / glow halo when selected */}
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
              {/* 选中打钩标记 */}
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
      </svg>
    </div>
  );
}
