"use client";
// components/Mobile/MobileChatLayout.tsx
//
// 移动端布局重构 —— claude.ai-style：单页面满屏对话 + 左 drawer（sessions）
// + 右 drawer（list/graph + merge/flatten）；不再有左右滑动的三面板。
//
// Mobile layout — claude.ai-style: single full-screen chat + left drawer
// (sessions + pinned bottom for lang / account) + right drawer (list/graph
// view + pinned bottom for merge / flatten). No more horizontal panel swipe.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Thread, Message, Session } from "@/lib/api";
import type { ThreadCardItem } from "@/components/SubThread/types";
import type { AnchorRange } from "@/components/MainThread/MessageBubble";
import ThreadTree from "@/components/Layout/ThreadTree";
import ThreadGraph from "@/components/Layout/ThreadGraph";
import MessageList from "@/components/MainThread/MessageList";
import InputBar from "@/components/MainThread/InputBar";
import LangSelector from "@/components/LangSelector";
import { formatSessionDate } from "@/components/SessionDrawer";
import { useT } from "@/stores/useLangStore";

// ── Props ────────────────────────────────────────────────────────────────
export interface MobileChatLayoutProps {
  threads: Thread[];
  activeThreadId: string | null;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigateTo: (threadId: string) => void;

  // Sessions drawer
  sessions: Session[];
  sessionsLoading: boolean;
  onOpenSessions: () => void;
  onDeleteSession?: (sid: string) => void;
  onNewChat: () => void;

  // Active conversation
  activeMessages: Message[];
  streamingText?: string;
  activeStatus: string;
  anchorsByMessage: Record<string, AnchorRange[]>;
  activeSuggestions: string[];
  activeThread: Thread | null;
  userAvatarUrl: string | null;

  onMessageRef: (messageId: string, el: HTMLDivElement | null) => void;
  onTextSelect: (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => void;
  onAnchorClick: (threadId: string) => void;
  onAnchorHover: (threadIds: string[], rect: DOMRect | null) => void;
  onSendSuggestion: (question: string) => void;

  // Right drawer (overview)
  rollItems: ThreadCardItem[];
  unreadCounts: Record<string, number>;
  messagesByThread: Record<string, Message[]>;
  pinCount: number;
  onOpenMerge: () => void;
  onOpenFlatten: () => void;

  // Composer
  sessionId: string;
  onSend: (content: string, display?: string, ragFilename?: string) => void;
  isStreaming: boolean;
  webSearch: boolean;
  onWebSearchToggle: (v: boolean) => void;

  // Account / auth
  isAnon?: boolean;
  onSignIn?: () => void;
  onDeleteAccount?: () => void;

  /** 请求删除当前激活线程（连同所有后代）——由父层弹 DeleteThreadDialog 确认。
   *  主线被删 = 删除整个 session。
   *  Request to delete the active thread and its entire subtree — parent opens
   *  DeleteThreadDialog to confirm. Deleting the main thread wipes the session. */
  onDeleteActive?: (threadId: string) => void;
}

// ── Brand mark — 跟桌面顶栏一套（paper 方块 + 深墨蓝星 + Fraunces）
function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-6 h-6 rounded-md flex items-center justify-center"
        style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--accent)" }}>
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
        </svg>
      </span>
      <span className="font-serif text-[16px]" style={{ color: "var(--ink)" }}>
        Deeppin
      </span>
    </div>
  );
}

