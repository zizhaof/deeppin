"use client";
// app/chat/[sessionId]/page.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getSession, getMessages, getAllMessages, createSession, createThread, getSuggestions, listSessions, deleteSession, flattenSession, ApiError } from "@/lib/api";
import type { Session } from "@/lib/api";
import { sendMessageStream } from "@/lib/sse";
import type { SseErrorInfo } from "@/lib/sse";
import QuotaExceededModal from "@/components/QuotaExceededModal";
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
import AnchorPreviewPopover from "@/components/MainThread/AnchorPreviewPopover";
import FlattenPreview from "@/components/FlattenPreview";
import type { ThreadCardItem } from "@/components/SubThread/types";
import ThreadNav from "@/components/Layout/ThreadNav";
import ThreadTree from "@/components/Layout/ThreadTree";
import ThreadGraph from "@/components/Layout/ThreadGraph";
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

/**
 * 客户端瞬时生成占位追问，供弹窗立即展示，稍后由 LLM 结果合并/替换。
 * 占位固定英文：UI 语言跟锚点语言不匹配的组合场景下，把"未决"的那一方统一用英文兜，
 * 避免混排歧义；LLM 返回后会用匹配锚点语言的真实追问覆盖。
 *
 * Client-side placeholder questions shown instantly in the pin dialog while the
 * LLM generates real follow-ups. Kept in English on purpose: anchor language and
 * UI language may diverge, and an English fallback keeps the transient state
 * unambiguous until LLM results arrive.
 */
function makePlaceholders(anchorText: string): string[] {
  // 问题文本使用完整锚点，UI 显示由 CSS truncate 截断，发送给 AI 的内容不截断
  // Use full anchor text; CSS `truncate` handles visual clipping — never truncate what's sent to the AI
  return [
    `Explain "${anchorText}" in detail`,
    `What are the use cases of "${anchorText}"?`,
    `What are the pros and cons of "${anchorText}"?`,
  ];
}

