"use client";
// components/SessionDrawer.tsx — 历史会话侧边抽屉（主页和对话页共用）

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
  /** 当前用户是否匿名；匿名点「新对话」时走 onAnonNewChat（通常弹登录引导）。
   *  Anon flag — clicks on "new chat" delegate to onAnonNewChat (typically a sign-in modal). */
  isAnon?: boolean;
  /** 匿名用户点「新对话」时的回调；不传则按默认逻辑新建（会撞 402）。
   *  Handler for anon "new chat" clicks; falls through to default create if omitted. */
  onAnonNewChat?: () => void;
}

export default function SessionDrawer({ open, onClose, sessions, loading, currentSessionId, t, onDelete, isAnon = false, onAnonNewChat }: Props) {
  const router = useRouter();

  // 对话中直接新建：生成 UUID → 跳 /chat/<id>，由目标页 init() 走 getSession→404→createSession 流程。
  // 不绕主页，避免打断「我正在某个对话里，想马上开新对话」的体感。
  // In-chat new session: pre-generate a UUID and jump straight to /chat/<id>.
  // The target page's init() handles the DB create on 404, so we skip the home-page detour.
  // 匿名用户先走父组件的 onAnonNewChat（展示登录引导），避免硬撞 1-session 上限。
  // Anon users delegate to onAnonNewChat (sign-in prompt) instead of hitting the 1-session cap.
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
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 [background:rgba(27,26,23,0.45)] backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* 抽屉 */}
      <div className={`fixed left-0 top-0 h-full w-72 z-50 bg-surface border-r border-subtle flex flex-col
        transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}>

        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-subtle flex-shrink-0">
          <p className="text-[10px] font-semibold text-faint uppercase tracking-[0.12em]">{t.recentSessions}</p>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-ph hover:text-md hover:bg-glass transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto py-2 px-2 scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center gap-1.5 py-10">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1 h-1 rounded-full bg-ph animate-bounce"
                  style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }} />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-ph text-center py-10">{t.noSessions}</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {sessions.map((s) => {
                const isActive = s.id === currentSessionId;
                return (
                  <button
                    key={s.id}
                    onClick={() => { onClose(); router.push(`/chat/${s.id}`); }}
                    className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-colors group relative cursor-pointer ${
                      isActive ? "bg-indigo-950/30 border border-indigo-500/15" : "hover:bg-glass border border-transparent"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isActive ? "bg-indigo-500/10 border-indigo-500/20" : "bg-elevated/60 border-subtle group-hover:bg-elevated"
                    }`}>
                      <svg className={`w-3 h-3 transition-colors ${isActive ? "text-indigo-400" : "text-faint group-hover:text-lo"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate transition-colors ${isActive ? "text-indigo-300 font-medium" : "text-lo group-hover:text-md"}`}>
                        {s.title ?? t.untitled}
                      </p>
                      <p className="text-[10px] text-ph mt-0.5">
                        {formatSessionDate(s.created_at, t.yesterday, t.daysAgo)}
                      </p>
                    </div>
                    {isActive && (
                      <div className="w-1 h-1 rounded-full bg-indigo-500/70 flex-shrink-0" />
                    )}
                    {onDelete && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-faint hover:text-red-400 transition-all"
                        aria-label="删除会话"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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

        {/* 底部：新对话按钮（对所有用户可见；匿名点击由父组件弹登录引导）
         *  New-chat button — visible to all; anon clicks trigger the sign-in prompt via parent */}
        <div className="px-3 py-3 border-t border-subtle flex-shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-dim hover:text-md hover:bg-glass border border-subtle hover:border-base transition-all"
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
