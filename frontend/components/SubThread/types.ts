// components/SubThread/types.ts
// 子线程相关的共享类型；Mobile 端仍然使用这些类型来构造卡片数据。
// Shared types for sub-thread views; still used by the mobile layout.

import type { Thread, Message } from "@/lib/api";

export interface ThreadCardItem {
  thread: Thread;
  messages: Message[];
  streamingText?: string;
  /** 首个 chunk 到达前显示的后台状态文字
   *  Status text shown before the first chunk arrives. */
  statusText?: string;
  suggestions: string[];
  unreadCount: number;
  /** 锚点消息在主滚动内容中的绝对 top 偏移（px）
   *  Absolute top offset (px) of the anchor message within the main scroller. */
  anchorTop: number;
}
