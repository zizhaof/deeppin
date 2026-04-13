"use client";
// app/chat/[sessionId]/page.tsx

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSession, getMessages, createThread, getSuggestions } from "@/lib/api";
import { sendMessageStream, sendSearchStream } from "@/lib/sse";
import { useThreadStore } from "@/stores/useThreadStore";
import type { ThreadSide } from "@/stores/useThreadStore";
import { useT, useLangStore } from "@/stores/useLangStore";
import MessageList from "@/components/MainThread/MessageList";
import InputBar from "@/components/MainThread/InputBar";
import PinMenu from "@/components/PinMenu";
import type { SelectionInfo } from "@/components/PinMenu";
import PinStartDialog from "@/components/PinStartDialog";
import type { PinDialogInfo } from "@/components/PinStartDialog";
import type { AnchorRange } from "@/components/MainThread/MessageBubble";
import PinRoll from "@/components/SubThread/PinRoll";
import type { ThreadCardItem } from "@/components/SubThread/SideColumn";
import ThreadNav from "@/components/Layout/ThreadNav";
import ThreadTree from "@/components/Layout/ThreadTree";
import MergeOutput from "@/components/MergeOutput";

/**
 * 检测用户输入是否需要实时联网搜索。
 *
 * 双轨匹配：
 *   A. 强信号领域词 — 词本身就意味着需要实时数据（股价、天气、热搜…）
 *   B. 显式查询动作词 — 用户明确提出"查/搜/找"的意图（查一下、帮我搜…）
 * 任意一轨命中即触发。
 */
function needsRealtime(text: string): boolean {
  const t = text.toLowerCase();
  return REALTIME_STRONG.test(t) || REALTIME_ACTION.test(t);
}

/** A: 强信号领域词 — 单独出现就代表需要实时数据，误判率低 */
const REALTIME_STRONG = new RegExp(
  [
    // 金融
    "股价", "股市", "行情", "涨跌", "涨幅", "跌幅",
    "汇率", "外汇", "期货",
    "油价", "原油价格", "黄金价格",
    "比特币", "以太坊", "加密货币", "btc", "eth", "usdt",
    "纳斯达克", "道琼斯", "标普500", "恒生指数", "上证指数", "深证",
    "a股", "港股", "美股",
    "ipo",

    // 天气（带明确实时含义，避免"温度"这类物理概念词）
    "天气预报", "今天天气", "明天天气", "后天天气",
    "台风", "暴雨预警", "寒潮预警", "高温预警",
    "pm2\\.5", "空气质量指数", "aqi",

    // 新闻
    "热搜", "头条新闻", "突发新闻", "最新新闻",

    // 体育
    "比分", "赛果", "积分榜", "今日赛程",

    // 英文强信号
    "stock price", "share price", "exchange rate",
    "weather forecast", "breaking news",
    "bitcoin price", "crypto price", "live score",
  ]
    .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "i",
);

/** B: 显式查询动作词 — 用户主动提出"查/搜"的意图 */
const REALTIME_ACTION = new RegExp(
  [
    // 中文：足够具体的动作短语，避免"搜索算法"、"找个方法"等误判
    "查一下", "查查", "帮我查", "帮忙查", "查询一下", "麻烦查",
    "搜一下", "搜搜", "帮我搜", "搜索一下",
    "找一下.*信息", "找一下.*资料", "找一下.*数据",
    "查一查", "查下",

    // 英文
    "look up", "search for", "can you search", "find out",
    "what is the current", "what's the current", "what's the latest",
  ]
    .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "i",
);

/** 客户端瞬时生成占位追问，供弹窗立即展示，稍后由 LLM 结果替换 */
function makePlaceholders(anchorText: string): string[] {
  const short = anchorText.slice(0, 12);
  return [
    `请详细解释「${short}」`,
    `「${short}」有哪些应用场景？`,
    `「${short}」的优缺点是什么？`,
  ];
}

