"use client";
// Merge output panel — tree selection step, then streaming report generation.

import { useCallback, useMemo, useRef, useState } from "react";
import { sendMergeStream, type MergeFormat } from "@/lib/sse";
import { saveAssistantMessage } from "@/lib/api";
import type { Thread } from "@/lib/api";
import { useThreadStore } from "@/stores/useThreadStore";
import MarkdownContent from "@/components/MarkdownContent";
import MergeGraph from "@/components/MergeGraph";
import { useLangStore, useT } from "@/stores/useLangStore";
import { localizeStatusText } from "@/lib/i18n";

interface Props {
  sessionId: string;
  threads: Thread[];
  onClose: () => void;
}

type State = "selecting" | "generating" | "streaming" | "done" | "error";

export default function MergeOutput({ sessionId, threads, onClose }: Props) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);

  const FORMAT_OPTIONS: { value: MergeFormat; label: string; desc: string }[] = [
    { value: "free",       label: t.mergeFormatFree,        desc: t.mergeFormatFreeDesc },
    { value: "bullets",    label: t.mergeFormatBullets,     desc: t.mergeFormatBulletsDesc },
    { value: "structured", label: t.mergeFormatStructured,  desc: t.mergeFormatStructuredDesc },
    { value: "custom",     label: t.mergeFormatCustom,      desc: t.mergeFormatCustomDesc },
    { value: "transcript", label: t.mergeFormatTranscript,  desc: t.mergeFormatTranscriptDesc },
  ];

  const [format, setFormat] = useState<MergeFormat>("free");
  const [customPrompt, setCustomPrompt] = useState("");
  const [state, setState] = useState<State>("selecting");
  // All sub-threads selected by default.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(threads.filter(t => t.parent_thread_id !== null).map(t => t.id))
  );
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

  // ── Modal dimensions (resizable) ─────────────────────────────────────
  const [modalW, setModalW] = useState(() =>
    typeof window !== "undefined" ? Math.max(440, Math.min(720, Math.round(window.innerWidth * 0.65))) : 600
  );
  const [modalH, setModalH] = useState(() =>
    typeof window !== "undefined" ? Math.max(420, Math.min(650, Math.round(window.innerHeight * 0.78))) : 530
  );

  // Drag to resize.
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

  // Build parent→children map for cascade selection.
  const childrenMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const t of threads) {
      if (t.parent_thread_id) {
        (map[t.parent_thread_id] ??= []).push(t.id);
      }
    }
    return map;
  }, [threads]);

  /** Collect all descendant ids of a node. */
  const getDescendants = useCallback((id: string): string[] => {
    const result: string[] = [];
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const child of (childrenMap[cur] ?? [])) {
        result.push(child);
        queue.push(child);
      }
    }
    return result;
  }, [childrenMap]);

  const handleToggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      const descendants = getDescendants(id);
      if (next.has(id)) {
        // Deselect: cascade deselect all descendants.
        next.delete(id);
        for (const d of descendants) next.delete(d);
      } else {
        // Select: cascade select all descendants.
        next.add(id);
        for (const d of descendants) next.add(d);
      }
      return next;
    });
  }, [getDescendants]);

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
      // Backend status is bilingual ("Chinese / English"); keep only the locale-matching half.
      (text) => setStatus(localizeStatusText(text, lang)),
      format === "custom" ? customPrompt : undefined,
      lang,
    );
  }, [sessionId, format, selected, customPrompt, lang]);

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
      className="fixed inset-0 z-50 flex items-center justify-center [background:rgba(27,26,23,0.55)] backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col overflow-hidden relative rounded-xl"
        style={{
          width: modalW,
          maxWidth: "96vw",
          height: modalH,
          maxHeight: "96vh",
          background: "var(--card)",
          border: "1px solid var(--rule)",
          boxShadow: "0 24px 64px rgba(27,26,23,0.18)",
        }}
      >
        {/* ── Top bar ── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-[9px] h-[9px] rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
            <h2 className="font-serif text-[17px] font-medium" style={{ color: "var(--ink)" }}>{t.mergeTitle}</h2>
            {subThreads.length > 0 && (
              <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--ink-4)" }}>
                {subThreads.length} {t.mergeAngles}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--ink-4)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--paper-2)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--ink-4)"; }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Format picker ── */}
        <div
          className="flex flex-col gap-2 px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          <div className="flex gap-2">
            {FORMAT_OPTIONS.map((opt) => {
              const isActive = format === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  disabled={isGenerating}
                  className="flex-1 rounded-md px-2.5 py-2 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
                  style={{
                    background: isActive ? "var(--accent-soft)" : "var(--paper-2)",
                    border: `1px solid ${isActive ? "var(--accent)" : "var(--rule-soft)"}`,
                    color: isActive ? "var(--accent)" : "var(--ink-3)",
                  }}
                >
                  <div className="font-medium text-[12px]">{opt.label}</div>
                  <div className="font-mono text-[9.5px] mt-[2px] leading-snug opacity-80">{opt.desc}</div>
                </button>
              );
            })}
          </div>
          {format === "custom" && (
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder={t.mergeCustomPromptPlaceholder}
              rows={3}
              className="w-full rounded-md px-3 py-2.5 text-xs resize-none focus:outline-none transition-colors disabled:opacity-40"
              style={{
                background: "var(--paper-2)",
                border: "1px solid var(--rule)",
                color: "var(--ink-2)",
              }}
            />
          )}
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 overflow-hidden min-h-0 relative">

          {/* Selection tree graph */}
          {isSelecting && (
            <div className="h-full flex flex-col">
              <div className="px-5 pt-3 pb-1 flex-shrink-0">
                <span className="text-[9px] text-faint uppercase tracking-wider">{t.mergeHintSelect}</span>
              </div>
              <div className="flex-1 min-h-0 relative">
                <MergeGraph
                  threads={threads}
                  selected={selected}
                  onToggle={handleToggle}
                  messagesByThread={messagesByThread}
                />
              </div>
              <div className="px-5 py-1.5 flex-shrink-0 flex items-center justify-between border-t border-subtle">
                <span className="text-[10px] text-faint">
                  {t.mergeSelectedOf
                    .replace("{selected}", String(selCount))
                    .replace("{total}", String(subThreads.length))}
                </span>
                {/* Old "Scroll to pan · drag to move" hint removed — MergeGraph is
                    a static SVG and doesn't support those interactions. */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelected(new Set(subThreads.map(t => t.id)))}
                    className="font-mono text-[10px] uppercase tracking-wider transition-colors"
                    style={{ color: "var(--accent)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent-ink)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent)")}
                  >
                    {t.mergeSelectAll}
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="font-mono text-[10px] uppercase tracking-wider transition-colors"
                    style={{ color: "var(--ink-4)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--ink-2)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--ink-4)")}
                  >
                    {t.mergeSelectNone}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Generating */}
          {state === "generating" && (
            <div className="flex items-center gap-2.5 text-faint text-sm py-4 px-5">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500/70 animate-bounce"
                  style={{ animationDelay: `${i*150}ms`, animationDuration: "900ms" }} />
              ))}
              <span className="ml-1 text-faint">{status || t.mergeGeneratingReport}</span>
            </div>
          )}

          {/* Streaming / done */}
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

          {/* Error */}
          {state === "error" && (
            <div className="flex items-start gap-2.5 text-red-400/90 text-sm py-4 px-5">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* ── Resize handle (bottom-right corner) ── */}
        <div
          style={{ position: "absolute", bottom: 4, right: 4, width: 20, height: 20, cursor: "se-resize", zIndex: 10, display: "flex", alignItems: "flex-end", justifyContent: "flex-end", touchAction: "none" }}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: "none" }}>
            <path d="M9 3L3 9M9 6L6 9" stroke="var(--ink-5)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between px-5 py-3 gap-3 flex-shrink-0"
          style={{ borderTop: "1px solid var(--rule-soft)" }}
        >
          <span className="font-mono text-[11px] truncate flex-1" style={{ color: "var(--ink-4)" }}>
            {state === "streaming" && status ? status : ""}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasContent && (
              <button
                onClick={handleCopy}
                className="text-[12px] px-3 py-[6px] rounded-md transition-colors"
                style={{ color: "var(--ink-2)", border: "1px solid var(--rule)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--ink-5)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule)"; (e.currentTarget as HTMLElement).style.color = "var(--ink-2)"; }}
              >
                {t.mergeCopyMd}
              </button>
            )}
            {hasContent && state === "done" && (
              <button
                onClick={handleDownload}
                className="text-[12px] px-3 py-[6px] rounded-md transition-colors"
                style={{ color: "var(--ink-2)", border: "1px solid var(--rule)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--ink-5)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule)"; (e.currentTarget as HTMLElement).style.color = "var(--ink-2)"; }}
              >
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
                  } catch { /* silently swallow */ } finally {
                    setSaving(false);
                  }
                }}
                disabled={!mainThread || saving || saved}
                className="text-[12px] px-3 py-[6px] rounded-md transition-colors disabled:opacity-40"
                style={{ color: "var(--ink-2)", border: "1px solid var(--rule)" }}
                onMouseEnter={(e) => { if (!(saving || saved)) { (e.currentTarget as HTMLElement).style.borderColor = "var(--ink-5)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule)"; (e.currentTarget as HTMLElement).style.color = "var(--ink-2)"; }}
              >
                {saved ? t.mergeSavedToChat : saving ? t.mergeSaving : t.mergeSaveToChat}
              </button>
            )}
            {isSelecting && (
              <button
                onClick={handleGenerate}
                disabled={selCount === 0 || (format === "custom" && !customPrompt.trim())}
                className="text-[12px] font-medium px-4 py-[6px] rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--ink)", color: "var(--paper)" }}
                onMouseEnter={(e) => { if (!(selCount === 0)) (e.currentTarget as HTMLElement).style.background = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--ink)"; }}
              >
                {t.mergeCta
                  .replace("{n}", String(selCount))
                  .replace("{s}", selCount === 1 ? "" : "s")}
              </button>
            )}
            {(state === "done" || state === "error") && (
              <button
                onClick={() => setState("selecting")}
                className="text-[12px] font-medium px-4 py-[6px] rounded-md transition-colors"
                style={{ background: "var(--paper-2)", color: "var(--ink-2)", border: "1px solid var(--rule)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--ink-5)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--rule)")}
              >
                {t.mergeReselect}
              </button>
            )}
            {isGenerating && (
              <button
                disabled
                className="text-[12px] font-medium px-4 py-[6px] rounded-md cursor-not-allowed"
                style={{ background: "var(--s-disabled)", color: "var(--t-disabled)" }}
              >
                {t.mergeGenerating}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
