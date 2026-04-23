"use client";
// components/Layout/ThreadGraph.tsx
// 右栏 graph 视图 — 按设计：pigment-colored 圆节点 + 平滑贝塞尔连线
// + Fraunces 标签 + 未读脉动圆。
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
  /** 节点 hover 触发 —— 复用 MessageBubble 的 onAnchorHover 接口，让 chat page
   *  共用同一个 AnchorPreviewPopover（Q + A 预览）。
   *  Node hover — reuses the onAnchorHover contract so the chat page's
   *  AnchorPreviewPopover (Q + A) handles graph hover too. */
  onNodeHover?: (threadIds: string[], rect: DOMRect | null) => void;
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

/** 计算每个节点的位置。
 *
 *  旧版按 depth 分层、每层平铺整宽 —— depth 2 只有 2 个节点但被撑到左右两侧，
 *  跟 depth 1 拉开的距离完全不对。新版用「叶子数加权」的递归布局：每棵子树拿到
 *  跟其叶子数成比例的横向空间，每个节点居中于其所属区间内。这样子节点自然聚
 *  拢在父节点下方，深度再多也不会空虚。
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

  // 给每个非主线 thread 分配一个 pigment index（按锚点顺序）
  // Also pre-sort each parent's children in-place so recursion walks them in
  // that order — this fixes the visual left-to-right sibling layout too.
  const pigIdxMap = new Map<string, number>();
  for (const [parentId, siblings] of byParent) {
    if (parentId === null) continue;
    const sorted = sortSiblings(siblings, messagesByThread[parentId] ?? []);
    sorted.forEach((thr, i) => pigIdxMap.set(thr.id, i % PIG_VAR.length));
    byParent.set(parentId, sorted);
  }

  const mainThread = threads.find((t) => t.parent_thread_id === null);
  const positions = new Map<string, { x: number; y: number }>();

  // 递归：每个节点落在 [xLeft, xRight] 中心；子节点按 leafCount 占比瓜分区间
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

  // 如果某线程没被 place（坏数据：父 id 指向不存在的 thread），兜底放在中间
  // Fallback for orphan threads (parent_thread_id points to nothing).
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

  // 共享 zoom/pan —— 滚轮缩放（以光标为焦点）+ 拖拽平移 + 首次 fit
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
              onMouseEnter={(e) => {
                // 取 circle 的 bbox（node label + 圆）——位置给 popover 用
                // Use the <g>'s bbox so the popover sits right under the node.
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
