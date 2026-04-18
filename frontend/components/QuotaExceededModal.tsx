"use client";
// components/QuotaExceededModal.tsx — 匿名额度用尽或创建 session 超限时的引导弹窗
// Modal shown when an anonymous user hits the trial quota (402) or session cap (403):
// primary action is Google sign-in via linkIdentity so the conversation carries over.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase";
import { useT } from "@/stores/useLangStore";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 可选：后端返回的 detail.message；没有则用 i18n 默认文案。 */
  message?: string;
  /** "quota" = 20 轮用尽；"session" = 1 session 上限。影响标题 / 描述文案。 */
  variant?: "quota" | "session";
}

export default function QuotaExceededModal({ open, onClose, message, variant = "quota" }: Props) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const title = variant === "session" ? t.anonSessionLimitTitle : t.anonQuotaTitle;
  const desc = message || (variant === "session" ? t.anonSessionLimitDesc : t.anonQuotaDesc);

  // linkIdentity 将当前匿名用户与 Google 账号绑定，保留 user_id；RLS 下历史消息自动可见。
  // linkIdentity binds the current anonymous user to Google while preserving user_id,
  // so existing messages stay visible under RLS without a data migration.
  const handleSignIn = async () => {
    const supabase = createClient();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo },
    });
    if (error) alert(error.message);
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface border border-base rounded-2xl shadow-2xl shadow-black/40 p-6">
        <h2 className="text-base font-semibold text-hi mb-2">{title}</h2>
        <p className="text-sm text-lo leading-relaxed mb-5 whitespace-pre-line">{desc}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-faint hover:text-md rounded-lg transition-colors"
          >
            {t.later}
          </button>
          <button
            onClick={handleSignIn}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
          >
            {t.signInGoogle}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
