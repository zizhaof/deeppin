"use client";
// app/page.tsx — 会话列表首页

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listSessions, createSession } from "@/lib/api";
import type { Session } from "@/lib/api";
import { useT, useLangStore } from "@/stores/useLangStore";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString();
}

export default function HomePage() {
  const router = useRouter();
  const t = useT();
  const toggleLang = useLangStore((s) => s.toggle);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleNewChat = async () => {
    setCreating(true);
    try {
      const session = await createSession();
      router.push(`/chat/${session.id}`);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* 顶栏 */}
      <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/8 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-zinc-200 tracking-tight">Deeppin</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="text-[11px] font-medium text-zinc-600 hover:text-zinc-300 px-2 py-1 rounded-lg border border-white/8 hover:border-white/15 transition-colors"
          >
            {t.toggleLang}
          </button>
          <button
            onClick={handleNewChat}
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
      <main className="flex-1 max-w-xl mx-auto w-full px-6 py-10">

        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-600 text-sm">
            {t.loading}
          </div>
        ) : sessions.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/8 flex items-center justify-center">
              <svg className="w-6 h-6 text-indigo-400/60" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
              </svg>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-zinc-300 text-sm font-medium">{t.noSessions}</p>
              <p className="text-zinc-600 text-xs">选中任意文字，插针深挖</p>
            </div>
            <button
              onClick={handleNewChat}
              disabled={creating}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg transition-colors font-medium"
            >
              {t.newChat}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-medium text-zinc-600 uppercase tracking-wider">{t.recentSessions}</p>
            </div>
            <div className="flex flex-col gap-0.5">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => router.push(`/chat/${session.id}`)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-900 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 group-hover:bg-zinc-800 border border-white/5 flex items-center justify-center flex-shrink-0 transition-colors">
                    <svg className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 group-hover:text-zinc-100 truncate transition-colors">
                      {session.title ?? t.untitled}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-700 flex-shrink-0">
                    {formatDate(session.created_at)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
