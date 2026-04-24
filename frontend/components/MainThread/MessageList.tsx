"use client";
// components/MainThread/MessageList.tsx

import { useEffect, useRef } from "react";
import type { Message } from "@/lib/api";
import type { AnchorRange } from "./MessageBubble";
import MessageBubble from "./MessageBubble";
import { useT } from "@/stores/useLangStore";

// Stable empty array reference — avoids creating a new [] each render that would bypass React.memo.
const EMPTY_ANCHORS: AnchorRange[] = [];

interface Props {
  messages: Message[];
  streamingText?: string;
  /** Status text shown before the first chunk arrives (e.g. "Retrieving…"). */
  statusText?: string;
  anchorsByMessage: Record<string, AnchorRange[]>;
  /** Set of thread IDs with unread replies — anchors flip to the breathing state when included. */
  unreadThreadIds?: Set<string>;
  /** Mobile select-mode flag — passed straight to MessageBubble; see its Props doc. */
  mobileSelectActive?: boolean;
  suggestions?: string[];
  anchorText?: string | null;
  userAvatarUrl?: string | null;
  onTextSelect?: (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => void;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
  onSendSuggestion?: (question: string) => void;
}

// Stable empty set — avoids MessageBubble.memo invalidation from a fresh object each render.
const EMPTY_UNREAD: Set<string> = new Set();

export default function MessageList({
  messages,
  streamingText,
  statusText,
  anchorsByMessage,
  unreadThreadIds = EMPTY_UNREAD,
  mobileSelectActive,
  suggestions = [],
  anchorText,
  userAvatarUrl,
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
    // Claude-style reading column: centered max-w container + generous
    // side padding so messages aren't flush against the edges.
    <div className="flex-1 overflow-y-auto py-8 px-6 md:px-10">
     <div className="mx-auto w-full max-w-[780px]">
      {isEmpty ? (
        <div className="h-full flex flex-col items-center justify-center min-h-[60vh]">
          {suggestions.length > 0 ? (
            /* Sub-thread empty state. */
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
            /* Main-thread welcome state. */
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
              mobileSelectActive={mobileSelectActive}
              userAvatarUrl={userAvatarUrl}
              model={msg.model}
              onSelect={onTextSelect}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
            />
          ))}
          {/* Status placeholder shown while no stream content has arrived. */}
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
    </div>
  );
}
