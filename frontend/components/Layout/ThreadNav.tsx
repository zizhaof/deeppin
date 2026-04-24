"use client";
// components/Layout/ThreadNav.tsx

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Thread } from "@/lib/api";
import { deleteAccount } from "@/lib/api";
import { useT } from "@/stores/useLangStore";
import LangSelector from "@/components/LangSelector";
import { createClient } from "@/lib/supabase";

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onSelect: (threadId: string) => void;
  onOpenSessions: () => void;
  /** Handler for the topbar "new chat" button; parent branches on isAnon. */
  onNewChat: () => void;
  /** Anon flag — hides the account menu (delete-account is meaningless for anon) and shows a top-right "Sign in" button. */
  isAnon?: boolean;
  /** Handler for the anon-only "Sign in" button; triggers linkIdentity. */
  onSignIn?: () => void;
  /** Google OAuth avatar URL (from user_metadata.avatar_url); falls back to a person icon when null. */
  userAvatarUrl?: string | null;
}

export default function ThreadNav({
  threads,
  activeThreadId,
  canBack,
  canForward,
  onBack,
  onForward,
  onSelect,
  onOpenSessions,
  onNewChat,
  isAnon = false,
  onSignIn,
  userAvatarUrl = null,
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

  const handleLogout = async () => {
    setUserMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
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
    <header
      className="h-14 flex items-center gap-3 flex-shrink-0 px-6"
      style={{ borderBottom: "1px solid var(--rule)", background: "var(--paper)" }}
    >
      {/* Top-left order mirrors the welcome page: session drawer → brand →
          new chat → back/forward. Welcome shows only [drawer, brand]; the
          chat-only actions (new chat, history) extend that same sequence. */}
      <button
        onClick={onOpenSessions}
        className="w-[30px] h-[30px] flex items-center justify-center rounded-md transition-colors flex-shrink-0"
        title={t.recentSessions}
        style={{ color: "var(--ink-3)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--paper-2)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--ink-3)"; }}
      >
        <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <Link href="/" className="flex items-center gap-2 flex-shrink-0 group" title="Deeppin">
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
          style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--accent)" }}>
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
          </svg>
        </span>
        <span className="font-serif text-[18px] tracking-[-0.01em] group-hover:opacity-80 transition-opacity" style={{ color: "var(--ink)" }}>
          Deeppin
        </span>
      </Link>

      <span className="w-px h-5 flex-shrink-0" style={{ background: "var(--rule)" }} />

      <div className="flex items-center gap-0.5">
        <button
          onClick={onNewChat}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-md transition-colors flex-shrink-0"
          title={t.newChat}
          style={{ color: "var(--ink-3)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--paper-2)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--ink-3)"; }}
        >
          <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <button
          onClick={onBack}
          disabled={!canBack}
          className="w-[30px] h-[30px] rounded-md flex items-center justify-center disabled:opacity-30 transition-colors"
          aria-label={t.back}
          style={{ color: "var(--ink-3)" }}
        >
          <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={onForward}
          disabled={!canForward}
          className="w-[30px] h-[30px] rounded-md flex items-center justify-center disabled:opacity-30 transition-colors"
          aria-label={t.forward}
          style={{ color: "var(--ink-3)" }}
        >
          <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Breadcrumb. */}
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
              className="truncate max-w-[180px] px-2 py-[3px] rounded transition-colors font-mono text-[11px]"
              style={{
                background: thr.id === activeThreadId ? "var(--ink)" : "transparent",
                color: thr.id === activeThreadId ? "var(--paper)" : "var(--ink-3)",
                border: thr.id === activeThreadId ? "1px solid var(--ink)" : "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (thr.id !== activeThreadId) {
                  (e.currentTarget as HTMLElement).style.background = "var(--paper-2)";
                  (e.currentTarget as HTMLElement).style.color = "var(--ink)";
                }
              }}
              onMouseLeave={(e) => {
                if (thr.id !== activeThreadId) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--ink-3)";
                }
              }}
            >
              {thr.parent_thread_id === null
                ? (thr.title ?? t.mainThread)
                : (thr.title ?? thr.anchor_text?.slice(0, 20) ?? t.subThread) +
                  (thr.anchor_text && thr.anchor_text.length > 20 ? "…" : "")}
            </button>
          </span>
        ))}
      </div>

      {/* Language selector. */}
      <LangSelector />

      {/* Anon: "Sign in" button (no account menu — delete-account is meaningless for anon).
          Signed-in: account menu (includes delete-account). */}
      {isAnon ? (
        <button
          onClick={onSignIn}
          className="flex-shrink-0 h-[30px] px-3 rounded-md text-[12px] font-medium transition-colors"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--accent)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--ink)")}
        >
          {t.signIn}
        </button>
      ) : (
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            disabled={deleting}
            className="w-[30px] h-[30px] flex items-center justify-center rounded-full transition-all disabled:opacity-50 overflow-hidden"
            title={t.languageLabel}
            style={{ border: "1px solid var(--rule)", color: "var(--ink-4)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--ink-5)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--rule)"; (e.currentTarget as HTMLElement).style.color = "var(--ink-4)"; }}
          >
            {userAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userAvatarUrl}
                alt="avatar"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            )}
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-2 z-50 min-w-[160px] overflow-hidden rounded-lg"
                style={{ background: "var(--card)", border: "1px solid var(--rule)", boxShadow: "0 10px 32px rgba(27,26,23,0.14), 0 2px 6px rgba(27,26,23,0.06)" }}
              >
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-[12.5px] transition-colors"
                  style={{ color: "var(--ink)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--paper-2)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  {t.logout}
                </button>
                <div className="h-px" style={{ background: "var(--rule)" }} />
                <button
                  onClick={handleDeleteAccount}
                  className="w-full text-left px-3 py-2 text-[12.5px] transition-colors"
                  style={{ color: "#b84a5b" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--paper-2)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  {t.deleteAccount}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
