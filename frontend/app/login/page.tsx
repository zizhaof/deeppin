"use client";
// app/login/page.tsx — 登录页
// Paper-palette restyle: 暖纸底 + 卡片 + deep-ink 强调色；按钮更克制。
// Paper-palette restyle — warm paper background, card, deep-ink accent, calmer button.

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useT } from "@/stores/useLangStore";

export default function LoginPage() {
  const t = useT();
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // 成功时页面跳转到 Google，无需重置 loading
    // On success the page navigates to Google; on error reset so user can retry.
    if (error) {
      console.error("Google OAuth error:", error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: "var(--paper)" }}>
      {/* 背景 accent 光晕（很淡，呼应 hero 区）/ Subtle accent halo in the header. */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[640px] h-[320px] blur-[80px] opacity-35 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, var(--accent-soft) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8 px-6 w-full">
        {/* Brand — dot + Fraunces wordmark */}
        <div className="flex items-center gap-2.5">
          <span className="w-[10px] h-[10px] rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
          <span className="font-serif text-[22px] tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
            Deeppin
          </span>
        </div>

        {/* Sign-in card */}
        <div
          className="w-full max-w-[360px] rounded-2xl px-7 py-7 flex flex-col gap-5"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule)",
            boxShadow: "0 12px 40px rgba(27,26,23,0.08), 0 0 0 1px var(--rule-soft)",
          }}
        >
          <div className="text-center">
            <p className="font-serif text-[18px] font-medium" style={{ color: "var(--ink)" }}>
              {t.welcomeTitle}
            </p>
            <p className="text-[12px] leading-relaxed mt-1.5" style={{ color: "var(--ink-3)" }}>
              {t.welcomeSub}
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl disabled:opacity-50 transition-colors text-[13px] font-medium"
            style={{
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              color: "var(--ink)",
            }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.borderColor = "var(--ink-5)"; }}
            onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.borderColor = "var(--rule)"; }}
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {loading ? t.loading : t.signInGoogle}
          </button>
        </div>

        <p className="text-[11px] text-center max-w-[300px] leading-relaxed" style={{ color: "var(--ink-4)" }}>
          {t.signInTerms}
        </p>
      </div>
    </div>
  );
}
