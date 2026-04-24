"use client";
// 3-column article detail: left auto-TOC (h1/h2 + scroll-spy), center prose,
// right metadata rail. Stripe-dev editorial: h1 with indigo top-rule + § N
// eyebrow, note with "i" badge, code blocks with indigo left-border, diagrams
// wrapped as figure + Fig. N caption.

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import { narrowToContentLang } from "@/lib/i18n";
import LangSelector from "@/components/LangSelector";
import { articles, type Article, type Block } from "../data";
import { DIAGRAMS } from "../ArticleDiagrams";

interface TocEntry {
  id: string;
  text: string;
  level: 1 | 2;
}

/** Stable IDs + § N counter for each h1/h2 block. */
function buildAnchors(body: Block[]): {
  anchorById: Map<number, { id: string; level: 1 | 2; h1Index: number | null }>;
  toc: TocEntry[];
} {
  const anchorById = new Map<number, { id: string; level: 1 | 2; h1Index: number | null }>();
  const toc: TocEntry[] = [];
  let h1Counter = 0;
  body.forEach((block, i) => {
    if (block.type === "h1" || block.type === "h2") {
      const level = block.type === "h1" ? 1 : 2;
      if (level === 1) h1Counter++;
      const id = `h-${i}`;
      anchorById.set(i, { id, level, h1Index: level === 1 ? h1Counter : null });
      toc.push({ id, text: block.text ?? "", level });
    }
  });
  return { anchorById, toc };
}

