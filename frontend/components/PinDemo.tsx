"use client";
// components/PinDemo.tsx
// Welcome-page 的插针交互动画 —— 新版对齐 PR #12 / #13 的 2-col 设计：
//   主栏（chat） + 右栏（overview tree）。
//   流程：选中文字 → selpop → Pin → dialog → 选问题 → 锚点浮现 + 呼吸 →
//         hover 锚点 → preview popover → Enter → 进 sub-thread → 回主线。
//
// Welcome-page pin interaction demo, rebuilt for the new 2-col UI
// (main chat + right overview tree, no left rail).
//
// Flow: select text → selpop → Pin → dialog → pick suggestion → anchor
//   appears + breathing underline → hover anchor → preview popover →
//   Enter → enter sub-thread → back to main.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import type { Lang } from "@/lib/i18n";

type Phase =
  | "idle"
  | "sweep"
  | "selpop"
  | "dialog"
  | "pick"
  | "underline-appear"
  | "ai-replying"
  | "unread-breathing"
  | "popover"
  | "enter"
  | "sub-thread"
  | "back";

const NEXT: Record<Phase, Phase> = {
  idle: "sweep",
  sweep: "selpop",
  selpop: "dialog",
  dialog: "pick",
  pick: "underline-appear",
  "underline-appear": "ai-replying",
  "ai-replying": "unread-breathing",
  "unread-breathing": "popover",
  popover: "enter",
  enter: "sub-thread",
  "sub-thread": "back",
  back: "idle",
};

const DELAYS: Record<Phase, number> = {
  idle: 1400,
  sweep: 1300,
  selpop: 1400,
  dialog: 1800,
  pick: 500,
  "underline-appear": 1100,
  "ai-replying": 2400,
  "unread-breathing": 2200,
  popover: 2400,
  enter: 500,
  "sub-thread": 2400,
  back: 1600,
};

interface Copy {
  aiText: string;
  anchor: string;
  anchorPre: string;
  anchorPost: string;
  suggestions: string[];
  questionTitle: string;
  mainTitle: string;
  subTitle: string;
  threadReply: string;
  newReplyLabel: string;
  enterLabel: string;
  pinLabel: string;
  copyLabel: string;
  mainCrumb: string;
  subCrumb: string;
  caption: Record<Phase, string>;
}

const COPY_EN: Copy = {
  aiText:
    "In distributed systems, the CAP theorem says you can only guarantee two of three — Consistency, Availability, and Partition tolerance. Raft handles the trade-off through leader election, and consistent hashing minimizes data movement as nodes scale.",
  anchor: "CAP theorem",
  anchorPre: "In distributed systems, the ",
  anchorPost:
    " says you can only guarantee two of three — Consistency, Availability, and Partition tolerance. Raft handles the trade-off through leader election, and consistent hashing minimizes data movement as nodes scale.",
  suggestions: [
    "How do you trade off CAP in practice?",
    "Consistency vs availability — which matters more?",
    "Give a real-world CAP example?",
  ],
  questionTitle: "Deeppin — distributed systems chat",
  mainTitle: "What's CAP theorem?",
  subTitle: "CAP theorem",
  threadReply:
    "CAP (Consistency, Availability, Partition tolerance) — proposed by Brewer in 2000. When partitions are unavoidable, you must choose C or A. HBase picks CP; Cassandra picks AP…",
  newReplyLabel: "New",
  enterLabel: "Enter",
  pinLabel: "Pin",
  copyLabel: "Copy",
  mainCrumb: "Main",
  subCrumb: "CAP theorem",
  caption: {
    idle: "Main thread shows the reply. Right rail tracks the thread graph.",
    sweep: "Drag across a phrase to select it.",
    selpop: "A compact toolbar appears above the selection.",
    dialog: "Pin opens a dialog with 3 auto-generated follow-ups.",
    pick: "Pick the one you want.",
    "underline-appear": "The anchor gets an underline in its pigment color.",
    "ai-replying": "AI answers in the sub-thread — main stays untouched.",
    "unread-breathing": "Back in main, the anchor breathes until you see the reply.",
    popover: "Hover the underline for a preview — title, snippet, Enter.",
    enter: "Click Enter to jump into the sub-thread.",
    "sub-thread": "Full sub-thread view. Breadcrumb shows Main › CAP theorem.",
    back: "Click Main to return. Breathing stops — the reply is seen.",
  },
};

