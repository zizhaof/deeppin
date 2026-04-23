// lib/useDemoController.ts
// 共享 demo 状态机：接收 phase 顺序 + 每 phase 延迟，自动推进，支持
// 用户手动 prev/next/pause。PinDemo 和 MobilePinDemo 共用。
//
// Shared demo state machine: takes an ordered phase list + per-phase
// delays, auto-advances, and exposes prev/next/pause controls so the
// user can scrub. PinDemo and MobilePinDemo share this hook.

import { useCallback, useEffect, useRef, useState } from "react";

export interface DemoControl<P extends string> {
  phase: P;
  phaseIndex: number;
  phaseCount: number;
  isPlaying: boolean;
  next: () => void;
  prev: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  goTo: (index: number) => void;
  /** 当前 phase 预设的延迟（ms）—— 进度环动画可用 */
  phaseDelay: number;
}

export interface UseDemoControllerOptions<P extends string> {
  startPhase?: P;
  /** 循环到头回到开头，默认 true */
  loop?: boolean;
}

export function useDemoController<P extends string>(
  phases: readonly P[],
  delays: Record<P, number>,
  opts: UseDemoControllerOptions<P> = {},
): DemoControl<P> {
  const { startPhase, loop = true } = opts;
  const [index, setIndex] = useState(() => {
    if (!startPhase) return 0;
    const i = phases.indexOf(startPhase);
    return i < 0 ? 0 : i;
  });
  const [isPlaying, setIsPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 自动前进：每次 phase 或 isPlaying 改变时重置 timer。
  // Auto-advance: reset the timer whenever phase or play state changes.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isPlaying) return;
    const current = phases[index]!;
    const delay = delays[current];
    timerRef.current = setTimeout(() => {
      setIndex((i) => {
        const n = i + 1;
        if (n >= phases.length) return loop ? 0 : i;
        return n;
      });
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [index, isPlaying, phases, delays, loop]);

  const next = useCallback(() => {
    setIsPlaying(false);
    setIndex((i) => {
      const n = i + 1;
      if (n >= phases.length) return loop ? 0 : i;
      return n;
    });
  }, [phases.length, loop]);

  const prev = useCallback(() => {
    setIsPlaying(false);
    setIndex((i) => {
      const n = i - 1;
      if (n < 0) return loop ? phases.length - 1 : 0;
      return n;
    });
  }, [phases.length, loop]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= phases.length) return;
      setIsPlaying(false);
      setIndex(i);
    },
    [phases.length],
  );

  return {
    phase: phases[index]!,
    phaseIndex: index,
    phaseCount: phases.length,
    isPlaying,
    next,
    prev,
    play,
    pause,
    togglePlay,
    goTo,
    phaseDelay: delays[phases[index]!],
  };
}