export default function ChatPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const router = useRouter();
  const t = useT();
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
  /** 悬浮锚点时展开的预览 popover — 取代旧的左栏卡片入口
   *  Anchor-hover preview popover — replaces the old left-rail card entry. */
  const [anchorHover, setAnchorHover] = useState<{ threadIds: string[]; rect: DOMRect } | null>(null);
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

  // 右栏宽度（可拖拽调整）—— 左栏已移除，只剩右栏一个可调节点
  // Right panel width (left panel was removed — only right resizer remains).
  const [rightW, setRightW] = useState(() =>
    typeof window !== "undefined" ? Number(localStorage.getItem("deeppin:right-w")) || 288 : 288
  );
  const MIN_SIDE = 200;
  // 上限 = 窗口宽度的一半，为主对话区留出 >= 200px 的空间
  // Max = half of viewport width; main column always keeps >= 200px.
  const maxSide = () =>
    typeof window !== "undefined" ? Math.max(MIN_SIDE, Math.floor(window.innerWidth / 2)) : 640;

  const startResizeRight = useCallback((startX: number, startW: number) => {
    const onMove = (e: MouseEvent) => {
      const next = Math.min(maxSide(), Math.max(MIN_SIDE, startW - (e.clientX - startX)));
      setRightW(next);
      localStorage.setItem("deeppin:right-w", String(next));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  const anchorHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // messageId → 相对主滚动容器顶部的 top 偏移（px），用于 Mobile 的锚点计算
  const [messagePositions, setMessagePositions] = useState<Record<string, number>>({});

  // ── refs ────────────────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement>>({});
  const scrollFrameRef = useRef<number | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  /** 当前登录用户是否匿名；影响「新对话」按钮可见性 + 配额弹窗文案。
   *  Whether the current user is anonymous — gates in-chat "new session" button + quota modal. */
  const [isAnon, setIsAnon] = useState(false);
  /** 额度用尽弹窗。variant 决定是 20 轮用尽 (quota) 还是多开 session (session)。
   *  Quota-exceeded modal; variant picks between trial-turns vs session-cap copy. */
  const [quotaModal, setQuotaModal] = useState<{ variant: "quota" | "session"; message?: string } | null>(null);
  /** 当前 session 已使用的轮数（匿名用户 quota 计数器用）。init 时从 getSession 取，
   *  每次 send 后本地 +1；与后端 turn_count 最终一致，但无需额外往返。
   *  Per-session turn count for the anon quota counter. Initialized from getSession,
   *  incremented locally after each send — eventually consistent with backend turn_count. */
  const [sessionTurnCount, setSessionTurnCount] = useState(0);

  const mainThread = threads.find((t) => t.parent_thread_id === null);
  const activeThread = activeThreadId ? threads.find((t) => t.id === activeThreadId) : null;
  const activeMessages = activeThreadId ? (messagesByThread[activeThreadId] ?? []) : [];
  const streamingText = activeThreadId ? streamingByThread[activeThreadId] : undefined;
  const activeStatus = activeThreadId ? (statusByThread[activeThreadId] ?? "") : "";
  const isStreaming = streamingText !== undefined || !!activeStatus;
  const activeSuggestions = activeThreadId ? (suggestions[activeThreadId] ?? []) : [];

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
      // is_anonymous 可能不存在（老版本 supabase-js），缺失则按「非匿名」处理
      // is_anonymous may be absent on older supabase-js; treat missing as non-anon
      setIsAnon(Boolean((authSession.user as { is_anonymous?: boolean }).is_anonymous));

      try {
        // 若 session 尚未写入 DB（首页预热只生成了 UUID），先创建再加载。
        // If the session hasn't been persisted yet (prewarm only generated a UUID),
        // create it now with the pre-generated ID, then load normally.
        try {
          await getSession(sessionId);
        } catch {
          // 404（或其他错误）：用预生成的 sessionId 在 DB 中创建 session
          // 匿名用户已有 1 个 session 时会 402 anon_session_limit
          // Anon users hitting the 1-session cap get 402 anon_session_limit here
          try {
            await createSession({ id: sessionId });
          } catch (err) {
            if (err instanceof ApiError && err.code === "anon_session_limit") {
              if (!cancelled) setQuotaModal({ variant: "session", message: err.message });
              return;
            }
            throw err;
          }
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
        setSessionTurnCount(session.turn_count ?? 0);

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

  const messageCount = activeMessages.length;
  useEffect(() => {
    updatePositions();
  }, [messageCount, updatePositions]);

  const handleMessageRef = useCallback((messageId: string, el: HTMLDivElement | null) => {
    if (el) messageRefs.current[messageId] = el;
    else delete messageRefs.current[messageId];
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
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
  // 统一处理流式错误：匿名额度用尽 → 弹配额登录弹窗；其他 → 常规错误显示。
  // Unified stream error handler: quota exceeded opens the sign-in modal; others fall back to existing error UI.
  const makeStreamErrorHandler = useCallback(
    (threadId: string, surfaceError: boolean) =>
      (msg: string, info?: SseErrorInfo) => {
        if (info?.code === "anon_quota_exceeded") {
          finalizeStream(threadId, "");
          setQuotaModal({ variant: "quota", message: msg });
          return;
        }
        finalizeStream(threadId, `${t.streamError} ${msg}`);
        if (surfaceError) setError(msg);
      },
    [finalizeStream, t.streamError],
  );

  const handleSend = async (content: string, display?: string, ragFilename?: string) => {
    if (!activeThreadId || isStreaming) return;
    addUserMessage(activeThreadId, display ?? content);
    setStreamStatus(activeThreadId, t.processing);
    const threadId = activeThreadId;
    setSessionTurnCount((n) => n + 1);

    await sendMessageStream(
      threadId,
      content,
      (chunk) => appendChunk(threadId, chunk),
      (fullText, messageId, model) => finalizeStream(threadId, fullText, messageId, model),
      makeStreamErrorHandler(threadId, true),
      (tid, title) => updateThreadTitle(tid, title),
      (text) => setStreamStatus(threadId, text),
      ragFilename,
    );
  };

  const handleSendSuggestion = useCallback((threadId: string, question: string) => {
    consumeSuggestion(threadId, question);
    addUserMessage(threadId, question);
    setStreamStatus(threadId, t.processing);
    setSessionTurnCount((n) => n + 1);
    sendMessageStream(
      threadId,
      question,
      (chunk) => appendChunk(threadId, chunk),
      (fullText, messageId, model) => finalizeStream(threadId, fullText, messageId, model),
      makeStreamErrorHandler(threadId, false),
      undefined,
      (text) => setStreamStatus(threadId, text),
    );
  }, [consumeSuggestion, addUserMessage, appendChunk, finalizeStream, setStreamStatus, makeStreamErrorHandler]);

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

  // ── 新建对话：匿名用户弹登录引导，登录用户直接跳新 UUID ───────────
  // New chat: anon users get the sign-in prompt; signed-in users go straight to a fresh UUID.
  const handleNewChat = useCallback(() => {
    if (isAnon) {
      setQuotaModal({ variant: "session" });
      return;
    }
    const id = crypto.randomUUID();
    router.push(`/chat/${id}`);
  }, [isAnon, router]);

  // ── 匿名用户手动触发 Google linkIdentity（保留 user_id + 历史）──
  // Anon sign-in — linkIdentity preserves user_id + all trial messages.
  const handleSignIn = useCallback(async () => {
    const supabase = createClient();
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo },
    });
    if (error) alert(error.message);
  }, []);

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

  // ── 切换线程时清除残留 hover popover ─────────────────────────────
  useEffect(() => {
    setAnchorHover(null);
  }, [activeThreadId]);

  // ── 悬浮锚点：展开/关闭预览 popover（左栏卡片入口的替代方案）─────
  // Anchor hover: open/close the preview popover (replaces the old left-rail card entry point).
  // 延迟关闭，让用户有时间把鼠标从锚点移到 popover 上
  // Delay close so the mouse can travel from anchor to popover without dropping it.
  const handleAnchorHover = useCallback((threadIds: string[], rect: DOMRect | null) => {
    if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
    if (threadIds.length > 0 && rect) {
      setAnchorHover({ threadIds, rect });
    } else {
      anchorHoverTimer.current = setTimeout(() => setAnchorHover(null), 120);
    }
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

  // 有未读回复的 thread id 集合 — 锚点呼吸下划线用这个判断
  // Set of thread IDs with unread replies — anchor breathing-underline keys off this.
  const unreadThreadIds = useMemo(() => {
    const s = new Set<string>();
    for (const [id, n] of Object.entries(unreadCounts)) {
      if (n > 0) s.add(id);
    }
    return s;
  }, [unreadCounts]);

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
        onOpenSessions={handleOpenSessions}
        onNewChat={handleNewChat}
        isAnon={isAnon}
        onSignIn={handleSignIn}
      />

      {/* 主体两栏：主对话 + 右侧概览。锚点 hover popover 取代了原来的左栏卡片入口 */}
      {/* Main 2-column shell: chat + right overview. Anchor-hover popover replaces the old left rail. */}
      <div
        className="flex flex-1 min-h-0 overflow-hidden relative"
        onMouseLeave={() => setAnchorHover(null)}
      >
        {/* 中间：主对话 */}
        <div className="flex-1 flex flex-col min-w-0 relative">
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
              unreadThreadIds={unreadThreadIds}
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

        {/* 右栏 resize handle — hover 显示 3-dash grip + accent 条，跟设计 .resizer 对齐
            Right-rail resize handle — hover reveals 3-dash grip + accent stripe (design .resizer). */}
        <div
          className="resize-handle group/rh relative flex-shrink-0 cursor-col-resize self-stretch"
          style={{ width: 10 }}
          onMouseDown={(e) => { e.preventDefault(); startResizeRight(e.clientX, rightW); }}
        >
          {/* 1px 细线，hover / drag 时变 accent 2px */}
          <span
            className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px transition-all group-hover/rh:w-[2px] group-hover/rh:bg-accent"
            style={{ background: "var(--rule)" }}
          />
          {/* 3-dash grip — hover opacity 0 → 1 */}
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col justify-between w-[3px] h-7 pointer-events-none opacity-0 transition-opacity group-hover/rh:opacity-100">
            <span className="block w-[3px] h-[2px] rounded-full bg-accent" />
            <span className="block w-[3px] h-[2px] rounded-full bg-accent" />
            <span className="block w-[3px] h-[2px] rounded-full bg-accent" />
          </span>
        </div>
        {/* 右栏：概览面板 — 按设计 rail-head / rail-tabs / rail-body 三段式
            Right rail — design's rail-head / rail-tabs / rail-body three-section split. */}
        {(
          <div style={{ width: rightW, flexShrink: 0 }} className="min-w-0 border-l border-subtle flex flex-col bg-elevated">
            {/* rail-head：eyebrow + 线程计数 + merge/flatten 按钮
                rail-head: eyebrow + count + merge/flatten actions */}
            <div className="px-4 pt-4 pb-3 flex items-center gap-3 flex-shrink-0 border-b border-rule">
              <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-lo">
                {t.overview}
              </h2>
              <span className="font-mono text-[11px] text-faint tabular-nums">{threads.length}</span>
              <span className="flex-1" />
              {pinCount > 0 && (
                <button
                  onClick={() => setShowMerge(true)}
                  title="合并输出 / Merge output"
                  className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider uppercase text-md hover:text-ink-accent transition-colors"
                  style={{ color: "var(--ink-2)" }}
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4l8 9M20 4l-8 9m0 0v7" />
                  </svg>
                  <span>{t.mergeButton}</span>
                </button>
              )}
              {pinCount > 0 && (
                <button
                  onClick={() => setShowFlattenConfirm(true)}
                  disabled={flattening}
                  title="扁平化：把所有子线程并回主线（不可逆） / Flatten: merge all sub-threads back into main (irreversible)"
                  className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider uppercase transition-colors disabled:opacity-40"
                  style={{ color: "var(--ink-2)" }}
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                  <span>{t.flattenButton}</span>
                </button>
              )}
            </div>

            {/* rail-tabs：mono 大写 + active 下划线（代替 glass pill）
                rail-tabs: mono uppercase + active bottom-border (replaces the glass pill toggle) */}
            <div className="flex flex-shrink-0 border-b border-rule-soft">
              <button
                onClick={() => switchRightView("dots")}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors ${
                  rightView === "dots" ? "text-ink" : "text-faint hover:text-md"
                }`}
                style={{ borderBottom: `2px solid ${rightView === "dots" ? "var(--ink)" : "transparent"}` }}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="5" r="2.5"/><circle cx="5" cy="12" r="2.5"/><circle cx="5" cy="19" r="2.5"/>
                  <circle cx="14" cy="9" r="2.5"/><circle cx="14" cy="19" r="2.5"/>
                </svg>
                <span>{t.viewList}</span>
              </button>
              <button
                onClick={() => switchRightView("canvas")}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors ${
                  rightView === "canvas" ? "text-ink" : "text-faint hover:text-md"
                }`}
                style={{ borderBottom: `2px solid ${rightView === "canvas" ? "var(--ink)" : "transparent"}` }}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
                  <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
                </svg>
                <span>{t.viewGraph}</span>
              </button>
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
                <ThreadGraph
                  threads={threads}
                  activeThreadId={activeThreadId}
                  unreadCounts={unreadCounts}
                  messagesByThread={messagesByThread}
                  onSelect={handleNavigateTo}
                  width={Math.max(200, rightW - 24)}
                />
              </div>
            )}
          </div>
        )}

        {/* 锚点 hover 预览 popover — 原左栏卡片入口的替代
            Anchor hover preview popover — replaces the old left-rail card entry */}
        <AnchorPreviewPopover
          hover={anchorHover}
          threads={threads}
          messagesByThread={messagesByThread}
          unreadCounts={unreadCounts}
          onEnter={(threadId) => {
            setAnchorHover(null);
            handleNavigateTo(threadId);
          }}
          onMouseEnter={() => {
            if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
          }}
          onMouseLeave={() => setAnchorHover(null)}
        />
      </div>

      {/* 输入框：左栏已删，直接占满中间主对话区（减去右侧概览） */}
      {/* Input bar: left rail removed — spans the main column (minus the right overview). */}
      <div className="flex">
        <div className="flex-1 min-w-0">
          <InputBar
            sessionId={sessionId}
            onSend={handleSend}
            disabled={isStreaming || !activeThreadId}
            webSearch={webSearch}
            onWebSearchToggle={setWebSearch}
            turnCount={sessionTurnCount}
            isAnon={isAnon}
          />
        </div>
        <div style={{ width: rightW + 10 }} className="flex-shrink-0" />
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

      {/* 扁平化确认弹窗 — 破坏性操作，带 before / after 可视化预览
          Flatten confirmation — destructive, with before/after preview */}
      {showFlattenConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          style={{ background: "rgba(27,26,23,0.45)" }}
          onClick={() => !flattening && setShowFlattenConfirm(false)}
        >
          <div
            className="max-w-xl w-[90vw] rounded-lg shadow-2xl overflow-hidden"
            style={{
              background: "var(--card)",
              border: "1px solid var(--rule)",
              boxShadow: "0 24px 64px rgba(27,26,23,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-4 flex items-start gap-3" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
              <span
                className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full grid place-items-center font-mono text-[13px] font-medium"
                style={{ background: "var(--accent)", color: "var(--paper)" }}
              >
                !
              </span>
              <div className="flex-1">
                <h3 className="font-serif text-[17px] font-medium text-ink leading-tight">{t.flattenConfirmTitle}</h3>
                <p className="mt-1 text-[12.5px] whitespace-pre-line leading-relaxed" style={{ color: "var(--ink-3)" }}>
                  {t.flattenConfirmBody}
                </p>
              </div>
            </div>

            {/* Before / After 可视化 / preview */}
            <div className="px-6 py-5" style={{ background: "var(--paper-2)" }}>
              <FlattenPreview threads={threads} />
            </div>

            <div className="px-6 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--rule-soft)" }}>
              <button
                onClick={() => setShowFlattenConfirm(false)}
                disabled={flattening}
                className="px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors disabled:opacity-50"
                style={{ color: "var(--ink-3)" }}
              >
                {t.flattenCancel}
              </button>
              <button
                onClick={handleFlatten}
                disabled={flattening}
                className="px-3.5 py-1.5 text-[12px] font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: flattening ? "var(--accent-ink)" : "var(--ink)",
                  color: "var(--paper)",
                }}
                onMouseEnter={(e) => { if (!flattening) (e.currentTarget as HTMLElement).style.background = "var(--accent)"; }}
                onMouseLeave={(e) => { if (!flattening) (e.currentTarget as HTMLElement).style.background = "var(--ink)"; }}
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
        isAnon={isAnon}
        onAnonNewChat={() => setQuotaModal({ variant: "session" })}
      />

      <QuotaExceededModal
        open={quotaModal !== null}
        variant={quotaModal?.variant ?? "quota"}
        message={quotaModal?.message}
        onClose={() => setQuotaModal(null)}
      />
    </>
  );
}
