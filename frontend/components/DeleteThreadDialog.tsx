"use client";
// components/DeleteThreadDialog.tsx
//
// 删除线程 / session 的确认弹窗。
// 中心画 thread graph：即将被删的节点（目标 + 所有后代）用红色实心 + × 叉
// 标记，其他节点和连线灰掉。Graph 支持鼠标滚轮缩放（以光标为焦点）+
// 拖拽平移；首次挂载自适应 fit-to-viewport。
// 主线（parent_thread_id === null）被删 = 删除整个 session。
//
// Delete-thread / session confirmation modal.
// Renders a mini thread graph with the doomed subtree (target + descendants)
// highlighted red with an ✕ glyph; surviving nodes + edges are dimmed.
// Graph supports wheel-zoom (cursor-anchored) + pointer-drag pan; auto-fits
// on mount. Deleting the main thread (parent_thread_id === null) wipes the
// entire session.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Thread, Message } from "@/lib/api";
import { useT } from "@/stores/useLangStore";

// ── 与 ThreadGraph 对齐的 pigment 色板 ─────────────────────────────
const PIG_VAR = ["var(--pig-1)", "var(--pig-2)", "var(--pig-3)", "var(--pig-4)", "var(--pig-5)"];
const ROW_H = 96;
const PAD = 46;
const MIN_SCALE = 0.3;
const MAX_SCALE = 4;

interface Positioned {
  thread: Thread;
  x: number;
  y: number;
  pigmentIdx: number;
}

/** 按 anchor 顺序排兄弟 sub-thread —— 与 ThreadGraph / ThreadTree 保持一致 */
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

/** leaf-count 加权布局（复刻 ThreadGraph.layoutNodes） */
function layoutNodes(
  threads: Thread[],
  messagesByThread: Record<string, Message[] | undefined>,
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
    const sorted = sortSiblings(siblings, messagesByThread[parentId] ?? []);
    sorted.forEach((thr, i) => pigIdxMap.set(thr.id, i % PIG_VAR.length));
    byParent.set(parentId, sorted);
  }
  const mainThread = threads.find((t) => t.parent_thread_id === null);
  const positions = new Map<string, { x: number; y: number }>();
  const leafCache = new Map<string, number>();
  function leafCount(id: string): number {
    const cached = leafCache.get(id);
    if (cached != null) return cached;
    const kids = byParent.get(id) ?? [];
    const n = kids.length === 0 ? 1 : kids.reduce((acc, k) => acc + leafCount(k.id), 0);
    leafCache.set(id, n);
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
  if (mainThread) place(mainThread.id, 0, PAD, width - PAD);
  for (const thr of threads) {
    if (!positions.has(thr.id)) {
      positions.set(thr.id, { x: width / 2, y: 36 + thr.depth * ROW_H });
      if (thr.depth > maxDepth) maxDepth = thr.depth;
    }
  }
  const nodes: Positioned[] = threads.map((thr) => {
    const p = positions.get(thr.id)!;
    return { thread: thr, x: p.x, y: p.y, pigmentIdx: pigIdxMap.get(thr.id) ?? -1 };
  });
  const height = Math.max(220, (maxDepth + 1) * ROW_H + 56);
  return { nodes, height };
}

/** 收集 target + 所有后代 id */
function collectSubtree(threads: Thread[], targetId: string): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => {
    out.add(id);
    for (const t of threads) if (t.parent_thread_id === id) walk(t.id);
  };
  walk(targetId);
  return out;
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

