"use client";
// components/MainThread/InputBar.tsx

import { useState, useRef, KeyboardEvent, useCallback } from "react";
import { useT } from "@/stores/useLangStore";
import { uploadAttachment } from "@/lib/api";

const PASTE_ATTACH_THRESHOLD = 300;

interface FileAttachment {
  kind: "file";
  label: string;
}

interface PasteAttachment {
  kind: "paste";
  label: string;
  content: string;
}

type Attachment = FileAttachment | PasteAttachment;

interface Props {
  sessionId: string;
  onSend: (content: string, display?: string) => void;
  disabled?: boolean;
  webSearch?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
}

export default function InputBar({ sessionId, onSend, disabled, webSearch = false, onWebSearchToggle }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    }
    const fullContent = contentParts.join("\n\n---\n\n");

    const displayParts: string[] = [];
    if (trimmed) displayParts.push(trimmed);
    for (const a of attachments) displayParts.push(`📎 ${a.label}`);
    const displayContent = displayParts.join("  ");

    onSend(
      fullContent || displayContent,
      displayContent !== fullContent ? displayContent : undefined,
    );
    setText("");
    setAttachments([]);
    resetHeight();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.length > PASTE_ATTACH_THRESHOLD) {
      e.preventDefault();
      setAttachments((prev) => [
        ...prev,
        { kind: "paste", label: `长文本（${pasted.length} 字）`, content: pasted },
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
        const { filename, chunk_count } = await uploadAttachment(sessionId, file);
        if (chunk_count === 0) {
          alert(`文件「${filename}」解析失败，无法提取文字内容。`);
          return;
        }
        setAttachments((prev) => [...prev, { kind: "file", label: filename }]);
      } catch (err) {
        alert(`文件上传失败：${err instanceof Error ? err.message : "未知错误"}`);
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
    <div className="border-t border-white/5 bg-zinc-950 px-6 py-3">
      <div className={`bg-zinc-900 rounded-2xl border transition-colors overflow-hidden ${
        disabled ? "border-white/5" : "border-white/8 focus-within:border-indigo-500/30"
      }`}>

        {/* 附件 chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 text-[11px] bg-zinc-800 text-zinc-300 rounded-full pl-2.5 pr-1 py-0.5 border border-zinc-700/50"
              >
                <svg className="w-3 h-3 text-zinc-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
                <span className="max-w-[160px] truncate">{a.label}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 w-4 h-4 rounded-full hover:bg-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 flex-shrink-0 transition-colors"
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
        <div className="flex items-end gap-2 px-3 py-2.5">
          {/* 附件按钮 */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="w-7 h-7 rounded-lg hover:bg-zinc-800 disabled:opacity-30 text-zinc-600 hover:text-zinc-400 flex items-center justify-center transition-colors flex-shrink-0 mb-0.5"
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
            onInput={handleInput}
            onPaste={handlePaste}
            placeholder={uploading ? t.extracting : webSearch ? "联网搜索…" : t.inputPlaceholder}
            disabled={disabled || uploading}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-zinc-100 placeholder-zinc-600 max-h-40 disabled:opacity-40 leading-relaxed"
          />

          {/* 联网搜索 toggle */}
          <button
            type="button"
            onClick={() => onWebSearchToggle?.(!webSearch)}
            disabled={disabled}
            title={webSearch ? "关闭联网搜索" : "开启联网搜索"}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 mb-0.5 disabled:opacity-30 ${
              webSearch
                ? "bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25"
                : "hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400"
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
            className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white flex items-center justify-center transition-colors flex-shrink-0 mb-0.5"
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