function RenderBlock({
  block,
  index,
  anchors,
  figNumberById,
}: {
  block: Block;
  index: number;
  anchors: Map<number, { id: string; level: 1 | 2; h1Index: number | null }>;
  figNumberById: Map<number, number>;
}) {
  const anchor = anchors.get(index);

  if (block.type === "h1") {
    const num = anchor?.h1Index != null ? String(anchor.h1Index).padStart(2, "0") : "";
    return (
      <h1 id={anchor?.id} className="relative font-serif text-[24px] font-semibold tracking-[-0.02em] leading-[1.25] text-ink pt-5 mt-14 mb-4">
        <span className="absolute top-0 left-0 w-10 h-[2px]" style={{ background: "var(--accent)" }} aria-hidden />
        {num && (
          <span className="block font-mono text-[11px] font-medium tracking-[0.1em] uppercase mb-1.5" style={{ color: "var(--accent)" }}>
            § {num}
          </span>
        )}
        {block.text}
      </h1>
    );
  }
  if (block.type === "h2") {
    return (
      <h2 id={anchor?.id} className="font-serif text-[18px] font-medium tracking-[-0.005em] leading-[1.35] text-ink mt-10 mb-3">
        {block.text}
      </h2>
    );
  }
  if (block.type === "h3") {
    return (
      <h3 className="font-serif text-[15px] font-medium text-md mt-6 mb-2.5">
        {block.text}
      </h3>
    );
  }
  if (block.type === "code") {
    return (
      <pre
        className="my-5 rounded-md overflow-x-auto font-mono text-[12.5px] leading-[1.55]"
        style={{
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderLeft: "3px solid var(--accent)",
          color: "var(--ink)",
          padding: "14px 16px",
          whiteSpace: "pre",
        }}
      >
        {block.text}
      </pre>
    );
  }
  if (block.type === "ul") {
    return (
      <ul className="list-none p-0 my-[18px] flex flex-col">
        {block.items?.map((it, i) => (
          <li
            key={i}
            className="relative text-[15px] leading-[1.65] pl-5 py-[3px]"
            style={{ color: "var(--ink-2)" }}
          >
            <span className="absolute left-[2px] top-[15px] w-[10px] h-px" style={{ background: "var(--accent)", opacity: 0.6 }} />
            {it}
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === "note") {
    return (
      <div
        className="relative my-5 rounded-[4px] text-[14px] leading-[1.6]"
        style={{
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          padding: "12px 16px 12px 44px",
          color: "var(--ink-2)",
        }}
      >
        <span
          className="absolute left-[14px] top-[13px] w-[18px] h-[18px] grid place-items-center rounded-full font-mono text-[11px] font-semibold italic"
          style={{ background: "var(--accent)", color: "var(--paper)" }}
        >
          i
        </span>
        {block.text}
      </div>
    );
  }
  if (block.type === "diagram") {
    const id = block.text?.trim() ?? "";
    const Diagram = DIAGRAMS[id];
    const figNum = figNumberById.get(index);
    if (!Diagram) {
      return (
        <div
          className="my-5 rounded-md font-mono text-[11px]"
          style={{ border: "1px solid var(--rule)", background: "var(--paper-2)", color: "var(--ink-3)", padding: "10px 14px" }}
        >
          unknown diagram: &quot;{id}&quot;
        </div>
      );
    }
    return (
      <figure
        className="my-7"
        style={{ background: "var(--paper-2)", border: "1px solid var(--rule)", borderRadius: 6, padding: 18 }}
      >
        <Diagram />
        {figNum != null && (
          <figcaption className="mt-2.5 font-mono text-[10.5px] tracking-[0.04em]" style={{ color: "var(--ink-4)" }}>
            <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>Fig. {figNum}</span>
            <span className="mx-1.5">·</span>
            <span>{id}</span>
          </figcaption>
        )}
      </figure>
    );
  }
  // paragraph
  return (
    <p className="text-[15px] leading-[1.72] mb-4" style={{ color: "var(--ink-2)" }}>
      {block.text}
    </p>
  );
}

function estimateReadingMin(body: Block[]): number {
  // Rough: 400 CJK-char/min or 220 words/min, whichever is slower.
  let chars = 0;
  const collect = (s?: string) => { if (s) chars += s.length; };
  for (const b of body) {
    collect(b.text);
    b.items?.forEach(collect);
  }
  const min = Math.max(1, Math.ceil(chars / 400));
  return min;
}

export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const lang = useLangStore((s) => s.lang);
  const contentLang = narrowToContentLang(lang);

  const article: Article | undefined = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  const c = article.content[contentLang];

  // TOC + anchor IDs.
  const { anchorById, toc } = useMemo(() => buildAnchors(c.body), [c.body]);

  // Fig numbering — assign every diagram block a sequential Fig. N.
  const figNumberById = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    c.body.forEach((b, i) => { if (b.type === "diagram") map.set(i, ++n); });
    return map;
  }, [c.body]);

  // Previous / next article.
  const { prev, next } = useMemo(() => {
    const sorted = [...articles].sort((a, b) => a.date.localeCompare(b.date));
    const i = sorted.findIndex((a) => a.slug === slug);
    return {
      prev: i > 0 ? sorted[i - 1] : null,
      next: i < sorted.length - 1 ? sorted[i + 1] : null,
    };
  }, [slug]);

  // Scroll-spy: highlight the current TOC section.
  const [activeId, setActiveId] = useState<string | null>(toc[0]?.id ?? null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ids = toc.map((t) => t.id);
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the section closest to the top viewport edge (within 80px threshold).
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top - 100) - Math.abs(b.boundingClientRect.top - 100));
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.25, 0.5] },
    );
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [toc, slug, contentLang]);

  const readingMin = useMemo(() => estimateReadingMin(c.body), [c.body]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-rule">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/articles" className="flex items-center justify-center w-7 h-7 rounded-md text-faint hover:text-md hover:bg-glass transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </Link>
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
              <span className="font-serif text-[19px] tracking-tight">Deeppin</span>
              <Link href="/articles" className="font-mono text-[11px] text-faint ml-2 hover:text-md transition-colors">
                / articles
              </Link>
            </div>
          </div>
          <LangSelector />
        </div>
      </header>

      {/* ── 3-col: TOC / body / meta ─────────────────────────────── */}
      <div
        ref={containerRef}
        className="max-w-[1200px] mx-auto px-6 grid gap-16 pt-12 pb-24 md:grid-cols-[200px_1fr] lg:grid-cols-[240px_1fr_240px]"
      >
        {/* Left: auto TOC (sticky) */}
        <aside className="hidden md:block sticky top-[80px] self-start max-h-[calc(100vh-100px)] overflow-y-auto pr-1 scrollbar-thin">
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint mb-3 pb-[10px] border-b border-rule">
            {contentLang === "zh" ? "目录" : "Contents"}
          </div>
          <ul className="list-none p-0 m-0">
            {toc.map((t) => (
              <li key={t.id} className={t.level === 2 ? "ml-[10px]" : ""}>
                <a
                  href={`#${t.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById(t.id);
                    if (el) {
                      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
                      setActiveId(t.id);
                    }
                  }}
                  className={`block py-1.5 transition-colors border-l-2 ${
                    t.level === 1 ? "pl-3 text-[12.5px]" : "pl-5 text-[11.5px]"
                  } ${
                    activeId === t.id
                      ? "font-medium"
                      : "border-transparent text-lo hover:text-ink"
                  }`}
                  style={
                    activeId === t.id
                      ? { color: "var(--accent)", borderColor: "var(--accent)" }
                      : { borderColor: "transparent" }
                  }
                >
                  {t.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        {/* Center: body */}
        <article className="max-w-[720px] min-w-0">
          {/* Article header */}
          <div className="mb-10">
            <div className="flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.15em] mb-3" style={{ color: "var(--accent)" }}>
              <span className="w-10 h-px" style={{ background: "var(--accent)", opacity: 0.35 }} />
              <span>
                {contentLang === "zh" ? "文章" : "Article"} · {article.tags[0] ?? ""}
              </span>
            </div>
            <h1 className="font-serif text-[34px] font-semibold tracking-[-0.025em] leading-[1.15] text-ink mb-4">
              {c.title}
            </h1>
            <p
              className="text-[16px] leading-[1.6] text-lo pl-[14px] mb-6"
              style={{ borderLeft: "2px solid var(--accent)" }}
            >
              {article.summary[contentLang]}
            </p>
            <div
              className="flex gap-5 items-center pt-[14px] font-mono text-[11px]"
              style={{ borderTop: "1px solid var(--rule)", color: "var(--ink-4)" }}
            >
              <span>
                <strong className="font-medium" style={{ color: "var(--ink-2)" }}>
                  {article.date}
                </strong>
              </span>
              <span>
                {readingMin}{" "}
                {contentLang === "zh" ? "分钟阅读" : `min read`}
              </span>
              <span className="flex gap-1.5 flex-wrap">
                {article.tags.map((tag) => (
                  <span
                    key={tag}
                    className="font-mono text-[10px] tracking-wide px-[7px] py-[2px] rounded-sm lowercase"
                    style={{
                      background: "var(--paper-2)",
                      border: "1px solid var(--rule)",
                      color: "var(--ink-4)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </span>
            </div>
          </div>

          {/* Prose */}
          <div>
            {c.body.map((block, i) => (
              <RenderBlock
                key={i}
                block={block as Block}
                index={i}
                anchors={anchorById}
                figNumberById={figNumberById}
              />
            ))}
          </div>
        </article>

        {/* Right: metadata rail */}
        <aside className="hidden lg:block sticky top-[80px] self-start pl-5" style={{ borderLeft: "1px solid var(--rule)" }}>
          <div className="mb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint mb-1.5">
              {contentLang === "zh" ? "日期" : "Published"}
            </div>
            <div className="font-mono text-[13px]" style={{ color: "var(--ink-2)" }}>
              {article.date}
            </div>
          </div>
          <div className="mb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint mb-1.5">
              {contentLang === "zh" ? "时长" : "Reading time"}
            </div>
            <div className="font-mono text-[13px]" style={{ color: "var(--ink-2)" }}>
              {readingMin} {contentLang === "zh" ? "分钟" : "min"}
            </div>
          </div>
          <div className="mb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint mb-1.5">
              {contentLang === "zh" ? "标签" : "Tags"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-[10px] tracking-wide px-[7px] py-[2px] rounded-sm lowercase"
                  style={{
                    background: "var(--paper-2)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink-4)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {(prev || next) && (
            <div className="mt-8 pt-5 border-t border-rule">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint mb-3">
                {contentLang === "zh" ? "更多" : "More"}
              </div>
              <div className="flex flex-col gap-2">
                {prev && (
                  <Link
                    href={`/articles/${prev.slug}`}
                    className="block p-2.5 rounded-md transition-colors text-[12px] leading-[1.35]"
                    style={{
                      background: "var(--paper-2)",
                      border: "1px solid var(--rule)",
                      color: "var(--ink-2)",
                    }}
                  >
                    <span className="block font-mono text-[10px] uppercase tracking-[0.05em] mb-[3px]" style={{ color: "var(--ink-4)" }}>
                      ← {contentLang === "zh" ? "上一篇" : "Previous"}
                    </span>
                    <span className="font-medium line-clamp-2">{prev.title[contentLang]}</span>
                  </Link>
                )}
                {next && (
                  <Link
                    href={`/articles/${next.slug}`}
                    className="block p-2.5 rounded-md transition-colors text-[12px] leading-[1.35]"
                    style={{
                      background: "var(--paper-2)",
                      border: "1px solid var(--rule)",
                      color: "var(--ink-2)",
                    }}
                  >
                    <span className="block font-mono text-[10px] uppercase tracking-[0.05em] mb-[3px]" style={{ color: "var(--ink-4)" }}>
                      {contentLang === "zh" ? "下一篇" : "Next"} →
                    </span>
                    <span className="font-medium line-clamp-2">{next.title[contentLang]}</span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
