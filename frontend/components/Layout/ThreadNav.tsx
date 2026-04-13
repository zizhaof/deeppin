"use client";
// components/Layout/ThreadNav.tsx
// 顶部导航：面包屑 + 前进后退 + 语言切换

import Link from "next/link";
import type { Thread } from "@/lib/api";
import type { Lang } from "@/lib/i18n";
import { useT } from "@/stores/useLangStore";

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onSelect: (threadId: string) => void;
  lang: Lang;
  onToggleLang: () => void;
}

export default function ThreadNav({
  threads,
  activeThreadId,
  canBack,
  canForward,
  onBack,
  onForward,
  onSelect,
  onToggleLang,
}: Props) {
  const t = useT();

  function buildBreadcrumb(threadId: string | null): Thread[] {
    if (!threadId) return [];
    const map = new Map(threads.map((thr) => [thr.id, thr]));
    const path: Thread[] = [];
    let current: Thread | undefined = map.get(threadId);
    while (current) {
      path.unshift(current);
      current = current.parent_thread_id ? map.get(current.parent_thread_id) : undefined;
    }
    return path;
  }

  const breadcrumb = buildBreadcrumb(activeThreadId);

  return (
    <header className="h-11 border-b border-zinc-800 bg-zinc-950 flex items-center px-3 gap-2 flex-shrink-0">
      {/* 主页链接 */}
      <Link
        href="/"
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 transition-colors flex-shrink-0"
        title="返回主页"
      >
        <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
        </svg>
      </Link>

      <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />

      {/* 前进后退 */}
      <button
        onClick={onBack}
        disabled={!canBack}
        className="w-6 h-6 rounded flex items-center justify-center hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        aria-label={t.back}
      >
        <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={onForward}
        disabled={!canForward}
        className="w-6 h-6 rounded flex items-center justify-center hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        aria-label={t.forward}
      >
        <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* 面包屑 */}
      <div className="flex items-center gap-1 text-sm min-w-0 flex-1">
        {breadcrumb.map((thr, i) => (
          <span key={thr.id} className="flex items-center gap-1 min-w-0">
            {i > 0 && <span className="text-zinc-700 flex-shrink-0 text-xs">›</span>}
            <button
              onClick={() => onSelect(thr.id)}
              className={`truncate max-w-[160px] px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors text-sm ${
                thr.id === activeThreadId
                  ? "font-semibold text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {thr.parent_thread_id === null
                ? t.mainThread
                : (thr.title ?? thr.anchor_text?.slice(0, 20) ?? t.subThread) +
                  (thr.anchor_text && thr.anchor_text.length > 20 ? "…" : "")}
            </button>
          </span>
        ))}
      </div>

      {/* 语言切换 */}
      <button
        onClick={onToggleLang}
        className="flex-shrink-0 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-600 transition-colors"
      >
        {t.toggleLang}
      </button>
    </header>
  );
}
