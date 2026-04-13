"use client";
// components/PinStartDialog.tsx — 插针后弹出的对话框

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/stores/useLangStore";

export interface PinDialogInfo {
  threadId: string;
  anchorText: string;
  suggestions: string[];
  /** true 时建议追问仍在后台生成，显示骨架动画 */
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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40" onClick={onClose} />

      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 锚点引用 */}
        <div className="px-5 pt-5 pb-3 flex gap-3 items-start">
          <div className="w-0.5 flex-shrink-0 self-stretch bg-blue-600/50 rounded-full" />
          <p className="text-sm text-zinc-400 leading-relaxed italic line-clamp-3 flex-1">
            {info.anchorText}
          </p>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors ml-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 推荐问题 */}
        <div className="px-5 pb-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-zinc-600 font-medium">{t.suggestedQuestions}</p>
            {info.loading && (
              <span className="flex gap-0.5 items-center">
                <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-zinc-600 animate-bounce [animation-delay:300ms]" />
              </span>
            )}
          </div>
          {info.suggestions.map((q, i) => (
            <button
              key={`${info.loading ? "ph" : "real"}-${i}`}
              onClick={() => handleSend(q)}
              className={`text-left text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-4 py-2.5 leading-snug transition-colors ${
                info.loading ? "text-zinc-500" : "text-zinc-300"
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mx-5 border-t border-zinc-800" />

        {/* 自定义输入 */}
        <div className="px-5 py-3 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.customQuestion}
            rows={2}
            className="flex-1 resize-none text-sm text-zinc-200 placeholder-zinc-600 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-600 transition-colors leading-snug"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim()}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
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
