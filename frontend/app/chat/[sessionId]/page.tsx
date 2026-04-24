"use client";
// app/chat/[sessionId]/page.tsx

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getSession, getMessages, getAllMessages, createSession, createThread, getSuggestions, listSessions, deleteSession, deleteThread, flattenSession, ApiError } from "@/lib/api";
import type { Session } from "@/lib/api";
import { sendMessageStream } from "@/lib/sse";
import type { SseErrorInfo } from "@/lib/sse";
import QuotaExceededModal from "@/components/QuotaExceededModal";
import { useThreadStore } from "@/stores/useThreadStore";
import { useT, useLangStore } from "@/stores/useLangStore";
import { localizeStatusText } from "@/lib/i18n";
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
import ThreadNav from "@/components/Layout/ThreadNav";
import ThreadTree from "@/components/Layout/ThreadTree";
import ThreadGraph from "@/components/Layout/ThreadGraph";
import MergeOutput from "@/components/MergeOutput";
import SessionDrawer from "@/components/SessionDrawer";
import MobileChatLayout from "@/components/Mobile/MobileChatLayout";
import DeleteThreadDialog from "@/components/DeleteThreadDialog";

/**
 * Detect whether user input needs real-time web search.
 *
 * Two-track match:
 *   A. Strong-signal domain words — the word itself implies real-time data
 *      (stock prices, weather, trending, etc.).
 *   B. Explicit query verbs — the user spells out "look up / search / find".
 * Trigger if either track matches.
 */

/**
 * Client-side placeholder questions shown instantly in the pin dialog while the
 * LLM generates real follow-ups. Kept in English on purpose: anchor language and
 * UI language may diverge, and an English fallback keeps the transient state
 * unambiguous until LLM results arrive.
 */
