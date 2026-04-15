"use client";
// app/page.tsx — 首页

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { listSessions, createSession, deleteSession } from "@/lib/api";
import type { Session } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { useT, useLangStore } from "@/stores/useLangStore";
import type { T } from "@/lib/i18n";
import SessionDrawer from "@/components/SessionDrawer";

// ── 分隔线 ────────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div className="w-full max-w-[420px] flex items-center gap-3">
      <div className="flex-1 h-px bg-base" />
      <span className="text-[9px] font-semibold text-ph uppercase tracking-[0.18em]">{label}</span>
      <div className="flex-1 h-px bg-base" />
    </div>
  );
}

// ── 问题陈述 ──────────────────────────────────────────────────────────

function ProblemStatement({ t }: { t: T }) {
  return (
    <div className="w-full max-w-[420px] space-y-3">
      {/* 情景铺垫 */}
      <p className="text-[13px] text-lo leading-relaxed mb-4">{t.problemSetup}</p>

      {/* 两个坏选择 */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: t.badChoice1Label, desc: t.badChoice1Desc },
          { label: t.badChoice2Label, desc: t.badChoice2Desc },
        ].map((item, i) => (
          <div key={i} className="relative rounded-xl border border-base bg-surface-60 p-4 overflow-hidden">
            {/* 顶部红线 */}
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-red-500/50 to-red-500/10" />
            <div className="flex items-center gap-1.5 mb-2">
              <svg className="w-3 h-3 text-red-500/50 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              <span className="text-xs font-medium text-dim line-through decoration-red-500/40 decoration-1">{item.label}</span>
            </div>
            <p className="text-[11px] text-faint leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* 解法 */}
      <div className="relative rounded-xl border border-indigo-500/20 bg-indigo-950/40 p-4 overflow-hidden">
        {/* 顶部 indigo 线 */}
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-indigo-500/70 via-indigo-400/30 to-transparent" />
        {/* 内部光晕 */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_5%_0%,rgba(99,102,241,0.09),transparent_65%)]" />
        <div className="relative flex items-start gap-3">
          <div className="mt-0.5 w-5 h-5 rounded-md bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center flex-shrink-0">
            <svg className="w-2.5 h-2.5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-300 mb-1">{t.solutionLabel}</p>
            <p className="text-xs text-lo leading-relaxed">{t.solutionDesc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 使用步骤（竖向时间线）────────────────────────────────────────────

function HowItWorks({ t }: { t: T }) {
  const steps = [
    { num: "01", title: t.step1Title, desc: t.step1Desc },
    { num: "02", title: t.step2Title, desc: t.step2Desc },
    { num: "03", title: t.step3Title, desc: t.step3Desc },
    { num: "04", title: t.step4Title, desc: t.step4Desc },
  ];

  return (
    <div className="w-full max-w-[420px]">
      <div className="relative pl-[52px]">
        {/* 竖向连接线 */}
        <div className="absolute left-[19px] top-5 bottom-5 w-px bg-base" />

        <div className="space-y-1">
          {steps.map((step, i) => (
            <div key={i} className="relative flex items-start gap-0 pb-6 last:pb-0">
              {/* 数字圆点 */}
              <div className="absolute left-[-33px] w-[26px] h-[26px] rounded-full border border-base bg-base flex items-center justify-center z-10">
                <span className="font-mono text-[9px] text-faint tracking-tight">{step.num}</span>
              </div>
              {/* 内容 */}
              <div className="pt-0.5">
                <p className="text-[13px] font-medium text-md leading-snug mb-1">{step.title}</p>
                <p className="text-[11px] text-faint leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 主页 ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const t = useT();
  const toggleLang = useLangStore((s) => s.toggle);
  const [user, setUser] = useState<{ email?: string; avatar_url?: string } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [heroText, setHeroText] = useState("");
  const heroComposingRef = useRef(false);
  // 预热：登录后立即在后台创建好一个 session，点击时直接跳转无需等待
  const prewarmedRef = useRef<string | null>(null);

  const prewarm = (headers?: Record<string, string>) => {
    createSession().then(s => { prewarmedRef.current = s.id; }).catch(() => {});
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
        listSessions()
          .then(setSessions)
          .catch(() => setSessions([]))
          .finally(() => setLoading(false));
        // 后台预热一个 session
        prewarm();
      } else {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(id);
  }, []);

  const handleNewChat = async (initialMessage?: string) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }
    if (initialMessage?.trim()) {
      sessionStorage.setItem("deeppin:pending-msg", initialMessage.trim());
    }
    // 如果预热好了，直接跳转，同时后台预热下一个
    if (prewarmedRef.current) {
      const id = prewarmedRef.current;
      prewarmedRef.current = null;
      router.push(`/chat/${id}`);
      prewarm();
      return;
    }
    // 预热未完成（极少情况），fallback 正常创建
    setCreating(true);
    try {
      const s = await createSession();
      router.push(`/chat/${s.id}`);
    } catch {
      setCreating(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm("确定删除这个会话吗？删除后无法恢复。")) return;
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      alert(`删除失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setSessions([]);
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
      <SessionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sessions={sessions} loading={loading} t={t} onDelete={handleDeleteSession} />

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
            <span className="text-sm font-semibold text-md tracking-tight">Deeppin</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user && (
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
                退出
              </button>
            </>
          )}
          <button
            onClick={toggleLang}
            className="text-[11px] font-medium text-faint hover:text-md px-2 py-1 rounded-lg border border-subtle hover:border-base transition-colors"
          >
            {t.toggleLang}
          </button>
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
        </div>
      </header>

      {/* 主体 */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-6 py-16 gap-12 overflow-y-auto">

        {/* ── Hero ── */}
        <div style={fadeUp(0)} className="flex flex-col items-center gap-5 text-center max-w-[320px]">
          {/* 图标 + 光晕 */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-xl bg-indigo-500/20 scale-110" />
            <div className="relative w-14 h-14 rounded-2xl bg-surface border border-base flex items-center justify-center shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_8px_32px_rgba(0,0,0,0.15)]">
              <svg className="w-6 h-6 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
              </svg>
            </div>
          </div>

          <h1 className="text-[22px] font-semibold text-hi tracking-tight leading-tight">{t.welcomeTitle}</h1>

          {/* 首页输入框 */}
          <div className="w-full max-w-[360px] bg-surface rounded-2xl border border-base focus-within:border-indigo-500/25 focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.1)] transition-all overflow-hidden">
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

        {/* ── 分隔 Why ── */}
        <div style={fadeUp(80)} className="w-full max-w-[420px]">
          <Divider label="why" />
        </div>

        {/* ── 问题陈述 ── */}
        <div style={fadeUp(140)}>
          <ProblemStatement t={t} />
        </div>

        {/* ── 分隔 How ── */}
        <div style={fadeUp(200)} className="w-full max-w-[420px]">
          <Divider label={t.howToUseTitle} />
        </div>

        {/* ── 步骤 ── */}
        <div style={fadeUp(240)}>
          <HowItWorks t={t} />
        </div>

        <div className="h-8" />
      </main>
    </div>
  );
}
