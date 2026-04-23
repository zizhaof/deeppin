"use client";
// app/articles/page.tsx — 文章列表页
//
// 设计风：Stripe-dev / letterpress。左侧过滤 tags + 中间按日期倒序的流 + 右侧小统计栏。
// 每条文章：左边 mono 日期，右边 Fraunces 标题（带 § 前缀）+ 摘要 + tag chips。
//
// Stripe-dev / letterpress editorial style: left tag filters + center date-sorted stream + right stats rail.
// Each entry: mono date on the left, Fraunces title (§ prefix) + summary + tag chips on the right.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import { narrowToContentLang } from "@/lib/i18n";
import LangSelector from "@/components/LangSelector";
import { articles } from "./data";

export default function ArticlesPage() {
  const lang = useLangStore((s) => s.lang);
  const contentLang = narrowToContentLang(lang);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // 所有 tag 及其出现次数 / All tags + usage count
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) for (const t of a.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, []);

  const sorted = useMemo(
    () => [...articles].sort((a, b) => b.date.localeCompare(a.date)),
    [],
  );
  const filtered = activeTag ? sorted.filter((a) => a.tags.includes(activeTag)) : sorted;

  // 年份分组用于右侧统计
  const years = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of articles) {
      const y = a.date.slice(0, 4);
      map.set(y, (map.get(y) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ── Masthead (sticky) ───────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur-sm border-b border-rule">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center justify-center w-7 h-7 rounded-md text-faint hover:text-md hover:bg-glass transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </Link>
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
              <span className="font-serif text-[19px] tracking-tight">Deeppin</span>
              <span className="font-mono text-[11px] text-faint ml-2">/ articles</span>
            </div>
          </div>
          <LangSelector />
        </div>
      </header>

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 pt-16 pb-10 border-b border-rule-soft">
        <div className="flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.15em] mb-4" style={{ color: "var(--accent)" }}>
          <span className="w-10 h-px" style={{ background: "var(--accent)", opacity: 0.35 }} />
          <span>{contentLang === "zh" ? "技术笔记 · 工程记录" : "Dev log · Engineering notes"}</span>
        </div>
        <h1 className="font-serif text-[40px] font-medium tracking-[-0.02em] leading-[1.1] text-ink mb-3">
          {contentLang === "zh" ? "Deeppin 技术文章" : "Deeppin Engineering"}
        </h1>
        <p className="text-[15px] text-lo max-w-[640px] leading-[1.6]">
          {contentLang === "zh"
            ? "从 RAG、Context、SmartRouter 到部署架构——把 Deeppin 怎么造、为什么这么造，一篇一篇讲清楚。"
            : "From RAG, Context, and SmartRouter to deployment — what Deeppin is made of, component by component, and why."}
        </p>
      </div>

      {/* ── 3-col: filters / stream / stats ─────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 py-12 grid gap-12 lg:gap-16 lg:grid-cols-[180px_1fr_200px] md:grid-cols-[160px_1fr]">
        {/* Left: tag filters (sticky) */}
        <aside className="hidden md:block sticky top-[88px] self-start">
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint mb-3 pb-2 border-b border-rule-soft">
            {contentLang === "zh" ? "按标签" : "By tag"}
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setActiveTag(null)}
              className={`text-left text-[12.5px] font-mono py-1 transition-colors ${
                activeTag === null ? "text-ink font-medium" : "text-lo hover:text-ink"
              }`}
            >
              {contentLang === "zh" ? "全部" : "all"}
              <span className="text-faint ml-1.5">{articles.length}</span>
            </button>
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`text-left text-[12.5px] font-mono py-1 transition-colors lowercase ${
                  activeTag === tag ? "font-medium" : "text-lo hover:text-ink"
                }`}
                style={activeTag === tag ? { color: "var(--accent)" } : undefined}
              >
                {tag}
                <span className="text-faint ml-1.5">{count}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Center: stream */}
        <main>
          <ol className="list-none p-0 m-0">
            {filtered.map((a) => {
              return (
                <li key={a.slug} className="group grid grid-cols-[78px_1fr] gap-6 py-7 border-b border-rule-soft last:border-0">
                  {/* Date column */}
                  <div className="font-mono text-[11px] text-faint pt-1 tracking-tight leading-tight">
                    <span className="block text-ink font-medium text-[12px] mb-0.5">
                      {a.date.slice(5)}
                    </span>
                    <span className="block">{a.date.slice(0, 4)}</span>
                  </div>
                  {/* Content */}
                  <div className="min-w-0">
                    <Link href={`/articles/${a.slug}`} className="block">
                      <h2 className="font-serif text-[20px] font-medium tracking-[-0.015em] leading-[1.3] text-ink group-hover:[color:var(--accent)] transition-colors mb-2">
                        <span className="font-mono font-normal text-[14px] align-[2px] mr-2" style={{ color: "var(--accent)", opacity: 0.5 }}>§</span>
                        {a.title[contentLang]}
                      </h2>
                      <p className="text-[14px] text-lo leading-[1.55] mb-3 max-w-[640px]">
                        {a.summary[contentLang]}
                      </p>
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      {a.tags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                          className="font-mono text-[10px] tracking-wide px-[7px] py-[2px] rounded-sm border transition-colors lowercase"
                          style={{
                            background: activeTag === tag ? "var(--accent-soft)" : "var(--paper-2)",
                            borderColor: activeTag === tag ? "transparent" : "var(--rule)",
                            color: activeTag === tag ? "var(--accent)" : "var(--ink-4)",
                          }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {filtered.length === 0 && (
            <p className="text-center py-12 font-mono text-[12px] text-faint">
              {contentLang === "zh" ? "没有匹配的文章" : "No matching articles"}
            </p>
          )}
        </main>

        {/* Right: stats rail */}
        <aside className="hidden lg:block sticky top-[88px] self-start pl-6 border-l border-rule">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-faint mb-4">
            {contentLang === "zh" ? "编辑室" : "Editorial"}
          </div>
          <div className="mb-6">
            <div className="font-mono text-[11px] text-faint">{contentLang === "zh" ? "总计" : "total"}</div>
            <div className="font-mono text-[22px] tabular-nums tracking-[-0.02em] text-ink">{articles.length}</div>
          </div>
          <div className="mb-6">
            <div className="font-mono text-[11px] text-faint">{contentLang === "zh" ? "标签" : "tags"}</div>
            <div className="font-mono text-[22px] tabular-nums tracking-[-0.02em] text-ink">{tagCounts.length}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint mb-2 pb-2 border-b border-rule-soft">
              {contentLang === "zh" ? "按年" : "By year"}
            </div>
            <div className="flex flex-col gap-1 font-mono text-[11.5px]">
              {years.map(([y, c]) => (
                <div key={y} className="flex items-baseline justify-between">
                  <span className="text-lo">{y}</span>
                  <span className="text-faint">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
