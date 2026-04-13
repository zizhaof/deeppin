"use client";
// components/SubThread/PinRoll.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadCardItem } from "./SideColumn";
import { useThreadStore } from "@/stores/useThreadStore";
import { useT } from "@/stores/useLangStore";

interface Props {
  items: ThreadCardItem[];
  activeThreadId: string | null;
  mainScrollTop: number;
  mainHeight: number;
  rollHeight: number;
  focusThreadId?: string | null;
  /** 悬浮锚点时同时高亮多个卡片（每个都按 focused 尺寸展开） */
  focusThreadIds?: string[] | null;
  onCardHover?: (threadId: string | null) => void;
  onSelectThread: (threadId: string) => void;
  onSendSuggestion: (threadId: string, question: string) => void;
}

const CFG = [
  { h: 148, op: 1    },
  { h: 100, op: 0.85 },
  { h:  72, op: 0.65 },
  { h:  58, op: 0.5  },
  { h:  52, op: 0.4  },
];
const GAP = 5;
const RESUME_DELAY = 2000;
/** 展开动画时长（ms），与 CSS transition 保持一致，动画期间屏蔽 hover 切换 */
const ANIM_DURATION = 130;

function cfg(dist: number) {
  return CFG[Math.min(dist, CFG.length - 1)];
}

/**
 * 计算每张卡片的绝对 top。
 * 从顶部顺序排列，不因 focused 位置而整体偏移。
 */
function computeLayout(
  count: number,
  _focusedIdx: number,
  _rollHeight: number,
  cardHeights: number[],
): number[] {
  const tops: number[] = [];
  let y = GAP;
  for (let i = 0; i < count; i++) {
    tops.push(y);
    y += cardHeights[i] + GAP;
  }
  return tops;
}

