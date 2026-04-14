"use client";
// components/MergeTreeCanvas.tsx
// 自适应 SVG 线程树 — 根据画布宽高自动缩放布局，支持拖拽平移
// Adaptive SVG thread tree — auto-scales to canvas dimensions, supports pan

import { useEffect, useRef, useState, useMemo } from "react";
import type { Thread } from "@/lib/api";

interface Props {
  threads: Thread[];
  selected: Set<string>;
  onToggle: (threadId: string) => void;
  /** 当前正在查看的线程 id，在树中高亮显示 */
  activeThreadId?: string | null;
  /** 显式传入宽高（px），用于弹窗等固定尺寸场景；省略时组件自行测量 */
  canvasWidth?: number;
  canvasHeight?: number;
  /** 紧凑模式：节点更小，适合窄侧栏 */
  compact?: boolean;
}

// ── 基准节点尺寸（布局计算起点，最终会按画布缩放）────────────────────
const NODE_W = 130, NODE_H = 50, NODE_R = 9;
const ROOT_W = 110, ROOT_H = 40;
const H_GAP = 20, V_GAP = 85, PAD = 32;

const C_NODE_W = 80, C_NODE_H = 34, C_NODE_R = 7;
const C_ROOT_W = 66, C_ROOT_H = 28;
const C_H_GAP = 8, C_V_GAP = 52, C_PAD = 16;

// 缩放上限：避免节点太少时被放大过多
const MAX_SCALE = 1.4;

