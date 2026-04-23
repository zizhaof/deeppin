"use client";
// components/Layout/ThreadTree.tsx
// 右栏 list 视图 — 按设计 .node 模式：
//   左侧 3×N 颜料色条 + Fraunces 标题 + mono 元信息（N msgs · M pins）
//   + 脉动未读章 + active 反色（ink 底 / paper 字）+ 嵌套 branch 左 rule 线
// Right-rail list view — design's .node pattern:
//   3×N pigment color-bar + Fraunces title + mono meta + pulsing unread badge
//   + active = inverted (ink bg / paper text) + nested branch with left rule line.

import React, { useMemo } from "react";
import type { Thread, Message } from "@/lib/api";
import { useT } from "@/stores/useLangStore";

/** 5 色锚点颜料 — 与 MessageBubble.ANCHOR_COLORS 对齐
 *  Pigment palette — matches MessageBubble's ANCHOR_COLORS index order. */
const PIG_VAR = ["var(--pig-1)", "var(--pig-2)", "var(--pig-3)", "var(--pig-4)", "var(--pig-5)"];

interface TreeNode {
  thread: Thread;
  children: TreeNode[];
  /** 该线程在「同一锚点消息」内的兄弟序号 → pigment index */
  pigmentIndex: number;
}

/** 按 anchor 顺序排序兄弟 sub-thread —— 顺序决定 pigment 颜色 */
function sortSiblings(siblings: Thread[], parentMessages: Message[]): Thread[] {
  const msgOrder: Record<string, number> = {};
  parentMessages.forEach((m, i) => { msgOrder[m.id.toLowerCase()] = i; });

  return [...siblings].sort((a, b) => {
    const ai = a.anchor_message_id != null ? (msgOrder[a.anchor_message_id.toLowerCase()] ?? 9999) : 9999;
    const bi = b.anchor_message_id != null ? (msgOrder[b.anchor_message_id.toLowerCase()] ?? 9999) : 9999;
    if (ai !== bi) return ai - bi;
    const aStart = a.anchor_start_offset;
    const bStart = b.anchor_start_offset;
    if (aStart != null && bStart != null && aStart !== bStart) return aStart - bStart;
    if (aStart != null && bStart == null) return -1;
    if (aStart == null && bStart != null) return 1;
    const aEnd = a.anchor_end_offset;
    const bEnd = b.anchor_end_offset;
    if (aEnd != null && bEnd != null && aEnd !== bEnd) return aEnd - bEnd;
    if (aEnd != null && bEnd == null) return -1;
    if (aEnd == null && bEnd != null) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function buildTree(
  threads: Thread[],
  parentId: string | null,
  messagesByThread: Record<string, Message[]>,
): TreeNode[] {
  const raw = threads.filter((t) => t.parent_thread_id === parentId);
  const sorted = parentId
    ? sortSiblings(raw, messagesByThread[parentId] ?? [])
    : raw;
  return sorted.map((thr, idx) => ({
    thread: thr,
    children: buildTree(threads, thr.id, messagesByThread),
    // 主线 (parentId === null) 不上色；其余按兄弟顺序循环 5 色
    pigmentIndex: parentId === null ? -1 : idx % PIG_VAR.length,
  }));
}

interface NodeProps {
  node: TreeNode;
  activeThreadId: string | null;
  unreadCounts: Record<string, number>;
  messagesByThread: Record<string, Message[]>;
  onSelect: (threadId: string) => void;
  isRoot?: boolean;
}

function NodeRow({ node, activeThreadId, unreadCounts, messagesByThread, onSelect, isRoot }: NodeProps) {
  const t = useT();
  const { thread } = node;
  const active = thread.id === activeThreadId;
  const unread = unreadCounts[thread.id] ?? 0;
  const msgCount = (messagesByThread[thread.id] ?? []).length;
  const childCount = node.children.length;

  const title = isRoot
    ? (thread.title ?? t.mainThread)
    : (thread.title ?? thread.anchor_text?.slice(0, 28) ?? t.subThread);

  const pigColor = node.pigmentIndex >= 0 ? PIG_VAR[node.pigmentIndex] : "var(--ink-5)";

  return (
    <div className="mb-px">
      <button
        onClick={() => onSelect(thread.id)}
        className={`group/node w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md transition-colors text-left ${
          active ? "bg-hi" : "hover:bg-glass-md"
        }`}
        style={active ? { background: "var(--ink)" } : undefined}
      >
        {/* 颜料色条 / pigment color bar */}
        <span
          className="flex-shrink-0 mt-0.5 w-[3px] h-8 rounded-[2px]"
          style={{
            background: active ? "var(--paper)" : pigColor,
          }}
          aria-hidden
        />

        {/* 标题 + 元信息 */}
        <span className="flex-1 min-w-0">
          <span
            className="block font-serif text-[13.5px] leading-tight truncate"
            style={{ color: active ? "var(--paper)" : "var(--ink)", fontWeight: active ? 500 : 500 }}
          >
            {title}
          </span>
          <span
            className="block mt-1 font-mono text-[10px] leading-none truncate"
            style={{ color: active ? "var(--ink-5)" : "var(--ink-4)" }}
          >
            {msgCount} msg{msgCount === 1 ? "" : "s"}
            {childCount > 0 && (
              <>
                {" · "}
                {childCount} pin{childCount === 1 ? "" : "s"}
              </>
            )}
          </span>
        </span>

        {/* 脉动未读章 / pulsing unread badge */}
        {unread > 0 && (
          <span
            className="flex-shrink-0 mt-[3px] inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full font-mono text-[10px] font-semibold tree-node-unread"
            style={{
              background: active ? "var(--paper)" : "var(--accent)",
              color: active ? "var(--ink)" : "var(--paper)",
              animation: active ? "none" : undefined,
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* 嵌套子节点 — 左侧 1px rule 线 */}
      {node.children.length > 0 && (
        <div className="relative pl-4 ml-2">
          <span
            className="absolute left-[6px] top-1 bottom-2 w-px"
            style={{ background: "var(--rule)" }}
            aria-hidden
          />
          {node.children.map((child) => (
            <NodeRow
              key={child.thread.id}
              node={child}
              activeThreadId={activeThreadId}
              unreadCounts={unreadCounts}
              messagesByThread={messagesByThread}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  unreadCounts: Record<string, number>;
  messagesByThread: Record<string, Message[]>;
  onSelect: (threadId: string) => void;
}

export default function ThreadTree({
  threads,
  activeThreadId,
  unreadCounts,
  messagesByThread,
  onSelect,
}: Props) {
  const t = useT();

  const tree = useMemo(
    () => buildTree(threads, null, messagesByThread),
    [threads, messagesByThread],
  );

  if (tree.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[10px] text-ph select-none tracking-wider">{t.noThreads}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-2 px-2.5 scrollbar-thin">
      {tree.map((node) => (
        <NodeRow
          key={node.thread.id}
          node={node}
          activeThreadId={activeThreadId}
          unreadCounts={unreadCounts}
          messagesByThread={messagesByThread}
          onSelect={onSelect}
          isRoot
        />
      ))}
    </div>
  );
}
