"use client";
// components/FlattenPreview.tsx
//
// 扁平化前 / 后的对话式预览 —— 左边是当前的多线程（主线 + 分支子线程）
// 右边是合并后的单线程：主线消息 + 所有子线程的消息按 preorder 拼进主线，
// 带「↳ Flattened from …」分隔头。用真实 session 的 threads/messages 作结构。
//
// Before/after conversation-style preview for flatten:
//   - Left: current multi-thread tree — main thread bubbles + sub-thread bubbles
//     branching off anchors.
//   - Right: after flatten — one main thread with every sub-thread's messages
//     spliced in preorder, each prefixed by a small "↳ merged from …" separator.
//   - Uses real session threads + message counts for the shapes.

import React, { useMemo } from "react";
import type { Thread, Message } from "@/lib/api";
import { useT } from "@/stores/useLangStore";

const PIG_VAR = ["var(--pig-1)", "var(--pig-2)", "var(--pig-3)", "var(--pig-4)", "var(--pig-5)"];

interface Props {
  threads: Thread[];
  messagesByThread?: Record<string, Message[] | undefined>;
}

/** Pigment index = 在父线程下的兄弟顺序（按创建时间）
 *  Pigment index = sibling order (by created_at) within the parent thread. */
function buildPigmentMap(threads: Thread[]): Map<string, number> {
  const byParent = new Map<string | null, Thread[]>();
  for (const thr of threads) {
    const list = byParent.get(thr.parent_thread_id) ?? [];
    list.push(thr);
    byParent.set(thr.parent_thread_id, list);
  }
  const m = new Map<string, number>();
  for (const [parentId, siblings] of byParent) {
    if (parentId === null) continue;
    const sorted = [...siblings].sort(
      (a, b) => (a.anchor_start_offset ?? 0) - (b.anchor_start_offset ?? 0),
    );
    sorted.forEach((thr, i) => m.set(thr.id, i % PIG_VAR.length));
  }
  return m;
}

/** preorder 遍历所有 thread —— Flatten 后消息会按这个顺序拼进主线。
 *  Preorder walk over the thread tree — after flatten, messages concatenate
 *  in this order. */
function preorderThreads(threads: Thread[]): Thread[] {
  const byParent = new Map<string | null, Thread[]>();
  for (const thr of threads) {
    const list = byParent.get(thr.parent_thread_id) ?? [];
    list.push(thr);
    byParent.set(thr.parent_thread_id, list);
  }
  const mainId = threads.find((t) => t.parent_thread_id === null)?.id;
  if (!mainId) return threads;
  const out: Thread[] = [];
  const walk = (id: string) => {
    const thr = threads.find((t) => t.id === id);
    if (thr) out.push(thr);
    for (const child of byParent.get(id) ?? []) walk(child.id);
  };
  walk(mainId);
  return out;
}

/** 每条 thread 的消息数（没有传 messagesByThread 时用 2 作默认估算）
 *  Message count per thread; falls back to 2 when messagesByThread isn't given. */
function msgCount(thr: Thread, msgs?: Record<string, Message[] | undefined>): number {
  if (!msgs) return 2;
  const n = msgs[thr.id]?.length ?? 2;
  return Math.max(1, Math.min(6, n)); // 钳到 1..6，避免预览塞爆
}

/** 缩略气泡行 —— 一个用户气泡 + 一个 AI 气泡的小组合 */
function BubbleRow({
  alignRight,
  color,
  width,
  withAnchor,
}: {
  alignRight: boolean;
  color: string;
  width: number;
  withAnchor?: boolean;
}) {
  return (
    <div className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
      <div
        className="relative rounded-[4px] h-[8px]"
        style={{
          width,
          background: alignRight ? "var(--accent)" : color,
          opacity: alignRight ? 1 : 0.85,
        }}
      >
        {withAnchor && (
          <span
            className="absolute left-[16px] bottom-[-3px] h-[2px]"
            style={{ width: 28, background: "var(--pig-1)" }}
          />
        )}
      </div>
    </div>
  );
}

/** 单条 thread 的小型气泡 stack —— 展示 N 条消息，用户/AI 交替 */
function ThreadStack({
  thread,
  msgs,
  width,
  anchorIdx,
  isMain,
  pigColor,
}: {
  thread: Thread;
  msgs: Record<string, Message[] | undefined> | undefined;
  width: number;
  anchorIdx?: number; // 在第几条 AI 消息上放一个锚点（仅 main 用）
  isMain: boolean;
  pigColor: string;
}) {
  const n = msgCount(thread, msgs);
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const isUser = i % 2 === 0;
    const showAnchor = !isUser && anchorIdx === i;
    rows.push(
      <BubbleRow
        key={i}
        alignRight={isUser}
        color={isMain ? "var(--ink-2)" : pigColor}
        width={Math.max(34, Math.round(width * (isUser ? 0.48 : 0.72)))}
        withAnchor={showAnchor}
      />,
    );
  }
  return <div className="flex flex-col gap-[3px]">{rows}</div>;
}