function makePlaceholders(anchorText: string): string[] {
  // Use full anchor text; CSS `truncate` handles visual clipping — never truncate what's sent to the AI.
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
    removeThreadAndDescendants,
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
  /** Anchor-hover preview popover — replaces the old left-rail card entry. */
  const [anchorHover, setAnchorHover] = useState<{ threadIds: string[]; rect: DOMRect } | null>(null);
  /** Right-rail overview view: dots (circle tree) or list (text list). */
  const [rightView, setRightView] = useState<"dots" | "canvas">(() =>
    typeof window !== "undefined"
      ? ((localStorage.getItem("deeppin:right-view") as "dots" | "canvas") ?? "dots")
      : "dots"
  );
  const switchRightView = (v: "dots" | "canvas") => {
    setRightView(v);
    localStorage.setItem("deeppin:right-view", v);
  };

  // Wrapper around navigateTo: saves last visited thread so it can be restored on next session entry.
  const handleNavigateTo = useCallback((threadId: string) => {
    navigateTo(threadId);
    localStorage.setItem(`deeppin:last-thread:${sessionId}`, threadId);
  }, [navigateTo, sessionId]);

  // Flatten: call backend, reload session (threads list collapses to main only,
  // main messages reordered by preorder).
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

  // Auto-dismiss the flatten toast.
  useEffect(() => {
    if (!flattenToast) return;
    const id = setTimeout(() => setFlattenToast(null), 3500);
    return () => clearTimeout(id);
  }, [flattenToast]);

  // Right panel width (drag-resizable) — defaults to a 4:1 main:rail ratio
  // (rail ~= 20% of viewport).
  const [rightW, setRightW] = useState(() => {
    if (typeof window === "undefined") return 340;
    const stored = Number(localStorage.getItem("deeppin:right-w"));
    if (stored > 0) return stored;
    return Math.max(240, Math.min(420, Math.round(window.innerWidth * 0.2)));
  });
  const MIN_SIDE = 220;
  // Max = half of viewport width; main column always keeps >= 220px.
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
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  /** Whether the current user is anonymous — gates in-chat "new session" button + quota modal. */
  const [isAnon, setIsAnon] = useState(false);
  /** Quota-exceeded modal; variant picks between trial-turns vs session-cap copy. */
  const [quotaModal, setQuotaModal] = useState<{ variant: "quota" | "session"; message?: string } | null>(null);
  /** Per-session turn count for the anon quota counter. Initialized from getSession,
   *  incremented locally after each send — eventually consistent with backend turn_count. */
  const [sessionTurnCount, setSessionTurnCount] = useState(0);

  const mainThread = threads.find((t) => t.parent_thread_id === null);
  const activeThread = activeThreadId ? threads.find((t) => t.id === activeThreadId) : null;
  const activeMessages = activeThreadId ? (messagesByThread[activeThreadId] ?? []) : [];
  const streamingText = activeThreadId ? streamingByThread[activeThreadId] : undefined;
  const activeStatus = activeThreadId ? (statusByThread[activeThreadId] ?? "") : "";
  const isStreaming = streamingText !== undefined || !!activeStatus;
  const activeSuggestions = activeThreadId ? (suggestions[activeThreadId] ?? []) : [];

  // ── Initialization (includes auth check) ────────────────────────
  // Auth check is done inside init() so data fetches never race with auth.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      // Defense-in-depth: middleware already blocks unauthenticated access,
      // but checking here ensures data fetches never fire before auth is confirmed.
      const supabase = createClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        router.push("/login");
        return;
      }
      setUserAvatarUrl(authSession.user.user_metadata?.avatar_url ?? null);
      // is_anonymous may be absent on older supabase-js; treat missing as non-anon.
      setIsAnon(Boolean((authSession.user as { is_anonymous?: boolean }).is_anonymous));

      try {
        // If the session hasn't been persisted yet (prewarm only generated a UUID),
        // create it now with the pre-generated ID, then load normally.
        try {
          await getSession(sessionId);
        } catch {
          // 404 (or any other error): create the session in the DB with the pre-generated id.
          // Anon users hitting the 1-session cap get 402 anon_session_limit here.
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

        // Load session (with threads) and all messages in parallel — 1 round-trip total.
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

        // Batch-write messages for every thread (one request instead of N serial calls).
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

  // ── Lazy-load messages when switching threads ───────────────────
  useEffect(() => {
    if (!activeThreadId) return;
    const msgs = messagesByThread[activeThreadId];
    // undefined means never loaded (new threads don't hit this — pinThread initializes to []).
    if (msgs !== undefined) return;
    getMessages(activeThreadId)
      .then((m) => setMessages(activeThreadId, m))
      .catch(() => {});
  }, [activeThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-send the pending message after navigating from the home input ──
  const pendingMsgSentRef = useRef(false);
  useEffect(() => {
    if (!activeThreadId || pendingMsgSentRef.current) return;
    // Validate: activeThreadId must belong to the current session to guard against
    // stale Zustand state left over from the previous navigation.
    if (!threads.some(t => t.id === activeThreadId && t.session_id === sessionId)) return;
    const pending = sessionStorage.getItem("deeppin:pending-msg");
    if (!pending) return;
    sessionStorage.removeItem("deeppin:pending-msg");
    pendingMsgSentRef.current = true;
    handleSend(pending);
  }, [activeThreadId, threads]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message ────────────────────────────────────────────────
  // content = full text the AI sees; display = optional bubble text (may include
  // attachment label).
  // ragFilename = the just-uploaded RAG filename — backend prioritizes chunks
  // from that file.
  //
  // Note: every message goes through sendMessageStream (the persisted path).
  // Web-search is decided server-side by classify_search_intent — the frontend
  // no longer routes to the stateless /api/search. This ensures every chat
  // (including search queries) is persisted and survives a refresh.
  //
  // Unified stream error handler: anon quota exhausted → quota sign-in modal;
  // anything else → existing error UI.
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
      // Backend SSE status text is bilingual ("Chinese / English") — keep only
      // the half matching the active locale before showing it.
      (text) => setStreamStatus(threadId, localizeStatusText(text, lang)),
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
      (text) => setStreamStatus(threadId, localizeStatusText(text, lang)),
    );
  }, [consumeSuggestion, addUserMessage, appendChunk, finalizeStream, setStreamStatus, makeStreamErrorHandler, lang]);

  // ── Click an anchor to enter the sub-thread ─────────────────────
  const handleAnchorClick = useCallback((threadId: string) => {
    handleNavigateTo(threadId);
  }, [handleNavigateTo]);

  // ── Lazy-fetch the session list (kicked off on first drawer open) ─
  const ensureSessionsLoaded = useCallback(() => {
    if (sessions.length === 0) {
      setSessionsLoading(true);
      listSessions()
        .then((s) => setSessions(s))
        .catch(() => {})
        .finally(() => setSessionsLoading(false));
    }
  }, [sessions.length]);

  // Desktop entry point: open the SessionDrawer + lazy-load the list.
  const handleOpenSessions = useCallback(() => {
    setShowSessions(true);
    ensureSessionsLoaded();
  }, [ensureSessionsLoaded]);

  // ── New chat: anon → sign-in prompt; signed-in → straight to a fresh UUID ─
  const handleNewChat = useCallback(() => {
    if (isAnon) {
      setQuotaModal({ variant: "session" });
      return;
    }
    const id = crypto.randomUUID();
    router.push(`/chat/${id}`);
  }, [isAnon, router]);

  // ── Anon sign-in — linkIdentity preserves user_id + all trial messages ─
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
      // If we deleted the current session, head back to home.
      if (sid === sessionId) router.push("/");
    } catch (err) {
      alert(`${t.deleteError}${err instanceof Error ? err.message : t.unknownError}`);
    }
  }, [sessionId, t]);

  // ── Delete-thread dialog: graph-preview confirm; hitting the main thread
  //    wipes the entire session ────────────────────────────────────
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openDeleteDialog = useCallback((threadId: string) => {
    setAnchorHover(null); // close the hover popover so it doesn't sit over the dialog
    setDeleteTargetId(threadId);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    if (deleting) return;
    setDeleteTargetId(null);
  }, [deleting]);

  const confirmDeleteThread = useCallback(async () => {
    if (!deleteTargetId) return;
    const target = threads.find((th) => th.id === deleteTargetId);
    if (!target) { setDeleteTargetId(null); return; }
    const isMainTarget = target.parent_thread_id === null;
    setDeleting(true);
    try {
      if (isMainTarget) {
        // Deleting the main thread = deleting the session (backend CASCADE) — go home.
        await deleteSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        router.push("/");
        return;
      }
      await deleteThread(deleteTargetId);
      const parentId = target.parent_thread_id;
      // If the active thread lives in the doomed subtree, hop to the parent
      // before we strip it from the store.
      const doomed = new Set<string>();
      const collect = (id: string) => {
        doomed.add(id);
        for (const th of threads) if (th.parent_thread_id === id) collect(th.id);
      };
      collect(deleteTargetId);
      if (activeThreadId && doomed.has(activeThreadId)) {
        const jumpTo = parentId ?? threads.find((th) => th.parent_thread_id === null)?.id;
        if (jumpTo) handleNavigateTo(jumpTo);
      }
      removeThreadAndDescendants(deleteTargetId);
      setDeleteTargetId(null);
    } catch (err) {
      alert(`${t.deleteError}${err instanceof Error ? err.message : t.unknownError}`);
    } finally {
      setDeleting(false);
    }
  }, [deleteTargetId, threads, sessionId, activeThreadId, removeThreadAndDescendants, handleNavigateTo, router, t]);

  // ── Clear stale hover popover when switching threads ────────────
  useEffect(() => {
    setAnchorHover(null);
  }, [activeThreadId]);

  // ── Anchor hover: open/close the preview popover (replaces the old
  //    left-rail card entry point). Delay close so the mouse can travel
  //    from anchor to popover without dropping it ────────────────
  const handleAnchorHover = useCallback((threadIds: string[], rect: DOMRect | null) => {
    if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
    if (threadIds.length > 0 && rect) {
      setAnchorHover({ threadIds, rect });
    } else {
      anchorHoverTimer.current = setTimeout(() => setAnchorHover(null), 120);
    }
  }, []);

  // ── Pin handling ────────────────────────────────────────────────
  const handleTextSelect = useCallback(
    (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => {
      setSelection({ text, messageId, rect, startOffset, endOffset });
    },
    []
  );

  // Mobile-only bridge — taps on Pin in the inline action sheet jump straight
  // to handlePin (no PinMenu round-trip). The callback identity must stay stable
  // because MessageBubble's touch useEffect depends on it, but handlePin is
  // rebuilt every render and closes over mainThread / activeThreadId — both
  // undefined on the first render. `useCallback(fn, [])` would freeze the early-
  // return version forever, so we proxy through a ref that always points at the
  // latest handlePin.
  const handlePinRef = useRef<((info: SelectionInfo) => void) | null>(null);
  const handleMobileSelectionPin = useCallback(
    (text: string, messageId: string, rect: DOMRect, startOffset: number, endOffset: number) => {
      handlePinRef.current?.({ text, messageId, rect, startOffset, endOffset });
    },
    []
  );

  const handlePin = async (info: SelectionInfo) => {
    clearActiveHighlight();
    setSelection(null);
    window.getSelection()?.removeAllRanges();

    if (!mainThread) return;

    // We already know the parent's depth on the client, so compute the child's depth here and save the backend a DB lookup.
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
      pinThread(newThread);

      const threadId = newThread.id;

      // Show the dialog immediately with placeholders so the user doesn't wait on the LLM.
      const placeholders = makePlaceholders(info.text);
      setSuggestions(threadId, placeholders);
      setPinDialog({ threadId, anchorText: info.text, suggestions: placeholders, loading: true });

      // /suggest already polls server-side (cache_hit → poll_hit → sync_gen, up to 3s).
      // Merge strategy: 3 placeholder templates + up to 3 LLM follow-ups, dedup'd
      // by normalized text so that the sync_gen fallback can't collide with the
      // placeholders (in practice, LLM-generated contextual follow-ups rarely
      // collide with the templates).
      // Backend /suggest polls server-side (up to 3s). Merge 3 placeholders with up to 3 LLM
      // follow-ups; dedup on normalized form to avoid collisions with sync_gen's template fallback.
      const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      getSuggestions(threadId).then(({ questions, title }) => {
        // Swap the anchor-truncated placeholder for the LLM title so the tree
        // and graph show the contextual name instead of raw anchor text. The
        // background _generate_and_patch task is what actually produced this;
        // /suggest just relays it inline.
        if (title) updateThreadTitle(threadId, title);
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

  // Refresh the handlePin ref every render so the stable mobile bridge
  // always calls the latest closure, not a frozen first-render one.
  handlePinRef.current = handlePin;

  // ── Anchor-highlight data (all threads, not just the main one) ──
  // useMemo keeps the same reference while threads is unchanged; otherwise a
  // fresh object every render would change MessageBubble's anchors prop,
  // defeat React.memo, and drop the user's text selection.
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

  // Number of sub-threads (pins) — surfaced by the MergeOutput panel.
  const pinCount = threads.filter((t) => t.depth > 0).length;

  // Set of thread IDs with unread replies — used by the anchor breathing-underline check.
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
      {/* ── Desktop layout (md and up) ── */}
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
        userAvatarUrl={userAvatarUrl}
      />

      {/* Main two-column layout: chat + right-rail overview. The anchor-hover popover replaces the old left-rail card entry. */}
      {/* Main 2-column shell: chat + right overview. Anchor-hover popover replaces the old left rail. */}
      <div
        className="flex flex-1 min-h-0 overflow-hidden relative"
        onMouseLeave={() => setAnchorHover(null)}
      >
        {/* Center: main chat. */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <MessageList
              messages={activeMessages}
              streamingText={streamingText}
              statusText={activeStatus}
              anchorsByMessage={anchorsByMessage}
              unreadThreadIds={unreadThreadIds}
              suggestions={activeSuggestions}
              anchorText={activeThread?.anchor_text}
              userAvatarUrl={userAvatarUrl}
              onTextSelect={handleTextSelect}
              onAnchorClick={handleAnchorClick}
              onAnchorHover={handleAnchorHover}
              onSendSuggestion={(q) => activeThreadId && handleSendSuggestion(activeThreadId, q)}
            />
          </div>
        </div>

        {/* Right-rail resize handle — hover reveals a 3-dash grip + accent stripe (design .resizer). */}
        <div
          className="resize-handle group/rh relative flex-shrink-0 cursor-col-resize self-stretch"
          style={{ width: 10 }}
          onMouseDown={(e) => { e.preventDefault(); startResizeRight(e.clientX, rightW); }}
        >
          {/* 1px line; on hover / drag it becomes a 2px accent stripe. */}
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
        {/* Right rail — design's rail-head / rail-tabs / rail-body three-section split. */}
        {(
          <div style={{ width: rightW, flexShrink: 0 }} className="min-w-0 border-l border-subtle flex flex-col bg-elevated">
            {/* rail-head: eyebrow + thread count + merge/flatten actions. */}
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

            {/* rail-tabs: mono uppercase + active bottom-border (replaces the glass pill toggle). */}
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
                  onNodeHover={handleAnchorHover}
                  width={Math.max(200, rightW - 24)}
                />
              </div>
            )}
          </div>
        )}

        {/* Anchor hover preview popover — replaces the old left-rail card entry. */}
        <AnchorPreviewPopover
          hover={anchorHover}
          threads={threads}
          messagesByThread={messagesByThread}
          unreadCounts={unreadCounts}
          onEnter={(threadId) => {
            setAnchorHover(null);
            handleNavigateTo(threadId);
          }}
          onDelete={(threadId) => openDeleteDialog(threadId)}
          onMouseEnter={() => {
            if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
          }}
          onMouseLeave={() => setAnchorHover(null)}
        />
      </div>

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
      {/* ── Mobile layout (below md) ── */}
      {/* MobileChatLayout uses fixed inset-0 internally; this wrapper just controls show/hide. */}
      <div className="md:hidden overflow-hidden">
        <MobileChatLayout
          threads={threads}
          activeThreadId={activeThreadId}
          canBack={navIndex > 0}
          onBack={navigateBack}
          onNavigateTo={handleNavigateTo}
          // Sessions
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          // Mobile layout owns its own left drawer — only trigger the lazy
          // session fetch here; opening the legacy SessionDrawer too would
          // result in two stacked drawers on mobile.
          onOpenSessions={ensureSessionsLoaded}
          onDeleteSession={handleDeleteSession}
          onNewChat={handleNewChat}
          // Active conversation
          activeMessages={activeMessages}
          streamingText={streamingText}
          activeStatus={activeStatus}
          anchorsByMessage={anchorsByMessage}
          activeSuggestions={activeSuggestions}
          activeThread={activeThread ?? null}
          userAvatarUrl={userAvatarUrl}
          // Mobile inline Pin tap creates the sub-thread directly — bypasses
          // PinMenu's removed mobile branch (the inline action sheet replaced it).
          onTextSelect={handleMobileSelectionPin}
          onAnchorClick={handleAnchorClick}
          onAnchorHover={handleAnchorHover}
          onSendSuggestion={(q) => { if (activeThreadId) handleSendSuggestion(activeThreadId, q); }}
          // Right drawer
          unreadCounts={unreadCounts}
          messagesByThread={messagesByThread}
          pinCount={pinCount}
          onOpenMerge={() => setShowMerge(true)}
          onOpenFlatten={() => setShowFlattenConfirm(true)}
          // Composer
          sessionId={sessionId}
          onSend={handleSend}
          isStreaming={isStreaming}
          webSearch={webSearch}
          onWebSearchToggle={setWebSearch}
          turnCount={sessionTurnCount}
          // Account
          isAnon={isAnon}
          onSignIn={handleSignIn}
          onDeleteActive={(threadId) => openDeleteDialog(threadId)}
        />
      </div>

      {/* ── Shared overlays (fixed positioning, used by desktop and mobile) ── */}
      <PinMenu
        selection={selection}
        onPin={handlePin}
        onClose={() => { clearActiveHighlight(); setSelection(null); }}
      />

      <PinStartDialog
        info={pinDialog}
        onSend={(threadId, question) => {
          // Stay on the current thread after pinning. The sub-thread streams
          // in the background; the anchor's unread pulse + overview drawer's
          // unread dot signal the new reply, and the user jumps in when
          // they're ready. Same logic on desktop and mobile.
          handleSendSuggestion(threadId, question);
        }}
        onClose={() => setPinDialog(null)}
      />

      {/* Delete-thread confirm (graph preview; main-thread target wipes session).
          Conditional mount — the zoom/pan hook's initial measurement runs when
          the container ref attaches, so the dialog body must not pre-mount. */}
      {deleteTargetId !== null && (
        <DeleteThreadDialog
          targetThreadId={deleteTargetId}
          threads={threads}
          messagesByThread={messagesByThread}
          busy={deleting}
          onCancel={closeDeleteDialog}
          onConfirm={confirmDeleteThread}
        />
      )}

      {showMerge && (
        <MergeOutput
          sessionId={sessionId}
          threads={threads}
          onClose={() => setShowMerge(false)}
        />
      )}

      {/* Flatten confirmation — destructive, with before/after preview. */}
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

            {/* Before / After visual preview. */}
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

      {/* Flatten result toast. */}
      {flattenToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-surface-95 border border-subtle shadow-lg text-xs text-md">
          {flattenToast}
        </div>
      )}

      {/* Desktop only — MobileChatLayout owns its own session drawer on
          mobile, so gating this on md+ prevents two drawers stacking. */}
      <div className="hidden md:contents">
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
      </div>

      <QuotaExceededModal
        open={quotaModal !== null}
        variant={quotaModal?.variant ?? "quota"}
        message={quotaModal?.message}
        onClose={() => setQuotaModal(null)}
      />
    </>
  );
}
