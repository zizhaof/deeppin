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

// ── Graph before/after — 两个小 SVG 展示线程结构的坍缩 ─────────────
// Two small SVGs showing how the thread tree collapses into a single main.
function GraphBefore({ threads, pigMap }: { threads: Thread[]; pigMap: Map<string, number> }) {
  const W = 150, H = 140;
  const mainId = threads.find((t) => t.parent_thread_id === null)?.id;
  if (!mainId) return null;

  // 同 ThreadGraph：叶子数加权递归布局，子节点聚拢在父节点下、不会出现交叉边
  // Same leaf-count-weighted recursive layout as ThreadGraph — children
  // cluster under their parent and edges never cross.
  const PAD = 18;
  const byParent = new Map<string | null, Thread[]>();
  for (const thr of threads) {
    const list = byParent.get(thr.parent_thread_id) ?? [];
    list.push(thr);
    byParent.set(thr.parent_thread_id, list);
  }
  for (const [parentId, siblings] of byParent) {
    if (parentId === null) continue;
    const sorted = [...siblings].sort(
      (a, b) => (a.anchor_start_offset ?? 0) - (b.anchor_start_offset ?? 0),
    );
    byParent.set(parentId, sorted);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const leafCountCache = new Map<string, number>();
  function leafCount(id: string): number {
    const cached = leafCountCache.get(id);
    if (cached != null) return cached;
    const kids = byParent.get(id) ?? [];
    const n = kids.length === 0 ? 1 : kids.reduce((acc, k) => acc + leafCount(k.id), 0);
    leafCountCache.set(id, n);
    return n;
  }
  function place(id: string, depth: number, xLeft: number, xRight: number) {
    positions.set(id, { x: (xLeft + xRight) / 2, y: 20 + depth * 45 });
    const kids = byParent.get(id) ?? [];
    if (kids.length === 0) return;
    const total = kids.reduce((acc, k) => acc + leafCount(k.id), 0);
    let cursor = xLeft;
    for (const k of kids) {
      const w = ((xRight - xLeft) * leafCount(k.id)) / total;
      place(k.id, depth + 1, cursor, cursor + w);
      cursor += w;
    }
  }
  place(mainId, 0, PAD, W - PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxHeight: 140, display: "block" }} preserveAspectRatio="xMidYMid meet">
      {/* edges */}
      {threads
        .filter((thr) => thr.parent_thread_id)
        .map((thr) => {
          const p = positions.get(thr.id);
          const parent = positions.get(thr.parent_thread_id!);
          if (!p || !parent) return null;
          const dy = p.y - parent.y;
          return (
            <path
              key={`e-${thr.id}`}
              d={`M ${parent.x} ${parent.y} C ${parent.x} ${parent.y + dy * 0.45}, ${p.x} ${p.y - dy * 0.45}, ${p.x} ${p.y}`}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
          );
        })}
      {/* nodes */}
      {threads.map((thr) => {
        const p = positions.get(thr.id);
        if (!p) return null;
        const isRoot = thr.parent_thread_id === null;
        const pigIdx = pigMap.get(thr.id);
        const color = isRoot
          ? "var(--ink)"
          : pigIdx != null
            ? PIG_VAR[pigIdx]
            : "var(--ink-3)";
        return (
          <circle
            key={`n-${thr.id}`}
            cx={p.x}
            cy={p.y}
            r={isRoot ? 5 : 4}
            fill="var(--paper-2)"
            stroke={color}
            strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
}

function GraphAfter() {
  const W = 150, H = 140;
  // flatten 后只剩一个 main 节点；用 pulsing ring 强调「合并到了这里」
  // After flatten there's exactly one main node; a static halo emphasizes it.
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxHeight: 140, display: "block" }} preserveAspectRatio="xMidYMid meet">
      <circle cx={W / 2} cy={H / 2} r={14} fill="var(--accent-soft)" />
      <circle cx={W / 2} cy={H / 2} r={6.5} fill="var(--ink)" />
    </svg>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center self-center">
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
  );
}

function Card({ children, minHeight }: { children: React.ReactNode; minHeight?: number }) {
  return (
    <div
      className="rounded-md px-3 py-3 relative overflow-hidden"
      style={{
        background: "var(--card)",
        border: "1px solid var(--rule-soft)",
        minHeight,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-[0.18em]"
      style={{ color: "var(--ink-4)" }}
    >
      {children}
    </span>
  );
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

  const COL_W = 130;
  const FLOW_GAP = 8;
  const totalMsgs = ordered.reduce((acc, thr) => acc + msgCount(thr, messagesByThread), 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Section 顶部 meta 标签 + Before/After 彩色标题 */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-end">
        <div className="flex items-center justify-center gap-1.5">
          <SectionLabel>{t.flattenPreviewBefore}</SectionLabel>
          <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--ink-3)" }}>
            · {threads.length} threads
          </span>
        </div>
        <div />
        <div className="flex items-center justify-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>
            {t.flattenPreviewAfter}
          </span>
          <span className="font-mono text-[10px] tabular-nums" style={{ color: "var(--ink-3)" }}>
            · {totalMsgs} msgs
          </span>
        </div>
      </div>

      {/* ── Row 1: 对话视图 / Chat view ─────────────────────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
        <div className="flex flex-col gap-1">
          <SectionLabel>chat</SectionLabel>
          <Card minHeight={170}>
            <div className="flex items-center gap-2 mb-2 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--ink-4)" }}>
              <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--ink)" }} />
              <span>{t.mainThread}</span>
            </div>
            <ThreadStack
              thread={mainThread}
              msgs={messagesByThread}
              width={COL_W}
              anchorIdx={1}
              isMain
              pigColor="var(--ink-2)"
            />
            <div className="mt-3 space-y-2.5">
              {subThreads.slice(0, 3).map((thr) => {
                const pigIdx = pigMap.get(thr.id) ?? 0;
                const color = PIG_VAR[pigIdx];
                return (
                  <div key={thr.id} className="flex gap-2 items-stretch">
                    <span className="w-[2px] rounded-full flex-shrink-0" style={{ background: color }} />
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
          </Card>
        </div>

        <Arrow />

        <div className="flex flex-col gap-1">
          <SectionLabel>chat</SectionLabel>
          <Card minHeight={170}>
            <div className="flex items-center gap-2 mb-2 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--ink-4)" }}>
              <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--ink)" }} />
              <span>{t.mainThread}</span>
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
                      <div className="flex items-center gap-1.5 py-1.5 font-mono text-[9px]" style={{ color: "var(--ink-4)" }}>
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
          </Card>
        </div>
      </div>

      {/* ── Row 2: Graph 视图 / Graph view ─────────────────────────── */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
        <div className="flex flex-col gap-1">
          <SectionLabel>graph</SectionLabel>
          <Card minHeight={140}>
            <GraphBefore threads={threads} pigMap={pigMap} />
          </Card>
        </div>
        <Arrow />
        <div className="flex flex-col gap-1">
          <SectionLabel>graph</SectionLabel>
          <Card minHeight={140}>
            <GraphAfter />
          </Card>
        </div>
      </div>
    </div>
  );
}
