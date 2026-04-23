"use client";
// components/DemoTransport.tsx
// 演示动画的播放控件 —— 挂在 caption 条右侧。默认播放；空闲 2.5s 后淡出，
// 用户 hover/touch 整个 demo 盒子时再淡入。
//
// Demo transport controls — mounted inside the caption bar. Auto-plays by
// default; fades out after ~2.5s of idle so it stays out of the way, and
// fades back in when the user hovers / taps the demo container.
//
// 用法 / Usage:
//   <DemoTransport control={control} active={isHovered} />

import type { DemoControl } from "@/lib/useDemoController";

interface Props<P extends string> {
  control: DemoControl<P>;
  /** 是否活跃（hover / touch）—— 活跃时控件完全不透明，否则低不透明度 */
  active: boolean;
  /** 紧凑模式 —— 手机端图标缩一点 */
  compact?: boolean;
}

export default function DemoTransport<P extends string>({
  control,
  active,
  compact = false,
}: Props<P>) {
  const { phaseIndex, phaseCount, isPlaying, prev, next, togglePlay, goTo } = control;
  const btnSize = compact ? 18 : 20;
  const dotSize = compact ? 4 : 5;
  const gap = compact ? 3 : 4;

  const baseOpacity = active ? 1 : 0.35;

  return (
    <div
      className="flex items-center gap-2 transition-opacity duration-200 select-none"
      style={{ opacity: baseOpacity }}
      aria-label="demo playback controls"
    >
      {/* prev */}
      <button
        type="button"
        onClick={prev}
        className="flex items-center justify-center rounded transition-colors hover:bg-[var(--rule-soft)]"
        style={{ width: btnSize + 6, height: btnSize + 2, color: "var(--ink-3)" }}
        aria-label="previous step"
      >
        <svg width={btnSize - 4} height={btnSize - 4} viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 5v14h2V5H6zm4 7l8 6V6l-8 6z" />
        </svg>
      </button>

      {/* play / pause */}
      <button
        type="button"
        onClick={togglePlay}
        className="flex items-center justify-center rounded transition-colors hover:bg-[var(--rule-soft)]"
        style={{ width: btnSize + 6, height: btnSize + 2, color: "var(--ink-2)" }}
        aria-label={isPlaying ? "pause" : "play"}
      >
        {isPlaying ? (
          <svg width={btnSize - 4} height={btnSize - 4} viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width={btnSize - 4} height={btnSize - 4} viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        )}
      </button>

      {/* next */}
      <button
        type="button"
        onClick={next}
        className="flex items-center justify-center rounded transition-colors hover:bg-[var(--rule-soft)]"
        style={{ width: btnSize + 6, height: btnSize + 2, color: "var(--ink-3)" }}
        aria-label="next step"
      >
        <svg width={btnSize - 4} height={btnSize - 4} viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 5v14h2V5h-2zM6 18l8-6-8-6v12z" />
        </svg>
      </button>

      {/* progress dots —— 每个 phase 一个小点，当前 phase 拉长、accent 色
           Progress dots; current phase is elongated + accent-tinted. */}
      <div className="flex items-center" style={{ gap }}>
        {Array.from({ length: phaseCount }).map((_, i) => {
          const isCurrent = i === phaseIndex;
          const isPast = i < phaseIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`go to step ${i + 1}`}
              className="rounded-full transition-all"
              style={{
                width: isCurrent ? dotSize * 3 : dotSize,
                height: dotSize,
                background: isCurrent
                  ? "var(--accent)"
                  : isPast
                    ? "var(--ink-4)"
                    : "var(--rule-strong)",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            />
          );
        })}
      </div>

      {/* step counter */}
      <span
        className="font-mono tabular-nums"
        style={{
          fontSize: compact ? 9 : 10,
          color: "var(--ink-4)",
          minWidth: compact ? 26 : 30,
          textAlign: "right",
        }}
      >
        {phaseIndex + 1}/{phaseCount}
      </span>
    </div>
  );
}
