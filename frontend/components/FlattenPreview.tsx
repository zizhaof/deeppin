"use client";
// components/FlattenPreview.tsx
//
// 扁平化前 / 后的小型可视化 — 显示树状结构（多条 sub-thread）
// 如何 collapse 成一条线性主线。用真实 threads 数据为形状参考。
// Before/after visualization for the flatten action — shows how the tree
// collapses into a single linear main thread. Uses actual threads as shape reference.

import React, { useMemo } from "react";
import type { Thread } from "@/lib/api";
import { useT } from "@/stores/useLangStore";

const PIG_VAR = ["var(--pig-1)", "var(--pig-2)", "var(--pig-3)", "var(--pig-4)", "var(--pig-5)"];
const ROW_H = 24;
const PAD_X = 12;

interface Props {
  threads: Thread[];
}

/** 按 depth 布局每个 thread — before 视图 */
function layoutBefore(threads: Thread[], width: number) {
  const byDepth = new Map<number, Thread[]>();
  for (const thr of threads) {
    const list = byDepth.get(thr.depth) ?? [];
    list.push(thr);
    byDepth.set(thr.depth, list);
  }
  const maxDepth = Math.max(0, ...Array.from(byDepth.keys()));

  const pigByThread = new Map<string, number>();
  const byParent = new Map<string | null, Thread[]>();
  for (const thr of threads) {
    const list = byParent.get(thr.parent_thread_id) ?? [];
    list.push(thr);
    byParent.set(thr.parent_thread_id, list);
  }
  for (const [parentId, siblings] of byParent) {
    if (parentId === null) continue;
    siblings.forEach((s, i) => pigByThread.set(s.id, i % PIG_VAR.length));
  }

  const positions = new Map<string, { x: number; y: number; pigIdx: number }>();
  for (const [depth, arr] of byDepth) {
    const y = 24 + depth * 36;
    if (arr.length === 1) {
      positions.set(arr[0].id, { x: width / 2, y, pigIdx: pigByThread.get(arr[0].id) ?? -1 });
    } else {
      const usable = width - PAD_X * 2;
      const gap = usable / (arr.length - 1);
      arr.forEach((thr, i) => {
        positions.set(thr.id, { x: PAD_X + i * gap, y, pigIdx: pigByThread.get(thr.id) ?? -1 });
      });
    }
  }

  const height = 48 + (maxDepth + 1) * 36;
  return { positions, height };
}

/** After 视图 — 所有节点按 preorder 排成一条线 */
function layoutAfter(threads: Thread[], width: number) {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const mainId = threads.find((t) => t.parent_thread_id === null)?.id;
  if (!mainId) return { ordered: [], height: 48 };

  const byParent = new Map<string | null, Thread[]>();
  for (const thr of threads) {
    const list = byParent.get(thr.parent_thread_id) ?? [];
    list.push(thr);
    byParent.set(thr.parent_thread_id, list);
  }

  const ordered: Thread[] = [];
  const walk = (id: string) => {
    const thr = byId.get(id);
    if (!thr) return;
    ordered.push(thr);
    for (const child of byParent.get(id) ?? []) walk(child.id);
  };
  walk(mainId);

  const pigByThread = new Map<string, number>();
  for (const [parentId, siblings] of byParent) {
    if (parentId === null) continue;
    siblings.forEach((s, i) => pigByThread.set(s.id, i % PIG_VAR.length));
  }

  const height = Math.max(40, 20 + ordered.length * ROW_H);
  // 避免未使用警告 / Suppress "width assigned but unused" lint
  void width;
  return {
    ordered: ordered.map((t, i) => ({
      thread: t,
      y: 14 + i * ROW_H,
      pigIdx: pigByThread.get(t.id) ?? -1,
    })),
    height,
  };
}

export default function FlattenPreview({ threads }: Props) {
  const t = useT();

  const BEFORE_W = 200;
  const AFTER_W = 200;

  const before = useMemo(() => layoutBefore(threads, BEFORE_W), [threads]);
  const after = useMemo(() => layoutAfter(threads, AFTER_W), [threads]);
  const flatHeight = Math.max(after.height, before.height);

  if (threads.length <= 1) {
    return (
      <p className="font-mono text-[11px] text-center py-4" style={{ color: "var(--ink-4)" }}>
        {t.flattenPreviewEmpty}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-4">
      {/* Before — tree */}
      <div className="flex flex-col items-center">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--ink-4)" }}>
          {t.flattenPreviewBefore}
        </span>
        <svg viewBox={`0 0 ${BEFORE_W} ${flatHeight}`} style={{ width: "100%", height: flatHeight, maxHeight: 180 }}>
          {/* edges */}
          {threads
            .filter((thr) => thr.parent_thread_id)
            .map((thr) => {
              const p = before.positions.get(thr.id);
              const parent = before.positions.get(thr.parent_thread_id!);
              if (!p || !parent) return null;
              const dy = p.y - parent.y;
              return (
                <path
                  key={`edge-${thr.id}`}
                  d={`M ${parent.x} ${parent.y} C ${parent.x} ${parent.y + dy * 0.45}, ${p.x} ${p.y - dy * 0.45}, ${p.x} ${p.y}`}
                  fill="none"
                  stroke="var(--rule-strong)"
                  strokeWidth={1}
                />
              );
            })}
          {/* nodes */}
          {Array.from(before.positions.entries()).map(([id, p]) => {
            const isRoot = threads.find((thr) => thr.id === id)?.parent_thread_id === null;
            const color = isRoot ? "var(--ink)" : p.pigIdx >= 0 ? PIG_VAR[p.pigIdx] : "var(--ink-3)";
            return (
              <circle
                key={`node-${id}`}
                cx={p.x}
                cy={p.y}
                r={4}
                fill="var(--paper-2)"
                stroke={color}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
        <span className="mt-2 font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
          {threads.length} threads · {threads.filter((t) => t.parent_thread_id !== null).length} pins
        </span>
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-center px-1 self-center">
        <svg width="22" height="18" viewBox="0 0 22 18" fill="none">
          <path d="M2 9 L18 9 M14 4 L19 9 L14 14" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* After — linear chain */}
      <div className="flex flex-col items-center">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--accent)" }}>
          {t.flattenPreviewAfter}
        </span>
        <svg viewBox={`0 0 ${AFTER_W} ${flatHeight}`} style={{ width: "100%", height: flatHeight, maxHeight: 180 }}>
          {/* vertical spine */}
          {after.ordered.length > 1 && (
            <line
              x1={AFTER_W / 2}
              y1={after.ordered[0].y}
              x2={AFTER_W / 2}
              y2={after.ordered[after.ordered.length - 1].y}
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
          )}
          {after.ordered.map(({ thread, y, pigIdx }) => {
            const isRoot = thread.parent_thread_id === null;
            const color = isRoot ? "var(--ink)" : pigIdx >= 0 ? PIG_VAR[pigIdx] : "var(--ink-3)";
            return (
              <circle
                key={`a-${thread.id}`}
                cx={AFTER_W / 2}
                cy={y}
                r={4}
                fill={color}
                stroke={color}
                strokeWidth={1}
              />
            );
          })}
        </svg>
        <span className="mt-2 font-mono text-[10px]" style={{ color: "var(--ink-4)" }}>
          1 main thread · {after.ordered.length} messages
        </span>
      </div>
    </div>
  );
}
