"use client";
// components/MarkdownContent.tsx
//
// 将 AI 回复渲染为 Markdown，同时支持锚点高亮。
// Renders AI replies as Markdown while supporting anchor highlights.
//
// 高亮策略 / Highlight strategy:
//   react-markdown 将 Markdown 解析为 React 树，每个段落 / 列表项里的直接文本
//   子节点是纯字符串。highlightStr() 在这些字符串中查找锚点文字并插入
//   彩色 <span>，再递归处理 <strong> / <em> 等内联元素中的文本子节点。
//
//   react-markdown processes Markdown into a React tree; direct text children of
//   paragraphs / list items are plain strings. highlightStr() searches those strings
//   for anchor text and inserts colored <span> elements, then recurses into inline
//   elements such as <strong> and <em>.
//
//   已知限制 / Known limitation:
//   如果锚点文字跨越 Markdown 格式边界（如 "**粗体** 普通" 选中 "粗体 普通"），
//   高亮将无法命中，但 pin 本身仍然正常工作。
//   If anchor text spans a Markdown formatting boundary (e.g. selecting across
//   "**bold** plain"), the highlight won't appear, but the pin still works.

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnchorRange } from "./MainThread/MessageBubble";

// ── 颜色 / Colors ─────────────────────────────────────────────────────
// 5 色锚点颜料 — 读 globals.css 的 --pig-1..5（light=muted、dark=原亮色）
// Anchor pigments from globals.css; auto-switches with theme.
const ANCHOR_COLORS = [
  "var(--pig-1)",
  "var(--pig-2)",
  "var(--pig-3)",
  "var(--pig-4)",
  "var(--pig-5)",
];

function buildColorMap(anchors: AnchorRange[]): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const { threadId } of anchors) {
    if (!map.has(threadId)) map.set(threadId, ANCHOR_COLORS[idx++ % ANCHOR_COLORS.length]);
  }
  return map;
}

// ── 单个文本块内查找并高亮锚点 / Highlight anchors within one text chunk ──
// highlightedIds：已在前面的文本块中命中过的锚点集合，确保每个锚点只高亮一次

