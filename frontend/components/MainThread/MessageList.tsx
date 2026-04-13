"use client";
// components/MainThread/MessageList.tsx

import { useEffect, useRef } from "react";
import type { Message } from "@/lib/api";
import type { AnchorRange } from "./MessageBubble";
import MessageBubble from "./MessageBubble";
import { useT } from "@/stores/useLangStore";

interface Props {
  messages: Message[];
  streamingText?: string;
  /** 首个 chunk 到达前显示的后台状态文字（如"正在检索…"）*/
  statusText?: string;
  anchorsByMessage: Record<string, AnchorRange[]>;
  suggestions?: string[];
  anchorText?: string | null;
  onMessageRef?: (messageId: string, el: HTMLDivElement | null) => void;
  onTextSelect?: (text: string, messageId: string, rect: DOMRect, side: "left" | "right", startOffset: number, endOffset: number) => void;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
  onSendSuggestion?: (question: string) => void;
}

export default function MessageList({
  messages,
  streamingText,
  statusText,
  anchorsByMessage,
  suggestions = [],
  anchorText,
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
    <div className="flex-1 overflow-y-auto px-8 py-5">
      {isEmpty ? (
        <div className="h-full flex flex-col items-center justify-center min-h-[60vh]">
          {suggestions.length > 0 ? (
            /* 子线程空状态 */
            <div className="w-full max-w-lg flex flex-col gap-4">
              {anchorText && (
                <div className="flex gap-3">
                  <div className="w-0.5 flex-shrink-0 bg-indigo-500/40 rounded-full" />
                  <p className="text-sm text-zinc-400 leading-relaxed italic">{anchorText}</p>
                </div>
              )}
              <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">{t.chooseQuestion}</p>
              <div className="flex flex-col gap-2">
                {suggestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onSendSuggestion?.(q)}
                    className="text-left text-sm text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-white/6 hover:border-white/10 rounded-xl px-4 py-3 leading-snug transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 主线欢迎态 */
            <div className="flex flex-col items-center gap-3 text-center px-4 max-w-md">
              <div className="w-11 h-11 rounded-2xl bg-zinc-900 border border-white/8 flex items-center justify-center mb-1">
                <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-zinc-200">{t.welcomeTitle}</h2>
              <p className="text-sm text-zinc-500 leading-relaxed">{t.welcomeSub}</p>
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
              anchors={anchorsByMessage[msg.id] ?? []}
              onRef={(el) => onMessageRef?.(msg.id, el)}
              onSelect={onTextSelect}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
            />
          ))}
          {/* status 占位：无 streaming 内容时显示后台状态提示 */}
          {statusText && !streamingText && (
            <div className="flex justify-start mb-4 pl-8">
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/6 max-w-xs">
                <span className="flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
                    />
                  ))}
                </span>
                <span className="text-xs text-zinc-500">{statusText}</span>
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
