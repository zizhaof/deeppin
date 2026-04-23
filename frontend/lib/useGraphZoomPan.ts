"use client";
// lib/useGraphZoomPan.ts
//
// 共享的 graph zoom / pan hook。用法：
//   const { containerRef, transformString, pointerHandlers, dragging, fit } =
//     useGraphZoomPan({ contentWidth, contentHeight, refitOn });
//   <div ref={containerRef} {...pointerHandlers} style={{ cursor: dragging ? "grabbing" : "grab" }}>
//     <svg width="100%" height="100%">
//       <g transform={transformString}>...</g>
//     </svg>
//   </div>
//
// 行为：
//   - 挂载时自适应 fit（contentW × contentH → 视口，外加 16px margin）
//   - 容器 resize 或 refitOn 变化时重新 fit
//   - 鼠标滚轮以光标为焦点缩放（scale 钳在 [minScale, maxScale]）
//   - 桌面：左键按住拖拽平移
//   - 手机：单指拖拽 = 平移；双指 pinch = 以双指中点为焦点缩放 + 同时平移
//
// 注意：
//   1. wheel 必须通过 native listener + passive:false 注册，否则 React 17+
//      的 SyntheticEvent 下 preventDefault() 不生效。
//   2. 不能在 pointerdown 立刻 setPointerCapture —— 否则子节点的 click/hover
//      会被吞；用 4px 阈值过了再抢。
//   3. 双指 pinch：维护一个 pointerId → pos 的 Map，size === 2 时进入 pinch
//      模式。子节点 click 在双指触发时会因为 pan/pinch 启动被自然打断。
//
// Shared zoom / pan hook for graph views. Auto-fits content on mount and
// whenever `refitOn` changes. Wheel zooms around the cursor, left-drag pans.
// On touch: one finger = pan, two fingers = pinch-zoom (around the midpoint)
// with simultaneous pan. Tracks active pointers in a Map keyed by pointerId.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface Options {
  contentWidth: number;
  contentHeight: number;
  minScale?: number;
  maxScale?: number;
  /** 任意 deps —— 变化即触发 refit（如 target 切换、数据刷新）
   *  Any deps that should trigger a re-fit when they change (target switch, data refresh, etc.). */
  refitOn?: unknown;
  /** 关闭自动 fit（很少用；默认 true） */
  autoFit?: boolean;
}

interface Transform {
  s: number;
  tx: number;
  ty: number;
}

export interface GraphZoomPan {
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewport: { w: number; h: number };
  transform: Transform;
  dragging: boolean;
  pointerHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  transformString: string;
  fit: () => void;
  setTransform: React.Dispatch<React.SetStateAction<Transform>>;
}

