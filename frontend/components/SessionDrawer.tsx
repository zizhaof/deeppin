"use client";
// Session-history side drawer (shared between the home and chat pages).
// Paper-palette restyle — Fraunces session titles, mono dates, ink-on-paper
// delete affordance that only shows on hover.

import { useRouter } from "next/navigation";
import type { Session } from "@/lib/api";
import type { T } from "@/lib/i18n";

export function formatSessionDate(iso: string, yesterday: string, daysAgo: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return yesterday;
  if (days < 7) return `${days} ${daysAgo}`;
  return d.toLocaleDateString();
}

interface Props {
  open: boolean;
  onClose: () => void;
  sessions: Session[];
  loading: boolean;
  currentSessionId?: string;
  t: T;
  onDelete?: (sessionId: string) => void;
  /** Anon flag — clicks on "new chat" delegate to onAnonNewChat (typically a sign-in modal). */
  isAnon?: boolean;
  /** Handler for anon "new chat" clicks; falls through to default create if omitted (and may hit 402). */
  onAnonNewChat?: () => void;
}

export default function SessionDrawer({ open, onClose, sessions, loading, currentSessionId, t, onDelete, isAnon = false, onAnonNewChat }: Props) {
  const router = useRouter();

  const handleNewChat = () => {
    onClose();
    if (isAnon && onAnonNewChat) {
      onAnonNewChat();
      return;
    }
    const id = crypto.randomUUID();
    router.push(`/chat/${id}`);
  };

  return (
    <>
      {/* Backdrop. */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 [background:rgba(27,26,23,0.45)] backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer. */}
      <div
        className={`fixed left-0 top-0 h-full w-[300px] z-50 flex flex-col transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--card)", borderRight: "1px solid var(--rule)" }}
      >
        {/* Header. */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--ink-3)" }}>
            {t.recentSessions}
          </p>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--ink-4)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--paper-2)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--ink-4)"; }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List. */}
        <div className="flex-1 overflow-y-auto py-2 px-2 scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center gap-1.5 py-10">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-[5px] h-[5px] rounded-full animate-bounce"
                  style={{ background: "var(--ink-5)", animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
                />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-[12px] text-center py-10" style={{ color: "var(--ink-4)" }}>
              {t.noSessions}
            </p>
          ) : (
            <div className="flex flex-col gap-[2px]">
              {sessions.map((s) => {
                const isActive = s.id === currentSessionId;
                return (
                  <button
                    key={s.id}
                    onClick={() => { onClose(); router.push(`/chat/${s.id}`); }}
                    className="group w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-md transition-colors relative"
                    style={{
                      background: isActive ? "var(--ink)" : "transparent",
                    }}
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--paper-2)"; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span
                      className="flex-shrink-0 mt-[5px] w-[3px] h-[28px] rounded-[2px]"
                      style={{ background: isActive ? "var(--paper)" : "var(--ink-5)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-serif text-[14px] font-medium leading-tight truncate"
                        style={{ color: isActive ? "var(--paper)" : "var(--ink)" }}
                      >
                        {s.title ?? t.untitled}
                      </p>
                      <p
                        className="font-mono text-[10px] mt-1 truncate"
                        style={{ color: isActive ? "var(--ink-5)" : "var(--ink-4)" }}
                      >
                        {formatSessionDate(s.created_at, t.yesterday, t.daysAgo)}
                      </p>
                    </div>
                    {onDelete && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                        className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                        style={{ color: isActive ? "var(--ink-5)" : "var(--ink-4)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#b84a5b"; (e.currentTarget as HTMLElement).style.background = "color-mix(in oklch, #b84a5b 10%, transparent)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = isActive ? "var(--ink-5)" : "var(--ink-4)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        aria-label={t.deleteAccount}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: new-chat button. */}
        <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: "1px solid var(--rule)" }}>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[12.5px] font-medium transition-colors"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--accent)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--ink)")}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t.newChat}
          </button>
        </div>
      </div>
    </>
  );
}
