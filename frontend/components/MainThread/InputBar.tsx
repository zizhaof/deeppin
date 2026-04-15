"use client";
// components/MainThread/InputBar.tsx

import { useState, useRef, KeyboardEvent, useCallback, useEffect } from "react";
import { useT } from "@/stores/useLangStore";
import { uploadAttachment } from "@/lib/api";

const PASTE_ATTACH_THRESHOLD = 300;

interface FileAttachment {
  kind: "file";
  label: string;
  /** 内联模式：短文件提取文本直接拼入消息 context，不在气泡中显示 */
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
}

export default function InputBar({ sessionId, onSend, disabled, webSearch = false, onWebSearchToggle }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [maxInputH, setMaxInputH] = useState(160);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const resizeStart = useRef<{ y: number; h: number } | null>(null);

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
      // 内联模式文件：提取文本拼入 context，但不在气泡中显示
      if (a.kind === "file" && a.content) contentParts.push(`[附件内容：${a.label}]\n${a.content}`);
    }
    const fullContent = contentParts.join("\n\n---\n\n");

    const displayParts: string[] = [];
    if (trimmed) displayParts.push(trimmed);
    for (const a of attachments) displayParts.push(`📎 ${a.label}`);
    const displayContent = displayParts.join("  ");

    // 任意文件附件的文件名（含内联和 RAG 两种模式），后端据此优先检索该文件或抑制旧文件 RAG
    // Filename of any file attachment (inline or RAG); backend uses it to prefer this file's chunks
    // or suppress old-file RAG when the file was sent inline (no chunks in DB)
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
    el.style.height = `${Math.min(el.scrollHeight, maxInputH)}px`;
  };

  // 拖拽调整输入框最大高度
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStart.current = { y: e.clientY, h: maxInputH };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
    const delta = resizeStart.current.y - e.clientY; // 向上拖 → 增大高度
    setMaxInputH(Math.max(60, Math.min(400, resizeStart.current.h + delta)));
  };
  const onResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    resizeStart.current = null;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  };

  // maxInputH 变化时重新适配当前 textarea 高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const current = parseFloat(el.style.height) || 0;
    if (current > maxInputH) el.style.height = `${maxInputH}px`;
  }, [maxInputH]);

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
        // chunk_count=0 且 inline_text=null → 提取失败（扫描件/加密 PDF 等）
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

  return (
    <div className="border-t border-subtle bg-base px-4 pt-3 pb-5 relative">
      {/* 拖拽调整输入框高度的把手 */}
      <div
        className="absolute top-0 left-0 right-0 h-2.5 cursor-ns-resize flex items-center justify-center group/rh"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      >
        <div className="w-10 h-0.5 rounded-full bg-subtle/50 group-hover/rh:bg-indigo-500/30 transition-colors" />
      </div>
      <div className={`bg-surface rounded-2xl border overflow-hidden transition-all ${
        disabled
          ? "border-subtle"
          : "border-base focus-within:border-indigo-500/25 focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.1)]"
      }`}>

        {/* 附件 chips */}
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

        {/* 输入行 */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* 附件按钮 */}
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
            accept=".txt,.md,.pdf,.docx,.doc,.csv,.json,.xml,.html,.py,.ts,.tsx,.js,.jsx"
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
            style={{ maxHeight: maxInputH }}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-hi placeholder-ph disabled:opacity-30 leading-relaxed"
          />

          {/* 联网搜索 toggle */}
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

          {/* 发送按钮 */}
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
  );
}
