// Thread-tree state + active-thread management.

import { create } from "zustand";
import type { Message, Thread } from "@/lib/api";

// ── Unread-state localStorage persistence ────────────────────────
// Storage format: JSON array of thread IDs with unread messages.
const UNREAD_LS_KEY = "deeppin:unread";

function loadUnreadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(UNREAD_LS_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveUnreadIds(unread: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    const ids = Object.entries(unread)
      .filter(([, v]) => v > 0)
      .map(([k]) => k);
    localStorage.setItem(UNREAD_LS_KEY, JSON.stringify(ids));
  } catch {}
}

export interface ThreadState {
  /** All threads in the current session (including the main thread). */
  threads: Thread[];
  /** Active thread ID. */
  activeThreadId: string | null;
  /** Per-thread messages (thread_id → messages). */
  messagesByThread: Record<string, Message[]>;
  /** Per-thread in-progress streaming text (thread_id → partial text). */
  streamingByThread: Record<string, string>;
  /** Per-thread background status text (thread_id → status); cleared on first chunk. */
  statusByThread: Record<string, string>;
  /** Per-sub-thread follow-up suggestions (thread_id → questions). */
  suggestions: Record<string, string[]>;
  /** Unread message counts (thread_id → count); persisted to localStorage. */
  unreadCounts: Record<string, number>;
  /** Navigation history stack (list of thread_ids). */
  navHistory: string[];
  /** Current position within the navigation history stack. */
  navIndex: number;