function highlightStr(
  text: string,
  anchors: AnchorRange[],
  colorMap: Map<string, string>,
  highlightedIds: Set<string>,
  onAnchorClick?: (threadId: string) => void,
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void,
  unreadThreadIds?: Set<string>,
): React.ReactNode {
  if (!anchors.length) return text;

  // 跨段落选中时 anchorText 含 \n，Markdown 渲染后文本节点无 \n，
  // 取第一个非空段落作为匹配标记（高亮第一段）
  type Span = { start: number; end: number; threadId: string };
  const spans: Span[] = [];
  for (const { text: anchorText, threadId } of anchors) {
    // 已在其他文本块中高亮过，跳过，确保不重复高亮相同文字
    if (highlightedIds.has(threadId)) continue;
    const searchText = anchorText.includes("\n")
      ? (anchorText.split("\n").find((s) => s.trim()) ?? anchorText)
      : anchorText;
    // 只取第一个匹配位置，不循环查找所有出现位置
    const idx = text.indexOf(searchText);
    if (idx !== -1) {
      spans.push({ start: idx, end: idx + searchText.length, threadId });
      highlightedIds.add(threadId); // 标记已高亮，后续文本块跳过此锚点
    }
  }
  if (!spans.length) return text;

  // 用边界点切分文本，为覆盖的 segment 包 span / Segment text at boundary points; wrap covered segments in spans
  const points = new Set([0, text.length]);
  for (const { start, end } of spans) { points.add(start); points.add(end); }
  const sorted = [...points].sort((a, b) => a - b);

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    const segText = text.slice(segStart, segEnd);
    if (!segText) continue;

    const covering = spans.filter(s => s.start <= segStart && s.end >= segEnd);
    if (!covering.length) {
      nodes.push(segText);
      continue;
    }

    // 嵌套彩色下划线 / Nested colored underlines
    let inner: React.ReactNode = segText;
    for (let j = covering.length - 1; j >= 0; j--) {
      const color = colorMap.get(covering[j].threadId)!;
      inner = (
        <span key={covering[j].threadId} style={{ borderBottom: `2px solid ${color}`, paddingBottom: "3px" }}>
          {inner}
        </span>
      );
    }

    const allThreadIds = covering.map(c => c.threadId);
    const isUnread = !!unreadThreadIds && allThreadIds.some((id) => unreadThreadIds.has(id));
    nodes.push(
      <span
        key={segStart}
        data-anchor-thread-ids={allThreadIds.join(" ")}
        data-unread={isUnread ? "1" : undefined}
        className={`anchor-span text-indigo-200 rounded-sm px-0.5 cursor-pointer transition-colors ${
          isUnread ? "anchor-unread" : "bg-indigo-900/30 hover:bg-indigo-800/50"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
          onAnchorClick?.(covering[0].threadId);
        }}
        onMouseEnter={(e) => {
          onAnchorHover?.(allThreadIds, (e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
        onMouseLeave={() => onAnchorHover?.([], null)}
      >
        {inner}
      </span>
    );
  }

  return nodes.length === 1 ? nodes[0] : <React.Fragment key={text.slice(0, 8)}>{nodes}</React.Fragment>;
}

// ── 递归处理子节点 / Recursively process children ─────────────────────

function processChildren(
  children: React.ReactNode,
  anchors: AnchorRange[],
  colorMap: Map<string, string>,
  highlightedIds: Set<string>,
  onAnchorClick?: (threadId: string) => void,
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void,
  unreadThreadIds?: Set<string>,
): React.ReactNode {
  if (!anchors.length) return children;
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return highlightStr(child, anchors, colorMap, highlightedIds, onAnchorClick, onAnchorHover, unreadThreadIds);
    }
    if (React.isValidElement(child) && child.props) {
      const props = child.props as Record<string, unknown>;
      if (props.children !== undefined) {
        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          children: processChildren(props.children as React.ReactNode, anchors, colorMap, highlightedIds, onAnchorClick, onAnchorHover, unreadThreadIds),
        });
      }
    }
    return child;
  });
}

// ── 主组件 / Main component ───────────────────────────────────────────

interface Props {
  content: string;
  anchors?: AnchorRange[];
  unreadThreadIds?: Set<string>;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
}

// React.memo: props 不变时跳过 re-render，保留浏览器文字选区
const MarkdownContent = React.memo(function MarkdownContent({ content, anchors = [], unreadThreadIds, onAnchorClick, onAnchorHover }: Props) {
  const colorMap = buildColorMap(anchors);

  // 每次渲染创建一个新的 Set，跨文本块共享，确保每个锚点只高亮一次
  const highlightedIds = new Set<string>();

  const hl = (children: React.ReactNode) =>
    processChildren(children, anchors, colorMap, highlightedIds, onAnchorClick, onAnchorHover, unreadThreadIds);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // ── 块级元素 / Block elements ─────────────────────────────────
        p:          ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{hl(children)}</p>,
        h1:         ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2 border-b border-base pb-1">{hl(children)}</h1>,
        h2:         ({ children }) => <h2 className="text-base font-bold mt-3 mb-1.5">{hl(children)}</h2>,
        h3:         ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-md">{hl(children)}</h3>,
        ul:         ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-0.5">{children}</ul>,
        ol:         ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-0.5">{children}</ol>,
        li:         ({ children }) => <li className="leading-relaxed">{hl(children)}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-strong pl-3 my-2 text-lo italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-base my-3" />,

        // ── 表格 / Table ──────────────────────────────────────────────
        table: ({ children }) => (
          <div className="overflow-x-auto my-3">
            <table className="min-w-full text-xs border border-base rounded">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-elevated">{children}</thead>,
        th:    ({ children }) => <th className="px-3 py-1.5 text-left font-semibold border-b border-base text-md">{hl(children)}</th>,
        td:    ({ children }) => <td className="px-3 py-1.5 border-b border-subtle text-hi">{hl(children)}</td>,

        // ── 行内元素 / Inline elements ────────────────────────────────
        strong: ({ children }) => <strong className="font-semibold text-hi">{hl(children)}</strong>,
        em:     ({ children }) => <em className="italic text-md">{hl(children)}</em>,
        del:    ({ children }) => <del className="line-through text-dim">{hl(children)}</del>,
        a:      ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300 transition-colors"
          >
            {children}
          </a>
        ),

        // ── 代码 / Code ───────────────────────────────────────────────
        // 注意：react-markdown v9+ 用 code 组件同时处理行内和块级代码。
        // Note: react-markdown v9+ uses a single code component for both inline and block code.
        code: ({ className, children, ...rest }) => {
          // 有语言 class（如 language-python）→ 块级代码
          // Has language class (e.g. language-python) → fenced code block
          const isBlock = /language-/.test(className ?? "");
          const lang = (className ?? "").replace("language-", "");
          if (isBlock) {
            return (
              <div className="my-3 rounded-lg overflow-hidden border border-base">
                {lang && (
                  <div className="flex items-center justify-between bg-surface px-3 py-1 border-b border-base">
                    <span className="text-[11px] text-dim font-mono">{lang}</span>
                  </div>
                )}
                <pre className="bg-base px-4 py-3 overflow-x-auto">
                  <code className="text-sm font-mono text-hi whitespace-pre">{children}</code>
                </pre>
              </div>
            );
          }
          // 行内代码 / Inline code
          return (
            <code
              className="bg-elevated text-hi rounded px-1 py-0.5 text-[0.85em] font-mono border border-subtle"
              {...rest}
            >
              {children}
            </code>
          );
        },

        // pre はreact-markdown が code を包む際に生成するが、
        // code コンポーネント側でブロックを丸ごとレンダリングするため不要
        // react-markdown generates <pre> wrapping <code> for fenced blocks;
        // since we handle the entire block inside the code component, skip pre here
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

export default MarkdownContent;