// ── Icon button helper
function IconButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-9 h-9 flex items-center justify-center rounded-md transition-colors active:scale-95"
      style={{ color: "var(--ink-3)" }}
      onTouchStart={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--paper-2)"; }}
      onTouchEnd={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

// ── Drawer wrapper（左/右抽屉公用）/ Reusable drawer panel ───────────────
function Drawer({
  open,
  onClose,
  side,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  children: React.ReactNode;
}) {
  // 锁住 body 滚动 & ESC 关闭 / Lock body scroll + ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 [background:rgba(27,26,23,0.45)] transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden
      />
      {/* 抽屉本体 */}
      <aside
        className={`fixed top-0 bottom-0 z-50 w-[86vw] max-w-[340px] flex flex-col transition-transform duration-250 ease-out`}
        style={{
          background: "var(--card)",
          [side]: 0,
          borderLeft: side === "right" ? "1px solid var(--rule)" : undefined,
          borderRight: side === "left" ? "1px solid var(--rule)" : undefined,
          transform: open
            ? "translateX(0)"
            : side === "left"
              ? "translateX(-100%)"
              : "translateX(100%)",
        }}
      >
        {children}
      </aside>
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────
export default function MobileChatLayout({
  threads,
  activeThreadId,
  canBack,
  onBack,
  onNavigateTo,
  sessions,
  sessionsLoading,
  onOpenSessions,
  onDeleteSession,
  onNewChat,
  activeMessages,
  streamingText,
  activeStatus,
  anchorsByMessage,
  activeSuggestions,
  activeThread,
  userAvatarUrl,
  onMessageRef,
  onTextSelect,
  onAnchorClick,
  onAnchorHover,
  onSendSuggestion,
  rollItems,
  unreadCounts,
  messagesByThread,
  pinCount,
  onOpenMerge,
  onOpenFlatten,
  sessionId,
  onSend,
  isStreaming,
  webSearch,
  onWebSearchToggle,
  isAnon = false,
  onSignIn,
  onDeleteAccount,
  onDeleteActive,
}: MobileChatLayoutProps) {
  const t = useT();
  const router = useRouter();

  void rollItems; // 旧三栏的 props，保留兼容；新布局没用到 / kept for compat

  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [overviewView, setOverviewView] = useState<"list" | "graph">("graph");
  // 选区模式：默认 false（普通滚动）；按下「Select」切到 true，触发后自动回 false
  // Select-mode toggle — default off (normal scroll); flips on, captures one
  // selection, auto-flips back off so the user can scroll normally again.
  const [selectMode, setSelectMode] = useState(false);

  /** 在 onTextSelect 之后自动关掉选区模式（这样不需要用户手动再点一次按钮） */
  /* Wrap parent's onTextSelect so we auto-exit select mode once a selection lands. */
  const wrappedTextSelect = useCallback(
    (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => {
      onTextSelect(text, messageId, rect, startOffset, endOffset);
      setSelectMode(false);
    },
    [onTextSelect],
  );

  // 打开左抽屉 = 触发 sessions 懒加载 / Opening left drawer triggers session list lazy-load
  const openLeftDrawer = useCallback(() => {
    setLeftOpen(true);
    onOpenSessions();
  }, [onOpenSessions]);

  const unreadThreadIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const [id, n] of Object.entries(unreadCounts)) {
      if (n > 0) s.add(id);
    }
    return s;
  }, [unreadCounts]);

  // 当前线程标题（topbar 中央显示）
  const activeTitle =
    activeThread?.parent_thread_id === null
      ? activeThread?.title ?? t.mainThread
      : activeThread?.title ??
        (activeThread?.anchor_text
          ? activeThread.anchor_text.slice(0, 22) +
            (activeThread.anchor_text.length > 22 ? "…" : "")
          : t.subThread);

  return (
    // fixed inset-0：钉死在可见视口
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: "var(--paper)" }}>
      {/* ── Topbar：hamburger | 中央 brand+breadcrumb | 右 panel 按钮 ── */}
      <header
        className="h-12 flex items-center px-3 gap-2 flex-shrink-0 z-20 select-none"
        style={{ background: "var(--paper)", borderBottom: "1px solid var(--rule)" }}
      >
        <IconButton onClick={openLeftDrawer} ariaLabel={t.recentSessions}>
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </IconButton>

        {canBack && (
          <IconButton onClick={onBack} ariaLabel={t.back}>
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </IconButton>
        )}

        <div className="flex-1 min-w-0 flex items-center justify-center">
          {/* 当前线程标题；子线程时显示 sub title，主线时显示 brand */}
          {activeThread?.parent_thread_id === null ? (
            <BrandMark />
          ) : (
            <p
              className="font-serif text-[14px] truncate px-2"
              style={{ color: "var(--ink)" }}
            >
              {activeTitle}
            </p>
          )}
        </div>

        {/* 删除当前线程按钮（主线 = 删 session）——放在 overview 按钮前。
            Delete-current-thread button (main thread = wipe session) — sits
            before the overview trigger. */}
        {onDeleteActive && activeThreadId && (
          <button
            onClick={() => onDeleteActive(activeThreadId)}
            aria-label={t.deleteThread}
            title={t.deleteThread}
            className="w-9 h-9 flex items-center justify-center rounded-md active:scale-95 transition-colors"
            style={{ color: "var(--danger, #dc2626)" }}
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
            </svg>
          </button>
        )}

        {/* 右上角：overview drawer 触发按钮，带未读 badge */}
        <button
          onClick={() => setRightOpen(true)}
          aria-label={t.overview}
          className="relative w-9 h-9 flex items-center justify-center rounded-md active:scale-95 transition-colors"
          style={{ color: "var(--ink-3)" }}
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="2"/>
            <circle cx="5" cy="19" r="2"/>
            <circle cx="19" cy="19" r="2"/>
            <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
          </svg>
          {unreadThreadIdSet.size > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
              style={{ background: "var(--accent)" }}
              aria-hidden
            />
          )}
        </button>
      </header>

      {/* ── 子线程时显示锚点上下文 / Anchor context strip in sub-threads ── */}
      {activeThread?.anchor_text && activeThread.parent_thread_id !== null && (
        <div
          className="flex-shrink-0 mx-3 mt-2 px-3 py-1.5 rounded-lg text-[11.5px] leading-snug line-clamp-2"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid color-mix(in oklch, var(--accent) 18%, transparent)",
            color: "var(--accent)",
          }}
        >
          <span className="mr-1.5" style={{ color: "color-mix(in oklch, var(--accent) 60%, var(--ink-4))" }}>›</span>
          {activeThread.anchor_text}
        </div>
      )}

      {/* ── 主对话区 ── */}
      <div className="flex-1 overflow-y-auto min-h-0 relative">
        <MessageList
          messages={activeMessages}
          streamingText={streamingText}
          statusText={activeStatus}
          anchorsByMessage={anchorsByMessage}
          unreadThreadIds={unreadThreadIdSet}
          mobileSelectActive={selectMode}
          suggestions={activeSuggestions}
          anchorText={activeThread?.anchor_text}
          userAvatarUrl={userAvatarUrl}
          onMessageRef={onMessageRef}
          onTextSelect={wrappedTextSelect}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onSendSuggestion={onSendSuggestion}
        />

        {/* ── Select-mode FAB / 浮动「选区」按钮 ──
            按一下：进入选区模式 → 整个气泡禁用 native scroll 在 AI 文字上，
            手指 down→drag→up 直接圈选；释放后弹 PinMenu。Selection 抓到后自动退出。
            Floating select-mode toggle: tap once → bubble text becomes
            finger-trackable; touch-down→drag→release captures the selection;
            PinMenu fires; mode auto-exits. */}
        <button
          onClick={() => setSelectMode((v) => !v)}
          className="fixed bottom-[88px] right-4 z-30 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full transition-transform active:scale-95"
          style={{
            background: selectMode ? "var(--accent)" : "var(--ink)",
            color: "var(--paper)",
            boxShadow: "0 8px 24px rgba(27,26,23,0.22)",
          }}
          aria-pressed={selectMode}
          aria-label="Selection mode"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            {/* 「I-beam + 高亮」图标 */}
            <path d="M7 5h4M7 19h4M9 5v14" />
            <path d="M14 8h6M14 16h6" strokeWidth={2.5} />
          </svg>
          <span className="font-mono text-[11px] uppercase tracking-wider">
            {selectMode ? t.cancel : t.selectMode}
          </span>
        </button>
      </div>

      {/* ── 输入栏 ── */}
      <div className="flex-shrink-0">
        <InputBar
          sessionId={sessionId}
          onSend={onSend}
          disabled={isStreaming || !activeThreadId}
          webSearch={webSearch}
          onWebSearchToggle={onWebSearchToggle}
          isAnon={isAnon}
        />
      </div>

      {/* ── 左 drawer：sessions + 固定底部（lang / account） ── */}
      <Drawer open={leftOpen} onClose={() => setLeftOpen(false)} side="left">
        {/* head */}
        <div
          className="flex items-center justify-between px-4 h-12 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <BrandMark />
          <button
            onClick={() => setLeftOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-md active:scale-95 transition-colors"
            style={{ color: "var(--ink-3)" }}
            aria-label="close"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* sessions list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
          <div
            className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 mb-2"
            style={{ color: "var(--ink-3)" }}
          >
            {t.recentSessions}
          </div>
          {sessionsLoading ? (
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
                const isActive = s.id === sessionId;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setLeftOpen(false);
                      router.push(`/chat/${s.id}`);
                    }}
                    className="group w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-md transition-colors relative active:scale-[0.99]"
                    style={{ background: isActive ? "var(--ink)" : "transparent" }}
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
                    {onDeleteSession && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                        className="w-7 h-7 rounded-md flex items-center justify-center"
                        style={{ color: isActive ? "var(--ink-5)" : "var(--ink-4)" }}
                        aria-label={t.deleteAccount}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* New chat */}
        <div className="px-3 pt-2 pb-1 flex-shrink-0" style={{ borderTop: "1px solid var(--rule)" }}>
          <button
            onClick={() => { setLeftOpen(false); onNewChat(); }}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-md text-[13px] font-medium transition-colors active:scale-[0.99]"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t.newChat}
          </button>
        </div>

        {/* 底部固定栏：lang + account */}
        <div className="px-3 py-3 flex-shrink-0 flex items-center justify-between gap-2" style={{ borderTop: "1px solid var(--rule-soft)" }}>
          {/* Lang selector — 直接 inline 一个 select */}
          <div className="flex-1 min-w-0">
            <LangSelector />
          </div>
          {/* Account button (anon → sign in，已登录 → delete account) */}
          {isAnon && onSignIn ? (
            <button
              onClick={() => { setLeftOpen(false); onSignIn(); }}
              className="h-[30px] px-3 rounded-md text-[12px] font-medium transition-colors"
              style={{ background: "var(--ink)", color: "var(--paper)" }}
            >
              {t.signIn}
            </button>
          ) : onDeleteAccount ? (
            <button
              onClick={() => { setLeftOpen(false); onDeleteAccount(); }}
              className="h-[30px] px-3 rounded-md text-[11.5px] transition-colors"
              style={{ color: "#b84a5b", border: "1px solid var(--rule)" }}
              aria-label={t.deleteAccount}
            >
              {t.deleteAccount}
            </button>
          ) : null}
        </div>
      </Drawer>

      {/* ── 右 drawer：list/graph + 底部固定 merge/flatten ── */}
      <Drawer open={rightOpen} onClose={() => setRightOpen(false)} side="right">
        {/* head */}
        <div
          className="flex items-center justify-between px-4 h-12 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "var(--ink-3)" }}
          >
            {t.overview}
          </span>
          <button
            onClick={() => setRightOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-md active:scale-95 transition-colors"
            style={{ color: "var(--ink-3)" }}
            aria-label="close"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* tabs：list / graph，default graph */}
        <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
          <button
            onClick={() => setOverviewView("list")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors"
            style={{
              color: overviewView === "list" ? "var(--ink)" : "var(--ink-4)",
              borderBottom: `2px solid ${overviewView === "list" ? "var(--ink)" : "transparent"}`,
            }}
          >
            {t.viewList}
          </button>
          <button
            onClick={() => setOverviewView("graph")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors"
            style={{
              color: overviewView === "graph" ? "var(--ink)" : "var(--ink-4)",
              borderBottom: `2px solid ${overviewView === "graph" ? "var(--ink)" : "transparent"}`,
            }}
          >
            {t.viewGraph}
          </button>
        </div>

        {/* body — list or graph */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {overviewView === "list" ? (
            <ThreadTree
              threads={threads}
              activeThreadId={activeThreadId}
              unreadCounts={unreadCounts}
              messagesByThread={messagesByThread}
              onSelect={(id) => {
                setRightOpen(false);
                onNavigateTo(id);
              }}
            />
          ) : (
            <ThreadGraph
              threads={threads}
              activeThreadId={activeThreadId}
              unreadCounts={unreadCounts}
              messagesByThread={messagesByThread}
              onSelect={(id) => {
                setRightOpen(false);
                onNavigateTo(id);
              }}
            />
          )}
        </div>

        {/* 底部固定栏 — Merge / Flatten */}
        <div className="px-3 py-3 flex-shrink-0 flex items-center gap-2" style={{ borderTop: "1px solid var(--rule)" }}>
          <button
            onClick={() => { setRightOpen(false); onOpenMerge(); }}
            disabled={pinCount === 0}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-md text-[12.5px] font-medium transition-colors disabled:opacity-40"
            style={{
              background: pinCount > 0 ? "var(--ink)" : "var(--paper-2)",
              color: pinCount > 0 ? "var(--paper)" : "var(--ink-4)",
            }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
              <path d="M4 4l8 9M20 4l-8 9m0 0v7" />
            </svg>
            {t.mergeButton}
          </button>
          <button
            onClick={() => { setRightOpen(false); onOpenFlatten(); }}
            disabled={pinCount === 0}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-md text-[12.5px] font-medium transition-colors disabled:opacity-40"
            style={{
              background: "var(--paper-2)",
              color: "var(--ink-2)",
              border: "1px solid var(--rule)",
            }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
            {t.flattenButton}
          </button>
        </div>
      </Drawer>

    </div>
  );
}
