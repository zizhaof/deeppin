"use client";
// components/MergeTreeCanvas.tsx
// 自适应 SVG 线程树 — 层级布局无交叉，根据画布自动缩放，支持拖拽平移
// Adaptive SVG thread tree — hierarchical no-crossing layout, auto-scales, pan support

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

/**
 * 层级布局：每个节点获得与其叶子数成比例的 x 区间，
 * 父节点居中于所有直接子节点的 x 范围上，杜绝连线交叉。
 * Hierarchical layout: x-range allocated proportionally to leaf count;
 * parent centered over its children — no crossing edges.
 */
function computeLayout(
  threads: Thread[],
  compact: boolean,
): { positions: NodePos[]; posMap: Record<string, NodePos>; treeW: number; treeH: number } {
  const nw = compact ? C_NODE_W : NODE_W;
  const nh = compact ? C_NODE_H : NODE_H;
  const hg = compact ? C_H_GAP : H_GAP;
  const vg = compact ? C_V_GAP : V_GAP;
  const pad = compact ? C_PAD : PAD;

  if (threads.length === 0) {
    return { positions: [], posMap: {}, treeW: compact ? 120 : 300, treeH: pad * 2 };
  }

  // ── 构建父→子映射，识别根节点 ──
  const threadIds = new Set(threads.map(t => t.id));
  const childrenOf: Record<string, Thread[]> = {};
  const roots: Thread[] = [];

  for (const t of threads) {
    if (!t.parent_thread_id || !threadIds.has(t.parent_thread_id)) {
      roots.push(t);
    } else {
      if (!childrenOf[t.parent_thread_id]) childrenOf[t.parent_thread_id] = [];
      childrenOf[t.parent_thread_id].push(t);
    }
  }

  // ── 计算各节点的叶子数（用于 x 区间分配）──
  const leafCounts: Record<string, number> = {};
  function leafCount(id: string): number {
    if (leafCounts[id] !== undefined) return leafCounts[id];
    const children = childrenOf[id] ?? [];
    leafCounts[id] = children.length === 0
      ? 1
      : children.reduce((s, c) => s + leafCount(c.id), 0);
    return leafCounts[id];
  }
  for (const t of threads) leafCount(t.id);

  // ── 树的整体尺寸 ──
  const minDepth = Math.min(...threads.map(t => t.depth));
  const maxDepth = Math.max(...threads.map(t => t.depth));
  const totalLeaves = roots.reduce((s, r) => s + leafCount(r.id), 0);
  const treeW = Math.max(compact ? 120 : 300, totalLeaves * (nw + hg) - hg + pad * 2);
  const treeH = (maxDepth - minDepth + 1) * (nh + vg) - vg + pad * 2;

  const positions: NodePos[] = [];
  const posMap: Record<string, NodePos> = {};

  /**
   * 递归布局：先布局所有子节点，再将父节点居中于子节点 x 范围。
   * Layout recursively: children first, then center parent over children's x span.
   */
  function layout(id: string, xMin: number, xMax: number): void {
    const thread = threads.find(t => t.id === id);
    if (!thread) return;
    const children = childrenOf[id] ?? [];
    const myLeaves = leafCount(id);

    // 先递归布局所有子节点，按叶子数比例分配 x 区间
    let cursor = xMin;
    for (const child of children) {
      const share = (xMax - xMin) * (leafCount(child.id) / myLeaves);
      layout(child.id, cursor, cursor + share);
      cursor += share;
    }

    // 节点 x：叶子节点居中于区间；非叶节点居中于首末子节点
    let nodeX: number;
    if (children.length === 0) {
      nodeX = (xMin + xMax) / 2;
    } else {
      const firstX = posMap[children[0].id]?.x ?? (xMin + xMax) / 2;
      const lastX  = posMap[children[children.length - 1].id]?.x ?? (xMin + xMax) / 2;
      nodeX = (firstX + lastX) / 2;
    }

    const y = pad + (thread.depth - minDepth) * (nh + vg) + nh / 2;
    const entry: NodePos = { thread, x: nodeX, y };
    positions.push(entry);
    posMap[id] = entry;
  }

  // 按叶子数比例给各根节点分配 x 区间
  const contentW = treeW - pad * 2;
  let cursor = pad;
  for (const root of roots) {
    const share = contentW * (leafCount(root.id) / totalLeaves);
    layout(root.id, cursor, cursor + share);
    cursor += share;
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
  const scale = canvasW && canvasH
    ? Math.min(canvasW / treeW, canvasH / treeH, MAX_SCALE)
    : 1;

  // 缩放后居中偏移
  const centX = canvasW ? (canvasW - treeW * scale) / 2 : 0;
  const centY = canvasH ? (canvasH - treeH * scale) / 2 : 0;

  // 树变化时重置 pan
  useEffect(() => { setPanX(0); setPanY(0); }, [treeW, treeH, canvasW, canvasH]);

  /**
   * 平移限制：即使树已完全适配画布也允许平移（体验更好），
   * 但限制在树尺寸的一半范围内，防止树完全移出视野。
   * Allow panning even when tree fits canvas; clamp to half tree-size so tree stays visible.
   */
  function clampPan(px: number, py: number): [number, number] {
    const halfW = Math.max(canvasW * 0.5, treeW * scale * 0.5);
    const halfH = Math.max(canvasH * 0.5, treeH * scale * 0.5);
    return [
      Math.max(-halfW, Math.min(halfW, px)),
      Math.max(-halfH, Math.min(halfH, py)),
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
                {isSel && !isRoot && !isActive && (
                  <rect x={-w/2-3} y={-h/2-3} width={w+6} height={h+6} rx={nr+3}
                    fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth={2} />
                )}
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