function trunc(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

interface NodePos { thread: Thread; x: number; y: number }

function computeLayout(
  threads: Thread[],
  compact: boolean,
): { positions: NodePos[]; posMap: Record<string, NodePos>; treeW: number; treeH: number } {
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

export default function MergeTreeCanvas({
  threads, selected, onToggle,
  activeThreadId,
  canvasWidth: propW, canvasHeight: propH,
  compact = false,
}: Props) {
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  // 自测量：未传入 props 时用 ResizeObserver 量自身
  const [selfW, setSelfW] = useState(0);
  const [selfH, setSelfH] = useState(0);
  useEffect(() => {
    if (propW !== undefined && propH !== undefined) return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSelfW(el.clientWidth);
      setSelfH(el.clientHeight);
    });
    ro.observe(el);
    setSelfW(el.clientWidth);
    setSelfH(el.clientHeight);
    return () => ro.disconnect();
  }, [propW, propH]);

  const canvasW = propW ?? selfW;
  const canvasH = propH ?? selfH;

  const nw = compact ? C_NODE_W : NODE_W;
  const nh = compact ? C_NODE_H : NODE_H;
  const nr = compact ? C_NODE_R : NODE_R;
  const rw = compact ? C_ROOT_W : ROOT_W;
  const rh = compact ? C_ROOT_H : ROOT_H;

  const { positions, posMap, treeW, treeH } = useMemo(
    () => computeLayout(threads, compact),
    [threads, compact],
  );

  // ── 自适应缩放 ────────────────────────────────────────────────────
  // 计算让树刚好填满画布的缩放比（上限 MAX_SCALE，防止单节点被放大过多）
  // Compute scale so the tree fills the canvas; cap at MAX_SCALE to avoid over-enlarging
  const scale = canvasW && canvasH
    ? Math.min(canvasW / treeW, canvasH / treeH, MAX_SCALE)
    : 1;

  // 缩放后居中偏移 / Center offset after scaling
  const centX = canvasW ? (canvasW - treeW * scale) / 2 : 0;
  const centY = canvasH ? (canvasH - treeH * scale) / 2 : 0;

  // 树变化时重置 pan / Reset pan when tree layout changes
  useEffect(() => { setPanX(0); setPanY(0); }, [treeW, treeH, canvasW, canvasH]);

  // pan 限制（考虑缩放后实际尺寸）
  function clampPan(px: number, py: number): [number, number] {
    const scaledW = treeW * scale;
    const scaledH = treeH * scale;
    const maxX = Math.max(0, scaledW - canvasW);
    const maxY = Math.max(0, scaledH - canvasH);
    return [
      Math.max(-maxX, Math.min(maxX, px)),
      Math.max(-maxY, Math.min(maxY, py)),
    ];
  }

  // ── 滚轮平移 ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setPanX(px => clampPan(px - (e.shiftKey ? e.deltaY : e.deltaX) * 0.8, 0)[0]);
      setPanY(py => clampPan(0, py - (e.shiftKey ? 0 : e.deltaY) * 0.8)[1]);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [treeW, treeH, canvasW, canvasH, scale]);

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
      setPanX(nx); setPanY(ny);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [treeW, treeH, canvasW, canvasH, scale]);

  // 容器样式：外部传尺寸时用固定大小；自测量时用 absolute inset-0
  const containerStyle: React.CSSProperties = propW !== undefined
    ? { width: propW, height: propH, position: "relative" }
    : { position: "absolute", inset: 0 };

  // SVG 内容用 <g> 包裹，先平移居中+pan，再缩放
  // transform order: translate first (screen coords), then scale (tree coords)
  const groupTransform = `translate(${centX + panX}, ${centY + panY}) scale(${scale})`;

  const titleChars = compact ? 8 : 11;
  const anchorChars = compact ? 10 : 16;
  const titleFontSize = compact ? 8.5 : 10;
  const anchorFontSize = compact ? 7.5 : 8.5;

  return (
    <div
      ref={wrapRef}
      style={{ ...containerStyle, overflow: "hidden", cursor: "grab" }}
      onMouseDown={onMouseDown}
    >
      {/* SVG 铺满容器，内容通过 <g> 变换定位 */}
      <svg
        width={canvasW || "100%"}
        height={canvasH || "100%"}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <filter id="mtc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* 当前激活节点的强发光 */}
          <filter id="mtc-active-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g transform={groupTransform} style={{ willChange: "transform" }}>
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
            const isActive = t.id === activeThreadId;

            return (
              <g
                key={t.id}
                transform={`translate(${x},${y})`}
                data-node="1"
                style={{ cursor: "pointer" }}
                onClick={() => onToggle(t.id)}
              >
                {/* 普通选中外圈 */}
                {isSel && !isRoot && !isActive && (
                  <rect x={-w/2-3} y={-h/2-3} width={w+6} height={h+6} rx={nr+3}
                    fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth={2} />
                )}
                {/* 当前激活节点：双层亮环 */}
                {isActive && (
                  <>
                    <rect x={-w/2-6} y={-h/2-6} width={w+12} height={h+12} rx={nr+6}
                      fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth={3} />
                    <rect x={-w/2-3} y={-h/2-3} width={w+6} height={h+6} rx={nr+3}
                      fill="none" stroke="rgba(129,140,248,0.7)" strokeWidth={1.5} />
                  </>
                )}
                <rect
                  x={-w/2} y={-h/2} width={w} height={h} rx={isRoot ? (compact ? 8 : 12) : nr}
                  fill={isActive ? "#2e2770" : isSel ? "#1e1b4b" : "#18181b"}
                  stroke={
                    isActive
                      ? "rgba(129,140,248,0.9)"
                      : isRoot
                        ? "rgba(99,102,241,0.5)"
                        : isSel
                          ? "rgba(99,102,241,0.3)"
                          : "rgba(255,255,255,0.06)"
                  }
                  strokeWidth={isActive ? 1.5 : isRoot ? 1.5 : 1}
                  filter={isActive ? "url(#mtc-active-glow)" : isSel ? "url(#mtc-glow)" : undefined}
                />
                {/* 激活节点顶部小圆点指示器 */}
                {isActive && (
                  <circle cx={0} cy={-h/2 - (compact ? 6 : 8)} r={compact ? 2.5 : 3}
                    fill="#818cf8" />
                )}
                {isRoot ? (
                  <text x={0} y={compact ? 4 : 5} textAnchor="middle"
                    fill={isActive ? "#e0e7ff" : "#c7d2fe"}
                    fontSize={compact ? 9 : 11} fontWeight={600}
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {trunc(t.title ?? "主线对话", compact ? 8 : 12)}
                  </text>
                ) : (
                  <>
                    {!compact && <circle cx={w/2-8} cy={-h/2+8} r={3.5} fill={isSel ? "#4ade80" : "#3f3f46"} />}
                    {!compact && <rect x={-w/2+10} y={h/2-7} width={w-20} height={2.5} rx={1.25} fill="rgba(255,255,255,0.04)" />}
                    <text x={-w/2+6} y={compact ? 3 : -4}
                      fill={isActive ? "#e0e7ff" : isSel ? "#c7d2fe" : "#52525b"}
                      fontSize={titleFontSize} fontWeight={isActive ? 700 : 600}
                      style={{ pointerEvents: "none", userSelect: "none" }}>
                      {trunc(t.title ?? t.anchor_text, titleChars)}
                    </text>
                    {t.anchor_text && !compact && (
                      <text x={-w/2+11} y={10}
                        fill={isActive ? "rgba(199,210,254,0.7)" : isSel ? "rgba(165,180,252,0.55)" : "rgba(82,82,91,0.6)"}
                        fontSize={anchorFontSize}
                        style={{ pointerEvents: "none", userSelect: "none" }}>
                        {trunc(t.anchor_text, anchorChars)}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
