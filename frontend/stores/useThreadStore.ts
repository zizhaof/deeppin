// frontend/stores/useThreadStore.ts
// 线程树状态 + 激活线程管理

import { create } from "zustand";
import type { Message, Thread } from "@/lib/api";

// ── localStorage 未读持久化 ──────────────────────────────────────
// 存储格式：JSON 数组，内容为有未读消息的 thread ID 列表
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
  /** 当前 session 的所有线程（含主线） */
  threads: Thread[];
  /** 激活线程 ID */
  activeThreadId: string | null;
  /** 各线程的消息（thread_id → messages） */
  messagesByThread: Record<string, Message[]>;
  /** 各线程当前正在流式生成的文本（thread_id → partial text） */
  streamingByThread: Record<string, string>;
  /** 各线程的后台状态提示（thread_id → status text），首个 chunk 到达后清空 */
  statusByThread: Record<string, string>;
  /** 插针时选中文字相对主滚动内容的精确 top（px），用于侧栏精确对齐 */
  anchorTextTops: Record<string, number>;
  /** 每个子线程的追问建议（thread_id → questions） */
  suggestions: Record<string, string[]>;
  /** 用户手动拖拽后的卡片 Y 坐标（覆盖锚点对齐，thread_id → px） */
  userCardPositions: Record<string, number>;
  /** 折叠状态（thread_id → collapsed） */
  collapsedCards: Record<string, boolean>;
  /** 未读消息数（thread_id → count），持久化到 localStorage */
  unreadCounts: Record<string, number>;
  /** 导航历史栈（thread_id 列表） */
  navHistory: string[];
  /** 当前在历史栈中的位置 */
  navIndex: number;

  setThreads: (threads: Thread[]) => void;
  /** 导航到某线程（写入历史栈，清零未读） */
  navigateTo: (threadId: string) => void;
  navigateBack: () => void;
  navigateForward: () => void;
  /** 插针：新增子线程并记录选中文字的精确 Y 坐标 */
  pinThread: (thread: Thread, anchorTextTop?: number) => void;
  /** 设置子线程的追问建议 */
  setSuggestions: (threadId: string, questions: string[]) => void;
  /** 消费一条建议（用户点击后移除） */
  consumeSuggestion: (threadId: string, question: string) => void;
  /** 保存用户拖拽后的卡片位置 */
  setUserCardPosition: (threadId: string, y: number) => void;
  /** 切换卡片折叠状态 */
  toggleCardCollapsed: (threadId: string) => void;
  addThread: (thread: Thread) => void;
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
  anchorTextTops: {},
  suggestions: {},
  userCardPositions: {},
  collapsedCards: {},
  unreadCounts: {},
  navHistory: [],
  navIndex: -1,

  setThreads: (threads) => {
    // 为每个线程初始化空消息数组，避免消息加载失败时 msgOrder 为 undefined 导致排序错乱
    const initialMessages: Record<string, Message[]> = {};
    for (const t of threads) {
      initialMessages[t.id] = [];
    }

    // 从 localStorage 恢复未读状态（仅保留当前 session 的线程）
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

  pinThread: (thread, anchorTextTop) =>
    set((s) => ({
      threads: [...s.threads, thread],
      messagesByThread: { ...s.messagesByThread, [thread.id]: [] },
      anchorTextTops: anchorTextTop !== undefined
        ? { ...s.anchorTextTops, [thread.id]: anchorTextTop }
        : s.anchorTextTops,
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

  setUserCardPosition: (threadId, y) =>
    set((s) => ({ userCardPositions: { ...s.userCardPositions, [threadId]: y } })),

  toggleCardCollapsed: (threadId) =>
    set((s) => ({
      collapsedCards: { ...s.collapsedCards, [threadId]: !s.collapsedCards[threadId] },
    })),

  addThread: (thread) =>
    set((s) => ({ threads: [...s.threads, thread] })),

  removeThreadAndDescendants: (threadId) =>
    set((s) => {
      // 递归收集所有后代 id
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
        anchorTextTops: clean(s.anchorTextTops),
        suggestions: clean(s.suggestions),
        userCardPositions: clean(s.userCardPositions),
        collapsedCards: clean(s.collapsedCards),
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
      delete status[threadId]; // 首个 chunk 到达，清除 status
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
        token_count: null,
        created_at: new Date().toISOString(),
        model: model ?? null,
      };
      const streaming = { ...s.streamingByThread };
      delete streaming[threadId];

      // 若当前不在该线程，计入未读并持久化
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
        token_count: null,
        created_at: new Date().toISOString(),
      };
      return {
        messagesByThread: { ...s.messagesByThread, [threadId]: [...prev, userMsg] },
      };
    }),
}));