export default function PinRoll({
  items,
  activeThreadId,
  mainScrollTop,
  mainHeight,
  rollHeight,
  focusThreadId,
  focusThreadIds,
  onCardHover,
  onSelectThread,
  onSendSuggestion,
}: Props) {
  const t = useT();
  const { consumeSuggestion } = useThreadStore();
  const sorted = items;

  const [focusedIdx, setFocusedIdx] = useState(0);
  const userFocusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /** 动画锁：transition 期间屏蔽 hover 切换，防止鼠标在动画中误触其他卡片 */
  const animatingRef = useRef(false);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockFocus = useCallback((delay = RESUME_DELAY) => {
    userFocusedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { userFocusedRef.current = false; }, delay);
  }, []);

  const setFocusWithLock = useCallback((idx: number) => {
    setFocusedIdx(idx);
    animatingRef.current = true;
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => { animatingRef.current = false; }, ANIM_DURATION);
  }, []);

  // 主滚动自动聚焦最近的锚点
  useEffect(() => {
    if (userFocusedRef.current || sorted.length === 0) return;
    const center = mainScrollTop + mainHeight / 2;
    let best = 0, bestD = Infinity;
    sorted.forEach((item, i) => {
      const d = Math.abs(item.anchorTop - center);
      if (d < bestD) { bestD = d; best = i; }
    });
    setFocusedIdx(best);
  }, [mainScrollTop, mainHeight, sorted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 外部 focusThreadId 聚焦（单个）
  useEffect(() => {
    if (!focusThreadId) return;
    const idx = sorted.findIndex((item) => item.thread.id === focusThreadId);
    if (idx >= 0) { lockFocus(RESUME_DELAY); setFocusWithLock(idx); }
  }, [focusThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 外部 focusThreadIds 聚焦（多个，取第一个作为手风琴中心）
  useEffect(() => {
    if (!focusThreadIds || focusThreadIds.length === 0) return;
    const idx = sorted.findIndex((item) => focusThreadIds.includes(item.thread.id));
    if (idx >= 0) { lockFocus(RESUME_DELAY); setFocusWithLock(idx); }
  }, [focusThreadIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCardMouseEnter = useCallback((idx: number, threadId: string) => {
    if (animatingRef.current) return; // 动画期间屏蔽，防止误触
    lockFocus(RESUME_DELAY);
    setFocusWithLock(idx);
    onCardHover?.(threadId);
  }, [lockFocus, setFocusWithLock, onCardHover]);

  const handleContainerMouseLeave = useCallback(() => {
    lockFocus(RESUME_DELAY);
    onCardHover?.(null);
  }, [lockFocus, onCardHover]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    lockFocus(RESUME_DELAY);
    setFocusedIdx(prev => Math.max(0, Math.min(sorted.length - 1, prev + (e.deltaY > 0 ? 1 : -1))));
  }, [sorted.length, lockFocus]);

  if (sorted.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[10px] text-zinc-700 [writing-mode:vertical-rl] select-none tracking-[0.15em]">
          {t.selectToPin}
        </p>
      </div>
    );
  }

  // ── 计算每张卡的高度 ──────────────────────────────────────────────
  const totalRawH = sorted.reduce((sum, item, i) => {
    const isHF = focusThreadIds ? focusThreadIds.includes(item.thread.id) : false;
    const effectiveDist = isHF ? 0 : Math.abs(i - focusedIdx);
    return sum + cfg(effectiveDist).h;
  }, 0);
  const totalGaps = Math.max(0, sorted.length - 1) * GAP + GAP * 2;
  // 内容不足时不拉伸（scale 最大为 1），只在内容溢出时等比缩小
  const scale = rollHeight > 0 && totalRawH > 0
    ? Math.min(1, (rollHeight - totalGaps) / totalRawH)
    : 1;

  const cardHeights = sorted.map((item, i) => {
    const isHF = focusThreadIds ? focusThreadIds.includes(item.thread.id) : false;
    const effectiveDist = isHF ? 0 : Math.abs(i - focusedIdx);
    return Math.round(cfg(effectiveDist).h * scale);
  });

  // ── 计算绝对定位 top（方向感知）────────────────────────────────────
  const cardTops = computeLayout(sorted.length, focusedIdx, rollHeight, cardHeights);

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden"
      onWheel={handleWheel}
      onMouseLeave={handleContainerMouseLeave}
    >
      {sorted.map((item, i) => {
        const h = cardHeights[i];
        const top = cardTops[i];
        const isHF = focusThreadIds ? focusThreadIds.includes(item.thread.id) : false;
        const effectiveDist = isHF ? 0 : Math.abs(i - focusedIdx);
        const { op } = cfg(effectiveDist);
        const isFocused = effectiveDist === 0;
        const isActive = activeThreadId === item.thread.id;

        const title = item.thread.title ?? item.thread.anchor_text?.slice(0, 24) ?? t.subThread;
        const lastMsg = item.messages[item.messages.length - 1];
        const isStreaming = item.streamingText !== undefined;
        const hasStatus = !!item.statusText && !isStreaming;
        const hasAutoReply = item.messages.some((m) => m.role === "assistant");

        const titleSizeCls = "text-xs";
        const previewSizeCls = "text-[11px]";

        let preview = "";
        if (isStreaming) preview = (item.streamingText || "…").slice(0, 300);
        else if (hasStatus) preview = item.statusText!;
        else if (lastMsg) preview = lastMsg.content;

        const remainingSuggestions = hasAutoReply || isStreaming ? [] : item.suggestions;

        return (
          <div
            key={item.thread.id}
            data-thread-id={item.thread.id}
            onClick={() => onSelectThread(item.thread.id)}
            onMouseEnter={() => handleCardMouseEnter(i, item.thread.id)}
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              top,
              height: h,
              opacity: op,
              transition: `top ${ANIM_DURATION}ms ease-out, height ${ANIM_DURATION}ms ease-out, opacity ${ANIM_DURATION}ms ease-out`,
            }}
            className={`
              rounded-xl border overflow-hidden cursor-pointer flex flex-col
              ${isActive
                ? "border-indigo-500/30 bg-indigo-950/15"
                : isFocused
                ? "border-white/10 bg-zinc-800/90"
                : "border-white/[0.05] bg-zinc-900/70"
              }
            `}
          >
            {/* 标题行 */}
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 flex-shrink-0">
              <div className="w-1 h-1 rounded-full bg-indigo-500/50 flex-shrink-0" />
              <p className={`font-medium truncate flex-1 leading-tight ${
                isFocused ? `text-zinc-200 ${titleSizeCls}` : `text-zinc-400 ${titleSizeCls}`
              }`}>
                {title}
              </p>
              {item.unreadCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/80 flex-shrink-0" />
              )}
            </div>

            {/* 预览 + 建议 */}
            {h > 44 && (
              <div className="flex-1 min-h-0 flex flex-col px-3 pb-2.5 gap-1.5 overflow-hidden">
                {(preview || isStreaming || hasStatus) && (
                  <div className={`flex-1 min-h-0 leading-snug overflow-hidden ${previewSizeCls} ${
                    isStreaming ? "text-indigo-400/80" : "text-zinc-600"
                  }`}>
                    <p className="overflow-hidden break-words" style={{ wordBreak: "break-word" }}>
                      {preview || "…"}
                    </p>
                    {isStreaming && (
                      <span className="inline-block w-0.5 h-3 bg-indigo-400/70 animate-pulse ml-0.5" />
                    )}
                    {hasStatus && (
                      <span className="flex gap-0.5 items-center mt-0.5">
                        {[0, 1, 2].map((j) => (
                          <span key={j} className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce"
                            style={{ animationDelay: `${j * 150}ms`, animationDuration: "900ms" }} />
                        ))}
                      </span>
                    )}
                  </div>
                )}

                {isFocused && remainingSuggestions.length > 0 && (
                  <div
                    className="flex flex-col gap-1 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {remainingSuggestions.slice(0, 2).map((q, qi) => (
                      <button
                        key={qi}
                        onClick={() => {
                          consumeSuggestion(item.thread.id, q);
                          onSendSuggestion(item.thread.id, q);
                        }}
                        className="text-left text-[10px] text-indigo-400/70 bg-indigo-950/20 hover:bg-indigo-950/40 border border-indigo-900/30 rounded-lg px-2 py-0.5 leading-snug transition-colors truncate"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
