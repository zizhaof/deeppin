"use client";
// components/Mobile/MobileChatLayout.tsx
// 移动端三面板布局：左下角 / 右下角按钮切换面板，无滑动手势

import { useState, useCallback, useMemo } from "react";
import type { Thread, Message } from "@/lib/api";
import type { ThreadCardItem } from "@/components/SubThread/SideColumn";
import type { AnchorRange } from "@/components/MainThread/MessageBubble";
import ThreadTree from "@/components/Layout/ThreadTree";
import MergeTreeCanvas from "@/components/MergeTreeCanvas";
import MessageList from "@/components/MainThread/MessageList";
import InputBar from "@/components/MainThread/InputBar";
import { useT } from "@/stores/useLangStore";

const PANEL_PINS = 0;
const PANEL_CHAT = 1;
const PANEL_TREE = 2;

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
  threads: Thread[];
  activeThreadId: string | null;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigateTo: (threadId: string) => void;
  onOpenSessions: () => void;

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

  rollItems: ThreadCardItem[];
  unreadCounts: Record<string, number>;
  messagesByThread: Record<string, Message[]>;

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
  /** 右面板视图：列表（dots）或节点图（canvas） */
  const [treeView, setTreeView] = useState<"dots" | "canvas">("dots");

  /** MergeTreeCanvas 需要的 selected set（全选） */
  const allSelected = useMemo(() => new Set(threads.map((t) => t.id)), [threads]);

  const navigateAndReturnToChat = useCallback(
    (threadId: string) => {
      onNavigateTo(threadId);
      setPanelIdx(PANEL_CHAT);
    },
    [onNavigateTo]
  );

  // ── 面板标题 ─────────────────────────────────────────────────────────
  const activeTitle =
    activeThread?.parent_thread_id === null
      ? activeThread?.title ?? t.mainThread
      : activeThread?.title ??
        (activeThread?.anchor_text
          ? activeThread.anchor_text.slice(0, 28) +
            (activeThread.anchor_text.length > 28 ? "…" : "")
          : t.subThread);

  const panelTitle =
    panelIdx === PANEL_PINS
      ? `子问题 (${rollItems.length})`
      : panelIdx === PANEL_TREE
      ? `线程树 (${threads.length})`
      : activeTitle;

  // ── CSS transform：三面板横向排列 ────────────────────────────────────
  const basePercent = -((panelIdx * 100) / 3);
  const transformStyle: React.CSSProperties = {
    transform: `translateX(${basePercent.toFixed(4)}%)`,
    transition: "transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  };

  return (
    // fixed inset-0：钉死在可见视口，不随地址栏显隐或文档滚动移动
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-base">
      {/* ── 顶部导航栏 ── */}
      <header className="h-12 border-b border-subtle bg-base flex items-center px-3 gap-2 flex-shrink-0 z-20 select-none">
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

        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-semibold text-md truncate px-2">{panelTitle}</p>
        </div>

        {/* 右上角：当在对话视图时显示面板切换徽章 */}
        {panelIdx === PANEL_CHAT && rollItems.length > 0 && (
          <button
            onClick={() => setPanelIdx(PANEL_PINS)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-950/30 border border-indigo-500/25 text-indigo-400 active:bg-indigo-950/50 transition-colors flex-shrink-0"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="5" r="2" />
              <circle cx="5" cy="12" r="2" />
              <circle cx="14" cy="9" r="2" />
            </svg>
            <span className="text-[11px] font-semibold">{rollItems.length}</span>
          </button>
        )}
      </header>

      {/* ── 三面板滑动容器 ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          className="flex h-full"
          style={{ width: "300%", ...transformStyle }}
        >
          {/* ── 左面板：子问题概览 ── */}
          <div className="flex flex-col h-full overflow-hidden select-none" style={{ width: "33.333%" }}>
            {rollItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
                <div className="w-12 h-12 rounded-2xl bg-surface border border-subtle flex items-center justify-center">
                  <svg className="w-5 h-5 text-ph" viewBox="0 0 24 24" fill="currentColor">
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
          <div className="flex flex-col h-full overflow-hidden" style={{ width: "33.333%" }}>
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
                onAnchorClick={onAnchorClick}
                onAnchorHover={onAnchorHover}
                onSendSuggestion={onSendSuggestion}
              />
            </div>
          </div>

          {/* ── 右面板：线程树概览 ── */}
          <div className="flex flex-col h-full overflow-hidden select-none" style={{ width: "33.333%" }}>
            {/* 列表 / 节点图 切换 */}
            <div className="flex-shrink-0 flex items-center gap-1 px-3 pt-2 pb-1">
              <div className="flex items-center gap-0.5 bg-glass rounded-lg p-0.5">
                <button
                  onClick={() => setTreeView("dots")}
                  className={`flex items-center gap-1 px-2 h-6 rounded-md transition-colors ${
                    treeView === "dots" ? "bg-surface text-md shadow-sm" : "text-ph"
                  }`}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none" />
                  </svg>
                  <span className="text-[10px] font-medium">列表</span>
                </button>
                <button
                  onClick={() => setTreeView("canvas")}
                  className={`flex items-center gap-1 px-2 h-6 rounded-md transition-colors ${
                    treeView === "canvas" ? "bg-surface text-md shadow-sm" : "text-ph"
                  }`}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
                    <path d="M12 7v4M12 11l-5 6M12 11l5 6" />
                  </svg>
                  <span className="text-[10px] font-medium">节点图</span>
                </button>
              </div>
              <span className="text-[9px] text-ph tabular-nums ml-1">{threads.length}</span>
            </div>

            {/* 视图内容 */}
            <div className="flex-1 min-h-0 relative">
              {treeView === "dots" ? (
                <ThreadTree
                  threads={threads}
                  activeThreadId={activeThreadId}
                  unreadCounts={unreadCounts}
                  messagesByThread={messagesByThread}
                  onSelect={(threadId) => navigateAndReturnToChat(threadId)}
                />
              ) : (
                <MergeTreeCanvas
                  threads={threads}
                  selected={allSelected}
                  activeThreadId={activeThreadId}
                  onToggle={(threadId) => navigateAndReturnToChat(threadId)}
                  compact
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 底部区域：InputBar（仅对话面板）+ 左右切换按钮 ── */}
      <div className="flex-shrink-0">
        {/* InputBar 仅在对话面板显示 */}
        {panelIdx === PANEL_CHAT && (
          <InputBar
            sessionId={sessionId}
            onSend={onSend}
            disabled={isStreaming || !activeThreadId}
            webSearch={webSearch}
            onWebSearchToggle={onWebSearchToggle}
          />
        )}

        {/* 左下 / 右下切换按钮 */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3 bg-base border-t border-subtle/40" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          {/* 左按钮 */}
          {panelIdx !== PANEL_PINS ? (
            <button
              onClick={() => setPanelIdx(panelIdx - 1)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-subtle active:bg-glass transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-xs text-dim">
                {panelIdx === PANEL_CHAT ? (
                  <span className="flex items-center gap-1">
                    子问题
                    {rollItems.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-indigo-500/80 text-white text-[9px] flex items-center justify-center font-semibold">
                        {rollItems.length > 9 ? "9+" : rollItems.length}
                      </span>
                    )}
                  </span>
                ) : (
                  "对话"
                )}
              </span>
            </button>
          ) : (
            <div className="w-20" /> /* 占位，保持右按钮对齐 */
          )}

          {/* 中间面板指示点 */}
          <div className="flex items-center gap-1.5">
            {[PANEL_PINS, PANEL_CHAT, PANEL_TREE].map((p) => (
              <div
                key={p}
                className={`rounded-full transition-all duration-200 ${
                  panelIdx === p ? "w-4 h-1.5 bg-indigo-400" : "w-1.5 h-1.5 bg-ph/30"
                }`}
              />
            ))}
          </div>

          {/* 右按钮 */}
          {panelIdx !== PANEL_TREE ? (
            <button
              onClick={() => setPanelIdx(panelIdx + 1)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-subtle active:bg-glass transition-colors"
            >
              <span className="text-xs text-dim">
                {panelIdx === PANEL_CHAT ? "线程树" : "对话"}
              </span>
              <svg className="w-3.5 h-3.5 text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="w-20" /> /* 占位，保持左按钮对齐 */
          )}
        </div>
      </div>
    </div>
  );
}
