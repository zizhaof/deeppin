"use client";
// components/Mobile/MobileChatLayout.tsx
// 移动端三面板滑动布局：
//   向右滑 → 左面板（当前子问题概览）
//   主视图 → 对话（含锚点高亮，点击锚点跳转并回到主视图）
//   向左滑 → 右面板（概览线程树，点击节点跳转并回到主视图）

import { useRef, useState, useEffect, useCallback } from "react";
import type { Thread, Message } from "@/lib/api";
import type { ThreadCardItem } from "@/components/SubThread/SideColumn";
import type { AnchorRange } from "@/components/MainThread/MessageBubble";
import ThreadTree from "@/components/Layout/ThreadTree";
import MessageList from "@/components/MainThread/MessageList";
import InputBar from "@/components/MainThread/InputBar";
import { useT } from "@/stores/useLangStore";

const PANEL_PINS = 0;
const PANEL_CHAT = 1;
const PANEL_TREE = 2;

const SWIPE_THRESHOLD = 48; // px，触发面板切换的最小水平位移
const DIRECTION_LOCK_PX = 12; // px，超过此值才锁定方向

// ── 子问题卡片（移动端简化版） ────────────────────────────────────────
function MobilePinCard({
  item,
  isActive,
  onClick,
}: {
  item: ThreadCardItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const title = item.thread.title ?? item.thread.anchor_text?.slice(0, 40) ?? "子线程";
  const lastMsg = item.messages[item.messages.length - 1];
  const isStreaming = item.streamingText !== undefined;
  const preview = isStreaming
    ? (item.streamingText || "…").slice(0, 120)
    : item.statusText
    ? item.statusText
    : lastMsg?.content.slice(0, 120) ?? "";
  const hasAutoReply = item.messages.some((m) => m.role === "assistant");

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors active:scale-[0.98] ${
        isActive
          ? "border-indigo-500/40 bg-indigo-950/20"
          : "border-subtle bg-surface active:bg-glass"
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/60 flex-shrink-0" />
        <p
          className={`text-sm font-medium truncate flex-1 ${
            isActive ? "text-indigo-300" : "text-hi"
          }`}
        >
          {title}
        </p>
        {item.unreadCount > 0 && (
          <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-semibold flex-shrink-0">
            {item.unreadCount > 9 ? "9+" : item.unreadCount}
          </span>
        )}
      </div>
      {preview ? (
        <p
          className={`text-xs leading-relaxed line-clamp-2 ${
            isStreaming ? "text-indigo-400/70" : "text-faint"
          }`}
        >
          {preview}
          {isStreaming && (
            <span className="inline-block w-0.5 h-3 bg-indigo-400/70 animate-pulse ml-0.5 align-middle" />
          )}
        </p>
      ) : !hasAutoReply ? (
        <p className="text-xs text-ph italic">点击开始追问…</p>
      ) : null}
      {/* 建议追问（未回复时显示） */}
      {!hasAutoReply && !isStreaming && item.suggestions.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {item.suggestions.slice(0, 1).map((q, i) => (
            <p key={i} className="text-[10px] text-indigo-400/60 truncate">
              {q}
            </p>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Props ────────────────────────────────────────────────────────────────
export interface MobileChatLayoutProps {
  // 导航
  threads: Thread[];
  activeThreadId: string | null;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigateTo: (threadId: string) => void;
  onOpenSessions: () => void;

  // 消息
  activeMessages: Message[];
  streamingText?: string;
  activeStatus: string;
  anchorsByMessage: Record<string, AnchorRange[]>;
  activeSuggestions: string[];
  activeThread: Thread | null;
  userAvatarUrl: string | null;

  onMessageRef: (messageId: string, el: HTMLDivElement | null) => void;
  onTextSelect: (
    text: string,
    messageId: string,
    rect: DOMRect,
    startOffset: number,
    endOffset: number
  ) => void;
  onAnchorClick: (threadId: string) => void;
  onAnchorHover: (threadIds: string[], rect: DOMRect | null) => void;
  onSendSuggestion: (question: string) => void;

  // 子问题面板
  rollItems: ThreadCardItem[];
  unreadCounts: Record<string, number>;
  messagesByThread: Record<string, Message[]>;

  // InputBar
  sessionId: string;
  onSend: (content: string, display?: string, ragFilename?: string) => void;
  isStreaming: boolean;
  webSearch: boolean;
  onWebSearchToggle: (v: boolean) => void;
}

// ── 主组件 ───────────────────────────────────────────────────────────────
export default function MobileChatLayout({
  threads,
  activeThreadId,
  canBack,
  onBack,
  onNavigateTo,
  onOpenSessions,
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
  sessionId,
  onSend,
  isStreaming,
  webSearch,
  onWebSearchToggle,
}: MobileChatLayoutProps) {
  const t = useT();

  const [panelIdx, setPanelIdx] = useState(PANEL_CHAT);
  const panelIdxRef = useRef(PANEL_CHAT);
  const [dragOffset, setDragOffset] = useState(0); // px，跟随手指的偏移量
  const dragOffsetRef = useRef(0);

  // 同步 ref
  useEffect(() => {
    panelIdxRef.current = panelIdx;
  }, [panelIdx]);

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  // "h"=水平滑动锁定，"v"=垂直滚动锁定，null=未确定
  const directionRef = useRef<"h" | "v" | null>(null);

  const sliderRef = useRef<HTMLDivElement>(null);

  // 跳转并切换回主视图
  const navigateAndReturnToChat = useCallback(
    (threadId: string) => {
      onNavigateTo(threadId);
      setPanelIdx(PANEL_CHAT);
    },
    [onNavigateTo]
  );

  // ── 非被动 touchmove 监听（需要 preventDefault） ──────────────────────
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      directionRef.current = null;
      dragOffsetRef.current = 0;
    };

    const onMove = (e: TouchEvent) => {
      // 有文字选区时不触发面板滑动（移动端选文 handle 拖拽保护）
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;

      const dx = e.touches[0].clientX - touchStartXRef.current;
      const dy = e.touches[0].clientY - touchStartYRef.current;

      // 方向尚未确定时，超过阈值才锁定
      if (directionRef.current === null) {
        if (Math.abs(dx) > DIRECTION_LOCK_PX || Math.abs(dy) > DIRECTION_LOCK_PX) {
          directionRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        }
      }

      if (directionRef.current !== "h") return;

      e.preventDefault(); // 阻止系统滚动

      // 边缘阻尼：到达最左或最右面板时产生回弹阻力
      let offset = dx;
      const idx = panelIdxRef.current;
      if (idx === PANEL_PINS && dx > 0) {
        offset = Math.pow(Math.abs(dx), 0.55) * Math.sign(dx) * 0.6;
      } else if (idx === PANEL_TREE && dx < 0) {
        offset = Math.pow(Math.abs(dx), 0.55) * Math.sign(dx) * 0.6;
      }

      dragOffsetRef.current = offset;
      setDragOffset(offset);
    };

    const onEnd = () => {
      if (directionRef.current !== "h") {
        setDragOffset(0);
        dragOffsetRef.current = 0;
        return;
      }
      const delta = dragOffsetRef.current;
      const idx = panelIdxRef.current;

      if (delta > SWIPE_THRESHOLD && idx > PANEL_PINS) {
        setPanelIdx(idx - 1);
      } else if (delta < -SWIPE_THRESHOLD && idx < PANEL_TREE) {
        setPanelIdx(idx + 1);
      }

      setDragOffset(0);
      dragOffsetRef.current = 0;
      directionRef.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []); // panelIdx 通过 panelIdxRef 访问，无需加入依赖

  // ── 面包屑标题 ───────────────────────────────────────────────────────
  const activeTitle =
    activeThread?.parent_thread_id === null
      ? activeThread?.title ?? t.mainThread
      : activeThread?.title ??
        (activeThread?.anchor_text
          ? activeThread.anchor_text.slice(0, 28) +
            (activeThread.anchor_text.length > 28 ? "…" : "")
          : t.subThread);

  // ── 面板标题文字 ─────────────────────────────────────────────────────
  const panelTitle =
    panelIdx === PANEL_PINS
      ? `子问题 (${rollItems.length})`
      : panelIdx === PANEL_TREE
      ? `线程树 (${threads.length})`
      : activeTitle;

  // ── CSS transform：三面板横向排列，通过 translateX 切换 ──────────────
  // 容器宽度 = 300%（包含三个 100% 的面板）
  // 显示面板 n 需 translateX(-(n * 100 / 3)%)
  // 再叠加手指拖拽偏移（px）
  const basePercent = -((panelIdx * 100) / 3);
  const transformStyle: React.CSSProperties = {
    transform: `translateX(calc(${basePercent.toFixed(4)}% + ${dragOffset}px))`,
    transition:
      dragOffset === 0
        ? "transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
        : "none",
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-base">
      {/* ── 顶部导航栏 ── */}
      <header className="h-12 border-b border-subtle bg-base flex items-center px-3 gap-2 flex-shrink-0 z-20 select-none">
        {/* 菜单 / 会话列表 */}
        <button
          onClick={onOpenSessions}
          className="w-9 h-9 flex items-center justify-center rounded-xl active:bg-glass transition-colors flex-shrink-0"
          aria-label="所有对话"
        >
          <svg
            className="w-[18px] h-[18px] text-faint"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* 后退（有历史时显示） */}
        {canBack && (
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl active:bg-glass transition-colors flex-shrink-0"
            aria-label="返回"
          >
            <svg
              className="w-[18px] h-[18px] text-dim"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* 当前面板/线程标题 */}
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-semibold text-md truncate px-2">{panelTitle}</p>
        </div>

        {/* 面板指示器 + 点击切换 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 子问题徽章（在主视图时显示数量提示） */}
          {panelIdx === PANEL_CHAT && rollItems.length > 0 && (
            <button
              onClick={() => setPanelIdx(PANEL_PINS)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-950/30 border border-indigo-500/25 text-indigo-400 active:bg-indigo-950/50 transition-colors"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="5" cy="5" r="2" />
                <circle cx="5" cy="12" r="2" />
                <circle cx="14" cy="9" r="2" />
              </svg>
              <span className="text-[11px] font-semibold">{rollItems.length}</span>
            </button>
          )}
          {/* 三点面板指示器 */}
          <div className="flex items-center gap-1.5">
            {[PANEL_PINS, PANEL_CHAT, PANEL_TREE].map((p) => (
              <button
                key={p}
                onClick={() => setPanelIdx(p)}
                className={`rounded-full transition-all duration-200 ${
                  panelIdx === p
                    ? "w-5 h-2 bg-indigo-400"
                    : "w-2 h-2 bg-ph/40 active:bg-ph"
                }`}
                aria-label={
                  p === PANEL_PINS ? "子问题" : p === PANEL_CHAT ? "对话" : "线程树"
                }
              />
            ))}
          </div>
        </div>
      </header>

      {/* ── 滑动提示（仅主视图显示，首次使用引导） ── */}
      {panelIdx === PANEL_CHAT && (
        <div className="flex justify-between px-5 py-1 flex-shrink-0 pointer-events-none">
          <span className="text-[10px] text-ph/50">← 子问题</span>
          <span className="text-[10px] text-ph/50">线程树 →</span>
        </div>
      )}

      {/* ── 三面板滑动容器 ── */}
      <div ref={sliderRef} className="flex-1 min-h-0 overflow-hidden relative">
        <div
          className="flex h-full"
          style={{ width: "300%", ...transformStyle }}
        >
          {/* ── 左面板：子问题概览 ── */}
          <div
            className="flex flex-col overflow-hidden select-none"
            style={{ width: "33.333%" }}
          >
            {rollItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
                <div className="w-12 h-12 rounded-2xl bg-surface border border-subtle flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-ph"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
                  </svg>
                </div>
                <p className="text-sm text-ph text-center leading-relaxed">
                  选中 AI 回复中的文字，点击「插针」创建子线程
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {rollItems.map((item) => (
                  <MobilePinCard
                    key={item.thread.id}
                    item={item}
                    isActive={activeThreadId === item.thread.id}
                    onClick={() => navigateAndReturnToChat(item.thread.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── 中面板：主对话 ── */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ width: "33.333%" }}
          >
            {/* 子线程锚点提示条 */}
            {activeThread?.anchor_text && activeThread.parent_thread_id !== null && (
              <div className="flex-shrink-0 mx-4 mt-3 px-3 py-2 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-indigo-300/80 leading-snug line-clamp-2">
                <span className="text-indigo-400/50 mr-1">锚点 ›</span>
                {activeThread.anchor_text}
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0">
              <MessageList
                messages={activeMessages}
                streamingText={streamingText}
                statusText={activeStatus}
                anchorsByMessage={anchorsByMessage}
                suggestions={activeSuggestions}
                anchorText={activeThread?.anchor_text}
                userAvatarUrl={userAvatarUrl}
                onMessageRef={onMessageRef}
                onTextSelect={onTextSelect}
                onAnchorClick={(threadId) => {
                  // 点击锚点高亮：跳转到该子线程（留在主视图）
                  onAnchorClick(threadId);
                }}
                onAnchorHover={onAnchorHover}
                onSendSuggestion={onSendSuggestion}
              />
            </div>

            <InputBar
              sessionId={sessionId}
              onSend={onSend}
              disabled={isStreaming || !activeThreadId}
              webSearch={webSearch}
              onWebSearchToggle={onWebSearchToggle}
            />
          </div>

          {/* ── 右面板：线程树概览 ── */}
          <div
            className="flex flex-col overflow-hidden select-none"
            style={{ width: "33.333%" }}
          >
            <div className="flex-1 min-h-0">
              <ThreadTree
                threads={threads}
                activeThreadId={activeThreadId}
                unreadCounts={unreadCounts}
                messagesByThread={messagesByThread}
                onSelect={(threadId) => {
                  // 点击节点：切换线程并回到主视图
                  navigateAndReturnToChat(threadId);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
