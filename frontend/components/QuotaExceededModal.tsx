"use client";
// Modal shown when an anonymous user hits the trial quota (402) or session cap (403).
// Primary action is Google sign-in via linkIdentity so the conversation carries over.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase";
import { useT } from "@/stores/useLangStore";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional backend `detail.message`; falls back to the i18n default copy. */
  message?: string;
  /** "quota" = 20-turn trial exhausted; "session" = 1-session cap hit. Drives title/description copy. */
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
        className="fixed inset-0 [background:rgba(27,26,23,0.45)] backdrop-blur-sm z-40"
        onClick={onClose}
      />
      <div
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--rule)",
          boxShadow: "0 24px 64px rgba(27,26,23,0.18)",
        }}
      >
        <div className="px-6 pt-5 pb-4 flex items-start gap-3" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
          {/* Brand badge. */}
          <span
            className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full grid place-items-center"
            style={{ background: "var(--accent)", color: "var(--paper)" }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
            </svg>
          </span>
          <div className="flex-1">
            <h2 className="font-serif text-[17px] font-medium" style={{ color: "var(--ink)" }}>{title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line" style={{ color: "var(--ink-3)" }}>
              {desc}
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end px-6 py-3" style={{ borderTop: "1px solid var(--rule-soft)" }}>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-[12.5px] font-medium rounded-md transition-colors"
            style={{ color: "var(--ink-3)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--paper-2)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--ink-3)"; }}
          >
            {t.later}
          </button>
          <button
            onClick={handleSignIn}
            className="px-4 py-1.5 text-[12.5px] font-medium rounded-md inline-flex items-center gap-2 transition-colors"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--accent)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--ink)")}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" opacity="0.95" />
            </svg>
            {t.signInGoogle}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
