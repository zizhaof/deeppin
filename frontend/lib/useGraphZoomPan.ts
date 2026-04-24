"use client";
// Shared zoom / pan hook for graph views. Auto-fits content on mount and
// whenever `refitOn` changes. Wheel zooms around the cursor, left-drag pans.
// On touch: one finger = pan, two fingers = pinch-zoom (around the midpoint)
// with simultaneous pan. Tracks active pointers in a Map keyed by pointerId.
//
// Usage:
//   const { containerRef, transformString, pointerHandlers, dragging, fit } =
//     useGraphZoomPan({ contentWidth, contentHeight, refitOn });
//   <div ref={containerRef} {...pointerHandlers} style={{ cursor: dragging ? "grabbing" : "grab" }}>
//     <svg width="100%" height="100%">
//       <g transform={transformString}>...</g>
//     </svg>
//   </div>
//
// Notes:
//   1. wheel must be registered as a native listener with passive:false; React 17+
//      SyntheticEvent does not honor preventDefault() on wheel.
//   2. Do not setPointerCapture on pointerdown — it would swallow child click/hover.
//      Wait until the 4px threshold is exceeded before capturing.
//   3. Two-finger pinch: maintain a Map<pointerId, pos>; enter pinch mode when
//      size === 2. Child clicks during pinch are naturally cancelled by the
//      pan/pinch start.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface Options {
  contentWidth: number;
  contentHeight: number;
  minScale?: number;
  maxScale?: number;
  /** Any deps that should trigger a re-fit when they change (target switch, data refresh, etc.). */
  refitOn?: unknown;
  /** Disable auto-fit (rarely needed; defaults to true). */
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

  // All currently-down pointers (client coords), keyed by pointerId.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Single-pointer pan state — active only when exactly one pointer is down
  // and the 4px threshold was crossed.
  const panRef = useRef<{
    sx: number; sy: number; tx0: number; ty0: number;
    captured: boolean; pointerId: number;
  } | null>(null);

  // Pinch state — snapshot of initial finger distance, midpoint, and transform.
  const pinchRef = useRef<{
    startDist: number;
    startMidX: number; startMidY: number;   // container-local coords
    startS: number; startTx: number; startTy: number;
  } | null>(null);

  // Mirror ref for the native wheel listener (avoids stale-closure transform).
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // ── Viewport size: on mount + window resize + ResizeObserver ─────────
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

  // ── Auto-fit ─────────────────────────────────────────────────────────
  const fit = useCallback(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return;
    if (contentWidth <= 0 || contentHeight <= 0) return;
    const margin = 16;
    const sx = (viewport.w - margin * 2) / contentWidth;
    const sy = (viewport.h - margin * 2) / contentHeight;
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

  // ── Wheel: must be native + passive:false so preventDefault works ────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Trackpad pinch arrives as wheel with ctrlKey=true (still uses deltaY);
      // a normal mouse wheel hits the same branch. Factor is bumped a bit so
      // trackpad pinch feels smoother.
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

  // ── Pointer handling: 1 finger = pan, 2 fingers = pinch ─────────────
  const DRAG_THRESHOLD = 4;

  /** Pinch start: snapshot the initial finger distance, midpoint (container-local coords), and current transform. */
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
    // Cancel pan when pinch begins so the second finger doesn't drag the graph.
    panRef.current = null;
    setDragging(true);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
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

    // ── Two-finger pinch ──
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
      // Anchor: the graph point under the initial midpoint must track the
      // current midpoint as the fingers move/pinch.
      //   graph point of initial midpoint: (startMid - startT) / startS
      //   after zoom must still sit at currentMid: newT + graphPt * newS = currentMid
      //   → newT = currentMid - (startMid - startT) * k
      setTransform({
        s: newS,
        tx: midX - (pin.startMidX - pin.startTx) * k,
        ty: midY - (pin.startMidY - pin.startTy) * k,
      });
      return;
    }

    // ── Single-pointer pan (only after threshold; protects child clicks) ──
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
      // dragging stays true during pinch; once back to 1 finger, drop the grab cursor.
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
