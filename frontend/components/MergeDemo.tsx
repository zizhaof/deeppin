"use client";
// components/MergeDemo.tsx
// 演示二：合并输出流程（独立动画）

import { useEffect, useState } from "react";

type Phase =
  | "idle"      // 展示三根针已选中状态
  | "clicking"  // 合并按钮点击动效
  | "selecting" // 弹窗：选择要合并的线程
  | "streaming" // 流式生成合并报告
  | "done";     // 报告完成，暂停后重置

const DELAYS: Record<Phase, number> = {
  idle:       1600,
  clicking:    500,
  selecting:   900,
  streaming:  3200,
  done:       3600,
};
const NEXT: Record<Phase, Phase> = {
  idle:       "clicking",
  clicking:   "selecting",
  selecting:  "streaming",
  streaming:  "done",
  done:       "idle",
};

const THREADS = [
  { id: "main",    label: "主线对话",   depth: 0, checked: false },
  { id: "raft",    label: "Raft 协议",  depth: 1, checked: true  },
  { id: "hash",    label: "一致性哈希", depth: 1, checked: true  },
  { id: "cap",     label: "CAP 定理",   depth: 1, checked: true  },
  { id: "leader",  label: "Leader 选举",depth: 2, checked: true  },
];

const MERGE_TEXT =
`## 分布式系统设计要点

**核心权衡（CAP 定理）**
网络分区不可避免，系统须在 C 与 A 之间抉择。HBase 选强一致，Cassandra 优先高可用。

**共识机制（Raft 协议）**
通过 Leader 选举 + 日志复制确保线性一致，Leader 选举保证同一时刻只有一个合法 Leader。

**扩缩容策略（一致性哈希）**
将节点增减影响控制在 O(1/N)，适合无状态服务横向扩展，配合虚拟节点解决数据倾斜。

**结论**
三者相互补充：CAP 决定架构方向，Raft 保障写入一致，一致性哈希优化数据分布。`;

