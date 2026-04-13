"use client";
// components/MergeOutput.tsx
// 合并输出面板 — 汇总所有子线程内容，生成结构化报告

import { useCallback, useRef, useState } from "react";
import { sendMergeStream, type MergeFormat } from "@/lib/sse";
import MarkdownContent from "@/components/MarkdownContent";
import { useT } from "@/stores/useLangStore";

interface Props {
  sessionId: string;
  pinCount: number;
  onClose: () => void;
}

type State = "idle" | "loading" | "streaming" | "done" | "error";

export default function MergeOutput({ sessionId, pinCount, onClose }: Props) {
  const t = useT();

  const FORMAT_OPTIONS: { value: MergeFormat; label: string; desc: string }[] = [
    { value: "free",       label: t.mergeFormatFree,        desc: t.mergeFormatFreeDesc },
    { value: "bullets",    label: t.mergeFormatBullets,     desc: t.mergeFormatBulletsDesc },
    { value: "structured", label: t.mergeFormatStructured,  desc: t.mergeFormatStructuredDesc },
  ];
  const [format, setFormat] = useState<MergeFormat>("free");
  const [state, setState] = useState<State>("idle");
  const [status, setStatus] = useState("");
  const [content, setContent] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const contentRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleGenerate = useCallback(async () => {
    setContent("");
    contentRef.current = "";
    setErrorMsg("");
    setStatus("");
    setState("loading");

    await sendMergeStream(
      sessionId,
      format,
      (chunk) => {
        contentRef.current += chunk;
        setContent(contentRef.current);
        setState("streaming");
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        });
      },
      (fullText) => {
        setContent(fullText);
        setState("done");
      },
      (msg) => {
        setErrorMsg(msg);
        setState("error");
      },
      (text) => setStatus(text),
    );
  }, [sessionId, format]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const el = document.createElement("textarea");
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    const label = FORMAT_OPTIONS.find(f => f.value === format)?.label ?? t.mergeTitle;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deeppin-${label}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, format]);

  const isGenerating = state === "loading" || state === "streaming";
  const hasContent = content.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-zinc-950 border border-white/8 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

        {/* ── 顶栏 / Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l8 9M20 4l-8 9m0 0v7" />
              </svg>
            </div>
            <h2 className="font-semibold text-zinc-200 text-sm">{t.mergeTitle}</h2>
            {pinCount > 0 && (
              <span className="text-[11px] text-zinc-600 tabular-nums">{pinCount} {t.mergeAngles}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-400 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5"
            aria-label="关闭"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── 格式选择 / Format selector ── */}
        <div className="flex gap-2 px-5 py-3 border-b border-white/5">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFormat(opt.value)}
              disabled={isGenerating}
              className={`flex-1 rounded-xl px-2.5 py-2.5 text-xs transition-all border ${
                format === opt.value
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                  : "bg-zinc-900/60 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-400"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <div className="font-semibold text-left">{opt.label}</div>
              <div className="text-[10px] mt-0.5 opacity-60 text-left leading-snug">{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* ── 内容区 / Content area ── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-4 min-h-[200px] scrollbar-thin"
        >
          {state === "idle" && (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-10">
              <svg className="w-8 h-8 text-zinc-800" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-zinc-700">{t.mergeHint}</p>
            </div>
          )}

          {(state === "loading") && (
            <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-4">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500/70 animate-bounce [animation-delay:-0.3s]" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500/70 animate-bounce [animation-delay:-0.15s]" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500/70 animate-bounce" />
              <span className="ml-1 text-zinc-600">{status || t.mergePreparing}</span>
            </div>
          )}

          {(state === "streaming" || state === "done") && (
            <div className="text-sm text-zinc-200">
              <MarkdownContent content={content} />
              {state === "streaming" && (
                <span className="inline-block w-0.5 h-3.5 bg-zinc-600 ml-0.5 align-middle animate-pulse" />
              )}
            </div>
          )}

          {state === "error" && (
            <div className="flex items-start gap-2.5 text-red-400/90 text-sm py-4">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* ── 底栏操作 / Footer actions ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 gap-3">
          <span className="text-[11px] text-zinc-700 truncate flex-1">
            {state === "streaming" && status ? status : ""}
          </span>

          <div className="flex items-center gap-2 flex-shrink-0">
            {hasContent && (
              <button
                onClick={handleCopy}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg border border-white/6 hover:border-white/12 transition-all"
              >
                {t.mergeCopyMd}
              </button>
            )}
            {hasContent && state === "done" && (
              <button
                onClick={handleDownload}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg border border-white/6 hover:border-white/12 transition-all"
              >
                {t.mergeDownload}
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800/80 disabled:text-zinc-700 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              {isGenerating ? t.mergeGenerating : hasContent ? t.mergeRegenerate : t.mergeGenerate}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
