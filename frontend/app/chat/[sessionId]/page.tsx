"use client";
// app/chat/[sessionId]/page.tsx

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getSession, getMessages, getAllMessages, createSession, createThread, getSuggestions, listSessions, deleteSession, flattenSession } from "@/lib/api";
import type { Session } from "@/lib/api";
import { sendMessageStream } from "@/lib/sse";
import { useThreadStore } from "@/stores/useThreadStore";
import { useT, useLangStore } from "@/stores/useLangStore";
import MessageList from "@/components/MainThread/MessageList";
import InputBar from "@/components/MainThread/InputBar";
import PinMenu from "@/components/PinMenu";
import type { SelectionInfo } from "@/components/PinMenu";
import PinStartDialog from "@/components/PinStartDialog";
import type { PinDialogInfo } from "@/components/PinStartDialog";
import type { AnchorRange } from "@/components/MainThread/MessageBubble";
import { clearActiveHighlight } from "@/components/MainThread/MessageBubble";
import PinRoll from "@/components/SubThread/PinRoll";
import type { ThreadCardItem } from "@/components/SubThread/SideColumn";
import ThreadNav from "@/components/Layout/ThreadNav";
import ThreadTree from "@/components/Layout/ThreadTree";
import MergeTreeCanvas from "@/components/MergeTreeCanvas";
import MergeOutput from "@/components/MergeOutput";
import SessionDrawer from "@/components/SessionDrawer";
import MobileChatLayout from "@/components/Mobile/MobileChatLayout";

/**
 * 检测用户输入是否需要实时联网搜索。
 *
 * 双轨匹配：
 *   A. 强信号领域词 — 词本身就意味着需要实时数据（股价、天气、热搜…）
 *   B. 显式查询动作词 — 用户明确提出"查/搜/找"的意图（查一下、帮我搜…）
 * 任意一轨命中即触发。
 */

/** 客户端瞬时生成占位追问，供弹窗立即展示，稍后由 LLM 结果替换 */
function makePlaceholders(anchorText: string): string[] {
  // 问题文本使用完整锚点，UI 显示由 CSS truncate 截断，发送给 AI 的内容不截断
  // Use full anchor text; CSS `truncate` handles visual clipping — never truncate what's sent to the AI
  return [
    `请详细解释「${anchorText}」`,
    `「${anchorText}」有哪些应用场景？`,
    `「${anchorText}」的优缺点是什么？`,
  ];
}