interface Props {
  open: boolean;
  targetThreadId: string | null;
  threads: Thread[];
  messagesByThread: Record<string, Message[] | undefined>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteThreadDialog({
  open,
  targetThreadId,
  threads,
  messagesByThread,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const t = useT();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 520, h: 360 });
  const [transform, setTransform] = useState<{ s: number; tx: number; ty: number }>({ s: 1, tx: 0, ty: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

  const target = targetThreadId ? threads.find((th) => th.id === targetThreadId) : null;
  const isMainTarget = target?.parent_thread_id === null;

  const doomed = useMemo(() => {
    if (!targetThreadId) return new Set<string>();
    return collectSubtree(threads, targetThreadId);
  }, [threads, targetThreadId]);

  // 画布逻辑尺寸（供 layout 用）。实际 DOM 容器尺寸由 viewport 决定。
  // Logical canvas size for layout — independent of container size; transform
  // handles fit-to-viewport scaling.
  const CANVAS_W = 520;
  const { nodes, height: canvasH } = useMemo(
    () => layoutNodes(threads, messagesByThread, CANVAS_W),
    [threads, messagesByThread],
  );

  // 每节点可用 label 宽度（与 ThreadGraph 同算法）
  const labelBudget = useMemo(() => {
    const m = new Map<string, number>();
    const byDepth = new Map<number, Positioned[]>();
    for (const n of nodes) {
      const arr = byDepth.get(n.thread.depth) ?? [];
      arr.push(n);
      byDepth.set(n.thread.depth, arr);
    }
    for (const [, arr] of byDepth) {
      arr.sort((a, b) => a.x - b.x);
      arr.forEach((n, i) => {
        const leftClear = i === 0 ? n.x - 4 : (n.x - arr[i - 1].x) / 2 - 3;
        const rightClear = i === arr.length - 1 ? (CANVAS_W - n.x) - 4 : (arr[i + 1].x - n.x) / 2 - 3;
        m.set(n.thread.id, Math.max(48, 2 * Math.min(leftClear, rightClear)));
      });
    }
    return m;
  }, [nodes]);

  const posById = useMemo(() => new Map(nodes.map((n) => [n.thread.id, n])), [nodes]);

  // ── 容器尺寸跟随窗口 ─────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = viewportRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setViewport({ w: r.width, h: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  // ── 首次挂载 + 目标变化：auto-fit ────────────────────────────────
  useLayoutEffect(() => {
    if (!open || viewport.w <= 0 || viewport.h <= 0) return;
    const margin = 24;
    const sx = (viewport.w - margin * 2) / CANVAS_W;
    const sy = (viewport.h - margin * 2) / canvasH;
    const s = Math.min(sx, sy, 1);
    const tx = (viewport.w - CANVAS_W * s) / 2;
    const ty = (viewport.h - canvasH * s) / 2;
    setTransform({ s, tx, ty });
  }, [open, viewport.w, viewport.h, canvasH, targetThreadId]);

  // ── ESC 关闭 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  // ── 滚轮缩放：以光标为焦点 ───────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setTransform((prev) => {
      const newS = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.s * factor));
      if (newS === prev.s) return prev;
      const k = newS / prev.s;
      return {
        s: newS,
        tx: mx - (mx - prev.tx) * k,
        ty: my - (my - prev.ty) * k,
      };
    });
  };

  // ── 拖拽平移 ─────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTx: transform.tx,
      startTy: transform.ty,
    };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setTransform((prev) => ({
      ...prev,
      tx: d.startTx + (e.clientX - d.startX),
      ty: d.startTy + (e.clientY - d.startY),
    }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
    setDragging(false);
  };

  const resetView = () => {
    if (viewport.w <= 0 || viewport.h <= 0) return;
    const margin = 24;
    const sx = (viewport.w - margin * 2) / CANVAS_W;
    const sy = (viewport.h - margin * 2) / canvasH;
    const s = Math.min(sx, sy, 1);
    setTransform({
      s,
      tx: (viewport.w - CANVAS_W * s) / 2,
      ty: (viewport.h - canvasH * s) / 2,
    });
  };

  if (!open || !target) return null;

  const dialogTitle = isMainTarget ? t.deleteSessionTitle : t.deleteThreadTitle;
  const countText = t.deleteCount.replace("{n}", String(doomed.size));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "color-mix(in oklch, var(--ink) 40%, transparent)" }}
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[640px] max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--rule)",
          boxShadow: "0 24px 64px rgba(27,26,23,0.18), 0 4px 12px rgba(27,26,23,0.08)",
        }}
      >
        {/* 标题 */}
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
          <h2
            className="text-[17px] font-medium"
            style={{ color: "var(--ink)", fontFamily: "var(--font-serif)" }}
          >
            {dialogTitle}
          </h2>
          <p className="text-[12px] mt-1" style={{ color: "var(--ink-3)" }}>
            {t.deleteThreadBody}
          </p>
        </div>

        {/* Graph 视口 */}
        <div
          ref={viewportRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative flex-1 min-h-[260px] overflow-hidden select-none touch-none"
          style={{
            background: "var(--paper-2)",
            cursor: dragging ? "grabbing" : "grab",
          }}
        >
          <svg
            width={viewport.w || 1}
            height={viewport.h || 1}
            style={{ display: "block" }}
          >
            <g transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.s})`}>
              {/* edges */}
              {nodes
                .filter((n) => n.thread.parent_thread_id)
                .map((n) => {
                  const parent = posById.get(n.thread.parent_thread_id!);
                  if (!parent) return null;
                  const dy = n.y - parent.y;
                  const d = `M ${parent.x} ${parent.y} C ${parent.x} ${parent.y + dy * 0.45}, ${n.x} ${n.y - dy * 0.45}, ${n.x} ${n.y}`;
                  // 任一端将被删 → 边高亮红；否则灰
                  const edgeDoomed = doomed.has(n.thread.id) || doomed.has(n.thread.parent_thread_id!);
                  return (
                    <path
                      key={`edge-${n.thread.id}`}
                      d={d}
                      fill="none"
                      stroke={edgeDoomed ? "var(--danger, #dc2626)" : "var(--rule)"}
                      strokeWidth={edgeDoomed ? 1.4 : 1}
                      strokeDasharray={edgeDoomed ? "3 3" : undefined}
                      opacity={edgeDoomed ? 0.9 : 0.6}
                    />
                  );
                })}

              {/* nodes */}
              {nodes.map((n) => {
                const isDoomed = doomed.has(n.thread.id);
                const isRoot = n.thread.parent_thread_id === null;
                const baseColor = isRoot
                  ? "var(--ink)"
                  : n.pigmentIdx >= 0
                    ? PIG_VAR[n.pigmentIdx]
                    : "var(--ink-3)";
                const fill = isDoomed ? "var(--danger, #dc2626)" : "var(--paper-2)";
                const stroke = isDoomed ? "var(--danger, #dc2626)" : baseColor;
                const r = isDoomed ? 6 : 4.5;
                const lines = wrapLabel(
                  n.thread.title ?? n.thread.anchor_text?.slice(0, 24) ?? t.subThread,
                  labelBudget.get(n.thread.id) ?? 48,
                );
                return (
                  <g key={`node-${n.thread.id}`} opacity={isDoomed ? 1 : 0.5}>
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={isDoomed ? 0 : 1.25}
                    />
                    {isDoomed && (
                      <g stroke="var(--paper)" strokeWidth={1.4} strokeLinecap="round">
                        <line x1={n.x - 2.4} y1={n.y - 2.4} x2={n.x + 2.4} y2={n.y + 2.4} />
                        <line x1={n.x - 2.4} y1={n.y + 2.4} x2={n.x + 2.4} y2={n.y - 2.4} />
                      </g>
                    )}
                    <text
                      x={n.x}
                      y={n.y + 18}
                      fontSize={10.5}
                      fill={isDoomed ? "var(--danger, #dc2626)" : "var(--ink-3)"}
                      style={{ fontFamily: "var(--font-serif)" }}
                      textAnchor="middle"
                      fontWeight={isDoomed ? 600 : 400}
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

          {/* 右下角：缩放控件 + 计数徽章 */}
          <div
            className="absolute left-3 bottom-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg font-mono text-[10px]"
            style={{
              background: "var(--card)",
              border: "1px solid var(--rule)",
              color: "var(--ink-3)",
            }}
          >
            <span style={{ color: "var(--danger, #dc2626)" }}>●</span>
            <span>{countText}</span>
          </div>
          <div className="absolute right-3 bottom-3 flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); resetView(); }}
              className="px-2 h-7 rounded-md font-mono text-[10px] transition-colors"
              style={{
                background: "var(--card)",
                border: "1px solid var(--rule)",
                color: "var(--ink-3)",
              }}
              title={t.deleteResetView}
            >
              {t.deleteResetView}
            </button>
            <div
              className="px-2 h-7 flex items-center rounded-md font-mono text-[10px]"
              style={{
                background: "var(--card)",
                border: "1px solid var(--rule)",
                color: "var(--ink-4)",
              }}
            >
              {Math.round(transform.s * 100)}%
            </div>
          </div>
        </div>

        {/* 操作区 */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: "1px solid var(--rule-soft)", background: "var(--card)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 h-9 rounded-lg text-[13px] transition-colors disabled:opacity-50"
            style={{
              color: "var(--ink-2)",
              background: "transparent",
              border: "1px solid var(--rule)",
            }}
          >
            {t.flattenCancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-3.5 h-9 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50"
            style={{
              color: "white",
              background: "var(--danger, #dc2626)",
              border: "1px solid var(--danger, #dc2626)",
            }}
          >
            {busy ? t.deleting : t.deleteCta}
          </button>
        </div>
      </div>
    </div>
  );
}
