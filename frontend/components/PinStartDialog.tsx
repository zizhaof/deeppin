"use client";
// Dialog shown after a pin is created.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/stores/useLangStore";

export interface PinDialogInfo {
  threadId: string;
  anchorText: string;
  suggestions: string[];
  /** When true, suggested follow-ups are still generating; show a skeleton animation. */
  loading?: boolean;
}

interface Props {
  info: PinDialogInfo | null;
  onSend: (threadId: string, question: string) => void;
  onClose: () => void;
}

export default function PinStartDialog({ info, onSend, onClose }: Props) {
  const t = useT();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (info) {
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [info?.threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!info) return null;

  const handleSend = (question: string) => {
    const q = question.trim();
    if (!q) return;
    onSend(info.threadId, q);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 [background:rgba(27,26,23,0.45)] backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface border border-base rounded-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden">
        {/* Anchor quote */}
        <div className="px-5 pt-5 pb-3 flex gap-3 items-start">
          <div className="w-0.5 flex-shrink-0 self-stretch bg-indigo-500/30 rounded-full" />
          <p className="text-sm text-dim leading-relaxed italic line-clamp-3 flex-1">
            {info.anchorText}
          </p>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-ph hover:text-dim transition-colors ml-1 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-glass"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Suggested questions */}
        <div className="px-5 pb-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-ph font-semibold uppercase tracking-[0.1em]">{t.suggestedQuestions}</p>
            {info.loading && (
              <span className="flex gap-0.5 items-center">
                <span className="w-1 h-1 rounded-full bg-ph animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 rounded-full bg-ph animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-ph animate-bounce [animation-delay:300ms]" />
              </span>
            )}
          </div>
          {info.suggestions.map((q, i) => (
            <button
              key={`${info.loading ? "ph" : "real"}-${i}`}
              onClick={() => handleSend(q)}
              className={`text-left text-sm bg-surface-60 hover:bg-surface border border-subtle hover:border-base rounded-xl px-4 py-2.5 leading-snug transition-all ${
                info.loading ? "text-faint" : "text-md"
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mx-5 border-t border-subtle" />

        {/* Custom input */}
        <div className="px-5 py-3 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.customQuestion}
            rows={2}
            className="flex-1 resize-none text-sm text-hi placeholder-ph bg-surface-60 border border-base rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/25 transition-colors leading-snug"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim()}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-disabled disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shadow-sm shadow-indigo-950/40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