const COPY_ZH: Copy = {
  aiText:
    "在分布式系统中，CAP 定理指出你只能同时保证「一致性」「可用性」「分区容忍性」三者中的两个。Raft 通过 Leader 选举处理权衡，一致性哈希让节点扩缩容时数据迁移最少。",
  anchor: "CAP 定理",
  anchorPre: "在分布式系统中，",
  anchorPost:
    "指出你只能同时保证「一致性」「可用性」「分区容忍性」三者中的两个。Raft 通过 Leader 选举处理权衡，一致性哈希让节点扩缩容时数据迁移最少。",
  suggestions: [
    "实际系统里 CAP 怎么取舍？",
    "一致性和可用性哪个更重要？",
    "举一个 CAP 权衡的真实案例？",
  ],
  questionTitle: "Deeppin — 分布式系统对话",
  mainTitle: "CAP 定理是什么？",
  subTitle: "CAP 定理",
  threadReply:
    "CAP（Consistency / Availability / Partition tolerance）—— Brewer 2000 年提出。分区不可避免时，你必须在 C 和 A 中选一。HBase 选 CP；Cassandra 选 AP……",
  newReplyLabel: "新",
  enterLabel: "进入",
  pinLabel: "插针",
  copyLabel: "复制",
  mainCrumb: "主线",
  subCrumb: "CAP 定理",
  caption: {
    idle: "主线显示 AI 回复，右栏跟着展示线程树。",
    sweep: "拖选一段文字。",
    selpop: "选区上方自动弹出小工具栏。",
    dialog: "点击「插针」打开对话框，AI 已生成 3 条追问。",
    pick: "选一个你想问的。",
    "underline-appear": "锚点立刻浮现 —— 颜料色下划线。",
    "ai-replying": "AI 在子线程里独立回答，主线不受打扰。",
    "unread-breathing": "回到主线，锚点呼吸直到你看过。",
    popover: "悬停下划线 —— 浮出预览：标题、摘要、进入按钮。",
    enter: "点击「进入」跳进子线程。",
    "sub-thread": "完整子线程视图。面包屑：主线 › CAP 定理。",
    back: "点「主线」返回。呼吸停下，表示已读。",
  },
};

function pickCopy(lang: Lang): Copy {
  return lang === "zh" ? COPY_ZH : COPY_EN;
}

