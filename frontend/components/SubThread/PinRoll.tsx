"use client";
// components/SubThread/PinRoll.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ThreadCardItem } from "./SideColumn";
import { useThreadStore } from "@/stores/useThreadStore";
import { useT } from "@/stores/useLangStore";
import { getThreadSubtree, deleteThread } from "@/lib/api";

// ── 删除确认树形弹窗 ─────────────────────────────────────────────────
interface SubtreeNode {
  id: string;
  title?: string | null;
  children?: SubtreeNode[];
}

function TreePreview({ node, depth = 0 }: { node: SubtreeNode; depth?: number }) {
  const title = node.title ?? "（无标题）";
  const children = node.children ?? [];
  return (
    <div>
      <div className="flex items-start gap-1.5" style={{ paddingLeft: depth * 16 }}>
        {depth > 0 && (
          <span className="mt-1.5 flex-shrink-0 text-zinc-600 select-none">└</span>
        )}
        <span className={`text-sm leading-snug ${depth === 0 ? "text-indigo-300 font-medium" : "text-zinc-300"}`}>
          {title}
        </span>
      </div>
      {children.map((c) => (
        <TreePreview key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

function DeleteConfirmModal({
  subtree,
  onConfirm,
  onCancel,
}: {
  subtree: SubtreeNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const countNodes = (n: SubtreeNode): number =>
    1 + (n.children ?? []).reduce((s, c) => s + countNodes(c), 0);
  const total = countNodes(subtree);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-80 max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="px-5 pt-5 pb-3 border-b border-zinc-800 flex-shrink-0">
          <h3 className="text-sm font-semibold text-white">删除子线程</h3>
          <p className="text-xs text-zinc-400 mt-1">
            {total > 1
              ? `以下 ${total} 个线程将被永久删除`
              : "以下线程将被永久删除"}
          </p>
        </div>

        {/* 树形预览 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          <TreePreview node={subtree} />
        </div>

        {/* 操作按钮 */}
        <div className="px-5 pb-5 pt-3 border-t border-zinc-800 flex gap-2 justify-end flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-lg text-xs bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

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
  onDeleteThread?: (threadId: string) => void;
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
  onDeleteThread,
}: Props) {
  const t = useT();
  const { consumeSuggestion, removeThreadAndDescendants, streamingByThread } = useThreadStore();

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    threadId: string;
    subtree: SubtreeNode;
  } | null>(null);

  const handleDelete = useCallback(async (threadId: string) => {
    if (streamingByThread[threadId]) return;
    try {
      const raw = await getThreadSubtree(threadId);
      setDeleteConfirm({ threadId, subtree: raw as SubtreeNode });
    } catch (err) {
      alert(`获取线程信息失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  }, [streamingByThread]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const { threadId } = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await deleteThread(threadId);
      removeThreadAndDescendants(threadId);
      onDeleteThread?.(threadId);
    } catch (err) {
      alert(`删除失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  }, [deleteConfirm, removeThreadAndDescendants, onDeleteThread]);
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
        <p className="text-[10px] text-ph [writing-mode:vertical-rl] select-none tracking-[0.15em]">
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
                ? "border-base bg-elevated-80"
                : "border-subtle bg-surface-70"
              }
            `}
          >
            {/* 标题行 */}
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 flex-shrink-0">
              <div className="w-1 h-1 rounded-full bg-indigo-500/50 flex-shrink-0" />
              <p className={`font-medium truncate flex-1 leading-tight ${
                isFocused ? `text-hi ${titleSizeCls}` : `text-lo ${titleSizeCls}`
              }`}>
                {title}
              </p>
              {item.unreadCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/80 flex-shrink-0" />
              )}
              {isFocused && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(item.thread.id); }}
                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-ph hover:text-red-400 transition-colors rounded"
                  title="删除子线程"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              )}
            </div>

            {/* 预览 + 建议 */}
            {h > 44 && (
              <div className="flex-1 min-h-0 flex flex-col px-3 pb-2.5 gap-1.5 overflow-hidden">
                {(preview || isStreaming || hasStatus) && (
                  <div className={`flex-1 min-h-0 leading-snug overflow-hidden ${previewSizeCls} ${
                    isStreaming ? "text-indigo-400/80" : "text-faint"
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
                          <span key={j} className="w-1 h-1 rounded-full bg-faint animate-bounce"
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

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <DeleteConfirmModal
          subtree={deleteConfirm.subtree}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
