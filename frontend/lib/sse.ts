// frontend/lib/sse.ts
// SSE 客户端 —— 流式接收 AI 回复

const BASE_URL = "";

export type SSEEvent =
  | { type: "ping" }
  | { type: "status"; text: string }
  | { type: "chunk"; content: string }
  | { type: "done"; message_id?: string | null }
  | { type: "error"; message: string }
  | { type: "thread_title"; thread_id: string; title: string };

export type MergeFormat = "free" | "bullets" | "structured";

/**
 * 触发合并生成，通过 SSE 流式接收合并报告。
 * Trigger merge generation and receive the merged report via SSE streaming.
 */
export async function sendMergeStream(
  sessionId: string,
  format: MergeFormat,
  onChunk: (chunk: string) => void,
  onDone: (fullText: string) => void,
  onError: (message: string) => void,
  onStatus?: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionId}/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format }),
  });

  if (!res.ok || !res.body) {
    onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok || !res.body) {
    onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
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
  onDone: (fullText: string, messageId: string | null) => void,
  onError: (message: string) => void,
  onThreadTitle?: (threadId: string, title: string) => void,
  onStatus?: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/threads/${threadId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok || !res.body) {
    onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
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
          onDone(fullText, event.message_id);
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