export default function ChatPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();
  const t = useT();
  const toggleLang = useLangStore((s) => s.toggle);
  const lang = useLangStore((s) => s.lang);

  const {
    threads,
    activeThreadId,
    messagesByThread,
    streamingByThread,
    unreadCounts,
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
  const [showSessions, setShowSessions] = useState(false);
  const [showFlattenConfirm, setShowFlattenConfirm] = useState(false);
  const [flattening, setFlattening] = useState(false);
  const [flattenToast, setFlattenToast] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [pinDialog, setPinDialog] = useState<PinDialogInfo | null>(null);
  /** 立即传给 PinRoll，触发卡片聚焦动画（第一个悬浮线程） */
  const [hoverThreadId, setHoverThreadId] = useState<string | null>(null);
  /** 统一引导线：悬浮时显示的线程 ID 列表（hover-only） */
  const [cardGuide, setCardGuide] = useState<string[] | null>(null);
  /** 卡片展开动画结束后才显示 SVG（避免动画中出现错误位置的线） */
  const [svgReady, setSvgReady] = useState(false);
  /** 右侧概览视图：dots（圆点树）或 list（文字列表） */
  const [rightView, setRightView] = useState<"dots" | "canvas">(() =>
    typeof window !== "undefined"
      ? ((localStorage.getItem("deeppin:right-view") as "dots" | "canvas") ?? "dots")
      : "dots"
  );
  const switchRightView = (v: "dots" | "canvas") => {
    setRightView(v);
    localStorage.setItem("deeppin:right-view", v);
  };

  // navigateTo 包装：记录上次访问的线程，下次进入 session 时恢复
  // Wrapper around navigateTo: saves last visited thread so it can be restored on next session entry
  const handleNavigateTo = useCallback((threadId: string) => {
    navigateTo(threadId);
    localStorage.setItem(`deeppin:last-thread:${sessionId}`, threadId);
  }, [navigateTo, sessionId]);

  // 扁平化：调用后端，重新加载 session（threads 列表只剩主线，主线消息按 preorder 重排）
  // Flatten: call backend, reload session (threads list collapses to main only, main messages reordered by preorder)
  const handleFlatten = useCallback(async () => {
    setFlattening(true);
    setFlattenToast(null);
    try {
      const result = await flattenSession(sessionId);
      const [refreshed, msgMap] = await Promise.all([
        getSession(sessionId),
        getAllMessages(sessionId),
      ]);
      const allThreads = refreshed.threads ?? [];
      setThreads(allThreads);
      for (const t of allThreads) {
        setMessages(t.id, msgMap[t.id] ?? []);
      }
      const main = allThreads.find((t) => t.parent_thread_id === null);
      if (main) {
        navigateTo(main.id);
        localStorage.setItem(`deeppin:last-thread:${sessionId}`, main.id);
      }
      setShowFlattenConfirm(false);
      setFlattenToast(
        result.already_flattened
          ? t.flattenAlready
          : t.flattenSuccess.replace("{count}", String(result.flattened_thread_count)),
      );
    } catch (e) {
      setFlattenToast(t.flattenError + (e instanceof Error ? e.message : t.unknownError));
    } finally {
      setFlattening(false);
    }
  }, [sessionId, setThreads, setMessages, navigateTo, t]);

  // toast 自动消失 / Auto-dismiss the flatten toast
  useEffect(() => {
    if (!flattenToast) return;
    const id = setTimeout(() => setFlattenToast(null), 3500);
    return () => clearTimeout(id);
  }, [flattenToast]);

  // 侧栏宽度（可拖拽调整）
  const [leftW, setLeftW] = useState(() =>
    typeof window !== "undefined" ? Number(localStorage.getItem("deeppin:left-w")) || 200 : 200
  );
  const [rightW, setRightW] = useState(() =>
    typeof window !== "undefined" ? Number(localStorage.getItem("deeppin:right-w")) || 200 : 200
  );
  const MIN_SIDE = 120;
  // 上限 = 三栏 1:1:1 时每栏宽度，即窗口宽度的三分之一
  // Max = one-third of window width (the 1:1:1 equal-column layout)
  const maxSide = () => (typeof window !== "undefined" ? Math.floor(window.innerWidth / 3) : 640);

  const startResize = useCallback((side: "left" | "right", startX: number, startW: number) => {
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const next = Math.min(maxSide(), Math.max(MIN_SIDE, startW + (side === "left" ? delta : -delta)));
      if (side === "left") { setLeftW(next); localStorage.setItem("deeppin:left-w", String(next)); }
      else { setRightW(next); localStorage.setItem("deeppin:right-w", String(next)); }
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
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
  const scrollFrameRef = useRef<number | null>(null);
  const [sideMetrics, setSideMetrics] = useState({ offset: 0, height: 600, mainHeight: 600 });
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

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

  // ── 初始化（含 auth 检查）────────────────────────────────────────
  // Auth check is done inside init() so data fetches never race with auth
  useEffect(() => {
    let cancelled = false;
    async function init() {
      // 双保险：middleware 已处理，但 init 内也验证一次，确保数据请求不会在 auth 之前发出
      // Defense-in-depth: middleware already blocked unauthenticated access,
      // but checking here ensures data fetches never fire before auth is confirmed
      const supabase = createClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        router.push("/login");
        return;
      }
      setUserAvatarUrl(authSession.user.user_metadata?.avatar_url ?? null);

      try {
        // 若 session 尚未写入 DB（首页预热只生成了 UUID），先创建再加载。
        // If the session hasn't been persisted yet (prewarm only generated a UUID),
        // create it now with the pre-generated ID, then load normally.
        try {
          await getSession(sessionId);
        } catch {
          // 404（或其他错误）：用预生成的 sessionId 在 DB 中创建 session
          await createSession({ id: sessionId });
        }

        // session（含 threads）和全部消息并行加载，1 次网络往返
        // Load session (with threads) and all messages in parallel — 1 round-trip total
        const [session, messageMap] = await Promise.all([
          getSession(sessionId),
          getAllMessages(sessionId),
        ]);
        if (cancelled) return;

        const allThreads = session.threads ?? [];
        setThreads(allThreads);

        const main = allThreads.find((t) => t.parent_thread_id === null);
        const lastThreadId = localStorage.getItem(`deeppin:last-thread:${sessionId}`);
        const target = lastThreadId && allThreads.find((t) => t.id === lastThreadId)
          ? lastThreadId
          : main?.id;
        if (target) navigateTo(target);

        // 批量写入所有线程消息（O(1) 次请求，替代原来的 N 次串行请求）
        // Bulk-set all thread messages (O(1) requests, replaces the original N sequential requests)
        for (const t of allThreads) {
          if (cancelled) break;
          setMessages(t.id, messageMap[t.id] ?? []);
        }
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

  // ── 首页输入框跳转后自动发送待发消息 ──────────────────────────
  const pendingMsgSentRef = useRef(false);
  useEffect(() => {
    if (!activeThreadId || pendingMsgSentRef.current) return;
    // 校验：activeThreadId 必须属于当前 session，防止使用上一个 session 的残留 ID
    // Validate: activeThreadId must belong to the current session to guard against
    // stale Zustand state left over from the previous navigation.
    if (!threads.some(t => t.id === activeThreadId && t.session_id === sessionId)) return;
    const pending = sessionStorage.getItem("deeppin:pending-msg");
    if (!pending) return;
    sessionStorage.removeItem("deeppin:pending-msg");
    pendingMsgSentRef.current = true;
    handleSend(pending);
  }, [activeThreadId, threads]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const newTop = e.currentTarget.scrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      setScrollTop(newTop);
      updatePositions();
      scrollFrameRef.current = null;
    });
  }, [updatePositions]);

  // ── 发送消息 ────────────────────────────────────────────────────
  // content = AI 看到的完整内容；display = 气泡里显示的文字（含附件标签，可选）
  // ragFilename = 刚上传的 RAG 文件名，后端用于优先检索该文件的块
  //
  // 注意：所有消息都走 sendMessageStream（存库路径）。
  // 联网搜索由后端 classify_search_intent 自动判断，前端不再路由到无状态的 /api/search。
  // 这样确保所有对话（包括搜索类查询）都能持久化，刷新后不丢失。
  const handleSend = async (content: string, display?: string, ragFilename?: string) => {
    if (!activeThreadId || isStreaming) return;
    addUserMessage(activeThreadId, display ?? content);
    setStreamStatus(activeThreadId, t.processing);
    const threadId = activeThreadId;

    await sendMessageStream(
      threadId,
      content,
      (chunk) => appendChunk(threadId, chunk),
      (fullText, messageId, model) => finalizeStream(threadId, fullText, messageId, model),
      (msg) => { finalizeStream(threadId, `${t.streamError} ${msg}`); setError(msg); },
      (tid, title) => updateThreadTitle(tid, title),
      (text) => setStreamStatus(threadId, text),
      ragFilename,
    );
  };

  const handleSendSuggestion = useCallback((threadId: string, question: string) => {
    consumeSuggestion(threadId, question);
    addUserMessage(threadId, question);
    setStreamStatus(threadId, t.processing);
    sendMessageStream(
      threadId,
      question,
      (chunk) => appendChunk(threadId, chunk),
      (fullText, messageId, model) => finalizeStream(threadId, fullText, messageId, model),
      (msg) => finalizeStream(threadId, `${t.streamError} ${msg}`),
      undefined,
      (text) => setStreamStatus(threadId, text),
    );
  }, [consumeSuggestion, addUserMessage, appendChunk, finalizeStream, setStreamStatus]);

  // ── 点击锚点进入子线程 ──────────────────────────────────────────
  const handleAnchorClick = useCallback((threadId: string) => {
    handleNavigateTo(threadId);
  }, [handleNavigateTo]);

  // ── 打开 session 抽屉时懒加载列表 ──────────────────────────────
  const handleOpenSessions = useCallback(() => {
    setShowSessions(true);
    if (sessions.length === 0) {
      setSessionsLoading(true);
      listSessions()
        .then((s) => setSessions(s))
        .catch(() => {})
        .finally(() => setSessionsLoading(false));
    }
  }, [sessions.length]);

  const handleDeleteSession = useCallback(async (sid: string) => {
    if (!window.confirm(t.confirmDelete)) return;
    try {
      await deleteSession(sid);
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      // 如果删的是当前 session，跳回首页
      if (sid === sessionId) router.push("/");
    } catch (err) {
      alert(`${t.deleteError}${err instanceof Error ? err.message : t.unknownError}`);
    }
  }, [sessionId, t]);

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
    (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => {
      const container = scrollContainerRef.current;
      const centerY = rect.top + rect.height / 2;
      const anchorContentY = container
        ? centerY - container.getBoundingClientRect().top + container.scrollTop
        : centerY;

      setSelection({ text, messageId, rect, anchorContentY, startOffset, endOffset });
    },
    []
  );

  const handlePin = async (info: SelectionInfo) => {
    clearActiveHighlight();
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
        anchor_message_id: (info.messageId === "__streaming__" || info.messageId?.startsWith("local_")) ? undefined : info.messageId,
        anchor_start_offset: info.startOffset,
        anchor_end_offset: info.endOffset,
        depth: parentDepth + 1,
      });
      pinThread(newThread, anchorTextTop);

      const threadId = newThread.id;

      // 立刻用占位符展示弹窗，用户无需等待 LLM
      const placeholders = makePlaceholders(info.text);
      setSuggestions(threadId, placeholders);
      setPinDialog({ threadId, anchorText: info.text, suggestions: placeholders, loading: true });

      // /suggest 后端已做 server-side 轮询（cache_hit → poll_hit → sync_gen，最长 3s）
      // 合并策略：3 模板 + 最多 3 条 LLM 追问；归一化字面去重，避免 sync_gen 兜底时
      //          跟占位符撞车导致重复项（LLM 正常生成的上下文追问基本不会跟模板撞）。
      // Backend /suggest polls server-side (up to 3s). Merge 3 placeholders with up to 3 LLM
      // follow-ups; dedup on normalized form to avoid collisions with sync_gen's template fallback.
      const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      getSuggestions(threadId).then((questions) => {
        let next = placeholders;
        if (questions.length > 0) {
          const seen = new Set(placeholders.map(normalize));
          const fresh = questions.filter((q) => !seen.has(normalize(q)));
          next = [...placeholders, ...fresh].slice(0, 6);
          setSuggestions(threadId, next);
        }
        setPinDialog((prev) =>
          prev?.threadId === threadId
            ? { ...prev, suggestions: next, loading: false }
            : prev
        );
      });
    } catch (e) {
      setError(String(e));
    }
  };

  // ── rollItems（当前激活线程的直接子针） ─────────────────────────
  const rollItems: ThreadCardItem[] = [];
  for (const thr of threads) {
    if (thr.parent_thread_id !== activeThreadId) continue;

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
  // useMemo 保证 threads 不变时返回同一引用，否则每次渲染产生新对象
  // 导致 MessageBubble 的 anchors prop 变化，React.memo 失效，选区丢失
  const anchorsByMessage = useMemo(() => {
    const map: Record<string, AnchorRange[]> = {};
    for (const thr of threads) {
      if (!thr.anchor_message_id || !thr.anchor_text) continue;
      const mid = String(thr.anchor_message_id);
      if (!map[mid]) map[mid] = [];
      map[mid].push({
        text: thr.anchor_text,
        threadId: thr.id,
        startOffset: thr.anchor_start_offset ?? undefined,
        endOffset: thr.anchor_end_offset ?? undefined,
      });
    }
    return map;
  }, [threads]);

  // 子线程（插针）数量，供 MergeOutput 面板显示
  const pinCount = threads.filter((t) => t.depth > 0).length;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-base">
        <div className="flex items-center gap-2.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-ph animate-bounce"
              style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-base">
        <div className="flex items-center gap-2 text-sm">
          <svg className="w-4 h-4 text-red-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="text-red-400/80">{t.errorPrefix}{error}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── 桌面端布局（md 及以上显示） ── */}
      <div className="hidden md:flex flex-col h-screen bg-base overflow-hidden">
      <ThreadNav
        threads={threads}
        activeThreadId={activeThreadId}
        canBack={navIndex > 0}
        canForward={navIndex < navHistory.length - 1}
        onBack={navigateBack}
        onForward={navigateForward}
        onSelect={handleNavigateTo}
        lang={lang}
        onToggleLang={toggleLang}
        onOpenSessions={handleOpenSessions}
      />

      {/* drawable area — SVG 在此范围内，不包含 InputBar，避免引导线污染输入框 */}
      {/* onMouseLeave 兜底：鼠标快速滑出整个区域时内层元素可能漏发事件，统一在此清除 */}
      <div
        ref={drawableAreaRef}
        className="flex flex-1 min-h-0 overflow-hidden relative"
        onMouseLeave={() => { setCardGuide(null); setHoverThreadId(null); }}
      >

        {/* 左侧：子问题面板 */}
        <div style={{ width: leftW, flexShrink: 0 }} className="min-w-0 border-r border-subtle flex flex-col">
          {rollItems.length > 0 ? (
            <>
              <div className="px-3 py-2 border-b border-subtle flex-shrink-0 flex items-center">
                <h2 className="text-[9px] font-semibold text-faint uppercase tracking-[0.12em] flex-1">{t.subQuestions}</h2>
              </div>
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
                  onSelectThread={handleNavigateTo}
                  onSendSuggestion={handleSendSuggestion}
                />
              </div>
            </>
          ) : (
            <div ref={leftCardsRef} className="flex-1 flex items-center justify-center">
              <p className="text-[10px] text-ph [writing-mode:vertical-rl] select-none tracking-[0.15em]">
                选中文字 → 插针
              </p>
            </div>
          )}
        </div>
        {/* 左侧拖拽手柄 */}
        <div
          className="w-1 flex-shrink-0 hover:bg-indigo-500/30 cursor-col-resize transition-colors"
          onMouseDown={(e) => { e.preventDefault(); startResize("left", e.clientX, leftW); }}
        />

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
              userAvatarUrl={userAvatarUrl}
              onMessageRef={handleMessageRef}
              onTextSelect={handleTextSelect}
              onAnchorClick={handleAnchorClick}
              onAnchorHover={handleAnchorHover}
              onSendSuggestion={(q) => activeThreadId && handleSendSuggestion(activeThreadId, q)}
            />
          </div>
        </div>

        {/* 右侧拖拽手柄 */}
        <div
          className="w-1 flex-shrink-0 hover:bg-indigo-500/30 cursor-col-resize transition-colors"
          onMouseDown={(e) => { e.preventDefault(); startResize("right", e.clientX, rightW); }}
        />
        {/* 右侧：概览面板 */}
        {(
          <div style={{ width: rightW, flexShrink: 0 }} className="min-w-0 border-l border-subtle flex flex-col">
            <div className="px-3 py-2 border-b border-subtle flex-shrink-0 flex items-center gap-2">
              <h2 className="text-[9px] font-semibold text-faint uppercase tracking-[0.12em]">
                {t.overview}
              </h2>
              {/* 视图切换：紧跟「概览」文字 */}
              <div className="flex gap-0.5 bg-surface-80 border border-subtle rounded-lg p-0.5">
                <button
                  onClick={() => switchRightView("dots")}
                  className={`flex items-center gap-1 px-1.5 h-5 rounded-md transition-colors ${rightView === "dots" ? "bg-glass-md text-md" : "text-ph hover:text-dim"}`}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="5" r="2.5"/><circle cx="5" cy="12" r="2.5"/><circle cx="5" cy="19" r="2.5"/>
                    <circle cx="14" cy="9" r="2.5"/><circle cx="14" cy="19" r="2.5"/>
                  </svg>
                  <span className="text-[9px] font-medium">{t.viewList}</span>
                </button>
                <button
                  onClick={() => switchRightView("canvas")}
                  className={`flex items-center gap-1 px-1.5 h-5 rounded-md transition-colors ${rightView === "canvas" ? "bg-glass-md text-md" : "text-ph hover:text-dim"}`}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
                    <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
                  </svg>
                  <span className="text-[9px] font-medium">{t.viewGraph}</span>
                </button>
              </div>
              <span className="text-[9px] text-ph tabular-nums select-none flex-1">{threads.length}</span>
              {pinCount > 0 && (
                <button
                  onClick={() => setShowMerge(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 hover:border-indigo-400/50 transition-all"
                  title="合并输出 / Merge output"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l8 9M20 4l-8 9m0 0v7" />
                  </svg>
                  <span className="text-[10px] font-medium">{t.mergeButton}</span>
                </button>
              )}
              {pinCount > 0 && (
                <button
                  onClick={() => setShowFlattenConfirm(true)}
                  disabled={flattening}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-amber-300 hover:text-white bg-amber-600/15 hover:bg-amber-600/35 border border-amber-500/30 hover:border-amber-400/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="扁平化：把所有子线程并回主线（不可逆） / Flatten: merge all sub-threads back into main (irreversible)"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                  <span className="text-[10px] font-medium">{t.flattenButton}</span>
                </button>
              )}
            </div>
            {rightView === "dots" ? (
              <ThreadTree
                threads={threads}
                activeThreadId={activeThreadId}
                unreadCounts={unreadCounts}
                messagesByThread={messagesByThread}
                onSelect={handleNavigateTo}
              />
            ) : (
              <div className="flex-1 min-h-0 relative">
                <MergeTreeCanvas
                  threads={threads}
                  selected={new Set(threads.map(t => t.id))}
                  activeThreadId={activeThreadId}
                  onToggle={handleNavigateTo}
                  compact
                />
              </div>
            )}
          </div>
        )}

        {/* 引导线 SVG：仅悬停时显示，cardGuide 列表中的每条线程都画一条曲线 */}
        {/* svgReady 在卡片展开动画结束后变为 true，确保坐标基于最终位置 */}
        {svgReady && (() => {
          const container = drawableAreaRef.current;
          if (!container || !cardGuide || cardGuide.length === 0) return null;
          const base = container.getBoundingClientRect();
          const toLocal = (vx: number, vy: number) => ({ x: vx - base.left, y: vy - base.top });

          /**
           * 用字符偏移量在消息 DOM 里精确还原选中区域的中心坐标。
           * 走 TreeWalker 遍历所有文本节点，累计字符数定位到 startOffset/endOffset
           * 所在的节点和偏移，建 Range 后取 getBoundingClientRect()。
           * 对单行、多行、跨段落均准确，不依赖 Markdown 高亮是否渲染成功。
           *
           * Accurately find the midpoint of a selection using character offsets,
           * by walking text nodes with TreeWalker and constructing a Range.
           * Works for single-line, multi-line, and cross-paragraph selections.
           */
          function anchorEdge(
            msgEl: HTMLElement,
            startOff: number,
            endOff: number,
          ): { x: number; y: number } | null {
            const walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_TEXT);
            let cur = 0;
            let sNode: Text | null = null, sOff = 0;
            let eNode: Text | null = null, eOff = 0;
            let node = walker.nextNode() as Text | null;
            while (node) {
              const len = node.length;
              if (!sNode && cur + len > startOff) { sNode = node; sOff = startOff - cur; }
              if (sNode && cur + len >= endOff)   { eNode = node; eOff = endOff   - cur; break; }
              cur += len;
              node = walker.nextNode() as Text | null;
            }
            if (!sNode || !eNode) return null;
            try {
              const range = document.createRange();
              range.setStart(sNode, Math.min(sOff, sNode.length));
              range.setEnd(eNode,   Math.min(eOff,  eNode.length));
              const r = range.getBoundingClientRect();
              if (!r.width && !r.height) return null;
              // 指向锚点左边缘，垂直居中
              return toLocal(r.left, r.top + r.height / 2);
            } catch { return null; }
          }

          const paths = cardGuide.flatMap((threadId) => {
            const cardEl = container.querySelector(`[data-thread-id="${threadId}"]`);
            if (!cardEl) return [];

            const cr = cardEl.getBoundingClientRect();
            const p1 = toLocal(cr.right, cr.top + cr.height / 2);

            // 优先：data-anchor-thread-ids 高亮 span — 指向左边缘
            // Priority: anchor highlight span — connect to left edge
            let p2: { x: number; y: number } | null = null;
            const markEl = container.querySelector(`[data-anchor-thread-ids~="${threadId}"]`);
            if (markEl) {
              const mr = markEl.getBoundingClientRect();
              p2 = toLocal(mr.left, mr.top + mr.height / 2);
            }

            // 次选：TreeWalker + Range 偏移量定位（跨行 / 跨段落均可）
            // Fallback: TreeWalker + Range offset lookup (handles multi-line/cross-paragraph)
            if (!p2) {
              const thr = threads.find((t) => t.id === threadId);
              if (thr?.anchor_message_id != null &&
                  thr.anchor_start_offset != null &&
                  thr.anchor_end_offset != null) {
                const msgEl = messageRefs.current[thr.anchor_message_id] ??
                              messageRefs.current[thr.anchor_message_id.toLowerCase()];
                if (msgEl) {
                  p2 = anchorEdge(msgEl, thr.anchor_start_offset, thr.anchor_end_offset);
                }
              }
            }

            // 兜底：连到消息气泡左边缘中点
            // Last resort: connect to left edge of message bubble
            if (!p2) {
              const thr = threads.find((t) => t.id === threadId);
              if (thr?.anchor_message_id) {
                const msgEl = container.querySelector(`[data-message-id="${thr.anchor_message_id}"]`);
                if (msgEl) {
                  const mr = msgEl.getBoundingClientRect();
                  p2 = toLocal(mr.left, mr.top + mr.height / 2);
                }
              }
            }

            if (!p2) return [];

            const dx = Math.abs(p2.x - p1.x);
            return [(
              <g key={threadId}>
                <path
                  d={`M ${p1.x} ${p1.y} C ${p1.x + dx * 0.45} ${p1.y}, ${p2.x - dx * 0.45} ${p2.y}, ${p2.x} ${p2.y}`}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={1}
                  opacity={0.5}
                />
                <circle cx={p1.x} cy={p1.y} r="2" fill="#6366f1" opacity={0.6} />
                <circle cx={p2.x} cy={p2.y} r="2" fill="#6366f1" opacity={0.6} />
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

      </div>
      {/* ── 移动端布局（md 以下显示） ── */}
      {/* MobileChatLayout 内部用 fixed inset-0，此 wrapper 仅控制显隐 */}
      <div className="md:hidden overflow-hidden">
        <MobileChatLayout
          threads={threads}
          activeThreadId={activeThreadId}
          canBack={navIndex > 0}
          canForward={navIndex < navHistory.length - 1}
          onBack={navigateBack}
          onForward={navigateForward}
          onNavigateTo={handleNavigateTo}
          onOpenSessions={handleOpenSessions}
          activeMessages={activeMessages}
          streamingText={streamingText}
          activeStatus={activeStatus}
          anchorsByMessage={anchorsByMessage}
          activeSuggestions={activeSuggestions}
          activeThread={activeThread ?? null}
          userAvatarUrl={userAvatarUrl}
          onMessageRef={handleMessageRef}
          onTextSelect={handleTextSelect}
          onAnchorClick={handleAnchorClick}
          onAnchorHover={handleAnchorHover}
          onSendSuggestion={(q) => { if (activeThreadId) handleSendSuggestion(activeThreadId, q); }}
          rollItems={rollItems}
          unreadCounts={unreadCounts}
          messagesByThread={messagesByThread}
          sessionId={sessionId}
          onSend={handleSend}
          isStreaming={isStreaming}
          webSearch={webSearch}
          onWebSearchToggle={setWebSearch}
        />
      </div>

      {/* ── 共享浮层（fixed 定位，桌面/移动端通用） ── */}
      <PinMenu
        selection={selection}
        onPin={handlePin}
        onClose={() => { clearActiveHighlight(); setSelection(null); }}
      />

      <PinStartDialog
        info={pinDialog}
        onSend={(threadId, question) => handleSendSuggestion(threadId, question)}
        onClose={() => setPinDialog(null)}
      />

      {showMerge && (
        <MergeOutput
          sessionId={sessionId}
          threads={threads}
          pinCount={pinCount}
          onClose={() => setShowMerge(false)}
        />
      )}

      {/* 扁平化确认弹窗 — 破坏性操作，必须二次确认 */}
      {/* Flatten confirmation — destructive, requires second-step confirmation */}
      {showFlattenConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !flattening && setShowFlattenConfirm(false)}
        >
          <div
            className="max-w-md w-[90vw] rounded-lg border border-amber-500/40 bg-surface-95 shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM9.75 3.75L1.5 18a1.5 1.5 0 001.31 2.25h18.38A1.5 1.5 0 0022.5 18L14.25 3.75a1.5 1.5 0 00-2.5 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-md">{t.flattenConfirmTitle}</h3>
                <p className="mt-2 text-xs text-dim whitespace-pre-line leading-relaxed">{t.flattenConfirmBody}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowFlattenConfirm(false)}
                disabled={flattening}
                className="px-3 py-1.5 text-xs rounded-md text-dim hover:text-md hover:bg-glass-md transition-colors disabled:opacity-50"
              >
                {t.flattenCancel}
              </button>
              <button
                onClick={handleFlatten}
                disabled={flattening}
                className="px-3 py-1.5 text-xs rounded-md font-medium text-white bg-amber-600 hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {flattening ? t.flattening : t.flattenConfirmCta}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast：扁平化结果提示 / flatten result toast */}
      {flattenToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-surface-95 border border-subtle shadow-lg text-xs text-md">
          {flattenToast}
        </div>
      )}

      <SessionDrawer
        open={showSessions}
        onClose={() => setShowSessions(false)}
        sessions={sessions}
        loading={sessionsLoading}
        currentSessionId={sessionId}
        t={t}
        onDelete={handleDeleteSession}
      />
    </>
  );
}
