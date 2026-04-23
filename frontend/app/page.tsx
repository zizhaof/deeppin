"use client";
// app/page.tsx — 首页

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { listSessions, createSession, deleteSession, ApiError } from "@/lib/api";
import type { Session } from "@/lib/api";
import QuotaExceededModal from "@/components/QuotaExceededModal";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useT } from "@/stores/useLangStore";
import SessionDrawer from "@/components/SessionDrawer";
import LangSelector from "@/components/LangSelector";
import PinDemo from "@/components/PinDemo";

// ── 主页 ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const t = useT();
  const [user, setUser] = useState<{ email?: string; avatar_url?: string } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [heroText, setHeroText] = useState("");
  const heroComposingRef = useRef(false);
  /** 匿名用户超过 1-session 上限时弹窗（罕见：需要手动清 prewarm 时触发）。
   *  Modal shown when an anon user trips the 1-session cap during fallback createSession. */
  const [quotaModal, setQuotaModal] = useState<{ message?: string } | null>(null);
  /** 当前用户是否匿名；用来在 SessionDrawer 里隐藏「新对话」按钮。
   *  Anon flag — hides the "new chat" button in SessionDrawer (1-session cap). */
  const [isAnon, setIsAnon] = useState(false);
  // 预热：登录后立即在后台创建好一个 session，点击时直接跳转无需等待
  const prewarmedRef = useRef<string | null>(null);

  // 预热：只预生成 UUID，不写 DB。
  // 点击「新建对话」时才真正创建 session，在跳转前并行发出请求。
  // Prewarm: generate a UUID client-side only — no DB write at all.
  // The session is created on-demand when the chat page loads.
  const prewarm = () => {
    prewarmedRef.current = crypto.randomUUID();
  };

  // 先检查 auth，认证后再拉取 sessions（避免未登录时静默抛错）
  // Check auth first, then fetch sessions (avoids silent errors for unauthenticated users)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          email: session.user.email,
          avatar_url: session.user.user_metadata?.avatar_url,
        });
        // is_anonymous 可能不存在于老版本 supabase-js；缺失则视为非匿名。
        // is_anonymous may not exist on older supabase-js — treat absence as non-anon.
        setIsAnon(Boolean((session.user as { is_anonymous?: boolean }).is_anonymous));
        listSessions()
          .then(setSessions)
          .catch(() => setSessions([]))
          .finally(() => setLoading(false));
        // 预生成 UUID（不写 DB）
        prewarm();
      } else {
        setLoading(false);
      }
    });

    // 卸载时清空 ref（UUID 从未写 DB，不需要删除）
    // On unmount: just clear the ref — no DB record was created, nothing to delete
    return () => { prewarmedRef.current = null; };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(id);
  }, []);

  const handleNewChat = async (initialMessage?: string) => {
    const supabase = createClient();
    let { data: { session } } = await supabase.auth.getSession();
    // 未登录 → 匿名试用（lazy：只在用户主动点「新对话」时才创建匿名账号，避免
    // 爬虫/预渲染污染 auth.users）。失败才退到 /login。
    // No session → lazy signInAnonymously (only on user action to keep auth.users clean).
    // Fall back to /login only if anon sign-in fails.
    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.session) {
        router.push("/login");
        return;
      }
      session = data.session;
    }
    if (initialMessage?.trim()) {
      sessionStorage.setItem("deeppin:pending-msg", initialMessage.trim());
    }
    // 使用预生成的 UUID 立即跳转（chat 页面 init 会完成实际的 DB 创建）
    // Use the pre-generated UUID for instant navigation; chat page init() does the actual DB write
    if (prewarmedRef.current) {
      const id = prewarmedRef.current;
      prewarmedRef.current = null;
      router.push(`/chat/${id}`);
      // 为下一次新建对话预生成 UUID
      prewarm();
      return;
    }
    // 极少情况：ref 为空（组件刚挂载就立即点击），fallback 正常创建
    // Rare fallback: ref is empty (click before prewarm ran) — create normally
    setCreating(true);
    try {
      const s = await createSession();
      router.push(`/chat/${s.id}`);
    } catch (err) {
      setCreating(false);
      // 匿名用户已用掉 1 session 额度 → 弹登录引导
      // Anon user already burned their 1-session allowance → show sign-in modal
      if (err instanceof ApiError && err.code === "anon_session_limit") {
        setQuotaModal({ message: err.message });
      }
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm(t.confirmDelete)) return;
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      alert(`${t.deleteError}${err instanceof Error ? err.message : t.unknownError}`);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setSessions([]);
  };

  // 匿名用户手动触发 Google 绑定(linkIdentity 保留 user_id 与历史消息)。
  // Anon users manually trigger Google link-identity (preserves user_id + history).
  const handleSignIn = async () => {
    const supabase = createClient();
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo },
    });
    if (error) alert(error.message);
  };

  // 渐入动画 / Staggered entrance
  const fadeUp = (delay: number): CSSProperties => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(16px)",
    transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
  });

  return (
    <div className="min-h-screen bg-base flex flex-col relative overflow-x-hidden">

      {/* 背景：点网格 + 顶部光晕 */}
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden>
        <div
          className="absolute inset-0 opacity-100"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='28' height='28' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='14' cy='14' r='0.7' fill='rgba(128,128,128,0.15)'/%3E%3C/svg%3E")`,
          }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[320px] blur-[80px] opacity-60"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%)" }}
        />
      </div>

      {/* 抽屉 */}
      <SessionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sessions={sessions} loading={loading} t={t} onDelete={handleDeleteSession} isAnon={isAnon} onAnonNewChat={() => setQuotaModal({})} />

      {/* 顶栏 */}
      <header className="relative z-10 border-b border-subtle px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-faint hover:text-md hover:bg-glass transition-colors cursor-pointer"
            title={t.recentSessions}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-surface border border-base flex items-center justify-center">
              <svg className="w-3 h-3 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
              </svg>
            </div>
            <span className="font-serif text-base text-md tracking-tight">Deeppin</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 登录用户显示头像 + 退出；匿名不显示退出(强引导走登录按钮)
           *  Signed-in users see avatar + logout; anon users don't get a logout option (nudges toward Sign in) */}
          {user && !isAnon && (
            <>
              {user.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt="avatar"
                  className="w-7 h-7 rounded-full border border-base object-cover"
                />
              )}
              <button
                onClick={handleLogout}
                className="text-[11px] font-medium text-faint hover:text-md px-2 py-1 rounded-lg border border-subtle hover:border-base transition-colors"
              >
                {t.logout}
              </button>
            </>
          )}
          <Link
            href="/articles"
            className="text-[11px] font-medium text-faint hover:text-md px-2 py-1 rounded-lg border border-subtle hover:border-base transition-colors"
          >
            {t.articles}
          </Link>
          <LangSelector />
          {/* 右上角主 CTA:匿名 → 登录(linkIdentity 保留试用数据),登录 → 新对话
           *  Top-right primary CTA: anon users get "Sign in" (linkIdentity preserves trial data); signed-in get "New chat" */}
          {isAnon ? (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              {t.signIn}
            </button>
          ) : (
            <button
              onClick={() => handleNewChat()}
              disabled={creating}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {creating ? t.creating : t.newChat}
            </button>
          )}
        </div>
      </header>

      {/* 主体 */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-6 py-16 gap-12 overflow-y-auto">

        {/* ── Hero ── */}
        <div style={fadeUp(0)} className="flex flex-col items-center gap-5 text-center w-full max-w-[640px]">
          {/* 图标 + 光晕 */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-xl bg-indigo-500/20 scale-110" />
            <div className="relative w-14 h-14 rounded-2xl bg-surface border border-base flex items-center justify-center shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_8px_32px_rgba(0,0,0,0.15)]">
              <svg className="w-6 h-6 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
              </svg>
            </div>
          </div>

          <h1 className="font-serif text-[26px] font-medium text-hi tracking-tight leading-tight">{t.welcomeTitle}</h1>

          {/* 首页输入框 — 与对话页主栏等宽 */}
          <div className="w-full bg-surface rounded-2xl border border-base focus-within:border-indigo-500/25 focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.1)] transition-all overflow-hidden">
            <textarea
              value={heroText}
              onChange={(e) => setHeroText(e.target.value)}
              onCompositionStart={() => { heroComposingRef.current = true; }}
              onCompositionEnd={() => { heroComposingRef.current = false; }}
              onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === "Enter" && !e.shiftKey && !heroComposingRef.current) {
                  e.preventDefault();
                  if (heroText.trim() && !creating) handleNewChat(heroText);
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              placeholder={t.inputPlaceholder}
              disabled={creating}
              rows={1}
              className="w-full bg-transparent resize-none outline-none text-sm text-hi placeholder-ph px-4 pt-3 pb-2 max-h-[120px] disabled:opacity-30 leading-relaxed"
            />
            <div className="flex justify-end px-3 pb-2.5">
              <button
                onClick={() => { if (heroText.trim() && !creating) handleNewChat(heroText); }}
                disabled={!heroText.trim() || creating}
                className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-disabled disabled:text-disabled text-white flex items-center justify-center transition-colors shadow-sm shadow-indigo-950/50"
                aria-label="开始对话"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M22 2L15 22 11 13 2 9l20-7z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── 插针演示 —— 演示已自带「两个坏选项」的文案 + pin 的解法，
             所以 Why / How sections 删掉，避免重复。
             PinDemo now carries the "two bad options" framing + the pin fix
             inside its AI reply — the separate Why / How sections are redundant. ── */}
        <div style={fadeUp(60)}>
          <PinDemo />
        </div>

        <div className="h-16" />
      </main>

      <QuotaExceededModal
        open={quotaModal !== null}
        variant="session"
        message={quotaModal?.message}
        onClose={() => setQuotaModal(null)}
      />
    </div>
  );
}
