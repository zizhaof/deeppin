// frontend/lib/sse.ts
// SSE 客户端 —— 流式接收 AI 回复

import { createClient } from "./supabase";

const BASE_URL = "";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Not authenticated");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

/** 非 SSE 路径的错误信息（被 onError 附带返回给调用方）。
 *  Structured error info emitted alongside the message (for quota-type 402/403 handling).
 */
export type SseErrorInfo = { status?: number; code?: string };

/** 检查 SSE 响应状态，401 跳登录；402/403 解析结构化 detail 传回调用方。
 *  On non-2xx: parse detail for a `code` so the caller can trigger quota modal etc.
 */
async function assertSseOk(
  res: Response,
  onError: (msg: string, info?: SseErrorInfo) => void,
): Promise<boolean> {
  if (!res.ok || !res.body) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.clone().json();
      const detail = body?.detail;
      if (detail && typeof detail === "object") {
        code = (detail as { code?: string }).code;
        message = (detail as { message?: string }).message ?? message;
      } else if (typeof detail === "string" && detail) {
        message = detail;
      }
    } catch { /* ignore */ }
    onError(message, { status: res.status, code });
    return false;
  }
  return true;
}

export type SSEEvent =
  | { type: "ping" }
  | { type: "status"; text: string }
  | { type: "chunk"; content: string }
  | { type: "done"; message_id?: string | null; model?: string | null }
  | { type: "error"; message: string }
  | { type: "thread_title"; thread_id: string; title: string };

export type MergeFormat = "free" | "bullets" | "structured" | "custom" | "transcript";

/**
 * 触发合并生成，通过 SSE 流式接收合并报告。
 * Trigger merge generation and receive the merged report via SSE streaming.
 */
export async function sendMergeStream(
  sessionId: string,
  format: MergeFormat,
  threadIds: string[] | null,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (message: string) => void,
  onStatus?: (text: string) => void,
  customPrompt?: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/merge`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      format,
      ...(threadIds !== null ? { thread_ids: threadIds } : {}),
      ...(format === "custom" && customPrompt ? { custom_prompt: customPrompt } : {}),
    }),
  });

  if (!(await assertSseOk(res, onError))) return;

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event: SSEEvent = JSON.parse(line.slice(6));
        if (event.type === "status") onStatus?.(event.text);
        else if (event.type === "chunk") { fullText += event.content; onChunk(event.content); }
        else if (event.type === "done") onDone(fullText);
        else if (event.type === "error") onError(event.message);
      } catch { /* ignore */ }
    }
  }
}

/**
 * 向指定线程发送消息，通过 SSE 接收流式回复。
 *
 * @param threadId  目标线程 ID
 * @param content   用户消息
 * @param onChunk   每收到一个 chunk 调用
 * @param onDone    流结束时调用（含完整回复文本）
 * @param onError   出错时调用
 */
/** 联网搜索流式请求，SSE 格式与普通对话完全一致。*/
export async function sendSearchStream(
  query: string,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (message: string) => void,
  onStatus?: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/search`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ query }),
  });

  if (!(await assertSseOk(res, onError))) return;

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event: SSEEvent = JSON.parse(line.slice(6));
        if (event.type === "status") onStatus?.(event.text);
        else if (event.type === "chunk") { fullText += event.content; onChunk(event.content); }
        else if (event.type === "done") onDone(fullText);
        else if (event.type === "error") onError(event.message);
      } catch { /* ignore */ }
    }
  }
}

export async function sendMessageStream(
  threadId: string,
  content: string,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string, messageId: string | null, model?: string | null) => void,
  onError: (message: string, info?: SseErrorInfo) => void,
  onThreadTitle?: (threadId: string, title: string) => void,
  onStatus?: (text: string) => void,
  attachmentFilename?: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/chat`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      content,
      ...(attachmentFilename ? { attachment_filename: attachmentFilename } : {}),
    }),
  });

  if (!(await assertSseOk(res, onError))) return;

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 保留未完成的行

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event: SSEEvent = JSON.parse(line.slice(6));
        if (event.type === "ping") {
          // 连接确认，忽略
        } else if (event.type === "status") {
          onStatus?.(event.text);
        } else if (event.type === "chunk") {
          fullText += event.content;
          onChunk(event.content);
        } else if (event.type === "done") {
          onDone(fullText, event.message_id ?? null, event.model);
        } else if (event.type === "error") {
          onError(event.message);
        } else if (event.type === "thread_title") {
          onThreadTitle?.(event.thread_id, event.title);
        }
      } catch {
        // 忽略解析失败的行
      }
    }
  }
}
