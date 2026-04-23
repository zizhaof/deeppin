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
//   - 左键按住拖拽平移
//
// 注意：wheel 必须通过 native listener + passive:false 注册，否则 React 17+
// 的 SyntheticEvent 下 preventDefault() 不生效。
//
// Shared zoom / pan hook for graph views. Auto-fits content on mount and
// whenever `refitOn` changes. Wheel zooms around the cursor, left-drag pans.
// Wheel is attached via native listener because React synthetic wheel is
// passive by default (preventDefault wouldn't work otherwise).

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
  // captured：是否已抢占 pointer capture（超过阈值才抢，保证 child click 能正常触发）
  // captured: whether pointer-capture is active — only flips true after the 4px
  // drag threshold, so plain clicks on child nodes are never swallowed.
  const dragRef = useRef<{
    sx: number; sy: number; tx0: number; ty0: number;
    captured: boolean; pointerId: number;
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

  // ── pointer drag → pan（带阈值，避免吞掉 child click）──────────────
  // pointer drag → pan (with 4px threshold so node clicks still fire)
  const DRAG_THRESHOLD = 4;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      tx0: transformRef.current.tx,
      ty0: transformRef.current.ty,
      captured: false,
      pointerId: e.pointerId,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.captured) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // 超过阈值 → 正式进入 pan 模式，抢 pointer capture
      // Crossed the threshold → enter pan mode + claim pointer capture.
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      d.captured = true;
      setDragging(true);
    }
    setTransform((prev) => ({
      ...prev,
      tx: d.tx0 + dx,
      ty: d.ty0 + dy,
    }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d?.captured) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    dragRef.current = null;
    setDragging(false);
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
