// frontend/lib/api.ts
// 后端 API 调用封装

import { createClient } from "./supabase";

// rewrites 在 next.config.ts 里把 /api/* 代理到后端，浏览器无需直接访问后端
const BASE_URL = "";

/** 获取带 Authorization header 的 JSON 请求头 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

/**
 * 检查响应状态，401 时跳转登录页（token 在长会话中过期时触发）。
 * Check response status; redirect to login on 401 (fires when token expires during a long session).
 * 读取 JSON body 中的 detail 字段，给用户展示有意义的错误信息。
 * Reads the detail field from the JSON body to surface meaningful error messages to the user.
 */
async function assertOk(res: Response, errorMessage: string): Promise<void> {
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail ?? "";
    } catch { /* ignore parse errors */ }
    throw new Error(detail || `${errorMessage}: ${res.status}`);
  }
}

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
  /** 生成该回复的 LLM 模型名（如 "groq/llama-3.3-70b-versatile"） */
  model?: string | null;
}

/** 获取所有 sessions 列表（按创建时间倒序） */
export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "获取会话列表失败");
  return res.json();
}

/** 删除 session（级联删除所有 threads/messages/summaries） */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  if (res.status === 404) throw new Error("Session 不存在");
  if (!res.ok) throw new Error(`删除 session 失败: ${res.status}`);
}

/** 创建新 session，后端自动创建对应主线 thread
 *  可传入客户端预生成的 { id } 以避免 DB 自动分配新 UUID。
 *  Pass a client-pre-generated { id } to reuse a UUID without a prior DB write.
 */
export async function createSession(opts?: string | { id?: string; title?: string }): Promise<Session> {
  const title = typeof opts === "string" ? opts : opts?.title ?? null;
  const id = typeof opts === "object" ? (opts.id ?? null) : null;
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ title, id }),
  });
  await assertOk(res, "创建 session 失败");
  return res.json();
}

/** 获取 session 详情（含 threads 列表） */
export async function getSession(sessionId: string): Promise<Session> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "获取 session 失败");
  return res.json();
}

/** 创建子线程（插针） */
export async function createThread(params: {
  session_id: string;
  parent_thread_id?: string;
  anchor_text?: string;
  anchor_message_id?: string;
  anchor_start_offset?: number;
  anchor_end_offset?: number;
  depth?: number;
}): Promise<Thread> {
  const res = await fetch(`${BASE_URL}/api/threads`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(params),
  });
  await assertOk(res, "创建线程失败");
  return res.json();
}

/** 获取针对该线程锚点的追问建议 */
export async function getSuggestions(threadId: string): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/suggest`, {
    headers: await getAuthHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.questions ?? [];
}

export interface RelevanceItem {
  thread_id: string;
  selected: boolean;
  reason: string;
}

/** 获取子线程与主线的相关性评估（用于合并输出节点默认选中）*/
export async function getRelevance(sessionId: string): Promise<RelevanceItem[]> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/relevance`, {
    method: "POST",
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "Failed to get relevance");
  return res.json();
}

/** 获取线程消息历史 */
export async function getMessages(threadId: string): Promise<Message[]> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/messages`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "获取消息失败");
  return res.json();
}

/** 批量获取 session 下所有线程的消息（一次请求替代 N 次串行请求） */
export async function getAllMessages(sessionId: string): Promise<Record<string, Message[]>> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/messages`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "批量获取消息失败");
  return res.json();
}

/** 直接保存一条 assistant 消息到指定线程（不触发 AI，用于保存合并结果） */
export async function saveAssistantMessage(threadId: string, content: string): Promise<Message> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/messages`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ role: "assistant", content }),
  });
  await assertOk(res, "保存消息失败");
  return res.json();
}

/** 获取线程及所有后代的树结构（用于删除前预览） */
export async function getThreadSubtree(threadId: string): Promise<{ id: string; title: string | null; children: unknown[] }> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/subtree`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "获取子树失败");
  return res.json();
}

/** 删除线程及所有后代 */
export async function deleteThread(threadId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  if (res.status === 404) throw new Error("线程不存在");
  if (!res.ok) throw new Error(`删除线程失败: ${res.status}`);
}

/** 删除当前用户账号及所有对话数据（不可撤销） */
export async function deleteAccount(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/users/me`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail ?? ""; } catch { /* ignore */ }
    throw new Error(detail || `删除账号失败: ${res.status}`);
  }
}

/** 上传附件，后端异步提取文本并向量化（不返回文本内容，通过 RAG 检索注入 context） */
export async function uploadAttachment(
  sessionId: string,
  file: File,
): Promise<{ filename: string; chunk_count: number; inline_text: string | null }> {
  const form = new FormData();
  form.append("file", file);
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/attachments/upload`, {
    method: "POST",
    // headers: 只传 Authorization，不设 Content-Type（FormData 由浏览器自动处理 multipart boundary）
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `附件上传失败: ${res.status}`);
  }
  return res.json();
}
