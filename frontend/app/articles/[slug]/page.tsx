"use client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { useLangStore } from "@/stores/useLangStore";
import { articles } from "../data";
import { DIAGRAMS } from "../ArticleDiagrams";

type Block = {
  type: "p" | "h1" | "h2" | "h3" | "code" | "ul" | "note" | "diagram";
  text?: string;
  items?: string[];
};

function renderBlock(block: Block, i: number) {
  if (block.type === "h1") return (
    <h2 key={i} className="text-[19px] font-semibold text-hi tracking-tight mt-12 mb-3 pb-2.5 border-b border-indigo-500/40">
      {block.text}
    </h2>
  );
  if (block.type === "h2") return (
    <h3 key={i} className="flex items-center gap-2.5 text-[14px] font-semibold text-hi mt-8 mb-2">
      <span className="inline-block w-0.5 h-4 rounded-full bg-indigo-400 flex-shrink-0" />
      {block.text}
    </h3>
  );
  if (block.type === "h3") return (
    <h4 key={i} className="text-[13px] font-semibold text-indigo-400 mt-5 mb-1.5">
      {block.text}
    </h4>
  );
  if (block.type === "code") return (
    <pre key={i} className="bg-elevated border border-strong rounded-xl px-5 py-4 text-[12px] font-mono text-md overflow-x-auto leading-relaxed my-4 whitespace-pre">
      {block.text}
    </pre>
  );
  if (block.type === "ul") return (
    <ul key={i} className="list-none space-y-2.5 pl-0 my-4">
      {block.items?.map((item, j) => (
        <li key={j} className="flex items-start gap-2.5 text-[13.5px] text-md leading-relaxed">
          <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
  if (block.type === "note") return (
    <div key={i} className="my-4 flex gap-3 rounded-xl border border-indigo-500/40 bg-indigo-500/8 px-4 py-3.5">
      <span className="mt-0.5 w-1 rounded-full bg-indigo-400 flex-shrink-0 self-stretch" />
      <p className="text-[13px] text-md leading-relaxed">{block.text}</p>
    </div>
  );
  if (block.type === "diagram") {
    const id = block.text?.trim() ?? "";
    const Diagram = DIAGRAMS[id];
    if (!Diagram) return (
      <div key={i} className="my-4 rounded-xl border border-red-500/40 bg-red-500/8 px-4 py-3 text-[11px] text-red-400 font-mono">
        unknown diagram: &quot;{id}&quot;
      </div>
    );
    return (
      <div key={i} className="my-6 rounded-xl border border-strong bg-elevated overflow-x-auto p-5">
        <Diagram />
      </div>
    );
  }
  // paragraph
  return (
    <p key={i} className="text-[14px] leading-[1.9] text-md">
      {block.text}
    </p>
  );
}

export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const lang = useLangStore((s) => s.lang);
  const toggle = useLangStore((s) => s.toggle);

  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  const c = article.content[lang];

  return (
    <div className="min-h-screen bg-base text-hi">
      <header className="border-b border-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/articles" className="flex items-center justify-center w-7 h-7 rounded-lg text-faint hover:text-md hover:bg-glass transition-colors">
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
            <Link href="/articles" className="text-sm text-faint hover:text-md transition-colors">
              {lang === "zh" ? "文章" : "Articles"}
            </Link>
          </div>
        </div>
        <button onClick={toggle} className="text-[11px] font-medium text-faint hover:text-md px-2 py-1 rounded-lg border border-subtle hover:border-base transition-colors">
          {lang === "zh" ? "EN" : "中"}
        </button>
      </header>

      <main className="max-w-[720px] mx-auto px-6 py-14">
        {/* article header */}
        <div className="mb-10">
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {article.tags.map((tag) => (
              <span key={tag} className="text-[9px] font-medium text-dim bg-base border border-base px-2 py-0.5 rounded-md uppercase tracking-widest">
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-[26px] font-bold tracking-tight leading-snug mb-3 text-hi">{c.title}</h1>
          <p className="text-sm text-dim font-mono">{article.date}</p>
        </div>

        {/* article body */}
        <div className="space-y-4">
          {c.body.map((block, i) => renderBlock(block as Block, i))}
        </div>

        {/* footer */}
        <div className="mt-16 pt-6 border-t border-subtle">
          <Link href="/articles" className="inline-flex items-center gap-2 text-[12px] text-faint hover:text-md transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            {lang === "zh" ? "所有文章" : "All articles"}
          </Link>
        </div>
      </main>
    </div>
  );
}
