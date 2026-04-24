"use client";
// Renders AI replies as Markdown while supporting anchor highlights.
//
// Highlight strategy:
//   react-markdown processes Markdown into a React tree; direct text children of
//   paragraphs / list items are plain strings. highlightStr() searches those
//   strings for anchor text and inserts colored <span> elements, then recurses
//   into inline elements such as <strong> and <em>.
//
//   Known limitation:
//   If anchor text spans a Markdown formatting boundary (e.g. selecting across
//   "**bold** plain"), the highlight won't appear, but the pin still works.

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnchorRange } from "./MainThread/MessageBubble";

// ── Colors ───────────────────────────────────────────────────────────
// 5-color anchor pigments — reads --pig-1..5 from globals.css (light=muted, dark=brighter).
// Auto-switches with theme.
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

// ── Highlight anchors within one text chunk ──────────────────────────
// highlightedIds: set of anchors already highlighted in earlier text chunks,
// so each anchor is only highlighted once.

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

  // When selection spans paragraphs, anchorText contains \n but Markdown text
  // nodes don't — match against the first non-empty paragraph (highlight that one).
  type Span = { start: number; end: number; threadId: string };
  const spans: Span[] = [];
  for (const { text: anchorText, threadId } of anchors) {
    // Already highlighted in another text chunk — skip to avoid duplicate highlights.
    if (highlightedIds.has(threadId)) continue;
    const searchText = anchorText.includes("\n")
      ? (anchorText.split("\n").find((s) => s.trim()) ?? anchorText)
      : anchorText;
    // Use only the first match location; don't loop over every occurrence.
    const idx = text.indexOf(searchText);
    if (idx !== -1) {
      spans.push({ start: idx, end: idx + searchText.length, threadId });
      highlightedIds.add(threadId); // mark as highlighted so later chunks skip this anchor
    }
  }
  if (!spans.length) return text;

  // Segment text at boundary points; wrap covered segments in spans.
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

    const allThreadIds = covering.map(c => c.threadId);
    const isUnread = !!unreadThreadIds && allThreadIds.some((id) => unreadThreadIds.has(id));

    // State via underline thickness only — 3px unread, 1px read, no background wash.
    let inner: React.ReactNode = segText;
    for (let j = covering.length - 1; j >= 0; j--) {
      const color = colorMap.get(covering[j].threadId)!;
      inner = (
        <span
          key={covering[j].threadId}
          style={{ borderBottom: `${isUnread ? 3 : 1}px solid ${color}`, paddingBottom: "2px" }}
        >
          {inner}
        </span>
      );
    }

    nodes.push(
      <span
        key={segStart}
        data-anchor-thread-ids={allThreadIds.join(" ")}
        data-unread={isUnread ? "1" : undefined}
        className="anchor-span cursor-pointer"
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

// ── Recursively process children ────────────────────────────────────

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

// ── Main component ──────────────────────────────────────────────────

interface Props {
  content: string;
  anchors?: AnchorRange[];
  unreadThreadIds?: Set<string>;
  onAnchorClick?: (threadId: string) => void;
  onAnchorHover?: (threadIds: string[], rect: DOMRect | null) => void;
}

// React.memo: skip re-render when props are unchanged, so the browser text selection survives.
const MarkdownContent = React.memo(function MarkdownContent({ content, anchors = [], unreadThreadIds, onAnchorClick, onAnchorHover }: Props) {
  const colorMap = buildColorMap(anchors);

  // Fresh Set per render, shared across text chunks so each anchor is highlighted exactly once.
  const highlightedIds = new Set<string>();

  const hl = (children: React.ReactNode) =>
    processChildren(children, anchors, colorMap, highlightedIds, onAnchorClick, onAnchorHover, unreadThreadIds);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // ── Block elements ──────────────────────────────────────────
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

        // ── Table ───────────────────────────────────────────────────
        table: ({ children }) => (
          <div className="overflow-x-auto my-3">
            <table className="min-w-full text-xs border border-base rounded">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-elevated">{children}</thead>,
        th:    ({ children }) => <th className="px-3 py-1.5 text-left font-semibold border-b border-base text-md">{hl(children)}</th>,
        td:    ({ children }) => <td className="px-3 py-1.5 border-b border-subtle text-hi">{hl(children)}</td>,

        // ── Inline elements ─────────────────────────────────────────
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

        // ── Code ────────────────────────────────────────────────────
        // Note: react-markdown v9+ uses a single code component for both inline and block code.
        code: ({ className, children, ...rest }) => {
          // Has language class (e.g. language-python) → fenced code block.
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
          // Inline code.
          return (
            <code
              className="bg-elevated text-hi rounded px-1 py-0.5 text-[0.85em] font-mono border border-subtle"
              {...rest}
            >
              {children}
            </code>
          );
        },

        // react-markdown wraps <code> with <pre> for fenced blocks; since we
        // render the whole block inside the code component, skip <pre> here.
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

export default MarkdownContent;
