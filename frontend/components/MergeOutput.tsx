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

// ── 布局常量（与 MergeTreeCanvas 保持一致）──────────────────────────
const NODE_W = 130, NODE_H = 50, H_GAP = 20, V_GAP = 85, PAD = 32;
const FIXED_H = 40 + 44 + 44 + 16; // header + format + footer + padding

function computeTreeDimensions(threads: Thread[]): { treeW: number; treeH: number } {
  const byDepth: Record<number, number> = {};
  for (const t of threads) byDepth[t.depth] = (byDepth[t.depth] ?? 0) + 1;
  const maxDepth = threads.length ? Math.max(...threads.map(t => t.depth)) : 0;
  const maxPerLevel = Math.max(...Object.values(byDepth), 1);
  const treeW = Math.max(300, maxPerLevel * (NODE_W + H_GAP) - H_GAP + PAD * 2);
  const treeH = (maxDepth + 1) * (NODE_H + V_GAP) - V_GAP + PAD * 2;
  return { treeW, treeH };
}

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

  // ── 弹窗尺寸（根据树的宽高动态计算）──────────────────────────────
  const subThreads = threads.filter(th => th.parent_thread_id !== null);
  const { treeW, treeH } = computeTreeDimensions(threads);
  const modalW = typeof window !== "undefined"
    ? Math.max(400, Math.min(treeW + 40, window.innerWidth * 0.9))
    : 600;
  const modalH = typeof window !== "undefined"
    ? Math.max(380, Math.min(treeH + FIXED_H + 60, window.innerHeight * 0.85))
    : 560;
  const canvasH = modalH - FIXED_H - 20;

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
        className="flex flex-col bg-zinc-950 border border-white/8 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
        style={{ width: modalW, maxWidth: "90vw", height: modalH, maxHeight: "85vh" }}
      >
        {/* ── 顶栏 ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l8 9M20 4l-8 9m0 0v7" />
              </svg>
            </div>
            <h2 className="font-semibold text-zinc-200 text-sm">{t.mergeTitle}</h2>
            {subThreads.length > 0 && (
              <span className="text-[11px] text-zinc-600 tabular-nums">{subThreads.length} {t.mergeAngles}</span>
            )}
          </div>
          <button onClick={onClose}
            className="text-zinc-600 hover:text-zinc-400 transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── 格式选择 ── */}
        <div className="flex flex-col gap-2 px-5 py-3 border-b border-white/5 flex-shrink-0">
          <div className="flex gap-2">
            {FORMAT_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setFormat(opt.value)}
                disabled={isGenerating}
                className={`flex-1 rounded-xl px-2.5 py-2.5 text-xs transition-all border ${
                  format === opt.value
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                    : "bg-zinc-900/60 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-400"
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
              className="w-full bg-zinc-900/60 border border-white/8 rounded-xl px-3 py-2.5 text-xs text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-indigo-500/40 transition-colors disabled:opacity-40"
            />
          )}
        </div>

        {/* ── 内容区 ── */}
        <div className="flex-1 overflow-hidden min-h-0 relative">

          {/* 加载相关性 */}
          {state === "loading-relevance" && (
            <div className="flex items-center justify-center h-full gap-2 text-zinc-600 text-sm">
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
                <span className="text-[9px] text-zinc-600 uppercase tracking-wider">选择要合并的子问题 · 点击节点反选</span>
              </div>
              <div className="flex-1 min-h-0">
                <MergeTreeCanvas
                  threads={threads}
                  selected={selected}
                  onToggle={handleToggle}
                  canvasWidth={modalW - 2}
                  canvasHeight={canvasH}
                />
              </div>
              <div className="px-5 py-1.5 flex-shrink-0 flex items-center justify-between border-t border-white/[0.03]">
                <span className="text-[10px] text-zinc-600">
                  已选 {selCount} / {subThreads.length} 个子问题
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-zinc-700">滚轮平移 · 拖拽移动</span>
                </div>
              </div>
            </div>
          )}

          {/* 生成中 */}
          {state === "generating" && (
            <div className="flex items-center gap-2.5 text-zinc-600 text-sm py-4 px-5">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500/70 animate-bounce"
                  style={{ animationDelay: `${i*150}ms`, animationDuration: "900ms" }} />
              ))}
              <span className="ml-1 text-zinc-600">{status || "正在生成合并报告…"}</span>
            </div>
          )}

          {/* 流式输出 / 完成 */}
          {(state === "streaming" || state === "done") && (
            <div ref={scrollRef} className="h-full overflow-y-auto px-5 py-4 scrollbar-thin">
              <div className="text-sm text-zinc-200">
                <MarkdownContent content={content} />
                {state === "streaming" && (
                  <span className="inline-block w-0.5 h-3.5 bg-zinc-600 ml-0.5 align-middle animate-pulse" />
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

        {/* ── 底栏 ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 gap-3 flex-shrink-0">
          <span className="text-[11px] text-zinc-700 truncate flex-1">
            {state === "streaming" && status ? status : ""}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasContent && (
              <button onClick={handleCopy}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg border border-white/6 hover:border-white/12 transition-all">
                {t.mergeCopyMd}
              </button>
            )}
            {hasContent && state === "done" && (
              <button onClick={handleDownload}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg border border-white/6 hover:border-white/12 transition-all">
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
                className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40 px-2.5 py-1.5 rounded-lg border border-white/6 hover:border-white/12 transition-all"
              >
                {saved ? "已保存" : saving ? "保存中…" : "保存到对话"}
              </button>
            )}
            {isSelecting && (
              <button
                onClick={handleGenerate}
                disabled={selCount === 0 || (format === "custom" && !customPrompt.trim())}
                className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800/80 disabled:text-zinc-700 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                合并 {selCount} 个子问题
              </button>
            )}
            {(state === "done" || state === "error") && (
              <button onClick={() => setState("selecting")}
                className="text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-1.5 rounded-lg transition-colors">
                重新选择
              </button>
            )}
            {isGenerating && (
              <button disabled
                className="text-xs font-semibold bg-zinc-800/80 text-zinc-700 px-4 py-1.5 rounded-lg cursor-not-allowed">
                生成中…
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
