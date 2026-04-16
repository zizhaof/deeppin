"use client";
// app/articles/page.tsx — 文章列表页
import Link from "next/link";
import { useLangStore } from "@/stores/useLangStore";
import { articles } from "./data";

export default function ArticlesPage() {
  const lang = useLangStore((s) => s.lang);
  const toggle = useLangStore((s) => s.toggle);

  return (
    <div className="min-h-screen bg-base text-hi">
      <header className="border-b border-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center justify-center w-7 h-7 rounded-lg text-faint hover:text-md hover:bg-glass transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-surface border border-base flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-md tracking-tight">Deeppin</span>
            <span className="text-faint text-sm">/</span>
            <span className="text-sm text-faint">{lang === "zh" ? "文章" : "Articles"}</span>
          </div>
        </div>
        <button onClick={toggle} className="text-[11px] font-medium text-faint hover:text-md px-2 py-1 rounded-lg border border-subtle hover:border-base transition-colors">
          {lang === "zh" ? "EN" : "中"}
        </button>
      </header>

      <main className="max-w-[680px] mx-auto px-6 py-14">
        <h1 className="text-xl font-semibold tracking-tight mb-1">
          {lang === "zh" ? "文章" : "Articles"}
        </h1>
        <p className="text-sm text-faint mb-10">
          {lang === "zh" ? "技术细节与产品思路" : "Technical deep-dives and product thinking"}
        </p>

        <div className="space-y-3">
          {articles.map((a) => (
            <Link
              key={a.slug}
              href={`/articles/${a.slug}`}
              className="group block rounded-xl border border-base bg-surface-60 hover:border-indigo-500/30 hover:bg-surface transition-all p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-hi group-hover:text-indigo-300 transition-colors leading-snug mb-1.5">
                    {a.title[lang]}
                  </p>
                  <p className="text-[11px] text-faint leading-relaxed line-clamp-2">
                    {a.summary[lang]}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[10px] text-ph font-mono">{a.date}</span>
                    <span className="text-ph">·</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {a.tags.map((tag) => (
                        <span key={tag} className="text-[9px] font-medium text-dim bg-base border border-base px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <svg className="w-4 h-4 text-faint group-hover:text-indigo-400 flex-shrink-0 mt-0.5 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
