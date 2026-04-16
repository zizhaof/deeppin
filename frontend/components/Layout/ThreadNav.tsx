"use client";
// components/Layout/ThreadNav.tsx

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Thread } from "@/lib/api";
import { deleteAccount } from "@/lib/api";
import type { Lang } from "@/lib/i18n";
import { useT } from "@/stores/useLangStore";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase";

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
  onOpenSessions: () => void;
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
  onOpenSessions,
}: Props) {
  const t = useT();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setUserMenuOpen(false);
    if (!window.confirm("确认删除账号？此操作不可撤销，所有对话将被永久删除。\n\nDelete account? This cannot be undone — all conversations will be permanently deleted.")) return;
    setDeleting(true);
    try {
      await deleteAccount();
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      alert(`${t.deleteError}${err instanceof Error ? err.message : t.unknownError}`);
      setDeleting(false);
    }
  };

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
    <header className="h-11 border-b border-subtle bg-base flex items-center px-3 gap-2 flex-shrink-0">
      {/* 菜单按钮 — 打开 session 抽屉 */}
      <button
        onClick={onOpenSessions}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-glass transition-colors flex-shrink-0 group cursor-pointer"
        title="所有对话"
      >
        <svg className="w-3.5 h-3.5 text-faint group-hover:text-md transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* 品牌图标 */}
      <Link
        href="/"
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-glass transition-colors flex-shrink-0 group"
        title="返回主页"
      >
        <svg className="w-3.5 h-3.5 text-indigo-400/60 group-hover:text-indigo-400 transition-colors" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
        </svg>
      </Link>

      <div className="w-px h-3.5 bg-glass-md flex-shrink-0" />

      {/* 前进后退 */}
      <button
        onClick={onBack}
        disabled={!canBack}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-glass disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        aria-label={t.back}
      >
        <svg className="w-3.5 h-3.5 text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={onForward}
        disabled={!canForward}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-glass disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        aria-label={t.forward}
      >
        <svg className="w-3.5 h-3.5 text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* 面包屑 */}
      <div className="flex items-center gap-0 text-sm min-w-0 flex-1 overflow-hidden">
        {breadcrumb.map((thr, i) => (
          <span key={thr.id} className="flex items-center gap-0 min-w-0 flex-shrink-0">
            {i > 0 && (
              <svg className="w-3 h-3 text-ph flex-shrink-0 mx-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            <button
              onClick={() => onSelect(thr.id)}
              className={`truncate max-w-[150px] px-1.5 py-1 rounded-md hover:bg-glass transition-colors text-xs ${
                thr.id === activeThreadId
                  ? "text-md font-medium"
                  : "text-faint hover:text-lo"
              }`}
            >
              {thr.parent_thread_id === null
                ? (thr.title ?? t.mainThread)
                : (thr.title ?? thr.anchor_text?.slice(0, 20) ?? t.subThread) +
                  (thr.anchor_text && thr.anchor_text.length > 20 ? "…" : "")}
            </button>
          </span>
        ))}
      </div>

      {/* 主题切换 */}
      <ThemeToggle />

      {/* 语言切换 */}
      <button
        onClick={onToggleLang}
        className="flex-shrink-0 text-[10px] font-semibold text-faint hover:text-md px-2.5 py-1 rounded-lg border border-subtle hover:border-base hover:bg-glass transition-all tracking-wide"
      >
        {t.toggleLang}
      </button>

      {/* 用户菜单 */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          disabled={deleting}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-subtle hover:border-base hover:bg-glass transition-all disabled:opacity-50"
          title="账号设置"
        >
          <svg className="w-3.5 h-3.5 text-faint" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        </button>

        {userMenuOpen && (
          <>
            {/* 点击外部关闭 */}
            <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[140px] bg-surface border border-base rounded-xl shadow-lg overflow-hidden">
              <button
                onClick={handleDeleteAccount}
                className="w-full text-left px-3.5 py-2.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                删除账号
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