export function useGraphZoomPan(opts: Options): GraphZoomPan {
  const {
    contentWidth,
    contentHeight,
    minScale = 0.3,
    maxScale = 4,
    refitOn,
    autoFit = true,
  } = opts;

  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [transform, setTransform] = useState<Transform>({ s: 1, tx: 0, ty: 0 });
  const [dragging, setDragging] = useState(false);

  // 所有活跃 pointer 的当前坐标（client coords），按 pointerId 索引
  // All currently-down pointers (client coords), keyed by pointerId.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // 单指 pan state —— 只有 pointers.size === 1 且过了 4px 阈值才 active
  // Single-pointer pan state — active only when exactly one pointer is down
  // and the 4px threshold was crossed.
  const panRef = useRef<{
    sx: number; sy: number; tx0: number; ty0: number;
    captured: boolean; pointerId: number;
  } | null>(null);

  // 双指 pinch state —— 锚定起手时的距离 + 中点 + transform 快照
  // Pinch state — snapshot of initial finger distance, midpoint, and transform.
  const pinchRef = useRef<{
    startDist: number;
    startMidX: number; startMidY: number;   // container-local coords
    startS: number; startTx: number; startTy: number;
  } | null>(null);

  // 最新 transform 的 ref —— native wheel listener 闭包里要读最新值
  // Mirror ref for the native wheel listener (avoids stale-closure transform).
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // ── 视口尺寸：挂载 + resize + ResizeObserver ─────────────────────
  useLayoutEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setViewport({ w: r.width, h: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    let ro: ResizeObserver | undefined;
    if (containerRef.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  // ── 自适应 fit ───────────────────────────────────────────────────
  const fit = useCallback(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return;
    if (contentWidth <= 0 || contentHeight <= 0) return;
    const margin = 16;
    const sx = (viewport.w - margin * 2) / contentWidth;
    const sy = (viewport.h - margin * 2) / contentHeight;
    // 不超过 1：小图不放大
    // Never upscale beyond 1× — small graphs shouldn't bloat.
    const s = Math.max(minScale, Math.min(sx, sy, 1));
    const tx = (viewport.w - contentWidth * s) / 2;
    const ty = (viewport.h - contentHeight * s) / 2;
    setTransform({ s, tx, ty });
  }, [viewport.w, viewport.h, contentWidth, contentHeight, minScale]);

  useLayoutEffect(() => {
    if (!autoFit) return;
    fit();
  }, [fit, refitOn, autoFit]);

  // ── wheel：必须 native + passive:false 才能 preventDefault ────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // trackpad 双指手势会以 ctrlKey=true 发 wheel（用 deltaY），正常鼠标滚
      // 轮也走同一分支；系数上调一点让 trackpad pinch 更顺滑
      // Trackpad pinch arrives as wheel with ctrlKey=true; same handling.
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const prev = transformRef.current;
      const newS = Math.max(minScale, Math.min(maxScale, prev.s * factor));
      if (newS === prev.s) return;
      const k = newS / prev.s;
      setTransform({
        s: newS,
        tx: mx - (mx - prev.tx) * k,
        ty: my - (my - prev.ty) * k,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [minScale, maxScale]);

  // ── pointer 处理：1 指 = pan，2 指 = pinch ─────────────────────────
  const DRAG_THRESHOLD = 4;

  /** 双指起手：锚定距离 + 中点（container 局部坐标）+ 当前 transform 快照 */
  const startPinch = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const rect = el.getBoundingClientRect();
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const midX = (p1.x + p2.x) / 2 - rect.left;
    const midY = (p1.y + p2.y) / 2 - rect.top;
    pinchRef.current = {
      startDist: Math.hypot(dx, dy) || 1,
      startMidX: midX,
      startMidY: midY,
      startS: transformRef.current.s,
      startTx: transformRef.current.tx,
      startTy: transformRef.current.ty,
    };
    // 进入 pinch 时取消 pan state，让第二指落下时不再沿着第一指继续 pan
    // Cancel pan when pinch begins so the second finger doesn't drag the graph.
    panRef.current = null;
    setDragging(true);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // 鼠标：只响应左键；触摸/笔：button 总是 0
    // Mouse: primary button only; touch/pen always reports button 0.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const n = pointersRef.current.size;
    if (n === 1) {
      panRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        tx0: transformRef.current.tx,
        ty0: transformRef.current.ty,
        captured: false,
        pointerId: e.pointerId,
      };
    } else if (n === 2) {
      startPinch();
    }
  }, [startPinch]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const n = pointersRef.current.size;

    // ── 双指 pinch ──
    if (n >= 2 && pinchRef.current) {
      const el = containerRef.current;
      if (!el) return;
      const pts = [...pointersRef.current.values()].slice(0, 2);
      const [p1, p2] = pts;
      const rect = el.getBoundingClientRect();
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (p1.x + p2.x) / 2 - rect.left;
      const midY = (p1.y + p2.y) / 2 - rect.top;
      const pin = pinchRef.current;
      const rawS = pin.startS * (dist / pin.startDist);
      const newS = Math.max(minScale, Math.min(maxScale, rawS));
      const k = newS / pin.startS;
      // 固定锚定点：起手时中点在 graph 上对应的点要跟随当前中点
      // 起手中点的 graph 坐标: (startMid - startT) / startS
      // 缩放后仍要落在 currentMid: newT + graphPt * newS = currentMid
      // → newT = currentMid - (startMid - startT) * k
      // Anchor: the graph point under the initial midpoint must track the
      // current midpoint as the fingers move/pinch.
      setTransform({
        s: newS,
        tx: midX - (pin.startMidX - pin.startTx) * k,
        ty: midY - (pin.startMidY - pin.startTy) * k,
      });
      return;
    }

    // ── 单指 pan（过阈值才启动，保护子节点 click）──
    const p = panRef.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    if (!p.captured) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      p.captured = true;
      setDragging(true);
    }
    setTransform((prev) => ({
      ...prev,
      tx: p.tx0 + dx,
      ty: p.ty0 + dy,
    }));
  }, [minScale, maxScale]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const hadCaptured = panRef.current?.captured && panRef.current.pointerId === e.pointerId;
    if (hadCaptured) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    pointersRef.current.delete(e.pointerId);
    const remaining = pointersRef.current.size;

    if (remaining < 2) pinchRef.current = null;

    if (remaining === 1) {
      // 从双指缩放回到单指 —— 用剩下那根手指当前位置作为新的 pan 起点，
      // 避免画面跳（不然剩下的手指继续走会从旧起点算 delta）
      // Dropped from 2 → 1 finger: restart single-pointer pan origin at the
      // remaining finger's current spot so the graph doesn't jump.
      const [remainingId, remainingPos] = [...pointersRef.current.entries()][0];
      panRef.current = {
        sx: remainingPos.x,
        sy: remainingPos.y,
        tx0: transformRef.current.tx,
        ty0: transformRef.current.ty,
        captured: false,
        pointerId: remainingId,
      };
      // pinch 期间 dragging 保持 true；1 指后不再画抓取手势状态
      setDragging(false);
    } else if (remaining === 0) {
      panRef.current = null;
      setDragging(false);
    }
  }, []);

  return {
    containerRef,
    viewport,
    transform,
    dragging,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    transformString: `translate(${transform.tx} ${transform.ty}) scale(${transform.s})`,
    fit,
    setTransform,
  };
}
