"use client";
// components/MergeOutput.tsx
// 合并输出面板 — 先展示线程树选择，再流式生成合并报告
// Merge output panel — tree selection step, then streaming report generation.

import { useCallback, useEffect, useRef, useState } from "react";
import { sendMergeStream, type MergeFormat } from "@/lib/sse";
import { getRelevance, saveAssistantMessage } from "@/lib/api";
import type { Thread } from "@/lib/api";
import { useThreadStore } from "@/stores/useThreadStore";
import MarkdownContent from "@/components/MarkdownContent";
import MergeTreeCanvas from "@/components/MergeTreeCanvas";
import { useT } from "@/stores/useLangStore";

interface Props {
  sessionId: string;
  threads: Thread[];
  pinCount: number;
  onClose: () => void;
}

type State = "loading-relevance" | "selecting" | "generating" | "streaming" | "done" | "error";

export default function MergeOutput({ sessionId, threads, onClose }: Props) {
  const t = useT();

  const FORMAT_OPTIONS: { value: MergeFormat; label: string; desc: string }[] = [
    { value: "free",       label: t.mergeFormatFree,       desc: t.mergeFormatFreeDesc },
    { value: "bullets",    label: t.mergeFormatBullets,    desc: t.mergeFormatBulletsDesc },
    { value: "structured", label: t.mergeFormatStructured, desc: t.mergeFormatStructuredDesc },
    { value: "custom",     label: t.mergeFormatCustom,     desc: t.mergeFormatCustomDesc },
  ];

  const [format, setFormat] = useState<MergeFormat>("free");
  const [customPrompt, setCustomPrompt] = useState("");
  const [state, setState] = useState<State>("loading-relevance");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [content, setContent] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const contentRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { threads: storeThreads, setMessages, messagesByThread } = useThreadStore();
  const mainThread = storeThreads.find((t) => t.parent_thread_id === null);

  const subThreads = threads.filter(th => th.parent_thread_id !== null);

  // ── 弹窗尺寸（可调整大小）──────────────────────────────────────────
  const [modalW, setModalW] = useState(() =>
    typeof window !== "undefined" ? Math.max(440, Math.min(720, Math.round(window.innerWidth * 0.65))) : 600
  );
  const [modalH, setModalH] = useState(() =>
    typeof window !== "undefined" ? Math.max(420, Math.min(650, Math.round(window.innerHeight * 0.78))) : 530
  );

  // 拖拽调整大小
  const resizing = useRef(false);
  const resizeOrigin = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    resizeOrigin.current = { x: e.clientX, y: e.clientY, w: modalW, h: modalH };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizePointerMove = (e: React.PointerEvent) => {
    if (!resizing.current) return;
    const dx = e.clientX - resizeOrigin.current.x;
    const dy = e.clientY - resizeOrigin.current.y;
    setModalW(Math.max(380, Math.min(window.innerWidth * 0.96, resizeOrigin.current.w + dx)));
    setModalH(Math.max(340, Math.min(window.innerHeight * 0.96, resizeOrigin.current.h + dy)));
  };
  const onResizePointerUp = (_e: React.PointerEvent) => { resizing.current = false; };

  // ── 打开时拉取相关性 ──────────────────────────────────────────────
  useEffect(() => {
    if (subThreads.length === 0) {
      setSelected(new Set());
      setState("selecting");
      return;
    }
    getRelevance(sessionId)
      .then(items => {
        const sel = new Set(items.filter(i => i.selected).map(i => i.thread_id));
        setSelected(sel);
        setState("selecting");
      })
      .catch(() => {
        // 请求失败：默认全选
        setSelected(new Set(subThreads.map(th => th.id)));
        setState("selecting");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleToggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    setContent("");
    contentRef.current = "";
    setErrorMsg("");
    setStatus("");
    setState("generating");

    await sendMergeStream(
      sessionId,
      format,
      selected.size > 0 ? [...selected] : null,
      (chunk) => {
        contentRef.current += chunk;
        setContent(contentRef.current);
        setState("streaming");
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        });
      },
      (fullText) => { setContent(fullText); setState("done"); },
      (msg) => { setErrorMsg(msg); setState("error"); },
      (text) => setStatus(text),
      format === "custom" ? customPrompt : undefined,
    );
  }, [sessionId, format, selected, customPrompt]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); }
    catch {
      const el = document.createElement("textarea");
      el.value = content; document.body.appendChild(el); el.select();
      document.execCommand("copy"); document.body.removeChild(el);
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    const label = FORMAT_OPTIONS.find(f => f.value === format)?.label ?? t.mergeTitle;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `deeppin-${label}-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
  }, [content, format]);

  const isGenerating = state === "generating" || state === "streaming";
  const hasContent = content.trim().length > 0;
  const isSelecting = state === "selecting";
  const selCount = selected.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col bg-surface border border-base rounded-2xl shadow-2xl shadow-black/20 overflow-hidden relative"
        style={{ width: modalW, maxWidth: "96vw", height: modalH, maxHeight: "96vh" }}
      >
        {/* ── 顶栏 ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-subtle flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l8 9M20 4l-8 9m0 0v7" />
              </svg>
            </div>
            <h2 className="font-semibold text-hi text-sm">{t.mergeTitle}</h2>
            {subThreads.length > 0 && (
              <span className="text-[11px] text-faint tabular-nums">{subThreads.length} {t.mergeAngles}</span>
            )}
          </div>
          <button onClick={onClose}
            className="text-faint hover:text-lo transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-glass">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── 格式选择 ── */}
        <div className="flex flex-col gap-2 px-5 py-3 border-b border-subtle flex-shrink-0">
          <div className="flex gap-2">
            {FORMAT_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setFormat(opt.value)}
                disabled={isGenerating}
                className={`flex-1 rounded-xl px-2.5 py-2.5 text-xs transition-all border ${
                  format === opt.value
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                    : "bg-surface-60 border-subtle text-dim hover:border-base hover:text-lo"
                } disabled:opacity-40 disabled:cursor-not-allowed`}>
                <div className="font-semibold text-left">{opt.label}</div>
                <div className="text-[10px] mt-0.5 opacity-60 text-left leading-snug">{opt.desc}</div>
              </button>
            ))}
          </div>
          {format === "custom" && (
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder={t.mergeCustomPromptPlaceholder}
              rows={3}
              className="w-full bg-surface-60 border border-base rounded-xl px-3 py-2.5 text-xs text-md placeholder:text-faint resize-none focus:outline-none focus:border-indigo-500/40 transition-colors disabled:opacity-40"
            />
          )}
        </div>

        {/* ── 内容区 ── */}
        <div className="flex-1 overflow-hidden min-h-0 relative">

          {/* 加载相关性 */}
          {state === "loading-relevance" && (
            <div className="flex items-center justify-center h-full gap-2 text-faint text-sm">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 animate-bounce"
                  style={{ animationDelay: `${i*150}ms`, animationDuration: "900ms" }} />
              ))}
              <span className="ml-1">正在分析相关性…</span>
            </div>
          )}

          {/* 选择树形图 */}
          {isSelecting && (
            <div className="h-full flex flex-col">
              <div className="px-5 pt-3 pb-1 flex-shrink-0">
                <span className="text-[9px] text-faint uppercase tracking-wider">选择要合并的子问题 · 点击节点反选</span>
              </div>
              <div className="flex-1 min-h-0 relative">
                <MergeTreeCanvas
                  threads={threads}
                  selected={selected}
                  onToggle={handleToggle}
                />
              </div>
              <div className="px-5 py-1.5 flex-shrink-0 flex items-center justify-between border-t border-subtle">
                <span className="text-[10px] text-faint">
                  已选 {selCount} / {subThreads.length} 个子问题
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-ph">滚轮平移 · 拖拽移动</span>
                </div>
              </div>
            </div>
          )}

          {/* 生成中 */}
          {state === "generating" && (
            <div className="flex items-center gap-2.5 text-faint text-sm py-4 px-5">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500/70 animate-bounce"
                  style={{ animationDelay: `${i*150}ms`, animationDuration: "900ms" }} />
              ))}
              <span className="ml-1 text-faint">{status || "正在生成合并报告…"}</span>
            </div>
          )}

          {/* 流式输出 / 完成 */}
          {(state === "streaming" || state === "done") && (
            <div ref={scrollRef} className="h-full overflow-y-auto px-5 py-4 scrollbar-thin">
              <div className="text-sm text-hi">
                <MarkdownContent content={content} />
                {state === "streaming" && (
                  <span className="inline-block w-0.5 h-3.5 bg-faint ml-0.5 align-middle animate-pulse" />
                )}
              </div>
            </div>
          )}

          {/* 错误 */}
          {state === "error" && (
            <div className="flex items-start gap-2.5 text-red-400/90 text-sm py-4 px-5">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* ── 调整大小手柄（右下角）── */}
        <div
          style={{ position: "absolute", bottom: 4, right: 4, width: 20, height: 20, cursor: "se-resize", zIndex: 10, display: "flex", alignItems: "flex-end", justifyContent: "flex-end", touchAction: "none" }}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: "none" }}>
            <path d="M9 3L3 9M9 6L6 9" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>

        {/* ── 底栏 ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-subtle gap-3 flex-shrink-0">
          <span className="text-[11px] text-ph truncate flex-1">
            {state === "streaming" && status ? status : ""}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasContent && (
              <button onClick={handleCopy}
                className="text-xs text-dim hover:text-md px-2.5 py-1.5 rounded-lg border border-subtle hover:border-base transition-all">
                {t.mergeCopyMd}
              </button>
            )}
            {hasContent && state === "done" && (
              <button onClick={handleDownload}
                className="text-xs text-dim hover:text-md px-2.5 py-1.5 rounded-lg border border-subtle hover:border-base transition-all">
                {t.mergeDownload}
              </button>
            )}
            {hasContent && state === "done" && (
              <button
                onClick={async () => {
                  if (!mainThread || saving || saved) return;
                  setSaving(true);
                  try {
                    const msg = await saveAssistantMessage(mainThread.id, content);
                    setMessages(mainThread.id, [...(messagesByThread[mainThread.id] ?? []), msg]);
                    setSaved(true);
                  } catch { /* 静默失败 */ } finally {
                    setSaving(false);
                  }
                }}
                disabled={!mainThread || saving || saved}
                className="text-xs text-dim hover:text-md disabled:opacity-40 px-2.5 py-1.5 rounded-lg border border-base hover:border-strong transition-all"
              >
                {saved ? "已保存" : saving ? "保存中…" : "保存到对话"}
              </button>
            )}
            {isSelecting && (
              <button
                onClick={handleGenerate}
                disabled={selCount === 0 || (format === "custom" && !customPrompt.trim())}
                className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-disabled disabled:text-disabled text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                合并 {selCount} 个子问题
              </button>
            )}
            {(state === "done" || state === "error") && (
              <button onClick={() => setState("selecting")}
                className="text-xs font-semibold bg-elevated hover:bg-glass-lg text-md px-4 py-1.5 rounded-lg transition-colors border border-subtle">
                重新选择
              </button>
            )}
            {isGenerating && (
              <button disabled
                className="text-xs font-semibold bg-disabled text-disabled px-4 py-1.5 rounded-lg cursor-not-allowed">
                生成中…
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
