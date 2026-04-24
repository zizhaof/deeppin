"use client";
// Home page.

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
import MobilePinDemo from "@/components/MobilePinDemo";

// ── HomePage component ──────────────────────────────────────────────

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
  /** Modal shown when an anon user trips the 1-session cap during fallback createSession. */
  const [quotaModal, setQuotaModal] = useState<{ message?: string } | null>(null);
  /** Anon flag — hides the "new chat" button in SessionDrawer (1-session cap). */
  const [isAnon, setIsAnon] = useState(false);
  // Prewarm: pre-generate a session UUID after login so a click navigates instantly.
  const prewarmedRef = useRef<string | null>(null);

  // Prewarm: generate a UUID client-side only — no DB write at all.
  // The session is actually created when the chat page loads.
  const prewarm = () => {
    prewarmedRef.current = crypto.randomUUID();
  };

  // Check auth first, then fetch sessions (avoids silent errors for unauthenticated users).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          email: session.user.email,
          avatar_url: session.user.user_metadata?.avatar_url,
        });
        // is_anonymous may not exist on older supabase-js — treat absence as non-anon.
        setIsAnon(Boolean((session.user as { is_anonymous?: boolean }).is_anonymous));
        listSessions()
          .then(setSessions)
          .catch(() => setSessions([]))
          .finally(() => setLoading(false));
        // Pre-generate UUID (no DB write).
        prewarm();
      } else {
        setLoading(false);
      }
    });

    // On unmount: just clear the ref — no DB record was created, nothing to delete.
    return () => { prewarmedRef.current = null; };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(id);
  }, []);

  const handleNewChat = async (initialMessage?: string) => {
    const supabase = createClient();
    let { data: { session } } = await supabase.auth.getSession();
    // No session → lazy signInAnonymously (only on user action, to keep crawlers /
    // prerenders out of auth.users). Fall back to /login only if anon sign-in fails.
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
    // Use the pre-generated UUID for instant navigation; chat page init() does the actual DB write.
    if (prewarmedRef.current) {
      const id = prewarmedRef.current;
      prewarmedRef.current = null;
      router.push(`/chat/${id}`);
      // Pre-generate UUID for the next new chat.
      prewarm();
      return;
    }
    // Rare fallback: ref is empty (click before prewarm ran) — create normally.
    setCreating(true);
    try {
      const s = await createSession();
      router.push(`/chat/${s.id}`);
    } catch (err) {
      setCreating(false);
      // Anon user already burned their 1-session allowance → show sign-in modal.
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

  // Two paths share the same Sign-in button:
  //   - Anon user (has a JWT with is_anonymous=true) → linkIdentity preserves
  //     their user_id + history.
  //   - Fully signed-out user (no session at all) → linkIdentity would fail with
  //     "invalid claim: missing sub claim" because there's no JWT to attach the
  //     new identity to. Fall back to a regular OAuth sign-in.
  const handleSignIn = async () => {
    const supabase = createClient();
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    const { data: { session } } = await supabase.auth.getSession();
    const isAnonSession = Boolean(
      session?.user && (session.user as { is_anonymous?: boolean }).is_anonymous,
    );
    const { error } = isAnonSession
      ? await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) alert(error.message);
  };

  // Staggered entrance animation.
  const fadeUp = (delay: number): CSSProperties => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(16px)",
    transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
  });

  return (
    <div className="min-h-screen bg-base flex flex-col relative overflow-x-hidden">

      {/* Background: dot grid + top halo. */}
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

      {/* Drawer. */}
      <SessionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} sessions={sessions} loading={loading} t={t} onDelete={handleDeleteSession} isAnon={isAnon} onAnonNewChat={() => setQuotaModal({})} />

      {/* Topbar. */}
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
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Signed-in users keep the avatar; the logout action lives in the
           *  primary CTA slot below (replaced the former "New chat" button on
           *  the welcome page, per the directive to surface auth controls
           *  instead of session actions in the header). */}
          {user && !isAnon && user.avatar_url && (
            <img
              src={user.avatar_url}
              alt="avatar"
              className="w-6 h-6 md:w-7 md:h-7 rounded-full border border-base object-cover"
            />
          )}
          {/* Articles link: icon-only on mobile (book icon), text on desktop. */}
          <Link
            href="/articles"
            aria-label={t.articles}
            title={t.articles}
            className="flex items-center justify-center text-[11px] font-medium text-faint hover:text-md w-7 h-7 md:w-auto md:h-auto md:px-2 md:py-1 rounded-lg border border-subtle hover:border-base transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5 md:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span className="hidden md:inline">{t.articles}</span>
          </Link>
          <LangSelector />
          {/* Welcome page topbar CTA shows Sign in for unauthenticated + anon
           *  users, Logout only for genuinely signed-in users. New chat is
           *  started from the hero input below. */}
          {user && !isAnon ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[11px] md:text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 md:px-3 py-1 md:py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
            >
              <svg className="w-3 md:w-3.5 h-3 md:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {t.logout}
            </button>
          ) : (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-1.5 text-[11px] md:text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 md:px-3 py-1 md:py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
            >
              {t.signIn}
            </button>
          )}
        </div>
      </header>

      {/* Main body. */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-6 py-16 gap-12 overflow-y-auto">

        {/* ── Hero ── */}
        <div style={fadeUp(0)} className="flex flex-col items-center gap-5 text-center w-full max-w-[640px]">
          {/* Icon + halo. */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-xl bg-indigo-500/20 scale-110" />
            <div className="relative w-14 h-14 rounded-2xl bg-surface border border-base flex items-center justify-center shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_8px_32px_rgba(0,0,0,0.15)]">
              <svg className="w-6 h-6 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
              </svg>
            </div>
          </div>

          <h1 className="font-serif text-[26px] font-medium text-hi tracking-tight leading-tight">{t.welcomeTitle}</h1>

          {/* Home input box — same width as the chat page main column. */}
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

        {/* ── Pin demo — the demo already includes the "two bad options" copy
             plus the pin solution, so the Why / How sections are intentionally
             omitted to avoid duplication. Wrapper sets w-full because the
             parent main uses items-center, which otherwise shrinks this child
             to its intrinsic content width and the demo collapses. ── */}
        <div style={fadeUp(60)} className="w-full max-w-[1100px]">
          {/* Desktop ≥md uses full PinDemo (2-col + right graph); mobile gets a
              compact vertical version that fits 380px-wide phone viewports. */}
          <div className="hidden md:block">
            <PinDemo />
          </div>
          <div className="md:hidden flex justify-center">
            <MobilePinDemo />
          </div>
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
