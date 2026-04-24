"use client";
// components/MainThread/InputBar.tsx

import { useState, useRef, KeyboardEvent, useCallback } from "react";
import { useT } from "@/stores/useLangStore";
import { uploadAttachment } from "@/lib/api";

const PASTE_ATTACH_THRESHOLD = 300;

interface FileAttachment {
  kind: "file";
  label: string;
  /** Inline mode: short-file extracted text spliced into the message context (not shown in the bubble). */
  content?: string;
}

interface PasteAttachment {
  kind: "paste";
  label: string;
  content: string;
}

type Attachment = FileAttachment | PasteAttachment;

interface Props {
  sessionId: string;
  onSend: (content: string, display?: string, ragFilename?: string) => void;
  disabled?: boolean;
  webSearch?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
  /** Anonymous trial turn count. Not shown when isAnon is false. */
  turnCount?: number;
  isAnon?: boolean;
}

// Mirrors backend/services/stream_manager.py::ANON_TURN_LIMIT.
const ANON_TURN_LIMIT = 20;

export default function InputBar({ sessionId, onSend, disabled, webSearch = false, onWebSearchToggle, turnCount = 0, isAnon = false }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  // Minimum height after manual drag; 0 = not dragged, textarea shrinks naturally.
  const manualHeightRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !disabled && !uploading;

  const resetHeight = () => {
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleSend = () => {
    if (!canSend) return;
    const trimmed = text.trim();

    const contentParts: string[] = [];
    if (trimmed) contentParts.push(trimmed);
    for (const a of attachments) {
      if (a.kind === "paste") contentParts.push(a.content);
      // Inline-mode file: splice the extracted text into the context but don't show it in the bubble.
      if (a.kind === "file" && a.content) contentParts.push(`[附件内容：${a.label}]\n${a.content}`);
    }
    const fullContent = contentParts.join("\n\n---\n\n");

    const displayParts: string[] = [];
    if (trimmed) displayParts.push(trimmed);
    for (const a of attachments) displayParts.push(`📎 ${a.label}`);
    const displayContent = displayParts.join("  ");

    // Filename of any file attachment (inline or RAG); backend uses it to prefer
    // this file's chunks, or to suppress old-file RAG when the file was sent
    // inline (no chunks in DB).
    const ragFilename = attachments.find((a) => a.kind === "file")?.label;

    const finalContent = fullContent || displayContent;
    if (!finalContent.trim()) return;

    onSend(
      finalContent,
      displayContent !== fullContent ? displayContent : undefined,
      ragFilename,
    );
    setText("");
    setAttachments([]);
    manualHeightRef.current = 0;
    resetHeight();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Use the manually dragged height as the floor, content height as the target, capped at 600px.
    el.style.height = `${Math.max(manualHeightRef.current, Math.min(el.scrollHeight, 600))}px`;
  };

  // Drag-to-resize the input — start from the textarea's current height and write style.height directly so the change is instantly visible.
  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const el = textareaRef.current;
    const startH = el ? el.offsetHeight : (manualHeightRef.current || 36);

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(36, Math.min(400, startH + (startY - ev.clientY)));
      manualHeightRef.current = next;
      // Write style.height directly so the resize is reflected immediately.
      if (el) el.style.height = `${next}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.length > PASTE_ATTACH_THRESHOLD) {
      e.preventDefault();
      setAttachments((prev) => [
        ...prev,
        { kind: "paste", label: `${t.longTextLabel}（${pasted.length} ${t.chars}）`, content: pasted },
      ]);
    }
  };

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      setUploading(true);
      try {
        const { filename, chunk_count, inline_text } = await uploadAttachment(sessionId, file);
        // chunk_count=0 and inline_text=null → extraction failed (scanned image / encrypted PDF / etc.).
        if (chunk_count === 0 && inline_text === null) {
          alert(`「${filename}」${t.fileParseError}`);
          return;
        }
        setAttachments((prev) => [
          ...prev,
          { kind: "file", label: filename, ...(inline_text ? { content: inline_text } : {}) },
        ]);
      } catch (err) {
        alert(`${t.fileUploadError}：${err instanceof Error ? err.message : "unknown error"}`);
      } finally {
        setUploading(false);
      }
    },
    [sessionId],
  );

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const quotaRemaining = Math.max(0, ANON_TURN_LIMIT - turnCount);
  const quotaPct = Math.min(1, turnCount / ANON_TURN_LIMIT);
  const quotaWarn = quotaRemaining <= 5 && quotaRemaining > 0;
  const quotaFull = quotaRemaining === 0;

  return (
    // Aligned with MessageList's reading column (max-w-[780px] centered, wide padding) for visual continuity.
    <div className="border-t border-subtle bg-base pt-3 pb-5 relative px-6 md:px-10">
     <div className="mx-auto w-full max-w-[780px] relative">
      {/* Drag handle for resizing the input box. */}
      <div
        className="absolute top-0 left-0 right-0 h-2.5 cursor-ns-resize flex items-center justify-center group/rh"
        onMouseDown={onResizeDown}
      >
        <div className="w-10 h-0.5 rounded-full bg-subtle/50 group-hover/rh:bg-indigo-500/30 transition-colors" />
      </div>
      {/* Anonymous trial quota bar — only shown for anon users. Previously
          absolute-positioned at top-2 right-4 over the input box, which
          crowded the web-search / send buttons on mobile. Now its own
          block-level row above the box, right-aligned, with clear vertical
          breathing room. */}
      {isAnon && (
        <div
          className={`flex justify-end items-center gap-1.5 text-[10px] font-mono tabular-nums select-none pointer-events-none mb-1.5 pr-1 transition-colors ${
            quotaFull ? "text-red-400" : quotaWarn ? "text-amber-400" : "text-faint"
          }`}
          aria-live="polite"
        >
          <span className="tracking-wider">
            {quotaFull ? t.quotaFull : `${quotaRemaining}/${ANON_TURN_LIMIT} ${t.quotaFree}`}
          </span>
          {!quotaFull && (
            <span className="relative h-1 w-10 rounded-full bg-subtle overflow-hidden">
              <span
                className={`absolute inset-y-0 left-0 rounded-full transition-[width,background-color] ${
                  quotaWarn ? "bg-amber-400" : "bg-indigo-500/60"
                }`}
                style={{ width: `${quotaPct * 100}%` }}
              />
            </span>
          )}
        </div>
      )}
      <div className={`bg-surface rounded-2xl border overflow-hidden transition-all ${
        disabled
          ? "border-subtle"
          : "border-base focus-within:border-indigo-500/25 focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.1)]"
      }`}>

        {/* Attachment chips. */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 text-[11px] bg-elevated-80 text-lo rounded-full pl-2.5 pr-1 py-0.5 border border-subtle"
              >
                <svg className="w-3 h-3 text-faint flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
                <span className="max-w-[160px] truncate">{a.label}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 w-4 h-4 rounded-full hover:bg-glass-md flex items-center justify-center text-faint hover:text-lo flex-shrink-0 transition-colors"
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input row. */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Attachment button. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="w-7 h-7 rounded-lg hover:bg-glass disabled:opacity-20 text-ph hover:text-dim flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="添加附件"
          >
            {uploading ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            )}
          </button>

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onInput={handleInput}
            onPaste={handlePaste}
            placeholder={uploading ? t.extracting : webSearch ? t.webSearchPlaceholder : t.inputPlaceholder}
            disabled={disabled || uploading}
            rows={1}
            style={{ maxHeight: 600 }}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-hi placeholder-ph disabled:opacity-30 leading-relaxed"
          />

          {/* Web-search toggle. */}
          <button
            type="button"
            onClick={() => onWebSearchToggle?.(!webSearch)}
            disabled={disabled}
            title={webSearch ? t.webSearchOn : t.webSearchOff}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-20 ${
              webSearch
                ? "bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/20"
                : "hover:bg-glass text-ph hover:text-dim"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>

          {/* Send button. */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-disabled disabled:text-disabled text-white flex items-center justify-center transition-colors flex-shrink-0 shadow-sm shadow-indigo-950/50"
            aria-label="发送"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2L15 22 11 13 2 9l20-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
     </div>
    </div>
  );
}