  setThreads: (threads: Thread[]) => void;
  /** Navigate to a thread (push history, clear its unread count). */
  navigateTo: (threadId: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  /** Pin: append a newly created sub-thread to the tree. */
  pinThread: (thread: Thread) => void;
  /** Set follow-up suggestions for a sub-thread. */
  setSuggestions: (threadId: string, questions: string[]) => void;
  /** Consume one suggestion (remove after user clicks it). */
  consumeSuggestion: (threadId: string, question: string) => void;
  removeThreadAndDescendants: (threadId: string) => void;
  updateThreadTitle: (threadId: string, title: string) => void;
  setMessages: (threadId: string, messages: Message[]) => void;
  appendChunk: (threadId: string, chunk: string) => void;
  finalizeStream: (threadId: string, fullText: string, messageId?: string | null, model?: string | null) => void;
  addUserMessage: (threadId: string, content: string) => void;
  setStreamStatus: (threadId: string, text: string) => void;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threads: [],
  activeThreadId: null,
  messagesByThread: {},
  streamingByThread: {},
  statusByThread: {},
  suggestions: {},
  unreadCounts: {},
  navHistory: [],
  navIndex: -1,

  setThreads: (threads) => {
    // Initialize an empty message array per thread so that, if message loading fails,
    // msgOrder doesn't end up undefined and break sort order.
    const initialMessages: Record<string, Message[]> = {};
    for (const t of threads) {
      initialMessages[t.id] = [];
    }

    // Restore unread state from localStorage (keep only threads in the current session).
    const storedIds = loadUnreadIds();
    const threadIdSet = new Set(threads.map((t) => t.id));
    const unread: Record<string, number> = {};
    for (const id of storedIds) {
      if (threadIdSet.has(id)) unread[id] = 1;
    }

    set({ threads, unreadCounts: unread, messagesByThread: initialMessages });
  },

  navigateTo: (threadId) =>
    set((s) => {
      const before = s.navHistory.slice(0, s.navIndex + 1);
      const newHistory = [...before, threadId];
      const unread = { ...s.unreadCounts };
      delete unread[threadId];
      saveUnreadIds(unread);
      return {
        activeThreadId: threadId,
        navHistory: newHistory,
        navIndex: newHistory.length - 1,
        unreadCounts: unread,
      };
    }),

  navigateBack: () =>
    set((s) => {
      if (s.navIndex <= 0) return {};
      const newIndex = s.navIndex - 1;
      const threadId = s.navHistory[newIndex];
      const unread = { ...s.unreadCounts };
      delete unread[threadId];
      saveUnreadIds(unread);
      return { activeThreadId: threadId, navIndex: newIndex, unreadCounts: unread };
    }),

  navigateForward: () =>
    set((s) => {
      if (s.navIndex >= s.navHistory.length - 1) return {};
      const newIndex = s.navIndex + 1;
      const threadId = s.navHistory[newIndex];
      const unread = { ...s.unreadCounts };
      delete unread[threadId];
      saveUnreadIds(unread);
      return { activeThreadId: threadId, navIndex: newIndex, unreadCounts: unread };
    }),

  pinThread: (thread) =>
    set((s) => ({
      threads: [...s.threads, thread],
      messagesByThread: { ...s.messagesByThread, [thread.id]: [] },
    })),

  setSuggestions: (threadId, questions) =>
    set((s) => ({ suggestions: { ...s.suggestions, [threadId]: questions } })),

  consumeSuggestion: (threadId, question) =>
    set((s) => ({
      suggestions: {
        ...s.suggestions,
        [threadId]: (s.suggestions[threadId] ?? []).filter((q) => q !== question),
      },
    })),

  removeThreadAndDescendants: (threadId) =>
    set((s) => {
      // Recursively collect all descendant ids.
      const toRemove = new Set<string>();
      const collect = (id: string) => {
        toRemove.add(id);
        for (const t of s.threads) {
          if (t.parent_thread_id === id) collect(t.id);
        }
      };
      collect(threadId);

      const threads = s.threads.filter((t) => !toRemove.has(t.id));
      const clean = <T>(obj: Record<string, T>) => {
        const next = { ...obj };
        for (const id of toRemove) delete next[id];
        return next;
      };

      return {
        threads,
        messagesByThread: clean(s.messagesByThread),
        streamingByThread: clean(s.streamingByThread),
        statusByThread: clean(s.statusByThread),
        suggestions: clean(s.suggestions),
        unreadCounts: clean(s.unreadCounts),
      };
    }),

  updateThreadTitle: (threadId, title) =>
    set((s) => ({
      threads: s.threads.map((t) => t.id === threadId ? { ...t, title } : t),
    })),

  setMessages: (threadId, messages) =>
    set((s) => ({
      messagesByThread: { ...s.messagesByThread, [threadId]: messages },
    })),

  appendChunk: (threadId, chunk) =>
    set((s) => {
      const status = { ...s.statusByThread };
      delete status[threadId]; // first chunk arrived — clear status
      return {
        streamingByThread: {
          ...s.streamingByThread,
          [threadId]: (s.streamingByThread[threadId] ?? "") + chunk,
        },
        statusByThread: status,
      };
    }),

  finalizeStream: (threadId, fullText, messageId, model) =>
    set((s) => {
      const prev = s.messagesByThread[threadId] ?? [];
      const assistantMsg: Message = {
        id: messageId ?? `local_${crypto.randomUUID()}`,
        thread_id: threadId,
        role: "assistant",
        content: fullText,
        created_at: new Date().toISOString(),
        model: model ?? null,
      };
      const streaming = { ...s.streamingByThread };
      delete streaming[threadId];

      // If we're not currently in this thread, count it as unread and persist.
      const isActive = get().activeThreadId === threadId;
      const unread = { ...s.unreadCounts };
      if (!isActive) {
        unread[threadId] = (unread[threadId] ?? 0) + 1;
        saveUnreadIds(unread);
      }

      const status = { ...s.statusByThread };
      delete status[threadId];

      return {
        messagesByThread: { ...s.messagesByThread, [threadId]: [...prev, assistantMsg] },
        streamingByThread: streaming,
        statusByThread: status,
        unreadCounts: unread,
      };
    }),

  setStreamStatus: (threadId, text) =>
    set((s) => ({ statusByThread: { ...s.statusByThread, [threadId]: text } })),

  addUserMessage: (threadId, content) =>
    set((s) => {
      const prev = s.messagesByThread[threadId] ?? [];
      const userMsg: Message = {
        id: crypto.randomUUID(),
        thread_id: threadId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      return {
        messagesByThread: { ...s.messagesByThread, [threadId]: [...prev, userMsg] },
      };
    }),
}));
