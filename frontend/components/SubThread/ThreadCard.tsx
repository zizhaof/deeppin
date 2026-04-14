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
  onDelete?: () => void;
  isStreaming?: boolean;
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
  onDelete,
}: Props) {
  const title = thread.title ?? thread.anchor_text?.slice(0, 20) ?? "子线程";
  const isStreaming = streamingText !== undefined;
  const lastMsg = messages[messages.length - 1];
  const hasAutoReply = messages.some((m) => m.role === "assistant");

  const baseCls = isActive
    ? "border-indigo-500/30 bg-indigo-950/20"
    : "border-white/6 bg-zinc-900/70 hover:border-white/10 hover:bg-zinc-900";

  // ── 折叠态 ──────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        onClick={onClick}
        className={`w-52 rounded-xl border cursor-pointer transition-all flex items-center gap-2 px-2.5 h-9 ${baseCls}`}
      >
        <span
          onPointerDown={onDragHandlePointerDown}
          className="text-zinc-700 hover:text-zinc-500 cursor-grab select-none flex-shrink-0"
          title="拖拽移动"
        >
          <svg className="w-3 h-3" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
            <circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/>
            <circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/>
            <circle cx="3" cy="14" r="1.2"/><circle cx="7" cy="14" r="1.2"/>
          </svg>
        </span>
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 flex-shrink-0" />
        <p className="font-medium text-zinc-400 text-xs truncate flex-1">{title}</p>
        {unreadCount > 0 && (
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="flex-shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors"
          title="展开"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
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
      className={`w-52 rounded-xl border cursor-pointer transition-all text-xs ${baseCls}`}
    >
      {/* 标题行 */}
      <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5">
        <span
          onPointerDown={onDragHandlePointerDown}
          className="text-zinc-700 hover:text-zinc-500 cursor-grab select-none flex-shrink-0"
          title="拖拽移动"
        >
          <svg className="w-3 h-3" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
            <circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/>
            <circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/>
            <circle cx="3" cy="14" r="1.2"/><circle cx="7" cy="14" r="1.2"/>
          </svg>
        </span>
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 flex-shrink-0" />
        <p className="font-medium text-zinc-300 leading-snug truncate flex-1">{title}</p>
        {unreadCount > 0 && (
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="flex-shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors"
          title="折叠"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={isStreaming}
            className="flex-shrink-0 text-zinc-700 hover:text-red-400 disabled:opacity-30 transition-colors"
            title={isStreaming ? "生成中，不可删除" : "删除子线程"}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* AI 回复预览 */}
      {(isStreaming || lastMsg) && (
        <div className="px-3 pb-2">
          <p className={`leading-snug line-clamp-2 text-[11px] ${
            isStreaming ? "text-indigo-400/80" : "text-zinc-600"
          }`}>
            {preview}
            {isStreaming && (
              <span className="inline-block w-0.5 h-3 bg-indigo-400/70 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>
      )}

      {/* 建议 chips */}
      {remainingSuggestions.length > 0 && (
        <div
          className="px-2.5 pb-2.5 flex flex-col gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {remainingSuggestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onSendSuggestion(q)}
              className="text-left text-[11px] text-indigo-400/70 bg-indigo-950/20 hover:bg-indigo-950/40 border border-indigo-900/40 rounded-lg px-2.5 py-1.5 leading-snug transition-colors line-clamp-2"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
