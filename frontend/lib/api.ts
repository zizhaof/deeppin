// frontend/lib/api.ts
// 后端 API 调用封装

// rewrites 在 next.config.ts 里把 /api/* 代理到后端，浏览器无需直接访问后端
const BASE_URL = "";

export interface Session {
  id: string;
  title: string | null;
  created_at: string;
  threads?: Thread[];
}

export interface Thread {
  id: string;
  session_id: string;
  parent_thread_id: string | null;
  anchor_text: string | null;
  anchor_message_id: string | null;
  anchor_start_offset: number | null;
  anchor_end_offset: number | null;
  side: "left" | "right" | null;
  title: string | null;
  suggestions: string[] | null;
  depth: number;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  token_count: number | null;
  created_at: string;
}

/** 获取所有 sessions 列表（按创建时间倒序） */
export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE_URL}/api/sessions`);
  if (!res.ok) throw new Error(`获取会话列表失败: ${res.status}`);
  return res.json();
}

/** 创建新 session，后端自动创建对应主线 thread */
export async function createSession(title?: string): Promise<Session> {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title ?? null }),
  });
  if (!res.ok) throw new Error(`创建 session 失败: ${res.status}`);
  return res.json();
}

/** 获取 session 详情（含 threads 列表） */
export async function getSession(sessionId: string): Promise<Session> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`获取 session 失败: ${res.status}`);
  return res.json();
}

/** 创建子线程（插针） */
export async function createThread(params: {
  session_id: string;
  parent_thread_id?: string;
  anchor_text?: string;
  anchor_message_id?: string;
  side?: "left" | "right";
  anchor_start_offset?: number;
  anchor_end_offset?: number;
  depth?: number;
}): Promise<Thread> {
  const res = await fetch(`${BASE_URL}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`创建线程失败: ${res.status}`);
  return res.json();
}

/** 获取针对该线程锚点的追问建议 */
export async function getSuggestions(threadId: string): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/suggest`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.questions ?? [];
}

/** 获取线程消息历史 */
export async function getMessages(threadId: string): Promise<Message[]> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/messages`);
  if (!res.ok) throw new Error(`获取消息失败: ${res.status}`);
  return res.json();
}

/** 批量获取 session 下所有线程的消息（一次请求替代 N 次串行请求） */
export async function getAllMessages(sessionId: string): Promise<Record<string, Message[]>> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error(`批量获取消息失败: ${res.status}`);
  return res.json();
}

/** 上传附件，后端异步提取文本并向量化（不返回文本内容，通过 RAG 检索注入 context） */
export async function uploadAttachment(
  sessionId: string,
  file: File,
): Promise<{ filename: string; chunk_count: number; inline_text: string | null }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/attachments/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `附件上传失败: ${res.status}`);
  }
  return res.json();
}
