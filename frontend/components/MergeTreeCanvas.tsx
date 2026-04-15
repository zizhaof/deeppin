"use client";
// components/MergeTreeCanvas.tsx
// 自适应 SVG 线程树 — 层级布局无交叉，滚轮/按钮缩放，拖拽平移
// Adaptive SVG thread tree — hierarchical layout, scroll/button zoom, drag pan

import { useEffect, useRef, useState, useMemo } from "react";
import type { Thread } from "@/lib/api";

interface Props {
  threads: Thread[];
  selected: Set<string>;
  onToggle: (threadId: string) => void;
  activeThreadId?: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
  compact?: boolean;
}

const NODE_W = 130, NODE_H = 50, NODE_R = 9;
const ROOT_W = 110, ROOT_H = 40;
const H_GAP = 20, V_GAP = 85, PAD = 32;

const C_NODE_W = 80, C_NODE_H = 34, C_NODE_R = 7;
const C_ROOT_W = 66, C_ROOT_H = 28;
const C_H_GAP = 8, C_V_GAP = 52, C_PAD = 16;

const MAX_FIT_SCALE = 1.4; // 自动适配的放大上限
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.28;

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

  if (threads.length === 0) {
    return { positions: [], posMap: {}, treeW: compact ? 120 : 300, treeH: pad * 2 };
  }

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

  const leafCounts: Record<string, number> = {};
  function leafCount(id: string): number {
    if (leafCounts[id] !== undefined) return leafCounts[id];
    const ch = childrenOf[id] ?? [];
    leafCounts[id] = ch.length === 0 ? 1 : ch.reduce((s, c) => s + leafCount(c.id), 0);
    return leafCounts[id];
  }
  for (const t of threads) leafCount(t.id);

  const minDepth = Math.min(...threads.map(t => t.depth));
  const maxDepth = Math.max(...threads.map(t => t.depth));
  const totalLeaves = roots.reduce((s, r) => s + leafCount(r.id), 0);
  const treeW = Math.max(compact ? 120 : 300, totalLeaves * (nw + hg) - hg + pad * 2);
  const treeH = (maxDepth - minDepth + 1) * (nh + vg) - vg + pad * 2;

  const positions: NodePos[] = [];
  const posMap: Record<string, NodePos> = {};

  function layout(id: string, xMin: number, xMax: number): void {
    const thread = threads.find(t => t.id === id);
    if (!thread) return;
    const children = childrenOf[id] ?? [];
    const myLeaves = leafCount(id);

    let cursor = xMin;
    for (const child of children) {
      const share = (xMax - xMin) * (leafCount(child.id) / myLeaves);
      layout(child.id, cursor, cursor + share);
      cursor += share;
    }

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
  const [zoom, setZoom] = useState(1); // 用户缩放倍数（叠加在 fitScale 之上）

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  // 自测量
  const [selfW, setSelfW] = useState(0);
  const [selfH, setSelfH] = useState(0);
  useEffect(() => {
    if (propW !== undefined && propH !== undefined) return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setSelfW(el.clientWidth); setSelfH(el.clientHeight); });
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

  // fitScale：让树自动适配画布的基础缩放
  const fitScale = canvasW && canvasH
    ? Math.min(canvasW / treeW, canvasH / treeH, MAX_FIT_SCALE)
    : 1;

  // 实际缩放 = 基础缩放 × 用户缩放
  const scale = fitScale * zoom;

  const centX = canvasW ? (canvasW - treeW * scale) / 2 : 0;
  const centY = canvasH ? (canvasH - treeH * scale) / 2 : 0;

  // 树结构或画布尺寸变化时重置视图
  useEffect(() => { setPanX(0); setPanY(0); setZoom(1); }, [treeW, treeH, canvasW, canvasH]);

  // ── 用 ref 保存最新状态，供事件处理器使用（避免 stale closure）──
  const sr = useRef({ zoom, panX, panY, scale, centX, centY, fitScale, canvasW, canvasH, treeW, treeH });
  sr.current = { zoom, panX, panY, scale, centX, centY, fitScale, canvasW, canvasH, treeW, treeH };

  /**
   * 以画布坐标 (cx, cy) 为中心应用缩放倍数 factor。
   * Zoom by factor, keeping the canvas point (cx, cy) fixed.
   */
  function applyZoom(factor: number, cx: number, cy: number) {
    const s = sr.current;
    const newZoom  = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s.zoom * factor));
    const newScale = s.fitScale * newZoom;
    const newCentX = s.canvasW ? (s.canvasW - s.treeW * newScale) / 2 : 0;
    const newCentY = s.canvasH ? (s.canvasH - s.treeH * newScale) / 2 : 0;
    // 当前光标下的 SVG 坐标
    const svgX = (cx - s.centX - s.panX) / s.scale;
    const svgY = (cy - s.centY - s.panY) / s.scale;
    // 新 pan 使 SVG 坐标保持在光标下
    setZoom(newZoom);
    setPanX(cx - newCentX - svgX * newScale);
    setPanY(cy - newCentY - svgY * newScale);
  }

  // 按钮缩放（以画布中心为基准）
  const btnZoomIn  = () => applyZoom(ZOOM_STEP, (sr.current.canvasW || 300) / 2, (sr.current.canvasH || 300) / 2);
  const btnZoomOut = () => applyZoom(1 / ZOOM_STEP, (sr.current.canvasW || 300) / 2, (sr.current.canvasH || 300) / 2);
  const btnReset   = () => { setZoom(1); setPanX(0); setPanY(0); };

  // ── 滚轮缩放（以光标位置为中心）──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      applyZoom(factor, mx, my);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 使用 sr.current，无需重注册

  // ── 拖拽平移 ──
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-node],[data-ctrl]")) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const s = sr.current;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      // 平移限制：树至少有一半保持在视野内
      const halfW = Math.max(s.canvasW * 0.5, s.treeW * s.scale * 0.5);
      const halfH = Math.max(s.canvasH * 0.5, s.treeH * s.scale * 0.5);
      setPanX(Math.max(-halfW, Math.min(halfW, dragStart.current.px + dx)));
      setPanY(Math.max(-halfH, Math.min(halfH, dragStart.current.py + dy)));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 使用 sr.current，无需重注册

  const containerStyle: React.CSSProperties = propW !== undefined
    ? { width: propW, height: propH, position: "relative" }
    : { position: "absolute", inset: 0 };

  const groupTransform = `translate(${centX + panX}, ${centY + panY}) scale(${scale})`;

  const titleChars = compact ? 8 : 11;
  const anchorChars = compact ? 10 : 16;
  const titleFontSize = compact ? 8.5 : 10;
  const anchorFontSize = compact ? 7.5 : 8.5;

  const zoomPct = Math.round(zoom * 100);

  return (
    <div
      ref={wrapRef}
      style={{ ...containerStyle, overflow: "hidden", cursor: isDragging.current ? "grabbing" : "grab" }}
      onMouseDown={onMouseDown}
    >
      {/* SVG 树图 */}
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
            const to   = posMap[t.id];
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
            const isRoot   = !t.parent_thread_id;
            const w        = isRoot ? rw : nw;
            const h        = isRoot ? rh : nh;
            const isSel    = isRoot || selected.has(t.id);
            const isActive = t.id === activeThreadId;

            return (
              <g key={t.id} transform={`translate(${x},${y})`} data-node="1"
                style={{ cursor: "pointer" }} onClick={() => onToggle(t.id)}>
                {isSel && !isRoot && !isActive && (
                  <rect x={-w/2-3} y={-h/2-3} width={w+6} height={h+6} rx={nr+3}
                    fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth={2} />
                )}
                {isActive && (<>
                  <rect x={-w/2-6} y={-h/2-6} width={w+12} height={h+12} rx={nr+6}
                    fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth={3} />
                  <rect x={-w/2-3} y={-h/2-3} width={w+6} height={h+6} rx={nr+3}
                    fill="none" stroke="rgba(129,140,248,0.7)" strokeWidth={1.5} />
                </>)}
                <rect x={-w/2} y={-h/2} width={w} height={h}
                  rx={isRoot ? (compact ? 8 : 12) : nr}
                  fill={isActive ? "#2e2770" : isSel ? "#1e1b4b" : "#18181b"}
                  stroke={isActive ? "rgba(129,140,248,0.9)" : isRoot ? "rgba(99,102,241,0.5)" : isSel ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}
                  strokeWidth={isActive ? 1.5 : isRoot ? 1.5 : 1}
                  filter={isActive ? "url(#mtc-active-glow)" : isSel ? "url(#mtc-glow)" : undefined}
                />
                {isActive && (
                  <circle cx={0} cy={-h/2-(compact?6:8)} r={compact?2.5:3} fill="#818cf8" />
                )}
                {isRoot ? (
                  <text x={0} y={compact?4:5} textAnchor="middle"
                    fill={isActive ? "#e0e7ff" : "#c7d2fe"}
                    fontSize={compact?9:11} fontWeight={600}
                    style={{ pointerEvents:"none", userSelect:"none" }}>
                    {trunc(t.title ?? "主线对话", compact?8:12)}
                  </text>
                ) : (<>
                  {!compact && <circle cx={w/2-8} cy={-h/2+8} r={3.5} fill={isSel?"#4ade80":"#3f3f46"} />}
                  {!compact && <rect x={-w/2+10} y={h/2-7} width={w-20} height={2.5} rx={1.25} fill="rgba(255,255,255,0.04)" />}
                  <text x={-w/2+6} y={compact?3:-4}
                    fill={isActive?"#e0e7ff":isSel?"#c7d2fe":"#52525b"}
                    fontSize={titleFontSize} fontWeight={isActive?700:600}
                    style={{ pointerEvents:"none", userSelect:"none" }}>
                    {trunc(t.title ?? t.anchor_text, titleChars)}
                  </text>
                  {t.anchor_text && !compact && (
                    <text x={-w/2+11} y={10}
                      fill={isActive?"rgba(199,210,254,0.7)":isSel?"rgba(165,180,252,0.55)":"rgba(82,82,91,0.6)"}
                      fontSize={anchorFontSize}
                      style={{ pointerEvents:"none", userSelect:"none" }}>
                      {trunc(t.anchor_text, anchorChars)}
                    </text>
                  )}
                </>)}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── 缩放控件（右下角）── */}
      <div
        data-ctrl="1"
        onMouseDown={e => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 8, right: 8,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          zIndex: 5,
        }}
      >
        {/* 放大 */}
        <button
          onClick={btnZoomIn}
          title="放大"
          style={ctrlBtn}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <line x1="5" y1="1" x2="5" y2="9"/><line x1="1" y1="5" x2="9" y2="5"/>
          </svg>
        </button>
        {/* 百分比 / 重置 */}
        <button
          onClick={btnReset}
          title="重置缩放"
          style={{ ...ctrlBtn, fontSize: 8, letterSpacing: "-0.3px", width: 28, color: zoom === 1 ? "rgba(255,255,255,0.25)" : "rgba(129,140,248,0.8)" }}
        >
          {zoomPct}%
        </button>
        {/* 缩小 */}
        <button
          onClick={btnZoomOut}
          title="缩小"
          style={ctrlBtn}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <line x1="1" y1="5" x2="9" y2="5"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

const ctrlBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(15,15,20,0.7)",
  backdropFilter: "blur(4px)",
  color: "rgba(255,255,255,0.45)",
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, lineHeight: 1,
  transition: "background 0.15s, color 0.15s",
};