function SimpleMd({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split("\n").map((line, i) => {
        if (!line) return <div key={i} className="h-0.5" />;
        if (line.startsWith("## "))
          return <p key={i} className="text-[12px] font-semibold text-hi">{line.slice(3)}</p>;
        if (line.startsWith("**")) {
          const parts = line.split("**");
          return (
            <p key={i} className="text-[11px] text-lo leading-relaxed">
              {parts.map((p, j) => j % 2 === 1
                ? <strong key={j} className="text-md font-medium">{p}</strong>
                : p
              )}
            </p>
          );
        }
        return <p key={i} className="text-[11px] text-lo leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export default function MergeDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [streamLen, setStreamLen] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => NEXT[p]), DELAYS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "idle") setStreamLen(0);
  }, [phase]);

  useEffect(() => {
    if (phase !== "streaming") return;
    if (streamLen >= MERGE_TEXT.length) return;
    const t = setTimeout(() => setStreamLen((n) => n + 5), 22);
    return () => clearTimeout(t);
  }, [phase, streamLen]);

  const showModal    = ["selecting","streaming","done"].includes(phase);
  const showContent  = ["streaming","done"].includes(phase);
  const btnPulsing   = phase === "clicking";

  return (
    <div className="w-full max-w-[700px] select-none">
      <div
        className="relative rounded-2xl border border-base overflow-hidden shadow-[0_0_0_1px_rgba(99,102,241,0.1),0_20px_60px_rgba(0,0,0,0.3)]"
        style={{ background: "var(--color-bg-base, #0f1117)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/* 标题栏 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-subtle">
          <div className="flex gap-1.5">
            {["bg-red-500/40","bg-yellow-500/40","bg-green-500/40"].map((c) => (
              <div key={c} className={`w-2.5 h-2.5 rounded-full ${c}`} />
            ))}
          </div>
          <span className="text-[11px] text-faint ml-2 font-medium">如何设计一个分布式系统？</span>
          {/* 概览栏里的 Merge 按钮（右侧） */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-faint">3 根针已就绪</span>
            <div
              className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1 transition-all"
              style={{
                background: btnPulsing ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.12)",
                borderColor: btnPulsing ? "rgba(99,102,241,0.7)" : "rgba(99,102,241,0.25)",
                boxShadow: btnPulsing ? "0 0 12px rgba(99,102,241,0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <svg className="w-3 h-3 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
              <span className="text-[10px] text-indigo-300 font-medium">合并输出</span>
            </div>
          </div>
        </div>

        {/* 主体：简化的对话背景 */}
        <div className="relative px-8 py-6" style={{ minHeight: 260 }}>
          {/* 背景对话（模糊状态） */}
          <div className={`space-y-3 transition-all duration-400 ${showModal ? "opacity-20 blur-[1px]" : "opacity-60"}`}>
            {["如何设计一个分布式系统？", "需要考虑 CAP 定理……Raft 协议……一致性哈希……"].map((line, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"} gap-2`}>
                {i % 2 === 1 && (
                  <div className="w-5 h-5 rounded-full border border-base flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(99,102,241,0.1)" }}>
                    <svg className="w-2.5 h-2.5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
                    </svg>
                  </div>
                )}
                <div
                  className="text-[11px] leading-relaxed px-3 py-1.5 rounded-xl max-w-[70%]"
                  style={{ background: i % 2 === 0 ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}
                >
                  {line}
                </div>
              </div>
            ))}
            {/* 高亮的三个锚点提示 */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["Raft 协议","一致性哈希","CAP 定理"].map((t) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30 text-indigo-300/70" style={{ background: "rgba(99,102,241,0.1)" }}>
                  📍 {t}
                </span>
              ))}
            </div>
          </div>

          {/* ── Merge 弹窗 ── */}
          <div
            className="absolute inset-x-4 rounded-2xl border border-base shadow-2xl"
            style={{
              top: showModal ? 16 : 340,
              bottom: showModal ? 0 : "auto",
              transition: "top 0.45s cubic-bezier(0.16,1,0.3,1)",
              zIndex: 20,
              background: "#131520",
              borderColor: "rgba(99,102,241,0.2)",
            }}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(99,102,241,0.15)" }}>
              <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
              <span className="text-[12px] font-semibold text-hi">合并输出</span>
              <div className="ml-auto flex items-center gap-2">
                {/* 格式选择 */}
                {["自由总结","要点列表","结构化分析"].map((f, i) => (
                  <span key={f} className="text-[9px] px-2 py-0.5 rounded-full border transition-all"
                    style={{
                      background: i === 0 ? "rgba(99,102,241,0.2)" : "transparent",
                      borderColor: i === 0 ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)",
                      color: i === 0 ? "rgb(165,180,252)" : "rgb(100,116,139)",
                    }}
                  >{f}</span>
                ))}
              </div>
            </div>

            <div className="flex" style={{ height: 180 }}>
              {/* 左：线程选择列表 */}
              <div className="border-r flex-shrink-0 px-3 py-3 space-y-1.5 overflow-y-auto" style={{ width: 160, borderColor: "rgba(99,102,241,0.12)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] text-faint uppercase tracking-wide">选择线程</span>
                  <span className="text-[9px] text-indigo-400">全选</span>
                </div>
                {THREADS.map((th) => (
                  <div key={th.id} className="flex items-center gap-1.5" style={{ paddingLeft: th.depth * 10 }}>
                    <div
                      className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                      style={{
                        background: th.checked ? "rgba(99,102,241,0.7)" : "rgba(255,255,255,0.06)",
                        border: `1px solid ${th.checked ? "rgba(99,102,241,0.8)" : "rgba(255,255,255,0.12)"}`,
                      }}
                    >
                      {th.checked && (
                        <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M2 6l3 3 5-5"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] truncate" style={{ color: th.checked ? "rgb(165,180,252)" : "rgb(100,116,139)" }}>
                      {th.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* 右：输出内容 */}
              <div className="flex-1 px-4 py-3 overflow-hidden relative">
                {!showContent ? (
                  <div className="h-full flex items-center justify-center">
                    <button
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-medium text-white"
                      style={{ background: "rgba(99,102,241,0.7)", border: "1px solid rgba(99,102,241,0.5)" }}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                      开始生成
                    </button>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-1">
                    <SimpleMd text={MERGE_TEXT.slice(0, streamLen)} />
                    {phase === "streaming" && streamLen < MERGE_TEXT.length && (
                      <span className="inline-block w-0.5 h-3 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                    )}
                    {phase === "done" && (
                      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t" style={{ borderColor: "rgba(99,102,241,0.15)" }}>
                        <button className="flex items-center gap-1.5 text-[10px] text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/25" style={{ background: "rgba(99,102,241,0.1)" }}>
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                          </svg>
                          下载 Markdown
                        </button>
                        <button className="flex items-center gap-1.5 text-[10px] text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/25" style={{ background: "rgba(99,102,241,0.1)" }}>
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                          </svg>
                          复制
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 状态栏 */}
        <div className="border-t border-subtle px-5 py-2 flex items-center justify-between">
          <div className="flex gap-1.5">
            {(["idle","clicking","selecting","streaming","done"] as Phase[]).map((p) => (
              <div key={p} className="h-1 rounded-full transition-all duration-300"
                style={{ width: phase === p ? "18px" : "5px", background: phase === p ? "rgb(99,102,241)" : "rgba(99,102,241,0.2)" }} />
            ))}
          </div>
          <span className="text-[10px] text-faint">
            {phase === "idle"      && "3 根针已就绪，点击合并输出"}
            {phase === "clicking"  && "点击合并按钮…"}
            {phase === "selecting" && "选择要合并的线程"}
            {phase === "streaming" && "生成结构化报告中…"}
            {phase === "done"      && "报告已生成，可下载或复制 ✓"}
          </span>
        </div>
      </div>
    </div>
  );
}
