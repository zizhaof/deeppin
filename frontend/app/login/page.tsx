"use client";
// app/login/page.tsx — 登录页

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // Page redirects to Google; no need to reset loading
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      {/* 背景光晕 */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] blur-[80px] opacity-50 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.15) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8 px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center shadow-[0_0_0_1px_rgba(99,102,241,0.2)]">
            <svg
              className="w-5 h-5 text-indigo-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-zinc-100 tracking-tight">
            Deeppin
          </span>
        </div>

        {/* 卡片 */}
        <div className="w-full max-w-[320px] rounded-2xl border border-white/[0.08] bg-zinc-900/60 backdrop-blur p-6 flex flex-col gap-5">
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-200">欢迎回来</p>
            <p className="text-xs text-zinc-500 mt-1">
              登录以保存和管理你的深度对话
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl border border-white/10 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition-colors text-sm font-medium text-zinc-200"
          >
            {/* Google SVG logo */}
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {loading ? "跳转中…" : "用 Google 账号继续"}
          </button>
        </div>

        <p className="text-[11px] text-zinc-600 text-center max-w-[260px]">
          登录即代表你同意 Deeppin 的服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}
