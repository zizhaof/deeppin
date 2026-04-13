"use client";
// components/MergeOutput.tsx
// 合并输出面板 — 汇总所有子线程内容，生成结构化报告
// Merge output panel — aggregates all sub-thread content into a structured report

import { useCallback, useRef, useState } from "react";
import { sendMergeStream, type MergeFormat } from "@/lib/sse";
import MarkdownContent from "@/components/MarkdownContent";

interface Props {
  sessionId: string;
  pinCount: number;       // 当前 session 有多少个子线程（供提示）/ Number of pins in the session (for display)
  onClose: () => void;
}

const FORMAT_OPTIONS: { value: MergeFormat; label: string; desc: string }[] = [
  { value: "free",       label: "自由总结",    desc: "流畅叙述，融合各角度洞察" },
  { value: "bullets",    label: "要点列表",    desc: "按主题分组，提炼关键要点" },
  { value: "structured", label: "结构化分析",  desc: "问题 → 方案 → 权衡 → 结论" },
];

type State = "idle" | "loading" | "streaming" | "done" | "error";

export default function MergeOutput({ sessionId, pinCount, onClose }: Props) {
  const [format, setFormat] = useState<MergeFormat>("free");
  const [state, setState] = useState<State>("idle");
  const [status, setStatus] = useState("");
  const [content, setContent] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const contentRef = useRef("");   // 流式积累，避免 state 频繁合并 / Accumulate during streaming to avoid excessive state merges
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
        // 自动滚到底 / Auto-scroll to bottom
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
      // 兜底：使用 execCommand / Fallback: use execCommand
      const el = document.createElement("textarea");
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    const label = FORMAT_OPTIONS.find(f => f.value === format)?.label ?? "合并报告";
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
    // 半透明遮罩 / Semi-transparent overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* ── 顶栏 / Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔀</span>
            <h2 className="font-semibold text-zinc-100 text-sm">合并输出</h2>
            {pinCount > 0 && (
              <span className="text-xs text-zinc-500 ml-1">· {pinCount} 个探索角度</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none px-1"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* ── 格式选择 / Format selector ── */}
        <div className="flex gap-2 px-5 py-3 border-b border-zinc-800">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFormat(opt.value)}
              disabled={isGenerating}
              className={`flex-1 rounded-lg px-2 py-2 text-xs transition-colors border ${
                format === opt.value
                  ? "bg-blue-600/20 border-blue-500 text-blue-300"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* ── 内容区 / Content area ── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-4 min-h-[200px]"
        >
          {state === "idle" && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2 py-10">
              <span className="text-3xl">📋</span>
              <p className="text-sm">选择格式后点击生成，将所有插针内容合并为一份报告</p>
            </div>
          )}

          {(state === "loading") && (
            <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
              <span className="ml-1">{status || "正在准备…"}</span>
            </div>
          )}

          {(state === "streaming" || state === "done") && (
            <div className="text-sm text-zinc-200">
              <MarkdownContent content={content} />
              {state === "streaming" && (
                <span className="inline-block w-0.5 h-3.5 bg-zinc-400 ml-0.5 align-middle animate-pulse" />
              )}
            </div>
          )}

          {state === "error" && (
            <div className="flex items-start gap-2 text-red-400 text-sm py-4">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* ── 底栏操作 / Footer actions ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 gap-3">
          {/* 状态提示 / Status hint */}
          <span className="text-[11px] text-zinc-600 truncate flex-1">
            {state === "streaming" && status ? status : ""}
          </span>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 复制 / Copy */}
            {hasContent && (
              <button
                onClick={handleCopy}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
              >
                复制 Markdown
              </button>
            )}
            {/* 下载 / Download */}
            {hasContent && state === "done" && (
              <button
                onClick={handleDownload}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
              >
                下载 .md
              </button>
            )}
            {/* 生成按钮 / Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              {isGenerating ? "生成中…" : hasContent ? "重新生成" : "生成"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