export default function FlattenPreview({ threads, messagesByThread }: Props) {
  const t = useT();

  const mainThread = threads.find((t) => t.parent_thread_id === null);
  const subThreads = threads.filter((t) => t.parent_thread_id !== null);
  const pigMap = useMemo(() => buildPigmentMap(threads), [threads]);
  const ordered = useMemo(() => preorderThreads(threads), [threads]);

  if (!mainThread || subThreads.length === 0) {
    return (
      <p className="font-mono text-[11px] text-center py-4" style={{ color: "var(--ink-4)" }}>
        {t.flattenPreviewEmpty}
      </p>
    );
  }

  // Before 视图：主线气泡纵向 stack；每个 sub-thread 作为从锚点横向分支出的小方块
  // After 视图：所有 thread 按 preorder 顺序拼成一条，sub-thread 段带分隔标签

  const COL_W = 130;   // 每栏内气泡基准宽度 / base bubble width
  const FLOW_GAP = 8;  // 气泡堆叠间距

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
      {/* ── Before ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col">
        <span
          className="font-mono text-[9.5px] uppercase tracking-[0.14em] mb-2 text-center"
          style={{ color: "var(--ink-4)" }}
        >
          {t.flattenPreviewBefore}
        </span>
        <div
          className="rounded-md px-3 py-3 relative overflow-hidden"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            minHeight: 160,
          }}
        >
          {/* 主线 */}
          <div className="flex items-center gap-2 mb-2 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--ink-4)" }}>
            <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--ink)" }} />
            <span>{t.mainThread ?? "main"}</span>
          </div>
          <ThreadStack
            thread={mainThread}
            msgs={messagesByThread}
            width={COL_W}
            anchorIdx={1}
            isMain
            pigColor="var(--ink-2)"
          />

          {/* 子线程：作为分支块显示在主线下方，缩进 + 左边 pigment 线 */}
          <div className="mt-3 space-y-2.5">
            {subThreads.slice(0, 3).map((thr) => {
              const pigIdx = pigMap.get(thr.id) ?? 0;
              const color = PIG_VAR[pigIdx];
              return (
                <div key={thr.id} className="flex gap-2 items-stretch">
                  <span
                    className="w-[2px] rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />
                  <div className="flex-1 min-w-0" style={{ paddingTop: 2, gap: FLOW_GAP }}>
                    <div className="font-mono text-[9px] mb-1 truncate" style={{ color: "var(--ink-4)" }}>
                      {thr.title?.slice(0, 20) ?? thr.anchor_text?.slice(0, 18) ?? "sub-thread"}
                    </div>
                    <ThreadStack
                      thread={thr}
                      msgs={messagesByThread}
                      width={COL_W - 12}
                      isMain={false}
                      pigColor={color}
                    />
                  </div>
                </div>
              );
            })}
            {subThreads.length > 3 && (
              <div className="font-mono text-[9.5px] pl-3" style={{ color: "var(--ink-4)" }}>
                + {subThreads.length - 3} more
              </div>
            )}
          </div>
        </div>
        <span className="mt-2 font-mono text-[10px] text-center" style={{ color: "var(--ink-4)" }}>
          {threads.length} threads · {subThreads.length} pins
        </span>
      </div>

      {/* ── Arrow ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center self-center pt-7">
        <svg width="22" height="18" viewBox="0 0 22 18" fill="none">
          <path
            d="M2 9 L18 9 M14 4 L19 9 L14 14"
            stroke="var(--accent)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* ── After ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col">
        <span
          className="font-mono text-[9.5px] uppercase tracking-[0.14em] mb-2 text-center"
          style={{ color: "var(--accent)" }}
        >
          {t.flattenPreviewAfter}
        </span>
        <div
          className="rounded-md px-3 py-3 relative overflow-hidden"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            minHeight: 160,
          }}
        >
          <div className="flex items-center gap-2 mb-2 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--ink-4)" }}>
            <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--ink)" }} />
            <span>{t.mainThread ?? "main"}</span>
          </div>
          <div className="flex flex-col gap-[3px]">
            {ordered.map((thr) => {
              const isMain = thr.parent_thread_id === null;
              const n = msgCount(thr, messagesByThread);
              const rows: React.ReactNode[] = [];
              for (let i = 0; i < n; i++) {
                rows.push(
                  <BubbleRow
                    key={`${thr.id}-${i}`}
                    alignRight={i % 2 === 0}
                    color="var(--ink-2)"
                    width={Math.max(34, Math.round(COL_W * (i % 2 === 0 ? 0.48 : 0.72)))}
                  />,
                );
              }
              return (
                <React.Fragment key={thr.id}>
                  {!isMain && (
                    <div
                      className="flex items-center gap-1.5 py-1.5 font-mono text-[9px]"
                      style={{ color: "var(--ink-4)" }}
                    >
                      <span className="flex-1 h-px" style={{ background: "var(--rule-soft)" }} />
                      <span className="tracking-tight">
                        ↳ {thr.title?.slice(0, 16) ?? thr.anchor_text?.slice(0, 14) ?? "merged"}
                      </span>
                      <span className="flex-1 h-px" style={{ background: "var(--rule-soft)" }} />
                    </div>
                  )}
                  {rows}
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <span className="mt-2 font-mono text-[10px] text-center" style={{ color: "var(--ink-4)" }}>
          1 main thread · {ordered.reduce((acc, thr) => acc + msgCount(thr, messagesByThread), 0)} messages
        </span>
      </div>
    </div>
  );
}
