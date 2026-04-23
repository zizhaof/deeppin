"use client";
// components/Layout/ThreadGraph.tsx
// 右栏 graph 视图 — 按设计：pigment-colored 圆节点 + 平滑贝塞尔连线
// + Fraunces 标签 + 未读脉动圆。
// Right-rail graph view — pigment-filled circle nodes + smooth bezier edges
// + Fraunces labels + pulsing unread indicator.

import React, { useMemo } from "react";
import type { Thread, Message } from "@/lib/api";
import { useT } from "@/stores/useLangStore";

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
  /** 渲染宽度，通常是父容器 clientWidth。默认 268。 */
  width?: number;
}

/** 同 ThreadTree.sortSiblings —— 保持两个视图的 pigment 顺序一致 */
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

/** 计算每个节点在其 depth 层的水平位置；同一父节点下兄弟按锚点顺序排 */
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

  // 给每个非主线 thread 分配一个 pigment index（按其兄弟顺序）
  const pigIdxMap = new Map<string, number>();
  for (const [parentId, siblings] of byParent) {
    if (parentId === null) continue;
    const sorted = sortSiblings(siblings, messagesByThread[parentId] ?? []);
    sorted.forEach((thr, i) => pigIdxMap.set(thr.id, i % PIG_VAR.length));
  }

  // 按 depth 分层
  const byDepth = new Map<number, Thread[]>();
  for (const thr of threads) {
    const list = byDepth.get(thr.depth) ?? [];
    list.push(thr);
    byDepth.set(thr.depth, list);
  }

  // 同 depth 内按兄弟顺序排序（沿父链走锚点顺序）—— 简化：按 created_at
  const positions = new Map<string, { x: number; y: number }>();
  const maxDepth = Math.max(0, ...Array.from(byDepth.keys()));

  for (const [depth, arr] of byDepth) {
    // 按父节点 pigment + anchor_start 排序，保证视觉稳定
    arr.sort((a, b) => {
      if (a.parent_thread_id !== b.parent_thread_id) {
        return (a.parent_thread_id ?? "").localeCompare(b.parent_thread_id ?? "");
      }
      return (a.anchor_start_offset ?? 0) - (b.anchor_start_offset ?? 0);
    });
    const y = 36 + depth * ROW_H;
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

  const height = Math.max(260, (maxDepth + 1) * ROW_H + 56);
  return { nodes, height, pigIdxMap };
}

/** 把标题裁成最多两行（字符估算，兼顾中日文与英文） */
function wrapLabel(text: string, maxPx: number): string[] {
  const charPx = 6.6; // ~11px Fraunces 的平均字宽估算
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

export default function ThreadGraph({
  threads,
  activeThreadId,
  unreadCounts,
  messagesByThread,
  onSelect,
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

  // 计算每个节点的标签可用宽度（跟左右邻居距离的一半，取小值）
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

  return (
    <div className="h-full overflow-auto scrollbar-thin px-3 py-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        {/* edges — 平滑贝塞尔，用 rule 灰作为底色 */}
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
      </svg>
    </div>
  );
}
