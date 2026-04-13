"use client";
// components/MainThread/InputBar.tsx

import { useState, useRef, KeyboardEvent, useCallback } from "react";
import { useT } from "@/stores/useLangStore";
import { uploadAttachment } from "@/lib/api";

// 粘贴内容超过此字符数时转为 chip（内容仍内联在消息里）
const PASTE_ATTACH_THRESHOLD = 300;

// 文件附件：内容已存 DB，前端不持有文本
interface FileAttachment {
  kind: "file";
  label: string;   // 文件名，显示在 chip 和气泡
}

// 粘贴附件：内容内联在消息里，对 AI 可见
interface PasteAttachment {
  kind: "paste";
  label: string;   // "长文本（N 字）"
  content: string; // 原始文本，拼入 AI 消息
}

type Attachment = FileAttachment | PasteAttachment;

interface Props {
  sessionId: string;
  /** content = AI 接收的完整消息；display = 气泡显示文字（含 📎 标签） */
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

  const canSend =
    (text.trim().length > 0 || attachments.length > 0) && !disabled && !uploading;

  const resetHeight = () => {
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleSend = () => {
    if (!canSend) return;
    const trimmed = text.trim();

    // AI 收到的内容：文字输入 + 粘贴附件原文（文件附件由后端 RAG 注入，不拼入此处）
    const contentParts: string[] = [];
    if (trimmed) contentParts.push(trimmed);
    for (const a of attachments) {
      if (a.kind === "paste") contentParts.push(a.content);
    }
    const fullContent = contentParts.join("\n\n---\n\n");

    // 气泡显示：文字 + 所有 chip 标签
    const displayParts: string[] = [];
    if (trimmed) displayParts.push(trimmed);
    for (const a of attachments) displayParts.push(`📎 ${a.label}`);
    const displayContent = displayParts.join("  ");

    onSend(
      fullContent || displayContent,  // 防止 fullContent 为空（只有文件附件时）
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

  // 超长粘贴转为内联 paste chip
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted.length > PASTE_ATTACH_THRESHOLD) {
      e.preventDefault();
      setAttachments((prev) => [
        ...prev,
        {
          kind: "paste",
          label: `长文本（${pasted.length} 字）`,
          content: pasted,
        },
      ]);
    }
  };

  // 文件上传 → 后端存 DB → chip（不持有内容）
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      setUploading(true);
      try {
        const { filename, chunk_count } = await uploadAttachment(sessionId, file);
        if (chunk_count === 0) {
          alert(`文件「${filename}」解析失败，无法提取文字内容（可能是扫描件或加密 PDF）。`);
          return;
        }
        setAttachments((prev) => [
          ...prev,
          { kind: "file", label: filename },
        ]);
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
    <div className="border-t border-zinc-800 bg-zinc-950 px-8 py-3">
      <div className="bg-zinc-800/80 rounded-2xl border border-zinc-700/60 focus-within:border-zinc-600 transition-colors overflow-hidden">

        {/* 附件 chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="flex items-center gap-1 text-[11px] bg-zinc-700/70 text-zinc-300 rounded-full pl-2.5 pr-1 py-0.5"
              >
                <svg
                  className="w-3 h-3 text-zinc-400 flex-shrink-0"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
                <span className="max-w-[160px] truncate">{a.label}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 w-4 h-4 rounded-full hover:bg-zinc-600 flex items-center justify-center text-zinc-400 hover:text-zinc-200 flex-shrink-0"
                  aria-label="移除"
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
        <div className="flex items-end gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="w-7 h-7 rounded-full hover:bg-zinc-700 disabled:opacity-40 text-zinc-500 hover:text-zinc-300 flex items-center justify-center transition-colors flex-shrink-0 mb-0.5"
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
            className="flex-1 bg-transparent resize-none outline-none text-sm text-zinc-100 placeholder-zinc-600 max-h-40 disabled:opacity-40"
          />

          {/* 联网搜索 toggle */}
          <button
            type="button"
            onClick={() => onWebSearchToggle?.(!webSearch)}
            disabled={disabled}
            title={webSearch ? "关闭联网搜索" : "开启联网搜索"}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0 mb-0.5 disabled:opacity-40 ${
              webSearch
                ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                : "hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
            aria-label="联网搜索"
          >
            {/* Globe icon */}
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>

          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors flex-shrink-0 mb-0.5"
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
