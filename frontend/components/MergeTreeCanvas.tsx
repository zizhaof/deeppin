"use client";
// components/MergeTreeCanvas.tsx
// 可平移 SVG 线程树 — 供 MergeOutput 的节点选择步骤使用
// Pannable SVG thread tree for the MergeOutput node-selection step.

import { useEffect, useRef, useState, useMemo } from "react";
import type { Thread } from "@/lib/api";

interface Props {
  threads: Thread[];
  selected: Set<string>;
  onToggle: (threadId: string) => void;
  /** 画布容器宽高（px），由父组件根据弹窗尺寸传入 */
  canvasWidth: number;
  canvasHeight: number;
  /** 紧凑模式：节点更小，适合窄侧栏 */
  compact?: boolean;
}

// ── 布局常量 ──────────────────────────────────────────────────────────
const NODE_W = 130, NODE_H = 50, NODE_R = 9;
const ROOT_W = 110, ROOT_H = 40;
const H_GAP = 20, V_GAP = 85, PAD = 32;

// 紧凑模式常量
const C_NODE_W = 80, C_NODE_H = 34, C_NODE_R = 7;
const C_ROOT_W = 66, C_ROOT_H = 28;
const C_H_GAP = 8, C_V_GAP = 52, C_PAD = 16;

function trunc(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

interface NodePos { thread: Thread; x: number; y: number }

function computeLayout(threads: Thread[], compact: boolean): { positions: NodePos[]; posMap: Record<string, NodePos>; treeW: number; treeH: number } {
  const nw = compact ? C_NODE_W : NODE_W;
  const nh = compact ? C_NODE_H : NODE_H;
  const hg = compact ? C_H_GAP : H_GAP;
  const vg = compact ? C_V_GAP : V_GAP;
  const pad = compact ? C_PAD : PAD;

  const byDepth: Record<number, Thread[]> = {};
  for (const t of threads) {
    if (!byDepth[t.depth]) byDepth[t.depth] = [];
    byDepth[t.depth].push(t);
  }
  const maxDepth = threads.length ? Math.max(...threads.map(t => t.depth)) : 0;
  const maxPerLevel = Math.max(...Object.values(byDepth).map(a => a.length), 1);
  const treeW = Math.max(compact ? 120 : 300, maxPerLevel * (nw + hg) - hg + pad * 2);
  const treeH = (maxDepth + 1) * (nh + vg) - vg + pad * 2;

  const positions: NodePos[] = [];
  const posMap: Record<string, NodePos> = {};

  for (let d = 0; d <= maxDepth; d++) {
    const lvl = byDepth[d] ?? [];
    for (let i = 0; i < lvl.length; i++) {
      const x = lvl.length === 1
        ? treeW / 2
        : pad + i * ((treeW - pad * 2 - nw) / Math.max(lvl.length - 1, 1));
      const y = pad + d * (nh + vg);
      const entry: NodePos = { thread: lvl[i], x: x + nw / 2, y: y + nh / 2 };
      positions.push(entry);
      posMap[lvl[i].id] = entry;
    }
  }
  return { positions, posMap, treeW, treeH };
}

export default function MergeTreeCanvas({ threads, selected, onToggle, canvasWidth, canvasHeight, compact = false }: Props) {
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  const nw = compact ? C_NODE_W : NODE_W;
  const nh = compact ? C_NODE_H : NODE_H;
  const nr = compact ? C_NODE_R : NODE_R;
  const rw = compact ? C_ROOT_W : ROOT_W;
  const rh = compact ? C_ROOT_H : ROOT_H;

  const { positions, posMap, treeW, treeH } = useMemo(
    () => computeLayout(threads, compact),
    [threads, compact],
  );

  // 初始居中 / Center on mount
  useEffect(() => {
    const cx = treeW < canvasWidth ? (canvasWidth - treeW) / 2 : 0;
    const cy = treeH < canvasHeight ? (canvasHeight - treeH) / 2 : 0;
    setPanX(cx);
    setPanY(cy);
  }, [treeW, treeH, canvasWidth, canvasHeight]);

  function clampPan(px: number, py: number): [number, number] {
    const maxX = Math.max(0, treeW - canvasWidth + PAD);
    const maxY = Math.max(0, treeH - canvasHeight + PAD);
    return [
      Math.max(-maxX, Math.min(PAD, px)),
      Math.max(-maxY, Math.min(PAD, py)),
    ];
  }

  // ── 滚轮平移 ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setPanX(px => { const [nx] = clampPan(px - (e.shiftKey ? e.deltaY : e.deltaX) * 0.8, 0); return nx; });
      setPanY(py => { const [, ny] = clampPan(0, py - (e.shiftKey ? 0 : e.deltaY) * 0.8); return ny; });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [treeW, treeH, canvasWidth, canvasHeight]);

  // ── 拖拽平移 ──
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const [nx, ny] = clampPan(dragStart.current.px + dx, dragStart.current.py + dy);
      setPanX(nx);
      setPanY(ny);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [treeW, treeH, canvasWidth, canvasHeight]);

  return (
    <div
      ref={wrapRef}
      style={{ width: canvasWidth, height: canvasHeight, overflow: "hidden", position: "relative", cursor: "grab" }}
      onMouseDown={onMouseDown}
    >
      <svg
        width={treeW}
        height={treeH}
        style={{ position: "absolute", top: 0, left: 0, transform: `translate(${panX}px,${panY}px)`, willChange: "transform" }}
      >
        <defs>
          <filter id="mtc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* 连线 */}
        {positions.map(({ thread: t }) => {
          if (!t.parent_thread_id) return null;
          const from = posMap[t.parent_thread_id];
          const to = posMap[t.id];
          if (!from || !to) return null;
          const isParentRoot = !from.thread.parent_thread_id;
          const y1 = from.y + (isParentRoot ? rh : nh) / 2;
          const y2 = to.y - nh / 2;
          const mid = (y1 + y2) / 2;
          const isSel = selected.has(t.id);
          return (
            <path
              key={`edge-${t.id}`}
              d={`M${from.x},${y1} C${from.x},${mid} ${to.x},${mid} ${to.x},${y2}`}
              fill="none"
              stroke={isSel ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.06)"}
              strokeWidth={isSel ? 1.5 : 1}
              strokeDasharray={isSel ? undefined : "4,3"}
            />
          );
        })}

        {/* 节点 */}
        {positions.map(({ thread: t, x, y }) => {
          const isRoot = !t.parent_thread_id;
          const w = isRoot ? rw : nw;
          const h = isRoot ? rh : nh;
          const isSel = isRoot || selected.has(t.id);
          const titleChars = compact ? 8 : 11;
          const anchorChars = compact ? 10 : 16;
          const titleFontSize = compact ? 8.5 : 10;
          const anchorFontSize = compact ? 7.5 : 8.5;

          return (
            <g
              key={t.id}
              transform={`translate(${x},${y})`}
              data-node="1"
              style={{ cursor: "pointer" }}
              onClick={() => onToggle(t.id)}
            >
              {/* 外圈光晕 */}
              {isSel && !isRoot && (
                <rect x={-w/2-3} y={-h/2-3} width={w+6} height={h+6} rx={nr+3}
                  fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth={2} />
              )}

              {/* 卡片背景 */}
              <rect
                x={-w/2} y={-h/2} width={w} height={h} rx={isRoot ? (compact ? 8 : 12) : nr}
                fill={isSel ? "#1e1b4b" : "#18181b"}
                stroke={isRoot ? "rgba(99,102,241,0.5)" : isSel ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}
                strokeWidth={isRoot ? 1.5 : 1}
                filter={isSel ? "url(#mtc-glow)" : undefined}
              />

              {isRoot ? (
                <text x={0} y={compact ? 4 : 5} textAnchor="middle" fill="#c7d2fe" fontSize={compact ? 9 : 11} fontWeight={600}
                  style={{ pointerEvents: "none", userSelect: "none" }}>
                  {trunc(t.title ?? "主线对话", compact ? 8 : 12)}
                </text>
              ) : (
                <>
                  {/* 状态点 */}
                  {!compact && <circle cx={w/2-8} cy={-h/2+8} r={3.5} fill={isSel ? "#4ade80" : "#3f3f46"} />}

                  {/* 相关性进度条背景 */}
                  {!compact && <rect x={-w/2+10} y={h/2-7} width={w-20} height={2.5} rx={1.25} fill="rgba(255,255,255,0.04)" />}

                  {/* Title */}
                  <text x={-w/2+6} y={compact ? 3 : -4} fill={isSel ? "#c7d2fe" : "#52525b"} fontSize={titleFontSize} fontWeight={600}
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {trunc(t.title ?? t.anchor_text, titleChars)}
                  </text>

                  {/* Anchor */}
                  {t.anchor_text && !compact && (
                    <text x={-w/2+11} y={10} fill={isSel ? "rgba(165,180,252,0.55)" : "rgba(82,82,91,0.6)"} fontSize={anchorFontSize}
                      style={{ pointerEvents: "none", userSelect: "none" }}>
                      {trunc(t.anchor_text, anchorChars)}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