export default function ChatPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const t = useT();
  const toggleLang = useLangStore((s) => s.toggle);
  const lang = useLangStore((s) => s.lang);

  const {
    threads,
    activeThreadId,
    messagesByThread,
    streamingByThread,
    unreadCounts,
    threadSides,
    anchorTextTops,
    suggestions,
    navHistory,
    navIndex,
    setThreads,
    navigateTo,
    navigateBack,
    navigateForward,
    pinThread,
    setSuggestions,
    consumeSuggestion,
    setMessages,
    appendChunk,
    finalizeStream,
    addUserMessage,
    updateThreadTitle,
    statusByThread,
    setStreamStatus,
  } = useThreadStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webSearch, setWebSearch] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [pinDialog, setPinDialog] = useState<PinDialogInfo | null>(null);
  /** 立即传给 PinRoll，触发卡片聚焦动画（第一个悬浮线程） */
  const [hoverThreadId, setHoverThreadId] = useState<string | null>(null);
  /** 统一引导线：悬浮时显示的线程 ID 列表（hover-only） */
  const [cardGuide, setCardGuide] = useState<string[] | null>(null);
  /** 卡片展开动画结束后才显示 SVG（避免动画中出现错误位置的线） */
  const [svgReady, setSvgReady] = useState(false);
  const anchorGuideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardGuideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 线程切换下拉
  // messageId → 相对主滚动容器顶部的 top 偏移（px）
  const [messagePositions, setMessagePositions] = useState<Record<string, number>>({});
  // 主内容区的 scrollTop
  const [scrollTop, setScrollTop] = useState(0);

  // ── refs ────────────────────────────────────────────────────────
  // drawableAreaRef：SVG 引导线所在的容器（不含 InputBar）
  const drawableAreaRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const leftCardsRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement>>({});
  const [sideMetrics, setSideMetrics] = useState({ offset: 0, height: 600, mainHeight: 600 });

  const mainThread = threads.find((t) => t.parent_thread_id === null);
  const activeThread = activeThreadId ? threads.find((t) => t.id === activeThreadId) : null;
  const activeMessages = activeThreadId ? (messagesByThread[activeThreadId] ?? []) : [];
  const streamingText = activeThreadId ? streamingByThread[activeThreadId] : undefined;
  const activeStatus = activeThreadId ? (statusByThread[activeThreadId] ?? "") : "";
  const isStreaming = streamingText !== undefined || !!activeStatus;
  const activeSuggestions = activeThreadId ? (suggestions[activeThreadId] ?? []) : [];

  // 有内容时才显示侧边栏（欢迎页隐藏）
  const hasContent =
    activeMessages.length > 0 ||
    streamingText !== undefined ||
    Object.values(messagesByThread).some((msgs) => msgs && msgs.length > 0);

  // ── 初始化 ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const session = await getSession(sessionId);
        if (cancelled) return;
        setThreads(session.threads ?? []);

        const allThreads = session.threads ?? [];
        const main = allThreads.find((t) => t.parent_thread_id === null);
        if (main) navigateTo(main.id);

        await Promise.all(
          allThreads.map(async (t) => {
            try {
              const msgs = await getMessages(t.id);
              if (!cancelled) setMessages(t.id, msgs);
            } catch {
              // 单个线程加载失败不影响其他（messagesByThread 已在 setThreads 时初始化为 []）
            }
          })
        );
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 切换线程时懒加载消息 ────────────────────────────────────────
  useEffect(() => {
    if (!activeThreadId) return;
    const msgs = messagesByThread[activeThreadId];
    // undefined 表示从未加载（新线程不走这里，pinThread 已初始化为 []）
    if (msgs !== undefined) return;
    getMessages(activeThreadId)
      .then((m) => setMessages(activeThreadId, m))
      .catch(() => {});
  }, [activeThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 消息位置测量 ────────────────────────────────────────────────
  const updatePositions = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const newPos: Record<string, number> = {};
    for (const [id, el] of Object.entries(messageRefs.current)) {
      if (el) {
        newPos[id] = el.getBoundingClientRect().top - containerTop + container.scrollTop;
      }
    }
    setMessagePositions((prev) => {
      const keys = new Set([...Object.keys(prev), ...Object.keys(newPos)]);
      for (const k of keys) {
        if (prev[k] !== newPos[k]) return newPos;
      }
      return prev;
    });
  }, []);

  const measureSideMetrics = useCallback(() => {
    if (!scrollContainerRef.current || !leftCardsRef.current) return;
    const scrollRect = scrollContainerRef.current.getBoundingClientRect();
    const sideRect = leftCardsRef.current.getBoundingClientRect();
    setSideMetrics({
      offset: scrollRect.top - sideRect.top,
      height: sideRect.height,
      mainHeight: scrollRect.height,
    });
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(measureSideMetrics);
    return () => cancelAnimationFrame(id);
  }, [loading, measureSideMetrics]);

  useEffect(() => {
    window.addEventListener("resize", measureSideMetrics);
    return () => window.removeEventListener("resize", measureSideMetrics);
  }, [measureSideMetrics]);

  const messageCount = activeMessages.length;
  useEffect(() => {
    updatePositions();
  }, [messageCount, updatePositions]);

  const handleMessageRef = useCallback((messageId: string, el: HTMLDivElement | null) => {
    if (el) messageRefs.current[messageId] = el;
    else delete messageRefs.current[messageId];
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    updatePositions();
  }, [updatePositions]);

  // ── 发送消息 ────────────────────────────────────────────────────
  // content = AI 看到的完整内容；display = 气泡里显示的文字（含附件标签，可选）
  const handleSend = async (content: string, display?: string) => {
    if (!activeThreadId || isStreaming) return;
    addUserMessage(activeThreadId, display ?? content);
    setStreamStatus(activeThreadId, "正在处理…");
    const threadId = activeThreadId;

    // 手动开启 或 自动检测到实时数据需求
    const useSearch = webSearch || needsRealtime(content);

    if (useSearch) {
      await sendSearchStream(
        content,
        (chunk) => appendChunk(threadId, chunk),
        (fullText) => finalizeStream(threadId, fullText, null),
        (msg) => { finalizeStream(threadId, `[错误] ${msg}`); setError(msg); },
        (text) => setStreamStatus(threadId, text),
      );
    } else {
      await sendMessageStream(
        threadId,
        content,
        (chunk) => appendChunk(threadId, chunk),
        (fullText, messageId) => finalizeStream(threadId, fullText, messageId),
        (msg) => { finalizeStream(threadId, `[错误] ${msg}`); setError(msg); },
        (tid, title) => updateThreadTitle(tid, title),
        (text) => setStreamStatus(threadId, text),
      );
    }
  };

  const handleSendSuggestion = useCallback((threadId: string, question: string) => {
    consumeSuggestion(threadId, question);
    addUserMessage(threadId, question);
    setStreamStatus(threadId, "正在处理…");
    sendMessageStream(
      threadId,
      question,
      (chunk) => appendChunk(threadId, chunk),
      (fullText, messageId) => finalizeStream(threadId, fullText, messageId),
      (msg) => finalizeStream(threadId, `[错误] ${msg}`),
      undefined,
      (text) => setStreamStatus(threadId, text),
    );
  }, [consumeSuggestion, addUserMessage, appendChunk, finalizeStream, setStreamStatus]);

  // ── 点击锚点进入子线程 ──────────────────────────────────────────
  const handleAnchorClick = useCallback((threadId: string) => {
    navigateTo(threadId);
  }, [navigateTo]);

  // ── 切换线程时清除残留引导线 ─────────────────────────────────────
  useEffect(() => {
    setCardGuide(null);
    setHoverThreadId(null);
  }, [activeThreadId]);

  // ── 卡片展开动画结束后才允许渲染 SVG（PinRoll transition: 200ms） ─
  useEffect(() => {
    setSvgReady(false);
    if (!cardGuide || cardGuide.length === 0) return;
    const t = setTimeout(() => setSvgReady(true), 130);
    return () => clearTimeout(t);
  }, [cardGuide]);

  // ── 悬浮锚点：聚焦卡片 + 立即画引导线（支持多线程） ─────────────
  const handleAnchorHover = useCallback((threadIds: string[], _rect: DOMRect | null) => {
    if (anchorGuideTimer.current) clearTimeout(anchorGuideTimer.current);
    if (threadIds.length > 0) {
      setHoverThreadId(threadIds[0]);
      setCardGuide(threadIds);
    } else {
      setHoverThreadId(null);
      setCardGuide(null);
    }
  }, []);

  // ── 针卡片 hover：立即画针→锚点引导线 ──────────────────────────
  const handleCardHover = useCallback((threadId: string | null) => {
    if (cardGuideTimer.current) clearTimeout(cardGuideTimer.current);
    setCardGuide(threadId ? [threadId] : null);
  }, []);

  // ── 插针 ────────────────────────────────────────────────────────
  const handleTextSelect = useCallback(
    (text: string, messageId: string, rect: DOMRect, side: "left" | "right", startOffset: number, endOffset: number) => {
      const container = scrollContainerRef.current;
      const centerY = rect.top + rect.height / 2;
      const anchorContentY = container
        ? centerY - container.getBoundingClientRect().top + container.scrollTop
        : centerY;

      setSelection({ text, messageId, rect, side, anchorContentY, startOffset, endOffset });
    },
    []
  );

  const handlePin = async (info: SelectionInfo) => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();

    if (!mainThread) return;

    const anchorTextTop = info.anchorContentY;

    // 前端已知父线程 depth，直接算出子线程 depth，省去后端一次 DB 查询
    const parentId = activeThreadId ?? mainThread.id;
    const parentDepth = threads.find((t) => t.id === parentId)?.depth ?? 0;

    try {
      const newThread = await createThread({
        session_id: sessionId,
        parent_thread_id: parentId,
        anchor_text: info.text,
        anchor_message_id: info.messageId === "__streaming__" ? undefined : info.messageId,
        side: info.side as "left" | "right",
        anchor_start_offset: info.startOffset,
        anchor_end_offset: info.endOffset,
        depth: parentDepth + 1,
      });
      pinThread(newThread, info.side as ThreadSide, anchorTextTop);

      const threadId = newThread.id;

      // 立刻用占位符展示弹窗，用户无需等待 LLM
      const placeholders = makePlaceholders(info.text);
      setSuggestions(threadId, placeholders);
      setPinDialog({ threadId, anchorText: info.text, suggestions: placeholders, loading: true });

      // 后台等 LLM 完成（_generate_and_patch 约 500-800ms），追加真实建议
      setTimeout(() => {
        getSuggestions(threadId).then((questions) => {
          if (questions.length === 0) return;
          // 占位符保留，AI 建议追加在后面（去重）
          const merged = [...placeholders, ...questions.filter((q) => !placeholders.includes(q))];
          setSuggestions(threadId, merged);
          // 仅当弹窗仍为该线程时才更新，避免重新打开已关闭的弹窗
          setPinDialog((prev) =>
            prev?.threadId === threadId
              ? { ...prev, suggestions: merged, loading: false }
              : prev
          );
        });
      }, 750);
    } catch (e) {
      setError(String(e));
    }
  };

  // ── rollItems（当前激活线程的直接子针） ─────────────────────────
  const rollItems: ThreadCardItem[] = [];
  for (const thr of threads) {
    if (thr.parent_thread_id !== activeThreadId) continue;
    if (!threadSides[thr.id]) continue;

    const anchorTop =
      anchorTextTops[thr.id] ??
      (thr.anchor_message_id ? (messagePositions[String(thr.anchor_message_id)] ?? 0) : 0);

    rollItems.push({
      thread: thr,
      messages: messagesByThread[thr.id] ?? [],
      streamingText: streamingByThread[thr.id],
      statusText: statusByThread[thr.id],
      suggestions: suggestions[thr.id] ?? [],
      unreadCount: unreadCounts[thr.id] ?? 0,
      anchorTop,
    });
  }
  {
    const parentMsgs = activeThreadId ? (messagesByThread[activeThreadId] ?? []) : [];
    const msgOrder: Record<string, number> = {};
    parentMsgs.forEach((m, i) => { msgOrder[m.id.toLowerCase()] = i; });
    rollItems.sort((a, b) => {
      const ai = a.thread.anchor_message_id != null ? (msgOrder[a.thread.anchor_message_id.toLowerCase()] ?? 9999) : 9999;
      const bi = b.thread.anchor_message_id != null ? (msgOrder[b.thread.anchor_message_id.toLowerCase()] ?? 9999) : 9999;
      if (ai !== bi) return ai - bi;
      const aStart = a.thread.anchor_start_offset;
      const bStart = b.thread.anchor_start_offset;
      if (aStart != null && bStart != null && aStart !== bStart) return aStart - bStart;
      if (aStart != null && bStart == null) return -1;
      if (aStart == null && bStart != null) return 1;
      const aEnd = a.thread.anchor_end_offset;
      const bEnd = b.thread.anchor_end_offset;
      if (aEnd != null && bEnd != null && aEnd !== bEnd) return aEnd - bEnd;
      if (aEnd != null && bEnd == null) return -1;
      if (aEnd == null && bEnd != null) return 1;
      return new Date(a.thread.created_at).getTime() - new Date(b.thread.created_at).getTime();
    });
  }

  // ── 锚点高亮数据（全线程，不只主线） ───────────────────────────
  const anchorsByMessage: Record<string, AnchorRange[]> = {};
  for (const thr of threads) {
    if (!thr.anchor_message_id || !thr.anchor_text) continue;
    const mid = String(thr.anchor_message_id);
    if (!anchorsByMessage[mid]) anchorsByMessage[mid] = [];
    anchorsByMessage[mid].push({ text: thr.anchor_text, threadId: thr.id, side: thr.side as "left" | "right" | undefined });
  }

  // 子线程（插针）数量，供 MergeOutput 面板显示
  const pinCount = threads.filter((t) => t.depth > 0).length;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-500 text-sm">{t.loading}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-red-400 text-sm">{t.errorPrefix}{error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      <ThreadNav
        threads={threads}
        activeThreadId={activeThreadId}
        canBack={navIndex > 0}
        canForward={navIndex < navHistory.length - 1}
        onBack={navigateBack}
        onForward={navigateForward}
        onSelect={navigateTo}
        lang={lang}
        onToggleLang={toggleLang}
      />

      {/* drawable area — SVG 在此范围内，不包含 InputBar，避免引导线污染输入框 */}
      <div ref={drawableAreaRef} className="flex flex-1 min-h-0 overflow-hidden relative">

        {/* 左侧：子问题面板 */}
        {hasContent && (
          <div className={`${rollItems.length > 0 ? "flex-[1]" : "w-8"} min-w-0 border-r border-zinc-800 flex flex-col transition-[width,flex] duration-200`}>
            {rollItems.length > 0 && (
              <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0 flex items-center">
                <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex-1">
                  {t.subQuestions}
                </h2>
              </div>
            )}
            <div ref={leftCardsRef} className="flex-1 overflow-hidden">
              <PinRoll
                items={rollItems}
                activeThreadId={activeThreadId}
                mainScrollTop={scrollTop}
                mainHeight={sideMetrics.mainHeight}
                rollHeight={sideMetrics.height}
                focusThreadId={hoverThreadId}
                focusThreadIds={cardGuide ?? undefined}
                onCardHover={handleCardHover}
                onSelectThread={navigateTo}
                onSendSuggestion={handleSendSuggestion}
              />
            </div>
          </div>
        )}

        {/* 中间：主对话 */}
        <div className="flex-[3.5] flex flex-col min-w-0 relative">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto scrollbar-thin"
            onScroll={handleScroll}
          >
            <MessageList
              messages={activeMessages}
              streamingText={streamingText}
              statusText={activeStatus}
              anchorsByMessage={anchorsByMessage}
              suggestions={activeSuggestions}
              anchorText={activeThread?.anchor_text}
              onMessageRef={handleMessageRef}
              onTextSelect={handleTextSelect}
              onAnchorClick={handleAnchorClick}
              onAnchorHover={handleAnchorHover}
              onSendSuggestion={(q) => activeThreadId && handleSendSuggestion(activeThreadId, q)}
            />
          </div>
        </div>

        {/* 右侧：概览面板 */}
        {hasContent && (
          <div className="flex-[1] min-w-0 border-l border-zinc-800 flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0 flex items-center gap-2">
              <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex-1">
                {t.overview}
              </h2>
              <span className="text-[9px] text-zinc-600 select-none">{threads.length}</span>
              {pinCount > 0 && (
                <button
                  onClick={() => setShowMerge(true)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
                  title="合并输出 / Merge output"
                >
                  🔀
                </button>
              )}
            </div>
            <ThreadTree
              threads={threads}
              activeThreadId={activeThreadId}
              unreadCounts={unreadCounts}
              messagesByThread={messagesByThread}
              onSelect={navigateTo}
            />
          </div>
        )}

        {/* 引导线 SVG：仅悬停时显示，cardGuide 列表中的每条线程都画一条曲线 */}
        {/* svgReady 在卡片展开动画结束后变为 true，确保坐标基于最终位置 */}
        {svgReady && (() => {
          const container = drawableAreaRef.current;
          if (!container || !cardGuide || cardGuide.length === 0) return null;
          const base = container.getBoundingClientRect();
          const toLocal = (vx: number, vy: number) => ({ x: vx - base.left, y: vy - base.top });

          const paths = cardGuide.flatMap((threadId) => {
            const cardEl = container.querySelector(`[data-thread-id="${threadId}"]`);
            // ~= 匹配 data-anchor-thread-ids 空格分隔列表中的某个词
            const markEl = container.querySelector(`[data-anchor-thread-ids~="${threadId}"]`);
            if (!cardEl || !markEl) return [];

            const cr = cardEl.getBoundingClientRect();
            const mr = markEl.getBoundingClientRect();
            const p1 = toLocal(cr.right, cr.top + cr.height / 2);
            const p2 = toLocal(mr.left, mr.top + mr.height / 2);
            const dx = Math.abs(p2.x - p1.x);

            return [(
              <g key={threadId}>
                <path
                  d={`M ${p1.x} ${p1.y} C ${p1.x + dx * 0.45} ${p1.y}, ${p2.x - dx * 0.45} ${p2.y}, ${p2.x} ${p2.y}`}
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth={1.5}
                  opacity={0.75}
                />
                <circle cx={p1.x} cy={p1.y} r="2" fill="#818cf8" opacity={0.75} />
                <circle cx={p2.x} cy={p2.y} r="2" fill="#818cf8" opacity={0.75} />
              </g>
            )];
          });

          if (!paths.length) return null;
          return (
            <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%", zIndex: 40 }}>
              {paths}
            </svg>
          );
        })()}
      </div>

      {/* InputBar 在 drawable area 之外，SVG 引导线不会覆盖此处 */}
      {/* 始终用相同的 flex 比例让输入框对齐中间主视图，无论有无侧栏 */}
      <div className="flex">
        <div className="flex-[1] flex-shrink-0" />
        <div className="flex-[3.5] min-w-0">
          <InputBar
            sessionId={sessionId}
            onSend={handleSend}
            disabled={isStreaming || !activeThreadId}
            webSearch={webSearch}
            onWebSearchToggle={setWebSearch}
          />
        </div>
        <div className="flex-[1] flex-shrink-0" />
      </div>

      <PinMenu
        selection={selection}
        onPin={handlePin}
        onClose={() => setSelection(null)}
      />

      <PinStartDialog
        info={pinDialog}
        onSend={(threadId, question) => handleSendSuggestion(threadId, question)}
        onClose={() => setPinDialog(null)}
      />

      {showMerge && (
        <MergeOutput
          sessionId={sessionId}
          pinCount={pinCount}
          onClose={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}
