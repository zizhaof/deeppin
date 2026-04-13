"use client";
// components/Layout/ThreadTree.tsx
// 概览 —— SVG 矢量连线 + 圆点节点，高亮当前线程

import { useMemo } from "react";
import type { Thread, Message } from "@/lib/api";
import { useT } from "@/stores/useLangStore";

interface TreeNode {
  thread: Thread;
  children: TreeNode[];
}

interface FlatNode {
  thread: Thread;
  depth: number;
  row: number;
  parentRow: number | null;
}

function buildTree(
  threads: Thread[],
  parentId: string | null,
  messagesByThread: Record<string, Message[]>
): TreeNode[] {
  const children = threads.filter((t) => t.parent_thread_id === parentId);

  const msgOrder: Record<string, number> = {};
  if (parentId) {
    (messagesByThread[parentId] ?? []).forEach((m, i) => { msgOrder[m.id.toLowerCase()] = i; });
  }

  children.sort((a, b) => {
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

  return children.map((thr) => ({
    thread: thr,
    children: buildTree(threads, thr.id, messagesByThread),
  }));
}

function flattenTree(
  nodes: TreeNode[],
  depth: number,
  parentRow: number | null,
  out: FlatNode[]
) {
  for (const { thread, children } of nodes) {
    const row = out.length;
    out.push({ thread, depth, row, parentRow });
    flattenTree(children, depth + 1, row, out);
  }
}

const ROW_H = 28;
const INDENT = 18;
const DOT_R = 3.5;

const dotX = (depth: number) => depth * INDENT + INDENT / 2;
const dotY = (row: number) => row * ROW_H + ROW_H / 2;

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  unreadCounts: Record<string, number>;
  messagesByThread: Record<string, Message[]>;
  onSelect: (threadId: string) => void;
}

export default function ThreadTree({ threads, activeThreadId, unreadCounts, messagesByThread, onSelect }: Props) {
  const t = useT();

  const flat = useMemo(() => {
    const out: FlatNode[] = [];
    flattenTree(buildTree(threads, null, messagesByThread), 0, null, out);
    return out;
  }, [threads, messagesByThread]);

  if (flat.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[11px] text-zinc-700 select-none">{t.noThreads}</p>
      </div>
    );
  }

  const svgH = flat.length * ROW_H;
  const svgW = flat.reduce((m, n) => Math.max(m, dotX(n.depth) + DOT_R + 2), 10);

  return (
    <div className="h-full overflow-y-auto py-2 px-1 scrollbar-thin">
      <div className="relative" style={{ height: svgH }}>

        {/* SVG 层：连线 + 圆点 */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={svgW}
          height={svgH}
          style={{ overflow: "visible" }}
        >
          {flat.map((node) => {
            if (node.parentRow === null) return null;
            const parent = flat[node.parentRow];
            const x1 = dotX(parent.depth);
            const y1 = dotY(parent.row) + DOT_R;
            const y2 = dotY(node.row);
            const x2 = dotX(node.depth) - DOT_R;
            return (
              <path
                key={`line-${node.thread.id}`}
                d={`M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`}
                fill="none"
                stroke="#3f3f46"
                strokeWidth={1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {flat.map((node) => {
            const isActive = node.thread.id === activeThreadId;
            const isRoot = node.depth === 0;
            const hasUnread = (unreadCounts[node.thread.id] ?? 0) > 0;

            const dotColor = isActive
              ? "#3b82f6"
              : hasUnread
              ? "#ef4444"
              : isRoot
              ? "#71717a"
              : "#52525b";

            return (
              <g key={`dot-${node.thread.id}`}>
                {isActive && (
                  <circle cx={dotX(node.depth)} cy={dotY(node.row)} r={DOT_R + 3} fill="#1e3a5f" />
                )}
                <circle
                  cx={dotX(node.depth)}
                  cy={dotY(node.row)}
                  r={isRoot ? DOT_R + 1 : DOT_R}
                  fill={dotColor}
                />
              </g>
            );
          })}
        </svg>

        {/* 节点按钮层 */}
        {flat.map((node) => {
          const isActive = node.thread.id === activeThreadId;
          const isRoot = node.depth === 0;
          const hasUnread = (unreadCounts[node.thread.id] ?? 0) > 0;
          const label = isRoot
            ? (node.thread.title ?? t.mainConversation)
            : node.thread.title ?? node.thread.anchor_text?.slice(0, 18) ?? t.subThread;
          const labelOffset = dotX(node.depth) + DOT_R + 6;

          return (
            <button
              key={`btn-${node.thread.id}`}
              onClick={() => onSelect(node.thread.id)}
              style={{ position: "absolute", top: node.row * ROW_H, left: 0, right: 0, height: ROW_H }}
              className={`flex items-center rounded transition-colors ${
                isActive ? "bg-blue-950/40" : "hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex-shrink-0" style={{ width: labelOffset }} />
              <span
                className={`text-xs truncate text-left flex-1 ${
                  isActive
                    ? "text-blue-300 font-medium"
                    : hasUnread
                    ? "text-zinc-200 font-medium"
                    : "text-zinc-500"
                }`}
              >
                {label}
              </span>
              {hasUnread && !isActive && (
                <span className="flex-shrink-0 mr-2 w-1.5 h-1.5 rounded-full bg-red-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
