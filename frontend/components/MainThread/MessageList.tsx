"use client";
// components/MainThread/MessageList.tsx

import { useEffect, useRef } from "react";
import type { Message } from "@/lib/api";
import type { AnchorRange } from "./MessageBubble";
import MessageBubble from "./MessageBubble";
import { useT } from "@/stores/useLangStore";

// 稳定的空数组引用，避免每次渲染产生新的 [] 绕过 React.memo
const EMPTY_ANCHORS: AnchorRange[] = [];

interface Props {
  messages: Message[];
  streamingText?: string;
  /** 首个 chunk 到达前显示的后台状态文字（如"正在检索…"）*/
  statusText?: string;
  anchorsByMessage: Record<string, AnchorRange[]>;
  /** 有未读回复的 thread id 集合 — 下游锚点据此切换呼吸动画
   *  Set of thread IDs with unread replies — anchors flip to the breathing state when included. */
  unreadThreadIds?: Set<string>;
  suggestions?: string[];
  anchorText?: string | null;
  userAvatarUrl?: string | null;
  onMessageRef?: (messageId: string, el: HTMLDivElement | null) => void;
  onTextSelect?: (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => void;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
  onSendSuggestion?: (question: string) => void;
}

// 稳定空集合，避免每次渲染创建新 Set 导致 MessageBubble.memo 失效
// Stable empty set — avoids MessageBubble.memo invalidation from a fresh object each render.
const EMPTY_UNREAD: Set<string> = new Set();

export default function MessageList({
  messages,
  streamingText,
  statusText,
  anchorsByMessage,
  unreadThreadIds = EMPTY_UNREAD,
  suggestions = [],
  anchorText,
  userAvatarUrl,
  onMessageRef,
  onTextSelect,
  onAnchorClick,
  onAnchorHover,
  onSendSuggestion,
}: Props) {
  const t = useT();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, statusText]);

  const isEmpty = messages.length === 0 && !streamingText && !statusText;

  return (
    <div className="flex-1 overflow-y-auto px-3 py-6">
      {isEmpty ? (
        <div className="h-full flex flex-col items-center justify-center min-h-[60vh]">
          {suggestions.length > 0 ? (
            /* 子线程空状态 */
            <div className="w-full max-w-lg flex flex-col gap-5">
              {anchorText && (
                <div className="flex gap-3">
                  <div className="w-0.5 flex-shrink-0 bg-indigo-500/30 rounded-full mt-0.5 mb-0.5" />
                  <p className="text-sm text-dim leading-relaxed italic">{anchorText}</p>
                </div>
              )}
              <p className="text-[10px] text-faint font-semibold tracking-[0.1em] uppercase">{t.chooseQuestion}</p>
              <div className="flex flex-col gap-2">
                {suggestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onSendSuggestion?.(q)}
                    className="text-left text-sm text-lo bg-surface-60 hover:bg-surface border border-subtle hover:border-base rounded-xl px-4 py-3 leading-snug transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 主线欢迎态 */
            <div className="flex flex-col items-center gap-3 text-center px-4 max-w-sm">
              <div className="relative mb-1">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 flex items-center justify-center">
                  <svg className="w-4.5 h-4.5 text-indigo-400/70" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
                  </svg>
                </div>
              </div>
              <h2 className="font-serif text-base font-medium text-md tracking-tight">{t.welcomeTitle}</h2>
              <p className="text-xs text-faint leading-relaxed">{t.welcomeSub}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              messageId={msg.id}
              role={msg.role}
              content={msg.content}
              anchors={anchorsByMessage[msg.id] ?? EMPTY_ANCHORS}
              unreadThreadIds={unreadThreadIds}
              userAvatarUrl={userAvatarUrl}
              model={msg.model}
              onMessageRef={onMessageRef}
              onSelect={onTextSelect}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
            />
          ))}
          {/* status 占位：无 streaming 内容时显示后台状态提示 */}
          {statusText && !streamingText && (
            <div className="flex justify-start mb-5 pl-9">
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-surface-70 border border-subtle max-w-xs">
                <span className="flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full bg-faint animate-bounce"
                      style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
                    />
                  ))}
                </span>
                <span className="text-xs text-faint">{statusText}</span>
              </div>
            </div>
          )}
          {streamingText !== undefined && (
            <MessageBubble
              messageId="__streaming__"
              role="assistant"
              content={streamingText}
              streaming
              anchors={[]}
            />
          )}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