// ── Component ────────────────────────────────────────────────────────────
export default function PinDemo() {
  const lang = useLangStore((s) => s.lang);
  const c = pickCopy(lang);

  const [phase, setPhase] = useState<Phase>("idle");
  const [sweepPct, setSweepPct] = useState(0); // 0..1
  const [streamLen, setStreamLen] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 自动流程 / Auto-advance phases
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPhase(NEXT[phase]), DELAYS[phase]);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase]);

  // sweep 动画：0 → 1
  useEffect(() => {
    if (phase !== "sweep") {
      setSweepPct(phase === "idle" ? 0 : 1);
      return;
    }
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const pct = Math.min(1, (ts - start) / 1000);
      setSweepPct(pct);
      if (pct < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // streaming 动画（sub-thread 视图里的 AI 回复逐字打出）
  useEffect(() => {
    if (phase !== "sub-thread") {
      setStreamLen(phase === "idle" ? 0 : c.threadReply.length);
      return;
    }
    setStreamLen(0);
    const total = c.threadReply.length;
    let i = 0;
    const tick = () => {
      i = Math.min(total, i + 3);
      setStreamLen(i);
      if (i < total) timerRef.current = setTimeout(tick, 22);
    };
    tick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, c.threadReply]);

  const goTo = useCallback((p: Phase) => setPhase(p), []);

  // 布尔便捷 / Boolean helpers
  const showSelpop = phase === "selpop";
  const pinClicking = false; // Not used; left here to signal the phase briefly highlights Pin — via CSS filter in selpop.
  const showDialog = phase === "dialog" || phase === "pick";
  const pickedIdx = phase === "pick" ? 0 : -1;
  // anchor exists from underline-appear onwards
  const anchorVisible = [
    "underline-appear",
    "ai-replying",
    "unread-breathing",
    "popover",
    "enter",
    "sub-thread",
    "back",
  ].includes(phase);
  const anchorBreathing = phase === "unread-breathing" || phase === "popover";
  const showPopover = phase === "popover" || phase === "enter";
  const inSub = phase === "ai-replying" || phase === "sub-thread" || phase === "enter";
  const showNewReplyTag = phase === "popover" || phase === "enter";

  // 右栏 tree 里 CAP 节点从 underline-appear 开始出现
  const showCapNode = anchorVisible;
  // active thread id for right-rail styling
  const activeThread: "main" | "cap" = inSub ? "cap" : "main";

  void pinClicking;

  return (
    <div className="w-full max-w-[980px] select-none">
      <div
        className="relative rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(27,26,23,0.12)]"
        style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
      >
        {/* Mac 窗口标题栏 / Mac window chrome */}
        <div
          className="flex items-center gap-2 px-4 h-[38px]"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="flex gap-1.5">
            {["#ff5f57", "#ffbd2e", "#28c840"].map((col) => (
              <span key={col} className="w-2.5 h-2.5 rounded-full" style={{ background: col, opacity: 0.85 }} />
            ))}
          </div>
          <span className="font-mono text-[11px] ml-2" style={{ color: "var(--ink-4)" }}>
            {c.questionTitle}
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.15em]" style={{ color: "var(--ink-4)" }}>
            demo
          </span>
        </div>

        {/* ── 两栏 grid：main + right overview ──────────────────────── */}
        <div className="grid" style={{ gridTemplateColumns: "1fr 210px", height: 340 }}>
          {/* Main column */}
          <div
            className="relative overflow-hidden"
            style={{ background: "var(--paper)" }}
          >
            {!inSub ? (
              <MainView
                c={c}
                sweepPct={sweepPct}
                anchorVisible={anchorVisible}
                anchorBreathing={anchorBreathing}
                showSelpop={showSelpop}
                phase={phase}
                showPopover={showPopover}
                showNewReplyTag={showNewReplyTag}
                onEnter={() => goTo("sub-thread")}
              />
            ) : (
              <SubThreadView c={c} streamLen={streamLen} phase={phase} />
            )}

            {/* Pin dialog 浮层 / Pin dialog overlay */}
            {showDialog && (
              <PinDialog c={c} pickedIdx={pickedIdx} />
            )}
          </div>

          {/* Right: overview tree */}
          <RightRail c={c} activeThread={activeThread} showCapNode={showCapNode} phase={phase} />
        </div>

        {/* Caption — 底部提示条 */}
        <div
          className="px-5 py-2.5 font-mono text-[11px] leading-snug tracking-wide"
          style={{ borderTop: "1px solid var(--rule)", color: "var(--ink-3)", background: "var(--paper-2)" }}
        >
          {c.caption[phase]}
        </div>
      </div>
    </div>
  );
}

// ── Main view (主线) ────────────────────────────────────────────────────
function MainView({
  c,
  sweepPct,
  anchorVisible,
  anchorBreathing,
  showSelpop,
  phase,
  showPopover,
  showNewReplyTag,
  onEnter,
}: {
  c: Copy;
  sweepPct: number;
  anchorVisible: boolean;
  anchorBreathing: boolean;
  showSelpop: boolean;
  phase: Phase;
  showPopover: boolean;
  showNewReplyTag: boolean;
  onEnter: () => void;
}) {
  const pinClickPulse = phase === "pick";
  void onEnter;
  void pinClickPulse;

  return (
    <div className="relative h-full p-6 overflow-hidden">
      {/* 面包屑 Main */}
      <div className="flex items-center gap-2 mb-5 font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}
        >
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--paper)" }} />
          {c.mainCrumb}
        </span>
      </div>

      {/* User question */}
      <div className="flex flex-col items-end mb-3">
        <div className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--ink-3)" }} />
          <span>YOU</span>
        </div>
        <div
          className="max-w-[70%] px-[14px] py-[10px] text-[14px] leading-[1.55]"
          style={{
            background: "var(--accent)",
            color: "var(--paper)",
            borderRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          {c.mainTitle}
        </div>
      </div>

      {/* AI bubble — 带可选区 / 可能含锚点 */}
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--accent)" }} />
          <span>AI</span>
        </div>
        <div
          className="relative max-w-[82%] px-[14px] py-[11px] text-[14px] leading-[1.6]"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            color: "var(--ink)",
            borderRadius: 14,
            borderBottomLeftRadius: 4,
          }}
        >
          {c.anchorPre}
          <AnchorSpan
            text={c.anchor}
            sweepPct={sweepPct}
            visible={anchorVisible}
            breathing={anchorBreathing}
            phase={phase}
          />
          {c.anchorPost}

          {/* selpop — 出现在 anchor 上方 */}
          {showSelpop && <SelPop c={c} phase={phase} />}

          {/* hover popover */}
          {showPopover && <AnchorPopover c={c} showNew={showNewReplyTag} />}
        </div>
      </div>

      {/* Pigment wash pulse when streaming (ai-replying) — 暗示子线程里在干活 */}
      {phase === "ai-replying" && (
        <div
          className="absolute bottom-3 left-6 font-mono text-[10px] flex items-center gap-2"
          style={{ color: "var(--accent)" }}
        >
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-[4px] h-[4px] rounded-full"
                style={{
                  background: "var(--accent)",
                  animation: "pin-demo-dot 900ms ease-in-out infinite",
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </span>
          <span style={{ opacity: 0.8 }}>replying in sub-thread…</span>
        </div>
      )}

      <style jsx>{`
        @keyframes pin-demo-dot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Anchor span — 文字里带下划线的高亮 / Anchor with pigment underline ──
function AnchorSpan({
  text,
  sweepPct,
  visible,
  breathing,
  phase,
}: {
  text: string;
  sweepPct: number;
  visible: boolean;
  breathing: boolean;
  phase: Phase;
}) {
  const sweeping = phase === "sweep";
  const pulseBorder = breathing;

  const bg = sweeping
    ? `color-mix(in oklch, var(--accent) ${Math.round(sweepPct * 22)}%, transparent)`
    : visible
      ? undefined
      : "transparent";
  const bb =
    visible || sweeping
      ? `2px solid ${visible ? "var(--pig-1)" : "transparent"}`
      : "none";

  return (
    <span
      className={`relative inline ${pulseBorder ? "pin-demo-anchor-unread" : ""}`}
      style={{
        background: bg,
        borderBottom: bb,
        paddingBottom: 1,
        transition: "background 120ms ease-out, border-bottom 220ms ease-out",
      }}
    >
      {text}
      <style jsx>{`
        .pin-demo-anchor-unread {
          animation: pin-demo-pulse 0.95s ease-in-out infinite;
        }
        @keyframes pin-demo-pulse {
          0%, 100% { filter: brightness(0.85); }
          50% { filter: brightness(1.15); }
        }
      `}</style>
    </span>
  );
}

// ── Selection popover (SelPop) ──────────────────────────────────────────
function SelPop({ c, phase }: { c: Copy; phase: Phase }) {
  const highlightPin = phase === "selpop";
  void highlightPin;
  return (
    <span
      className="absolute left-0 -top-11 z-20 inline-flex items-center gap-[2px] rounded-md shadow-[0_6px_20px_rgba(27,26,23,0.18)]"
      style={{ background: "var(--ink)", color: "var(--paper)", padding: 3 }}
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px]" style={{ color: "var(--paper)" }}>
        <svg className="w-3 h-3" style={{ opacity: 0.75 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
        {c.copyLabel}
      </span>
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-medium"
        style={{ background: "var(--accent)", color: "var(--paper)" }}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
        </svg>
        {c.pinLabel}
      </span>
      {/* 下三角 */}
      <span
        aria-hidden
        className="absolute left-[22px] -bottom-1 w-2 h-2 rotate-45"
        style={{ background: "var(--ink)" }}
      />
    </span>
  );
}

// ── Pin start dialog (suggestions) ──────────────────────────────────────
function PinDialog({ c, pickedIdx }: { c: Copy; pickedIdx: number }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0" style={{ background: "rgba(27,26,23,0.35)" }} />
      <div
        className="relative w-[82%] max-w-[420px] rounded-xl shadow-[0_16px_48px_rgba(27,26,23,0.18)]"
        style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
      >
        <div className="px-5 pt-4 pb-3 flex items-start gap-3" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
          <span className="w-[3px] h-7 rounded-[2px] flex-shrink-0" style={{ background: "var(--pig-1)" }} />
          <div className="flex-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-1" style={{ color: "var(--accent)" }}>
              {c.pinLabel}
            </div>
            <div className="font-serif text-[13px] italic leading-snug" style={{ color: "var(--ink-2)" }}>
              “{c.anchor}”
            </div>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-[6px]">
          <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-[2px]" style={{ color: "var(--ink-4)" }}>
            suggestions
          </div>
          {c.suggestions.map((q, i) => (
            <button
              key={q}
              className="text-left px-3 py-2 rounded-md text-[12.5px] transition-colors"
              style={{
                background: pickedIdx === i ? "var(--accent-soft)" : "var(--paper-2)",
                border: `1px solid ${pickedIdx === i ? "var(--accent)" : "var(--rule-soft)"}`,
                color: pickedIdx === i ? "var(--accent)" : "var(--ink-2)",
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Anchor hover preview popover ───────────────────────────────────────
function AnchorPopover({ c, showNew }: { c: Copy; showNew: boolean }) {
  return (
    <span
      className="absolute left-0 top-[calc(100%+4px)] z-20 inline-block rounded-xl overflow-hidden shadow-[0_10px_32px_rgba(27,26,23,0.12)] animate-in fade-in-0 duration-150"
      style={{ background: "var(--card)", border: "1px solid var(--rule)", width: 260 }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--pig-1)" }} />
        <span className="flex-1 font-serif text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>
          {c.subTitle}
        </span>
        {showNew && (
          <span
            className="font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-[1px] rounded-sm"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {c.newReplyLabel}
          </span>
        )}
      </div>
      <div className="px-3 py-2 text-[11.5px] leading-snug" style={{ borderTop: "1px solid var(--rule-soft)", color: "var(--ink-2)" }}>
        {c.threadReply.slice(0, 86)}…
      </div>
      <div className="flex items-center justify-end px-3 py-2" style={{ borderTop: "1px solid var(--rule-soft)", background: "var(--paper-2)" }}>
        <span className="inline-flex items-center gap-1 font-medium text-[11px]" style={{ color: "var(--accent)" }}>
          {c.enterLabel}
          <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </span>
  );
}

// ── Sub-thread view — 主栏切换到子线程 / Main column switches to sub-thread ──
function SubThreadView({ c, streamLen, phase }: { c: Copy; streamLen: number; phase: Phase }) {
  const streaming = phase === "sub-thread" && streamLen < c.threadReply.length;
  return (
    <div className="relative h-full p-6 overflow-hidden">
      {/* 面包屑 main / sub */}
      <div className="flex items-center gap-1.5 mb-5 font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded cursor-pointer"
          style={{ border: "1px solid transparent", color: "var(--ink-3)" }}
        >
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--ink-5)" }} />
          {c.mainCrumb}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}
        >
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--pig-1)" }} />
          {c.subCrumb}
        </span>
      </div>

      {/* User question in sub */}
      <div className="flex flex-col items-end mb-3">
        <div className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--ink-3)" }} />
          <span>YOU</span>
        </div>
        <div
          className="max-w-[72%] px-[14px] py-[10px] text-[13.5px] leading-[1.55]"
          style={{
            background: "var(--accent)",
            color: "var(--paper)",
            borderRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          {c.suggestions[0]}
        </div>
      </div>

      {/* AI reply */}
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--accent)" }} />
          <span>AI</span>
        </div>
        <div
          className="max-w-[82%] px-[14px] py-[11px] text-[13.5px] leading-[1.6]"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            color: "var(--ink)",
            borderRadius: 14,
            borderBottomLeftRadius: 4,
          }}
        >
          {c.threadReply.slice(0, streamLen)}
          {streaming && (
            <span
              className="inline-block w-[2px] h-3 align-middle ml-[1px]"
              style={{ background: "var(--accent)", animation: "pin-demo-caret 1s steps(2) infinite" }}
            />
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes pin-demo-caret {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Right rail — overview tree ────────────────────────────────────────
function RightRail({
  c,
  activeThread,
  showCapNode,
  phase,
}: {
  c: Copy;
  activeThread: "main" | "cap";
  showCapNode: boolean;
  phase: Phase;
}) {
  const capBreathing = phase === "unread-breathing" || phase === "popover";
  const capUnreadBadge = phase === "unread-breathing" || phase === "popover";
  return (
    <div className="flex flex-col" style={{ background: "var(--paper-2)", borderLeft: "1px solid var(--rule)" }}>
      {/* rail-head */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--rule)" }}>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--ink-3)" }}>
          overview
        </span>
      </div>
      {/* rail-tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
        <div
          className="flex-1 text-center py-2 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--ink)", borderBottom: "2px solid var(--ink)" }}
        >
          list
        </div>
        <div
          className="flex-1 text-center py-2 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-4)", borderBottom: "2px solid transparent" }}
        >
          graph
        </div>
      </div>
      {/* rail-body */}
      <div className="flex-1 p-2.5 flex flex-col gap-[2px]">
        {/* Main node */}
        <RailNode
          title={c.mainCrumb}
          meta="2 msgs · 1 pin"
          pigmentColor="var(--ink-5)"
          active={activeThread === "main"}
        />
        {/* branch indent */}
        {showCapNode && (
          <div className="relative pl-4 ml-2">
            <span
              className="absolute left-[6px] top-1 bottom-2 w-px"
              style={{ background: "var(--rule)" }}
            />
            <RailNode
              title={c.subTitle}
              meta={phase === "ai-replying" ? "generating…" : "2 msgs"}
              pigmentColor="var(--pig-1)"
              active={activeThread === "cap"}
              breathing={capBreathing}
              unread={capUnreadBadge}
              newNode={phase === "underline-appear"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RailNode({
  title,
  meta,
  pigmentColor,
  active,
  breathing,
  unread,
  newNode,
}: {
  title: string;
  meta: string;
  pigmentColor: string;
  active: boolean;
  breathing?: boolean;
  unread?: boolean;
  newNode?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 px-2.5 py-2 rounded-md ${newNode ? "pin-demo-node-in" : ""}`}
      style={{
        background: active ? "var(--ink)" : "transparent",
      }}
    >
      <span
        className="flex-shrink-0 mt-[2px] w-[3px] h-8 rounded-[2px]"
        style={{ background: active ? "var(--paper)" : pigmentColor }}
      />
      <span className="flex-1 min-w-0">
        <span
          className="block font-serif text-[12.5px] leading-tight truncate font-medium"
          style={{ color: active ? "var(--paper)" : "var(--ink)" }}
        >
          {title}
        </span>
        <span
          className="block mt-[3px] font-mono text-[9.5px] leading-none truncate"
          style={{ color: active ? "var(--ink-5)" : "var(--ink-4)" }}
        >
          {meta}
        </span>
      </span>
      {unread && !active && (
        <span
          className={`flex-shrink-0 mt-[3px] inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full font-mono text-[9px] font-semibold ${breathing ? "pin-demo-badge" : ""}`}
          style={{ background: "var(--accent)", color: "var(--paper)" }}
        >
          1
        </span>
      )}
      <style jsx>{`
        .pin-demo-badge {
          animation: pin-demo-badge 2.2s ease-in-out infinite;
        }
        @keyframes pin-demo-badge {
          0%, 100% { box-shadow: 0 0 0 0 rgba(42, 42, 114, 0.45); }
          50% { box-shadow: 0 0 0 5px rgba(42, 42, 114, 0); }
        }
        .pin-demo-node-in {
          animation: pin-demo-node-in 500ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes pin-demo-node-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
