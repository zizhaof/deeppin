"use client";
// components/SubThread/SideColumn.tsx

import { useCallback, useRef, useState } from "react";
import type { Thread, Message } from "@/lib/api";
import { useThreadStore } from "@/stores/useThreadStore";
import ThreadCard from "./ThreadCard";

export interface ThreadCardItem {
  thread: Thread;
  messages: Message[];
  streamingText?: string;
  /** 首个 chunk 到达前显示的后台状态文字 */
  statusText?: string;
  suggestions: string[];
  unreadCount: number;
  /** 锚点消息在主滚动内容中的绝对 top 偏移（px） */
  anchorTop: number;
}

interface Props {
  items: ThreadCardItem[];
  activeThreadId: string | null;
  scrollTop: number;
  anchorOffset: number;
  containerHeight: number;
  onSelectThread: (threadId: string) => void;
  onSendSuggestion: (threadId: string, question: string) => void;
}

const CARD_HEIGHT = 160;
const CARD_HEIGHT_COLLAPSED = 36;
const CARD_GAP = 8;
const CHIP_HEIGHT = 32;
const CHIP_GAP = 4;

/** 锚点在视口外时显示的小标题 chip */
function PinChip({
  thread,
  unreadCount,
  isActive,
  direction,
  onClick,
}: {
  thread: Thread;
  unreadCount: number;
  isActive: boolean;
  direction: "up" | "down";
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition-colors select-none ${
        isActive
          ? "bg-indigo-950/30 border-indigo-500/40 text-indigo-300"
          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
      }`}
    >
      <span className="text-zinc-600 flex-shrink-0 text-[10px]">
        {direction === "up" ? "↑" : "↓"}
      </span>
      <span className="truncate max-w-[120px]">
        {thread.title ?? thread.anchor_text ?? "子线程"}
      </span>
      {unreadCount > 0 && (
        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-semibold">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </div>
  );
}

export default function SideColumn({
  items,
  activeThreadId,
  scrollTop,
  anchorOffset,
  containerHeight,
  onSelectThread,
  onSendSuggestion,
}: Props) {
  const { userCardPositions, collapsedCards, setUserCardPosition, toggleCardCollapsed } =
    useThreadStore();

  // 拖拽状态（ref 避免 re-render，state 用于实时渲染）
  const draggingRef = useRef<{
    threadId: string;
    startPointerY: number;
    startCardTop: number;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ threadId: string; y: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, threadId: string, currentTop: number) => {
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = {
        threadId,
        startPointerY: e.clientY,
        startCardTop: currentTop,
      };
      setDragPos({ threadId, y: currentTop });

      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const dy = ev.clientY - draggingRef.current.startPointerY;
        const newY = Math.max(0, draggingRef.current.startCardTop + dy);
        setDragPos({ threadId: draggingRef.current.threadId, y: newY });
      };
      const onUp = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const dy = ev.clientY - draggingRef.current.startPointerY;
        const newY = Math.max(0, draggingRef.current.startCardTop + dy);
        setUserCardPosition(draggingRef.current.threadId, newY);
        draggingRef.current = null;
        setDragPos(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setUserCardPosition]
  );

  if (items.length === 0) {
    return (
      <div className="h-full flex items-start justify-center pt-16">
        <p className="text-xs text-gray-200 [writing-mode:vertical-rl] select-none">
          选中文字 → 插针
        </p>
      </div>
    );
  }

  type Positioned = {
    item: ThreadCardItem;
    viewportTop: number;
    zone: "above" | "in" | "below";
    collapsed: boolean;
    cardHeight: number;
  };

  const positioned: Positioned[] = items.map((item) => {
    const collapsed = !!collapsedCards[item.thread.id];
    const cardHeight = collapsed ? CARD_HEIGHT_COLLAPSED : CARD_HEIGHT;

    // 用户拖拽位置优先，否则用锚点计算
    // anchorTop 是选区中心 Y（绝对坐标），卡片中心对齐该位置
    const hasUserPos = userCardPositions[item.thread.id] !== undefined;
    const viewportTop = hasUserPos
      ? userCardPositions[item.thread.id]
      : item.anchorTop - scrollTop + anchorOffset - cardHeight / 2;

    const zone = hasUserPos
      ? "in" // 用户手动放置的卡片始终显示，不折成 chip
      : viewportTop + cardHeight < 0
      ? "above"
      : viewportTop > containerHeight
      ? "below"
      : "in";

    return { item, viewportTop, zone, collapsed, cardHeight };
  });

  const above = positioned.filter((p) => p.zone === "above");
  const inView = positioned.filter((p) => p.zone === "in");
  const below = positioned.filter((p) => p.zone === "below");

  // in-view 卡片：防重叠（按 viewportTop 排序后向下推）
  const sorted = [...inView].sort((a, b) => a.viewportTop - b.viewportTop);
  const final: { item: ThreadCardItem; top: number; collapsed: boolean; cardHeight: number }[] = [];
  let cursor = 0;
  for (const { item, viewportTop, collapsed, cardHeight } of sorted) {
    // 拖拽中的卡片用实时位置
    const isDragging = dragPos?.threadId === item.thread.id;
    const top = isDragging ? dragPos!.y : Math.max(viewportTop, cursor);
    if (!isDragging) cursor = top + cardHeight + CARD_GAP;
    final.push({ item, top, collapsed, cardHeight });
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* 锚点连接线 SVG 层 */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      >
        {final.map(({ item, top, cardHeight }) => {
          const anchorY = item.anchorTop - scrollTop + anchorOffset;
          const cardCenterY = top + cardHeight / 2;
          // 从左边缘锚点位置 → 卡片左侧中心，三次贝塞尔曲线
          const x0 = 0;
          const x1 = 8;
          const mx = (x0 + x1) / 2;
          return (
            <path
              key={item.thread.id}
              d={`M ${x0} ${anchorY} C ${mx} ${anchorY}, ${mx} ${cardCenterY}, ${x1} ${cardCenterY}`}
              fill="none"
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeOpacity={0.5}
            />
          );
        })}
      </svg>

      {/* 视口内：完整卡片 */}
      {final.map(({ item, top, collapsed }) => {
        const isDragging = dragPos?.threadId === item.thread.id;
        return (
          <div
            key={item.thread.id}
            style={{
              position: "absolute",
              top: isDragging ? dragPos!.y : top,
              left: 8,
              right: 8,
              zIndex: isDragging ? 50 : 1,
              cursor: isDragging ? "grabbing" : undefined,
            }}
            className={isDragging ? "" : "transition-[top] duration-100"}
          >
            <ThreadCard
              thread={item.thread}
              messages={item.messages}
              streamingText={item.streamingText}
              suggestions={item.suggestions}
              unreadCount={item.unreadCount}
              isActive={activeThreadId === item.thread.id}
              collapsed={collapsed}
              onClick={() => onSelectThread(item.thread.id)}
              onSendSuggestion={(q) => onSendSuggestion(item.thread.id, q)}
              onToggleCollapse={(e) => {
                e.stopPropagation();
                toggleCardCollapsed(item.thread.id);
              }}
              onDragHandlePointerDown={(e) => onPointerDown(e, item.thread.id, top)}
            />
          </div>
        );
      })}

      {/* 上方越界：顶部叠加 chip */}
      {above.map(({ item }, i) => (
        <div
          key={item.thread.id}
          style={{
            position: "absolute",
            top: i * (CHIP_HEIGHT + CHIP_GAP) + 4,
            left: 8,
            right: 8,
          }}
        >
          <PinChip
            thread={item.thread}
            unreadCount={item.unreadCount}
            isActive={activeThreadId === item.thread.id}
            direction="up"
            onClick={() => onSelectThread(item.thread.id)}
          />
        </div>
      ))}

      {/* 下方越界：底部叠加 chip */}
      {below.map(({ item }, i) => (
        <div
          key={item.thread.id}
          style={{
            position: "absolute",
            bottom: i * (CHIP_HEIGHT + CHIP_GAP) + 4,
            left: 8,
            right: 8,
          }}
        >
          <PinChip
            thread={item.thread}
            unreadCount={item.unreadCount}
            isActive={activeThreadId === item.thread.id}
            direction="down"
            onClick={() => onSelectThread(item.thread.id)}
          />
        </div>
      ))}
    </div>
  );
}
