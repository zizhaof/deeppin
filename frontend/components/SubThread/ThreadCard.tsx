"use client";
// components/SubThread/ThreadCard.tsx

import type { Thread, Message } from "@/lib/api";

interface Props {
  thread: Thread;
  messages: Message[];
  streamingText?: string;
  suggestions: string[];
  unreadCount: number;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  onSendSuggestion: (question: string) => void;
  onToggleCollapse: (e: React.MouseEvent) => void;
  onDragHandlePointerDown: (e: React.PointerEvent) => void;
}

export default function ThreadCard({
  thread,
  messages,
  streamingText,
  suggestions,
  unreadCount,
  isActive,
  collapsed,
  onClick,
  onSendSuggestion,
  onToggleCollapse,
  onDragHandlePointerDown,
}: Props) {
  const title = thread.title ?? thread.anchor_text?.slice(0, 20) ?? "子线程";
  const isStreaming = streamingText !== undefined;
  const lastMsg = messages[messages.length - 1];
  const hasAutoReply = messages.some((m) => m.role === "assistant");

  const borderCls = isActive
    ? "border-blue-400 bg-blue-50 shadow-blue-100"
    : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-md";

  // ── 折叠态：只显示标题行 ────────────────────────────────────
  if (collapsed) {
    return (
      <div
        onClick={onClick}
        className={`w-52 rounded-xl border cursor-pointer transition-all shadow-sm flex items-center gap-1 px-2 h-9 ${borderCls}`}
      >
        {/* 拖拽把手 */}
        <span
          onPointerDown={onDragHandlePointerDown}
          className="text-gray-300 hover:text-gray-500 cursor-grab select-none flex-shrink-0 text-[11px] pr-0.5"
          title="拖拽移动"
        >
          ⠿
        </span>
        <span className="text-blue-500 flex-shrink-0 text-[11px]">📍</span>
        <p className="font-medium text-gray-700 text-xs truncate flex-1">{title}</p>
        {unreadCount > 0 && (
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {/* 展开按钮 */}
        <button
          onClick={onToggleCollapse}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-[10px] px-0.5"
          title="展开"
        >
          ▾
        </button>
      </div>
    );
  }

  // ── 展开态 ──────────────────────────────────────────────────
  let preview: string;
  if (isStreaming) {
    preview = (streamingText || "…").slice(0, 80);
  } else if (lastMsg) {
    preview = lastMsg.content.slice(0, 80) + (lastMsg.content.length > 80 ? "…" : "");
  } else {
    preview = "正在生成建议…";
  }

  const remainingSuggestions = hasAutoReply || isStreaming
    ? suggestions.slice(1)
    : suggestions;

  return (
    <div
      onClick={onClick}
      className={`w-52 rounded-xl border cursor-pointer transition-all text-xs shadow-sm ${borderCls}`}
    >
      {/* 标题行 */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
        {/* 拖拽把手 */}
        <span
          onPointerDown={onDragHandlePointerDown}
          className="text-gray-300 hover:text-gray-500 cursor-grab select-none flex-shrink-0 text-[11px]"
          title="拖拽移动"
        >
          ⠿
        </span>
        <span className="text-blue-500 flex-shrink-0 text-[10px]">📍</span>
        <p className="font-semibold text-gray-700 leading-snug truncate flex-1">{title}</p>
        {unreadCount > 0 && (
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {/* 折叠按钮 */}
        <button
          onClick={onToggleCollapse}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-[10px] px-0.5"
          title="折叠"
        >
          ▴
        </button>
      </div>

      {/* AI 回复预览 */}
      {(isStreaming || lastMsg) && (
        <div className="px-3 pb-1.5">
          <div className={`flex items-start gap-1 ${isStreaming ? "text-blue-600" : "text-gray-400"}`}>
            {(hasAutoReply || isStreaming) && (
              <span className="flex-shrink-0 mt-0.5 text-[10px]">💡</span>
            )}
            <p className="leading-snug line-clamp-2">{preview}</p>
            {isStreaming && (
              <span className="inline-block w-0.5 h-3 bg-blue-400 ml-0.5 animate-pulse flex-shrink-0" />
            )}
          </div>
        </div>
      )}

      {/* 建议 chips */}
      {remainingSuggestions.length > 0 && (
        <div
          className="px-3 pb-3 flex flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {remainingSuggestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onSendSuggestion(q)}
              className="text-left text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-2 py-1 leading-snug transition-colors line-clamp-2"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
