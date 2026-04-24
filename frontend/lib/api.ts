// Wrapper around backend API calls.

import { createClient } from "./supabase";

// next.config.ts rewrites /api/* to the backend, so the browser never hits the backend directly.
const BASE_URL = "";

/** Build JSON request headers with the Authorization bearer token. */
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
 * API error carrying structured detail (used by 402/403 anon-quota paths).
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Check response status; redirect to login on 401 (fires when token expires during a long session).
 * Reads the detail field; it may be a string or a {code, message, ...} object
 * (anon-quota 402/403 uses the object form).
 */
async function assertOk(res: Response, errorMessage: string): Promise<void> {
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    let message = `${errorMessage}: ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      const detail = body?.detail;
      if (detail && typeof detail === "object") {
        code = (detail as { code?: string }).code;
        message = (detail as { message?: string }).message ?? message;
      } else if (typeof detail === "string" && detail) {
        message = detail;
      }
    } catch { /* ignore parse errors */ }
    throw new ApiError(message, res.status, code);
  }
}

export interface Session {
  id: string;
  title: string | null;
  created_at: string;
  turn_count?: number;
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
  depth: number;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  /** Name of the LLM model that produced this reply (e.g. "groq/llama-3.3-70b-versatile"). */
  model?: string | null;
}

/** List all sessions (newest first). */
export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "获取会话列表失败");
  return res.json();
}

/** Delete a session (cascades to all threads/messages/summaries). */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  if (res.status === 404) throw new Error("Session 不存在");
  if (!res.ok) throw new Error(`删除 session 失败: ${res.status}`);
}

/** Create a new session; the backend auto-creates the corresponding main thread.
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

/** Get session detail (including its threads list). */
export async function getSession(sessionId: string): Promise<Session> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "获取 session 失败");
  return res.json();
}

/** Create a sub-thread (pin). */
export async function createThread(params: {
  session_id: string;
  parent_thread_id?: string;
  anchor_text?: string;
  anchor_message_id?: string;
  anchor_start_offset?: number;
  anchor_end_offset?: number;
  depth?: number;
  lang?: string;
}): Promise<Thread> {
  const res = await fetch(`${BASE_URL}/api/threads`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify(params),
  });
  await assertOk(res, "创建线程失败");
  return res.json();
}

/** Get follow-up suggestions and the LLM-generated title for this thread's anchor.
 *  Title is bundled here so callers can swap the anchor placeholder once the
 *  background _generate_and_patch task on the server has produced it. */
export async function getSuggestions(
  threadId: string,
  lang?: string,
): Promise<{ questions: string[]; title: string | null }> {
  const qs = lang ? `?${new URLSearchParams({ lang }).toString()}` : "";
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/suggest${qs}`, {
    headers: await getAuthHeaders(),
  });
  if (!res.ok) return { questions: [], title: null };
  const data = await res.json();
  return { questions: data.questions ?? [], title: data.title ?? null };
}

/** Get a thread's message history. */
export async function getMessages(threadId: string): Promise<Message[]> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/messages`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "获取消息失败");
  return res.json();
}

/** Batch-fetch messages for every thread in a session (one request instead of N serial calls). */
export async function getAllMessages(sessionId: string): Promise<Record<string, Message[]>> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/messages`, {
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "批量获取消息失败");
  return res.json();
}

/** Save an assistant message directly to a thread (no AI call; used for merge results). */
export async function saveAssistantMessage(threadId: string, content: string): Promise<Message> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/messages`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ role: "assistant", content }),
  });
  await assertOk(res, "保存消息失败");
  return res.json();
}

/** Delete a thread and all its descendants. */
export async function deleteThread(threadId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  if (res.status === 404) throw new Error("线程不存在");
  if (!res.ok) throw new Error(`删除线程失败: ${res.status}`);
}

/** Delete the current user account and all conversation data (irreversible). */
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

/**
 * Flatten the session: merge all sub-thread messages back into the main thread via preorder DFS;
 * mark sub-threads as flattened (tombstone). **Irreversible.**
 */
export async function flattenSession(sessionId: string): Promise<{
  flattened_thread_count: number;
  already_flattened: boolean;
}> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/flatten`, {
    method: "POST",
    headers: await getAuthHeaders(),
  });
  await assertOk(res, "扁平化失败");
  return res.json();
}

/** Upload an attachment; backend extracts text and vectorizes asynchronously (no text in response — RAG retrieval injects it into context). */
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
    // headers: send Authorization only — do not set Content-Type so the browser picks the multipart boundary for FormData.
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `附件上传失败: ${res.status}`);
  }
  return res.json();
}
