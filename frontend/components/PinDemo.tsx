"use client";
// components/PinDemo.tsx
// 欢迎页 desktop 演示：三层 walkthrough —— L0 两针 → L1 一针 → L2 到底 →
// graph 跳转 → 合并输出。整个过程自动播放，底栏可 prev/pause/next。
//
// Landing-page desktop demo: 3-layer walkthrough — 2 pins at L0 → 1 pin
// inside sub-thread (L1) → deepest reply (L2) → click root to jump on the
// graph → merge output. Auto-plays; the bottom strip exposes prev/pause/next.
//
// 共享文案 & phase 列表在 components/demoFlow/{types,content}.ts；
// 播放控制在 lib/useDemoController.ts；UI 控件在 components/DemoTransport.tsx。

import { useEffect, useRef, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import DemoTransport from "@/components/DemoTransport";
import { useDemoController } from "@/lib/useDemoController";
import { DEMO_CONTENT, type DemoContent } from "@/components/demoFlow/content";
import { DEMO_PHASES, type DemoPhase } from "@/components/demoFlow/types";

// ── Delays ──────────────────────────────────────────────────────────────
// 读字多的 phase（main-stream、*-dialog、l*-stream、*-underline 提示
// 两处变化的那几帧）给够时长；纯过渡（pick、enter）短一点。单位 ms。
// Phases with lots of reading get more time; pure transitions stay snappy.
const DELAYS: Record<DemoPhase, number> = {
  blank: 1500,
  "main-stream": 5500,
  "p1-sweep": 1500,
  "p1-selpop": 3200,
  "p1-dialog": 4500,
  "p1-pick": 1400,
  "p1-underline": 3400,
  "p2-sweep": 1500,
  "p2-selpop": 3200,
  "p2-dialog": 4500,
  "p2-pick": 1400,
  "p2-underline": 4200,
  "l1-hover": 3400,
  "l1-enter": 1500,
  "l1-stream": 4000,
  "p3-sweep": 1500,
  "p3-selpop": 3200,
  "p3-dialog": 4500,
  "p3-pick": 1400,
  "p3-underline": 4000,
  "l2-hover": 3200,
  "l2-enter": 1500,
  "l2-stream": 4200,
  "graph-hint": 2800,
  "graph-nav-root": 4000,
  "graph-navigated": 5500,
  "merge-hint": 3500,
  "merge-modal": 3200,
  "merge-stream": 4800,
  "merge-done": 5500,
};

// ── Phase order helpers —— 按序号判断是否过了某个关键点
// Ordinal lookup so "has phase X already happened" is a simple comparison.
const PHASE_IDX: Record<DemoPhase, number> = DEMO_PHASES.reduce(
  (acc, p, i) => {
    acc[p] = i;
    return acc;
  },
  {} as Record<DemoPhase, number>,
);
const atOrAfter = (current: DemoPhase, ref: DemoPhase) =>
  PHASE_IDX[current] >= PHASE_IDX[ref];

const inMainView = (p: DemoPhase) =>
  p === "blank" ||
  p === "main-stream" ||
  p.startsWith("p1-") ||
  p.startsWith("p2-") ||
  p === "l1-hover" ||
  p === "l1-enter" ||
  p === "graph-navigated" ||
  // merge-hint 不单独显示视图 —— 保留刚才的 MainView 做背景，
  // 合并 modal 在下一个 phase 才淡入覆盖。否则 Merge 按钮脉冲时
  // 左边对话区会空白一段。
  // merge-hint keeps MainView as backdrop so the left side doesn't go
  // blank while the top-right Merge button is pulsing. The modal fades
  // in on the next phase (merge-modal) and covers MainView then.
  p === "merge-hint";
const inSub1View = (p: DemoPhase) =>
  p === "l1-stream" ||
  p.startsWith("p3-") ||
  p === "l2-hover" ||
  p === "l2-enter";
const inDeepestView = (p: DemoPhase) =>
  p === "l2-stream" || p === "graph-hint" || p === "graph-nav-root";
const inMergeView = (p: DemoPhase) => p.startsWith("merge-");

// ── Component ────────────────────────────────────────────────────────────
export default function PinDemo() {
  const lang = useLangStore((s) => s.lang);
  const c: DemoContent = DEMO_CONTENT[lang] ?? DEMO_CONTENT.en;

  const control = useDemoController<DemoPhase>(DEMO_PHASES, DELAYS);
  const { phase } = control;

  useEffect(() => {
    control.goTo(0);
    control.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // transport 可见性 —— hover 盒子时 active
  const [hoverActive, setHoverActive] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeHover = () => {
    setHoverActive(true);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverActive(false), 2500);
  };
  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  // Sweep 百分比：三次 sweep phase 都从 0 → 1，在进入 selpop 之前保持 1。
  // Sweep pct animates 0→1 during a sweep phase and stays at 1 afterwards
  // so the selection highlight persists through selpop / dialog / pick.
  const [sweepPct, setSweepPct] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const sweeping =
      phase === "p1-sweep" || phase === "p2-sweep" || phase === "p3-sweep";
    if (!sweeping) {
      setSweepPct(1);
      return;
    }
    setSweepPct(0);
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

  // ── 流式打字 / Streaming typewriter ──────────────────────────────────
  // main-stream 和 merge-stream 填满 ~80% 的 phase duration（跨语言 ok，
  // 因为基于文本长度计算速度）；l1-stream / l2-stream 不流式 —— 用户
  // 之前在主线等过，回答已经 ready，进入即完整。
  // main-stream and merge-stream fill ~80% of their phase duration
  // (language-agnostic: rate derives from length). l1-stream and l2-stream
  // don't stream because by the time the user "enters" the sub-thread,
  // the answer has been ready for a while — it shouldn't look like it's
  // just now being generated.
  const [mainLen, setMainLen] = useState(0);
  const [sub1Len, setSub1Len] = useState(0);
  const [sub2Len, setSub2Len] = useState(0);
  const [mergeLen, setMergeLen] = useState(0);
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mainFullLen =
    c.aiBefore1.length + c.anchor1.length + c.aiBetween.length +
    c.anchor2.length + c.aiAfter2.length;
  const sub1FullLen =
    c.sub1Before.length + c.sub1Anchor.length + c.sub1After.length;

  // 跑一次 typewriter。fullMs 是这段流式应该跑多久；setter 按 tickMs 推进。
  // Run one typewriter animation. fullMs is how long streaming should last;
  // setter advances per tick, chars-per-tick derives from the length.
  const runStream = (
    total: number,
    fullMs: number,
    setter: (n: number) => void,
    tickMs = 28,
  ) => {
    if (total === 0) {
      setter(0);
      return () => {};
    }
    let i = 0;
    setter(0);
    const ticks = Math.max(1, Math.floor(fullMs / tickMs));
    const step = Math.max(1, Math.ceil(total / ticks));
    const tick = () => {
      i = Math.min(total, i + step);
      setter(i);
      if (i < total) streamTimerRef.current = setTimeout(tick, tickMs);
    };
    tick();
    return () => {
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    };
  };

  // 主线 AI 回复：blank 时清空，其它所有 phase 直接满长显示。
  // 用户反馈打字机让他们等 —— 主线回复第一眼就直接给整段。
  // Main reply: empty on `blank`, full length everywhere else.
  // Per user feedback the typewriter on the first reply felt like waiting —
  // render the full paragraph immediately so the viewer can start reading.
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    setMainLen(phase === "blank" ? 0 : mainFullLen);
  }, [phase, mainFullLen]);

  // 子线程 1 —— 直接满长，不流式
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (
      inSub1View(phase) ||
      inDeepestView(phase) ||
      inMergeView(phase) ||
      atOrAfter(phase, "p3-underline")
    ) {
      setSub1Len(sub1FullLen);
    } else {
      setSub1Len(0);
    }
  }, [phase, sub1FullLen]);

  // 深层回复 —— 也不流式，进 L2 时已经 ready
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (inDeepestView(phase) || inMergeView(phase)) {
      setSub2Len(c.sub2Reply.length);
    } else {
      setSub2Len(0);
    }
  }, [phase, c.sub2Reply]);

  // Merge 报告流式
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (phase === "merge-stream") {
      return runStream(
        c.mergeReport.length,
        DELAYS["merge-stream"] * 0.8,
        setMergeLen,
        22,
      );
    }
    if (phase === "merge-done") {
      setMergeLen(c.mergeReport.length);
      return;
    }
    setMergeLen(0);
  }, [phase, c.mergeReport]);

  // ── 派生状态 ────────────────────────────────────────────────────────
  const viewMain = inMainView(phase);
  const viewSub1 = inSub1View(phase);
  const viewDeep = inDeepestView(phase);
  const viewMerge = inMergeView(phase);

  const selpopOn: 1 | 2 | 3 | 0 =
    phase === "p1-selpop" ? 1 :
    phase === "p2-selpop" ? 2 :
    phase === "p3-selpop" ? 3 : 0;
  const dialogOn: 1 | 2 | 3 | 0 =
    phase === "p1-dialog" || phase === "p1-pick" ? 1 :
    phase === "p2-dialog" || phase === "p2-pick" ? 2 :
    phase === "p3-dialog" || phase === "p3-pick" ? 3 : 0;
  const dialogPicked =
    phase === "p1-pick" || phase === "p2-pick" || phase === "p3-pick";

  // 选区高亮持续：sweep + selpop + dialog + pick 都保留 accent 底色。
  // Selection bg persists through sweep → selpop → dialog → pick.
  const anchor1Selecting =
    phase === "p1-sweep" || phase === "p1-selpop" ||
    phase === "p1-dialog" || phase === "p1-pick";
  const anchor2Selecting =
    phase === "p2-sweep" || phase === "p2-selpop" ||
    phase === "p2-dialog" || phase === "p2-pick";
  const sub1AnchorSelecting =
    phase === "p3-sweep" || phase === "p3-selpop" ||
    phase === "p3-dialog" || phase === "p3-pick";

  // 锚点 visibility / breathing（按 phase 顺序判定，落笔后就一直在）
  // Anchor visibility / breathing by phase ordinal — once planted, stays.
  const anchor1Visible = atOrAfter(phase, "p1-underline");
  const anchor2Visible = atOrAfter(phase, "p2-underline");
  const sub1AnchorVisible = atOrAfter(phase, "p3-underline");
  // Breathing 在 hover phase 之前停止 —— popover 是 anchor span 的子元素，
  // 会继承 .anchor-breathing 的 opacity 动画（50% 时降到 0.78），导致后面
  // 的对话文字时隐时现。hover 时关掉呼吸，popover 就能稳定不透明地覆盖。
  // Stop breathing at hover: the popover is nested inside the anchor span
  // and inherits .anchor-breathing's 0.78 opacity dip, which makes the
  // conversation behind the popover blink through. Disabling breathing on
  // hover lets the popover sit opaque and fully cover what's underneath.
  const anchor1Breathing = anchor1Visible && PHASE_IDX[phase] < PHASE_IDX["l1-hover"];
  const anchor2Breathing = anchor2Visible; // 从不进入 —— 保持未读
  const sub1AnchorBreathing =
    sub1AnchorVisible && PHASE_IDX[phase] < PHASE_IDX["l2-hover"];

  // *-underline phase：对应图节点上加"刚落针"脉冲
  // On *-underline phases, pulse the graph node that just appeared.
  const nodePulse: "sub1" | "sub2" | "deep" | null =
    phase === "p1-underline" ? "sub1" :
    phase === "p2-underline" ? "sub2" :
    phase === "p3-underline" ? "deep" : null;

  const showPopover1 = phase === "l1-hover" || phase === "l1-enter";
  const showPopoverDeep = phase === "l2-hover" || phase === "l2-enter";
  const enterPulse1 = phase === "l1-enter";
  const enterPulseDeep = phase === "l2-enter";

  const activeNode: "main" | "sub1" | "sub2" | "deep" = viewMain
    ? "main"
    : viewDeep
      ? "deep"
      : viewSub1
        ? "sub1"
        : viewMerge
          ? "deep"
          : "main";

  const mergeBtnPulse = phase === "merge-hint";
  const mergeModalOpen =
    phase === "merge-modal" ||
    phase === "merge-stream" ||
    phase === "merge-done";
  const mergeContentShown = phase === "merge-stream" || phase === "merge-done";
  const mergeDone = phase === "merge-done";

  const rootTapHint = phase === "graph-nav-root";
  // hereNode —— 当前停留层的"你在这里"指示：l1-stream 在 sub1，l2-stream
  // 在 deep，graph-navigated 回到 root。这几帧会画一圈脉冲环 + 节点上方
  // 的"◉ you are here"文字，帮用户在 graph 上确认自己当前的深度。
  // hereNode anchors the "you are here" cue to the node that matches where
  // the user currently sits: sub1 during l1-stream, deep during l2-stream,
  // main after graph-navigated. Rendered as a gentle ring + label so the
  // viewer can confirm their depth against the tree without reading text.
  const hereNode: "main" | "sub1" | "deep" | null =
    phase === "graph-navigated" ? "main" :
    phase === "l1-stream" ? "sub1" :
    phase === "l2-stream" ? "deep" : null;

  // 固定盒子尺寸（保持原版）
  const GRID_H = 420;
  const RIGHT_W = 320;
  const TOTAL_H = 38 + GRID_H + 40;

  return (
    <div
      className="w-full select-none mx-auto"
      style={{ maxWidth: 1080 }}
      onMouseMove={nudgeHover}
      onMouseEnter={nudgeHover}
    >
      <div className="overflow-x-auto" style={{ minHeight: TOTAL_H }}>
        <div
          className="relative rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(27,26,23,0.12)] mx-auto"
          style={{
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            minWidth: 880,
            maxWidth: 1080,
            height: TOTAL_H,
          }}
        >
          {/* 标题栏 + Merge 按钮 */}
          <div
            className="flex items-center gap-2 px-4 h-[38px]"
            style={{ borderBottom: "1px solid var(--rule)" }}
          >
            <div className="flex gap-1.5">
              {["#ff5f57", "#ffbd2e", "#28c840"].map((col) => (
                <span
                  key={col}
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: col, opacity: 0.85 }}
                />
              ))}
            </div>
            <span
              className="font-mono text-[11px] ml-2"
              style={{ color: "var(--ink-4)" }}
            >
              deeppin — live demo
            </span>
            <span className="flex-1" />
            {/* Merge 提示：更粗的 halo + 比 tap-press 更大更慢的脉冲
                Merge hint: thicker halo + slower, bigger pulse. */}
            {/* demo-merge-hint 本身就是外扩 halo + 轻微 scale（不遮文字），
                所以内部不挂 demo-tap-print/ring —— 那两个是 40px 实心圆，
                会把 "Merge" 完全盖住，造成按钮看起来空白。
                demo-merge-hint is already an outward halo + gentle scale and
                does not obscure the label. We intentionally skip the nested
                tap-print / tap-ring here because those are a 40px filled
                disc that covers the button center and makes the "Merge"
                label read as blank. */}
            <span
              className={`relative inline-flex items-center gap-1 h-6 px-2.5 rounded-md font-medium text-[10.5px] transition-all ${
                mergeBtnPulse ? "demo-merge-hint" : ""
              }`}
              style={{
                background: mergeBtnPulse ? "var(--accent)" : "var(--ink)",
                color: "var(--paper)",
              }}
              aria-hidden
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M4 4l8 9M20 4l-8 9m0 0v7" />
              </svg>
              {c.mergeLabel}
            </span>
          </div>

          {/* 两栏 */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `minmax(480px, 1fr) ${RIGHT_W}px`,
              height: GRID_H,
            }}
          >
            <div
              className="relative overflow-hidden"
              style={{ background: "var(--paper)" }}
            >
              <div
                className={`absolute inset-0 transition-opacity duration-200 ${
                  viewMain ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <MainView
                  c={c}
                  phase={phase}
                  sweepPct={sweepPct}
                  mainLen={mainLen}
                  anchor1Visible={anchor1Visible}
                  anchor2Visible={anchor2Visible}
                  anchor1Breathing={anchor1Breathing}
                  anchor2Breathing={anchor2Breathing}
                  anchor1Selecting={anchor1Selecting}
                  anchor2Selecting={anchor2Selecting}
                  selpopOn={selpopOn}
                  showPopover1={showPopover1}
                  enterPulse={enterPulse1}
                />
              </div>
              <div
                className={`absolute inset-0 transition-opacity duration-200 ${
                  viewSub1 ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <Sub1View
                  c={c}
                  phase={phase}
                  sweepPct={sweepPct}
                  sub1Len={sub1Len}
                  sub1AnchorVisible={sub1AnchorVisible}
                  sub1AnchorBreathing={sub1AnchorBreathing}
                  sub1AnchorSelecting={sub1AnchorSelecting}
                  selpopOn={selpopOn}
                  showPopoverDeep={showPopoverDeep}
                  enterPulseDeep={enterPulseDeep}
                />
              </div>
              <div
                className={`absolute inset-0 transition-opacity duration-200 ${
                  viewDeep ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <DeepestView c={c} phase={phase} sub2Len={sub2Len} />
              </div>

              {dialogOn !== 0 && (
                <PinDialog
                  c={c}
                  dialogOn={dialogOn as 1 | 2 | 3}
                  picked={dialogPicked}
                />
              )}
            </div>

            <RightRail
              c={c}
              phase={phase}
              activeNode={activeNode}
              anchor1Visible={anchor1Visible}
              anchor2Visible={anchor2Visible}
              sub1AnchorVisible={sub1AnchorVisible}
              anchor1Breathing={anchor1Breathing}
              anchor2Breathing={anchor2Breathing}
              sub1AnchorBreathing={sub1AnchorBreathing}
              nodePulse={nodePulse}
              rootTapHint={rootTapHint}
              hereNode={hereNode}
            />
          </div>

          {viewMerge && (
            <MergeOverlay
              c={c}
              modalOpen={mergeModalOpen}
              contentShown={mergeContentShown}
              done={mergeDone}
              mergeLen={mergeLen}
              topOffset={38}
              bottomOffset={40}
            />
          )}

          <div
            className="px-5 h-[40px] flex items-center font-mono text-[11px] leading-snug tracking-wide gap-3"
            style={{
              borderTop: "1px solid var(--rule)",
              color: "var(--ink-3)",
              background: "var(--paper-2)",
            }}
          >
            <span className="flex-1 truncate">{c.caption[phase]}</span>
            <DemoTransport control={control} active={hoverActive} />
          </div>
        </div>
      </div>

      <style jsx global>{`
        .demo-tap-press {
          animation: demo-tap-press 1100ms ease-out 1;
        }
        @keyframes demo-tap-press {
          0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(42,42,114,0);   filter: brightness(1); }
          18%  { transform: scale(0.94); box-shadow: 0 0 0 6px rgba(42,42,114,0.35); filter: brightness(1.35); }
          40%  { transform: scale(1.06); box-shadow: 0 0 0 10px rgba(42,42,114,0.15); filter: brightness(1.25); }
          100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(42,42,114,0);   filter: brightness(1); }
        }
        .demo-merge-hint {
          animation: demo-merge-hint 1.4s ease-in-out infinite;
          box-shadow: 0 0 0 0 rgba(42,42,114,0.45);
        }
        @keyframes demo-merge-hint {
          0%, 100% { box-shadow: 0 0 0 0 rgba(42,42,114,0.50); transform: scale(1); }
          50%      { box-shadow: 0 0 0 12px rgba(42,42,114,0); transform: scale(1.04); }
        }
        .demo-tap-print {
          pointer-events: none;
          position: absolute;
          left: 50%; top: 50%;
          width: 40px; height: 40px;
          margin-left: -20px; margin-top: -20px;
          border-radius: 9999px;
          background: radial-gradient(circle,
            color-mix(in oklch, var(--accent) 85%, transparent) 0%,
            color-mix(in oklch, var(--accent) 55%, transparent) 40%,
            color-mix(in oklch, var(--accent) 0%, transparent) 72%);
          animation: demo-tap-print 1100ms ease-out 1 forwards;
          z-index: 40;
        }
        @keyframes demo-tap-print {
          0%   { transform: scale(0.4); opacity: 0; }
          15%  { transform: scale(0.9); opacity: 0.95; }
          55%  { transform: scale(1.0); opacity: 0.85; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .demo-tap-ring {
          pointer-events: none;
          position: absolute;
          left: 50%; top: 50%;
          width: 40px; height: 40px;
          margin-left: -20px; margin-top: -20px;
          border-radius: 9999px;
          border: 2px solid var(--accent);
          animation: demo-tap-ring 1100ms ease-out 1 forwards;
          z-index: 41;
        }
        @keyframes demo-tap-ring {
          0%   { transform: scale(0.35); opacity: 0; }
          20%  { transform: scale(0.85); opacity: 0.9; }
          100% { transform: scale(2.0); opacity: 0; }
        }
        @keyframes pin-demo-caret {
          0%, 50%   { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── MainView —— L0 主线（带两个锚点）─────────────────────────────────────
function MainView({
  c, phase, sweepPct, mainLen,
  anchor1Visible, anchor2Visible,
  anchor1Breathing, anchor2Breathing,
  anchor1Selecting, anchor2Selecting,
  selpopOn, showPopover1, enterPulse,
}: {
  c: DemoContent;
  phase: DemoPhase;
  sweepPct: number;
  mainLen: number;
  anchor1Visible: boolean;
  anchor2Visible: boolean;
  anchor1Breathing: boolean;
  anchor2Breathing: boolean;
  anchor1Selecting: boolean;
  anchor2Selecting: boolean;
  selpopOn: 0 | 1 | 2 | 3;
  showPopover1: boolean;
  enterPulse: boolean;
}) {
  const full =
    c.aiBefore1.length + c.anchor1.length + c.aiBetween.length +
    c.anchor2.length + c.aiAfter2.length;
  const streaming = phase === "main-stream" && mainLen < full;
  const show = phase === "main-stream" ? mainLen : full;
  let rem = show;
  const slice = (s: string) => {
    const t = s.slice(0, rem);
    rem -= t.length;
    return t;
  };
  const [s0, s1, s2, s3, s4] = [
    c.aiBefore1, c.anchor1, c.aiBetween, c.anchor2, c.aiAfter2,
  ].map(slice);

  return (
    <div className="relative h-full p-6 overflow-hidden">
      <div
        className="flex items-center gap-2 mb-4 font-mono text-[11px]"
        style={{ color: "var(--ink-3)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            border: "1px solid var(--ink)",
          }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--paper)" }}
          />
          {c.mainCrumb}
        </span>
      </div>

      {phase !== "blank" && (
        <>
          <div className="flex flex-col items-end mb-4">
            <div
              className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]"
              style={{ color: "var(--ink-4)" }}
            >
              <span
                className="w-[5px] h-[5px] rounded-full"
                style={{ background: "var(--ink-3)" }}
              />
              <span>{c.youLabel}</span>
            </div>
            <div
              className="max-w-[78%] px-[14px] py-[10px] text-[14px] leading-[1.55]"
              style={{
                background: "var(--accent)",
                color: "var(--paper)",
                borderRadius: 14,
                borderBottomRightRadius: 4,
              }}
            >
              {c.mainQuestion}
            </div>
          </div>

          <div className="flex flex-col items-start">
            <div
              className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]"
              style={{ color: "var(--ink-4)" }}
            >
              <span
                className="w-[5px] h-[5px] rounded-full"
                style={{ background: "var(--accent)" }}
              />
              <span>{c.aiLabel}</span>
            </div>
            <div
              className="relative max-w-[86%] px-[14px] py-[11px] text-[13.5px] leading-[1.6]"
              style={{
                background: "var(--card)",
                border: "1px solid var(--rule-soft)",
                color: "var(--ink)",
                borderRadius: 14,
                borderBottomLeftRadius: 4,
              }}
            >
              {s0}
              {s1 && (
                <AnchorSpan
                  text={s1}
                  pigment="var(--pig-1)"
                  selecting={anchor1Selecting}
                  sweeping={phase === "p1-sweep"}
                  sweepPct={sweepPct}
                  visible={anchor1Visible}
                  breathing={anchor1Breathing}
                >
                  {selpopOn === 1 && (
                    <SelPop label={c.followupLabel} copy={c.copyLabel} pulse />
                  )}
                  {showPopover1 && (
                    <AnchorPopover
                      c={c}
                      title={c.subTitle1}
                      pigment="var(--pig-1)"
                      question={c.suggestions1[0]}
                      answer={
                        c.sub1Before + c.sub1Anchor + c.sub1After
                      }
                      showNew
                      enterPulse={enterPulse}
                    />
                  )}
                </AnchorSpan>
              )}
              {s2}
              {s3 && (
                <AnchorSpan
                  text={s3}
                  pigment="var(--pig-2)"
                  selecting={anchor2Selecting}
                  sweeping={phase === "p2-sweep"}
                  sweepPct={sweepPct}
                  visible={anchor2Visible}
                  breathing={anchor2Breathing}
                >
                  {selpopOn === 2 && (
                    <SelPop label={c.followupLabel} copy={c.copyLabel} pulse />
                  )}
                </AnchorSpan>
              )}
              {s4}
              {streaming && (
                <span
                  className="inline-block w-[2px] h-3 align-middle ml-[1px]"
                  style={{
                    background: "var(--accent)",
                    animation: "pin-demo-caret 1s steps(2) infinite",
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub1View ─────────────────────────────────────────────────────────────
function Sub1View({
  c, phase, sweepPct, sub1Len,
  sub1AnchorVisible, sub1AnchorBreathing, sub1AnchorSelecting,
  selpopOn, showPopoverDeep, enterPulseDeep,
}: {
  c: DemoContent;
  phase: DemoPhase;
  sweepPct: number;
  sub1Len: number;
  sub1AnchorVisible: boolean;
  sub1AnchorBreathing: boolean;
  sub1AnchorSelecting: boolean;
  selpopOn: 0 | 1 | 2 | 3;
  showPopoverDeep: boolean;
  enterPulseDeep: boolean;
}) {
  const full = c.sub1Before.length + c.sub1Anchor.length + c.sub1After.length;
  const show = sub1Len > 0 ? sub1Len : full;
  let rem = show;
  const slice = (s: string) => {
    const t = s.slice(0, rem);
    rem -= t.length;
    return t;
  };
  const [b, a, rest] = [c.sub1Before, c.sub1Anchor, c.sub1After].map(slice);

  return (
    <div className="relative h-full p-6 overflow-hidden">
      <div
        className="flex items-center gap-1.5 mb-4 font-mono text-[11px]"
        style={{ color: "var(--ink-3)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{ color: "var(--ink-3)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--ink-5)" }}
          />
          {c.mainCrumb}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            border: "1px solid var(--ink)",
          }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--pig-1)" }}
          />
          {c.subTitle1}
        </span>
      </div>

      <div className="flex flex-col items-end mb-3">
        <div
          className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-4)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--ink-3)" }}
          />
          <span>{c.youLabel}</span>
        </div>
        <div
          className="max-w-[80%] px-[14px] py-[10px] text-[13px] leading-[1.55]"
          style={{
            background: "var(--accent)",
            color: "var(--paper)",
            borderRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          {c.suggestions1[0]}
        </div>
      </div>

      <div className="flex flex-col items-start">
        <div
          className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-4)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span>{c.aiLabel}</span>
        </div>
        <div
          className="relative max-w-[86%] px-[14px] py-[11px] text-[13px] leading-[1.6]"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            color: "var(--ink)",
            borderRadius: 14,
            borderBottomLeftRadius: 4,
          }}
        >
          {b}
          {a && (
            <AnchorSpan
              text={a}
              pigment="var(--pig-3)"
              selecting={sub1AnchorSelecting}
              sweeping={phase === "p3-sweep"}
              sweepPct={sweepPct}
              visible={sub1AnchorVisible}
              breathing={sub1AnchorBreathing}
            >
              {selpopOn === 3 && (
                <SelPop label={c.followupLabel} copy={c.copyLabel} pulse />
              )}
              {showPopoverDeep && (
                <AnchorPopover
                  c={c}
                  title={c.deepTitle}
                  pigment="var(--pig-3)"
                  question={c.suggestions3[0]}
                  answer={c.sub2Reply}
                  showNew
                  enterPulse={enterPulseDeep}
                />
              )}
            </AnchorSpan>
          )}
          {rest}
        </div>
      </div>
    </div>
  );
}

// ── DeepestView —— L2 ───────────────────────────────────────────────────
function DeepestView({
  c, phase, sub2Len,
}: {
  c: DemoContent;
  phase: DemoPhase;
  sub2Len: number;
}) {
  // l2-stream 阶段我们其实直接给 full 长度（不流式），所以 streaming=false
  // l2-stream no longer streams — answer was ready while user was elsewhere.
  void phase;
  return (
    <div className="relative h-full p-6 overflow-hidden">
      <div
        className="flex items-center gap-1.5 mb-4 font-mono text-[11px] flex-wrap"
        style={{ color: "var(--ink-3)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{ color: "var(--ink-3)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--ink-5)" }}
          />
          {c.mainCrumb}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{ color: "var(--ink-3)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--pig-1)" }}
          />
          {trunc(c.subTitle1, 16)}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{
            background: "var(--ink)",
            color: "var(--paper)",
            border: "1px solid var(--ink)",
          }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--pig-3)" }}
          />
          {trunc(c.deepTitle, 18)}
        </span>
      </div>

      <div className="flex flex-col items-end mb-3">
        <div
          className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-4)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--ink-3)" }}
          />
          <span>{c.youLabel}</span>
        </div>
        <div
          className="max-w-[80%] px-[14px] py-[10px] text-[13px] leading-[1.55]"
          style={{
            background: "var(--accent)",
            color: "var(--paper)",
            borderRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          {c.suggestions3[0]}
        </div>
      </div>

      <div className="flex flex-col items-start">
        <div
          className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-4)" }}
        >
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span>{c.aiLabel}</span>
        </div>
        <div
          className="max-w-[88%] px-[14px] py-[11px] text-[13px] leading-[1.6]"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            color: "var(--ink)",
            borderRadius: 14,
            borderBottomLeftRadius: 4,
          }}
        >
          {c.sub2Reply.slice(0, sub2Len || c.sub2Reply.length)}
        </div>
      </div>
    </div>
  );
}

// ── AnchorSpan ───────────────────────────────────────────────────────────
// selecting 参数覆盖 sweep + selpop + dialog + pick 四个阶段 —— 高亮一路保持
// 到下划线落下为止。sweepPct 只在 sweeping 时动画，否则定格在 1.
// `selecting` covers sweep + selpop + dialog + pick so the selection bg
// persists until the underline drops.
function AnchorSpan({
  text, pigment, selecting, sweeping, sweepPct,
  visible, breathing, children,
}: {
  text: string;
  pigment: string;
  selecting: boolean;
  sweeping: boolean;
  sweepPct: number;
  visible: boolean;
  breathing: boolean;
  children?: React.ReactNode;
}) {
  const pct = sweeping ? sweepPct : selecting ? 1 : 0;
  const bg = selecting
    ? `color-mix(in oklch, var(--accent) ${Math.round(pct * 22)}%, transparent)`
    : undefined;
  const bb = visible
    ? `${breathing ? 3 : 1}px solid ${pigment}`
    : selecting
      ? "1px solid transparent"
      : "none";
  const innerStyle: React.CSSProperties = breathing
    ? ({
        background: bg,
        paddingBottom: 1,
        color: "var(--ink)",
        "--anchor-color": pigment,
      } as React.CSSProperties)
    : {
        background: bg,
        borderBottom: bb,
        paddingBottom: 1,
        color: "var(--ink)",
        transition: "background 120ms ease-out, border-bottom 220ms ease-out",
      };
  return (
    <span
      className={`relative inline-block ${breathing ? "anchor-breathing" : ""}`}
      style={innerStyle}
    >
      {text}
      {children}
    </span>
  );
}

// ── SelPop ───────────────────────────────────────────────────────────────
function SelPop({
  label, copy, pulse,
}: {
  label: string;
  copy: string;
  pulse: boolean;
}) {
  return (
    <span
      className="absolute left-0 -top-11 z-20 inline-flex items-center gap-[2px] rounded-md shadow-[0_6px_20px_rgba(27,26,23,0.18)]"
      style={{ background: "var(--ink)", color: "var(--paper)", padding: 3 }}
    >
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px]"
        style={{ color: "var(--paper)" }}
      >
        <svg
          className="w-3 h-3"
          style={{ opacity: 0.75 }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
        {copy}
      </span>
      <span
        className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-medium ${
          pulse ? "demo-tap-press" : ""
        }`}
        style={{ background: "var(--accent)", color: "var(--paper)" }}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
        </svg>
        {label}
        {pulse && (
          <>
            <span className="demo-tap-print" aria-hidden />
            <span className="demo-tap-ring" aria-hidden />
          </>
        )}
      </span>
      <span
        aria-hidden
        className="absolute left-[22px] -bottom-1 w-2 h-2 rotate-45"
        style={{ background: "var(--ink)" }}
      />
    </span>
  );
}

// ── PinDialog —— 含自定义输入框，模仿真实 PinStartDialog ───────────────
// Matches the real PinStartDialog: anchor quote + 3 suggestion buttons +
// divider + textarea (with placeholder) + send button.
function PinDialog({
  c, dialogOn, picked,
}: {
  c: DemoContent;
  dialogOn: 1 | 2 | 3;
  picked: boolean;
}) {
  const { anchorText, suggestions, pigColor } = (() => {
    if (dialogOn === 1)
      return {
        anchorText: c.anchor1,
        suggestions: c.suggestions1,
        pigColor: "var(--pig-1)",
      };
    if (dialogOn === 2)
      return {
        anchorText: c.anchor2,
        suggestions: c.suggestions2,
        pigColor: "var(--pig-2)",
      };
    return {
      anchorText: c.sub1Anchor,
      suggestions: c.suggestions3,
      pigColor: "var(--pig-3)",
    };
  })();
  const pickedIdx = picked ? 0 : -1;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center animate-in fade-in-0 duration-150">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(27,26,23,0.35)" }}
      />
      <div
        className="relative w-[86%] max-w-[480px] rounded-xl shadow-[0_16px_48px_rgba(27,26,23,0.18)]"
        style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
      >
        {/* Anchor quote */}
        <div
          className="px-5 pt-4 pb-3 flex items-start gap-3"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          <span
            className="w-[3px] h-7 rounded-[2px] flex-shrink-0"
            style={{ background: pigColor }}
          />
          <div className="flex-1">
            <div
              className="font-mono text-[9px] uppercase tracking-[0.15em] mb-1"
              style={{ color: "var(--accent)" }}
            >
              {c.pinLabel}
            </div>
            <div
              className="font-serif text-[13px] italic leading-snug"
              style={{ color: "var(--ink-2)" }}
            >
              “{anchorText}”
            </div>
          </div>
        </div>
        {/* Suggestions */}
        <div className="px-5 pt-3 pb-2 flex flex-col gap-[6px]">
          <div
            className="font-mono text-[9px] uppercase tracking-[0.15em] mb-[2px]"
            style={{ color: "var(--ink-4)" }}
          >
            {c.suggestionsLabel}
          </div>
          {suggestions.map((q, i) => (
            <div
              key={q}
              className={`relative text-left px-3 py-2 rounded-md text-[12.5px] transition-colors ${
                pickedIdx === i ? "demo-tap-press" : ""
              }`}
              style={{
                background: pickedIdx === i ? "var(--accent-soft)" : "var(--paper-2)",
                border: `1px solid ${pickedIdx === i ? "var(--accent)" : "var(--rule-soft)"}`,
                color: pickedIdx === i ? "var(--accent)" : "var(--ink-2)",
              }}
            >
              {q}
              {pickedIdx === i && (
                <>
                  <span className="demo-tap-print" aria-hidden />
                  <span className="demo-tap-ring" aria-hidden />
                </>
              )}
            </div>
          ))}
        </div>
        {/* Divider */}
        <div className="mx-5 my-2" style={{ borderTop: "1px solid var(--rule-soft)" }} />
        {/* Custom question input */}
        <div className="px-5 pb-4 pt-1 flex items-end gap-2">
          <div
            className="flex-1 rounded-lg px-3 py-2 text-[12px] leading-snug"
            style={{
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              color: "var(--ink-4)",
              minHeight: 44,
            }}
          >
            {c.customQuestionPlaceholder}
          </div>
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
            style={{ background: "var(--rule)", color: "var(--ink-4)" }}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AnchorPopover —— 模仿 AnchorPreviewPopover：显示 Question + Answer
// Mirrors AnchorPreviewPopover: title row → YOU question → AI answer → Enter.
function AnchorPopover({
  c, title, pigment, question, answer, showNew, enterPulse,
}: {
  c: DemoContent;
  title: string;
  pigment: string;
  question: string;
  answer: string;
  showNew: boolean;
  enterPulse: boolean;
}) {
  // 改到锚点上方显示（bottom: calc(100%+6px)）—— 避免被 MainView 的
  // overflow-hidden 在底部切掉。整体压缩到 ~130px 高以确保装得下。
  // Renders above the anchor (bottom: calc(100%+6px)) so the nested
  // overflow-hidden containers don't clip its bottom. Compressed to ~130px.
  return (
    <span
      className="absolute left-0 bottom-[calc(100%+6px)] z-20 inline-block rounded-xl overflow-hidden shadow-[0_10px_32px_rgba(27,26,23,0.12)] animate-in fade-in-0 duration-150"
      style={{
        background: "var(--card)",
        border: "1px solid var(--rule)",
        width: 288,
      }}
    >
      {/* title row */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: pigment }}
        />
        <span
          className="flex-1 font-serif text-[12.5px] font-medium truncate"
          style={{ color: "var(--ink)" }}
        >
          {title}
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
      {/* YOU question + AI answer —— 并排紧凑显示 */}
      <div
        className="px-2.5 py-1.5"
        style={{ borderTop: "1px solid var(--rule-soft)" }}
      >
        <div className="flex items-start gap-1.5">
          <span
            className="font-mono text-[8.5px] uppercase tracking-[0.1em] flex-shrink-0 mt-[1px]"
            style={{ color: "var(--ink-4)" }}
          >
            {c.youLabel}
          </span>
          <p
            className="text-[11px] leading-tight flex-1"
            style={{
              color: "var(--ink-2)",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {question}
          </p>
        </div>
      </div>
      <div
        className="px-2.5 py-1.5"
        style={{ borderTop: "1px solid var(--rule-soft)" }}
      >
        <div className="flex items-start gap-1.5">
          <span
            className="font-mono text-[8.5px] uppercase tracking-[0.1em] flex-shrink-0 mt-[1px]"
            style={{ color: "var(--ink-4)" }}
          >
            {c.aiLabel}
          </span>
          <p
            className="text-[11px] leading-tight flex-1"
            style={{
              color: "var(--ink-2)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {answer}
          </p>
        </div>
      </div>
      {/* Enter row */}
      <div
        className={`relative flex items-center justify-end px-2.5 py-1.5 ${
          enterPulse ? "demo-tap-press" : ""
        }`}
        style={{
          borderTop: "1px solid var(--rule-soft)",
          background: enterPulse ? "var(--accent-soft)" : "var(--paper-2)",
        }}
      >
        <span
          className="inline-flex items-center gap-1 font-medium text-[11px]"
          style={{ color: "var(--accent)" }}
        >
          {c.enterLabel}
          <svg
            className="w-[11px] h-[11px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
        {enterPulse && (
          <>
            <span className="demo-tap-print" aria-hidden />
            <span className="demo-tap-ring" aria-hidden />
          </>
        )}
      </div>
    </span>
  );
}

// ── RightRail (graph) ───────────────────────────────────────────────────
// 四节点：main → sub1 / sub2；sub1 → deep。nodePulse 标记哪个节点刚落笔，
// 渲染一圈更大的 accent 脉冲环。rootTapHint 在 graph-nav-root 时给 root
// 套一圈显眼的脉冲 + 下方 "tap" 提示泡。
// 4 nodes: main → sub1 / sub2; sub1 → deep. nodePulse marks which node
// just appeared so we draw a large accent ring around it. rootTapHint at
// graph-nav-root wraps the root in an emphatic pulse + "tap" label so the
// user can't miss the click cue.
function RightRail({
  c, phase, activeNode,
  anchor1Visible, anchor2Visible, sub1AnchorVisible,
  anchor1Breathing, anchor2Breathing, sub1AnchorBreathing,
  nodePulse, rootTapHint, hereNode,
}: {
  c: DemoContent;
  phase: DemoPhase;
  activeNode: "main" | "sub1" | "sub2" | "deep";
  anchor1Visible: boolean;
  anchor2Visible: boolean;
  sub1AnchorVisible: boolean;
  anchor1Breathing: boolean;
  anchor2Breathing: boolean;
  sub1AnchorBreathing: boolean;
  nodePulse: "sub1" | "sub2" | "deep" | null;
  rootTapHint: boolean;
  hereNode: "main" | "sub1" | "deep" | null;
}) {
  const W = 300;
  const mainX = W / 2;
  const mainY = 60;
  const sub1X = W * 0.28;
  const sub1Y = 150;
  const sub2X = W * 0.72;
  const sub2Y = 150;
  const deepX = W * 0.28;
  const deepY = 240;

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--paper-2)",
        borderLeft: "1px solid var(--rule)",
      }}
    >
      <div
        className="px-4 pt-4 pb-3"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <span
          className="font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: "var(--ink-3)" }}
        >
          {c.overviewLabel}
        </span>
      </div>
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: "1px solid var(--rule-soft)" }}
      >
        <div
          className="flex-1 text-center py-2 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{
            color: "var(--ink-4)",
            borderBottom: "2px solid transparent",
          }}
        >
          {c.listTabLabel}
        </div>
        <div
          className="flex-1 text-center py-2 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--ink)", borderBottom: "2px solid var(--ink)" }}
        >
          {c.graphTabLabel}
        </div>
      </div>
      <div className="flex-1 relative flex items-center justify-center">
        <svg
          viewBox={`0 0 ${W} 320`}
          style={{ width: "100%", height: "100%", maxHeight: 320 }}
          preserveAspectRatio="xMidYMid meet"
        >
          {anchor1Visible && (
            <path
              d={`M ${mainX} ${mainY} C ${mainX} ${mainY + 40}, ${sub1X} ${sub1Y - 40}, ${sub1X} ${sub1Y}`}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
          )}
          {anchor2Visible && (
            <path
              d={`M ${mainX} ${mainY} C ${mainX} ${mainY + 40}, ${sub2X} ${sub2Y - 40}, ${sub2X} ${sub2Y}`}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
          )}
          {sub1AnchorVisible && (
            <path
              d={`M ${sub1X} ${sub1Y} C ${sub1X} ${sub1Y + 40}, ${deepX} ${deepY - 40}, ${deepX} ${deepY}`}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
          )}

          {/* main */}
          <g>
            {rootTapHint && (
              <>
                <circle
                  cx={mainX}
                  cy={mainY}
                  r={14}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                >
                  <animate
                    attributeName="r"
                    values="10;20;10"
                    dur="1.1s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.8;0.05;0.8"
                    dur="1.1s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={mainX}
                  cy={mainY}
                  r={8}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  opacity={0.5}
                />
              </>
            )}
            <circle
              cx={mainX}
              cy={mainY}
              r={activeNode === "main" ? 6 : 4.5}
              fill={activeNode === "main" ? "var(--ink)" : "var(--paper-2)"}
              stroke="var(--ink)"
              strokeWidth={activeNode === "main" ? 0 : 1.25}
            />
            <text
              x={mainX}
              y={mainY + 22}
              fontSize={11}
              fill={activeNode === "main" ? "var(--ink)" : "var(--ink-3)"}
              style={{ fontFamily: "var(--font-serif)" }}
              textAnchor="middle"
              fontWeight={activeNode === "main" ? 500 : 400}
            >
              {c.mainCrumb}
            </text>
            {rootTapHint && (
              <g>
                <rect
                  x={mainX - 18}
                  y={mainY - 44}
                  width={36}
                  height={16}
                  rx={4}
                  fill="var(--accent)"
                />
                <text
                  x={mainX}
                  y={mainY - 33}
                  fontSize={9}
                  fill="var(--paper)"
                  style={{ fontFamily: "var(--font-mono)" }}
                  textAnchor="middle"
                  fontWeight={600}
                >
                  {c.tapLabel}
                </text>
              </g>
            )}
            {hereNode === "main" && (
              <text
                x={mainX}
                y={mainY - 18}
                fontSize={9}
                fill="var(--accent)"
                style={{ fontFamily: "var(--font-mono)" }}
                textAnchor="middle"
              >
                ◉ {c.youAreHereLabel}
              </text>
            )}
          </g>

          {/* sub1 */}
          {anchor1Visible && (
            <g>
              {(nodePulse === "sub1" || hereNode === "sub1") && (
                <circle
                  cx={sub1X}
                  cy={sub1Y}
                  r={10}
                  fill="none"
                  stroke="var(--pig-1)"
                  strokeWidth={2}
                >
                  <animate
                    attributeName="r"
                    values="6;16;6"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.9;0;0.9"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={sub1X}
                cy={sub1Y}
                r={activeNode === "sub1" ? 6 : 4.5}
                fill={activeNode === "sub1" ? "var(--pig-1)" : "var(--paper-2)"}
                stroke="var(--pig-1)"
                strokeWidth={activeNode === "sub1" ? 0 : 1.25}
              />
              {anchor1Breathing && (
                <circle
                  cx={sub1X + 7}
                  cy={sub1Y - 5}
                  r={3.5}
                  fill="var(--accent)"
                  stroke="var(--paper)"
                  strokeWidth={1.25}
                >
                  <animate
                    attributeName="r"
                    values="3.5;4.5;3.5"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <text
                x={sub1X}
                y={sub1Y + 22}
                fontSize={10}
                fill={activeNode === "sub1" ? "var(--ink)" : "var(--ink-3)"}
                style={{ fontFamily: "var(--font-serif)" }}
                textAnchor="middle"
                fontWeight={activeNode === "sub1" ? 500 : 400}
              >
                {trunc(c.subTitle1, 14)}
              </text>
              {hereNode === "sub1" && (
                <text
                  x={sub1X}
                  y={sub1Y - 14}
                  fontSize={9}
                  fill="var(--accent)"
                  style={{ fontFamily: "var(--font-mono)" }}
                  textAnchor="middle"
                >
                  ◉ {c.youAreHereLabel}
                </text>
              )}
            </g>
          )}

          {/* sub2 */}
          {anchor2Visible && (
            <g>
              {nodePulse === "sub2" && (
                <circle
                  cx={sub2X}
                  cy={sub2Y}
                  r={10}
                  fill="none"
                  stroke="var(--pig-2)"
                  strokeWidth={2}
                >
                  <animate
                    attributeName="r"
                    values="6;16;6"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.9;0;0.9"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={sub2X}
                cy={sub2Y}
                r={activeNode === "sub2" ? 6 : 4.5}
                fill={activeNode === "sub2" ? "var(--pig-2)" : "var(--paper-2)"}
                stroke="var(--pig-2)"
                strokeWidth={activeNode === "sub2" ? 0 : 1.25}
              />
              {anchor2Breathing && (
                <circle
                  cx={sub2X + 7}
                  cy={sub2Y - 5}
                  r={3.5}
                  fill="var(--accent)"
                  stroke="var(--paper)"
                  strokeWidth={1.25}
                >
                  <animate
                    attributeName="r"
                    values="3.5;4.5;3.5"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <text
                x={sub2X}
                y={sub2Y + 22}
                fontSize={10}
                fill={activeNode === "sub2" ? "var(--ink)" : "var(--ink-3)"}
                style={{ fontFamily: "var(--font-serif)" }}
                textAnchor="middle"
                fontWeight={activeNode === "sub2" ? 500 : 400}
              >
                {trunc(c.subTitle2, 14)}
              </text>
            </g>
          )}

          {/* deep */}
          {sub1AnchorVisible && (
            <g style={{ animation: "pin-demo-fade-in 320ms ease-out both" }}>
              {(nodePulse === "deep" || hereNode === "deep") && (
                <circle
                  cx={deepX}
                  cy={deepY}
                  r={10}
                  fill="none"
                  stroke="var(--pig-3)"
                  strokeWidth={2}
                >
                  <animate
                    attributeName="r"
                    values="6;16;6"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.9;0;0.9"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={deepX}
                cy={deepY}
                r={activeNode === "deep" ? 6 : 4.5}
                fill={activeNode === "deep" ? "var(--pig-3)" : "var(--paper-2)"}
                stroke="var(--pig-3)"
                strokeWidth={activeNode === "deep" ? 0 : 1.25}
              />
              {sub1AnchorBreathing && (
                <circle
                  cx={deepX + 7}
                  cy={deepY - 5}
                  r={3.5}
                  fill="var(--accent)"
                  stroke="var(--paper)"
                  strokeWidth={1.25}
                >
                  <animate
                    attributeName="r"
                    values="3.5;4.5;3.5"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <text
                x={deepX}
                y={deepY + 22}
                fontSize={10}
                fill={activeNode === "deep" ? "var(--ink)" : "var(--ink-3)"}
                style={{ fontFamily: "var(--font-serif)" }}
                textAnchor="middle"
                fontWeight={activeNode === "deep" ? 500 : 400}
              >
                {trunc(c.deepTitle, 14)}
              </text>
              {hereNode === "deep" && (
                <text
                  x={deepX}
                  y={deepY - 14}
                  fontSize={9}
                  fill="var(--accent)"
                  style={{ fontFamily: "var(--font-mono)" }}
                  textAnchor="middle"
                >
                  ◉ {c.youAreHereLabel}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
      <style jsx>{`
        @keyframes pin-demo-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ── MergeOverlay —— 用实际 graph 替代 flat list 选线程
// Uses the actual graph tree for branch selection — matches the narrative
// "the tree shows all your pins". All nodes render in their pigment-filled
// "selected" state.
function MergeOverlay({
  c, modalOpen, contentShown, done, mergeLen,
  topOffset, bottomOffset,
}: {
  c: DemoContent;
  modalOpen: boolean;
  contentShown: boolean;
  done: boolean;
  mergeLen: number;
  topOffset: number;
  bottomOffset: number;
}) {
  return (
    <div
      className="absolute inset-x-0 z-40 flex items-stretch justify-center"
      style={{
        top: topOffset,
        bottom: bottomOffset,
        background: "rgba(27,26,23,0.35)",
        opacity: modalOpen ? 1 : 0,
        transition: "opacity 240ms ease-out",
        pointerEvents: modalOpen ? "auto" : "none",
      }}
    >
      <div
        className="self-center w-[86%] max-w-[720px] rounded-xl overflow-hidden flex flex-col"
        style={{
          background: "var(--card)",
          border: "1px solid var(--rule)",
          boxShadow: "0 24px 64px rgba(27,26,23,0.22)",
          transform: modalOpen ? "translateY(0)" : "translateY(24px)",
          transition: "transform 300ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* 顶栏：dot + 标题 + 数量 + 关闭 —— 对齐真实 MergeOutput
            Header mirroring MergeOutput: dot + title + count + close. */}
        <div
          className="flex items-center gap-2.5 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          <span
            className="w-[8px] h-[8px] rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span
            className="font-serif text-[15px] font-medium"
            style={{ color: "var(--ink)" }}
          >
            {c.mergeOutputLabel}
          </span>
          <span
            className="font-mono text-[10.5px] tabular-nums"
            style={{ color: "var(--ink-4)" }}
          >
            {c.mergeBranchesSelected}
          </span>
          <span className="flex-1" />
          <span
            className="w-6 h-6 flex items-center justify-center rounded-md"
            style={{ color: "var(--ink-4)" }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        </div>

        {/* 格式选择行 —— 跟真实 UI 一样的卡片（label 加一行小描述） */}
        <div
          className="flex gap-1.5 px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          {c.mergeFormats.map((f, i) => {
            const isActive = i === 0;
            return (
              <span
                key={f}
                className="flex-1 rounded-md px-2.5 py-1.5 text-left"
                style={{
                  background: isActive ? "var(--accent-soft)" : "var(--paper-2)",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--rule-soft)"}`,
                  color: isActive ? "var(--accent)" : "var(--ink-3)",
                }}
              >
                <div className="font-medium text-[11.5px] leading-tight">{f}</div>
              </span>
            );
          })}
        </div>

        <div className="flex flex-1" style={{ height: 240 }}>
          {/* 左：graph tree 选择（全选 pigment）*/}
          <div
            className="flex-shrink-0 flex flex-col"
            style={{ width: 230, borderRight: "1px solid var(--rule-soft)" }}
          >
            <div
              className="px-3 py-1.5 flex items-center"
              style={{ borderBottom: "1px solid var(--rule-soft)" }}
            >
              <span
                className="font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{ color: "var(--ink-4)" }}
              >
                {c.mergeSelectThreads}
              </span>
            </div>
            <div className="flex-1 p-2 flex items-center justify-center">
              <MergeGraphPreview c={c} />
            </div>
          </div>

          {/* 右：输出 */}
          <div className="flex-1 px-4 py-3 overflow-hidden relative">
            {!contentShown ? (
              <div className="h-full flex items-center justify-center">
                <span
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium"
                  style={{ background: "var(--accent)", color: "var(--paper)" }}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  {c.mergeGenerate}
                </span>
              </div>
            ) : (
              <div className="overflow-y-auto h-full pr-1">
                <MiniMd text={c.mergeReport.slice(0, mergeLen)} />
                {!done && (
                  <span
                    className="inline-block w-[2px] h-3 align-middle ml-[1px]"
                    style={{
                      background: "var(--accent)",
                      animation: "pin-demo-caret 1s steps(2) infinite",
                    }}
                  />
                )}
                {done && (
                  <div
                    className="flex items-center gap-2 mt-3 pt-2.5"
                    style={{ borderTop: "1px solid var(--rule-soft)" }}
                  >
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md"
                      style={{
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        border: "1px solid var(--accent)",
                      }}
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                      >
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                      {c.mergeDownload}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md"
                      style={{
                        background: "var(--paper-2)",
                        color: "var(--ink-2)",
                        border: "1px solid var(--rule)",
                      }}
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                      {c.mergeCopy}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MergeGraphPreview —— 合并弹窗左侧的缩略 graph，四节点都是"选中"态
// Thumbnail graph for the merge modal — all 4 nodes render in their
// pigment-filled "selected" state with a checkmark overlay.
function MergeGraphPreview({ c }: { c: DemoContent }) {
  void c;
  const W = 200, H = 220;
  const mainX = W / 2;
  const mainY = 30;
  const sub1X = W * 0.28;
  const sub1Y = 110;
  const sub2X = W * 0.72;
  const sub2Y = 110;
  const deepX = W * 0.28;
  const deepY = 180;

  const Check = ({ cx, cy }: { cx: number; cy: number }) => (
    <g>
      <circle
        cx={cx + 6}
        cy={cy - 6}
        r={5}
        fill="var(--accent)"
        stroke="var(--paper)"
        strokeWidth={1.5}
      />
      <path
        d={`M ${cx + 3.5} ${cy - 6} L ${cx + 5.5} ${cy - 4} L ${cx + 8.5} ${cy - 8}`}
        stroke="var(--paper)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%" }}
    >
      <path
        d={`M ${mainX} ${mainY} C ${mainX} ${mainY + 30}, ${sub1X} ${sub1Y - 30}, ${sub1X} ${sub1Y}`}
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />
      <path
        d={`M ${mainX} ${mainY} C ${mainX} ${mainY + 30}, ${sub2X} ${sub2Y - 30}, ${sub2X} ${sub2Y}`}
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />
      <path
        d={`M ${sub1X} ${sub1Y} C ${sub1X} ${sub1Y + 30}, ${deepX} ${deepY - 30}, ${deepX} ${deepY}`}
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />

      <g>
        <circle cx={mainX} cy={mainY} r={5} fill="var(--ink)" />
        <text
          x={mainX}
          y={mainY + 18}
          fontSize={10}
          fill="var(--ink-2)"
          style={{ fontFamily: "var(--font-serif)" }}
          textAnchor="middle"
        >
          Main
        </text>
      </g>
      <g>
        <circle cx={sub1X} cy={sub1Y} r={5} fill="var(--pig-1)" />
        <Check cx={sub1X} cy={sub1Y} />
      </g>
      <g>
        <circle cx={sub2X} cy={sub2Y} r={5} fill="var(--pig-2)" />
        <Check cx={sub2X} cy={sub2Y} />
      </g>
      <g>
        <circle cx={deepX} cy={deepY} r={5} fill="var(--pig-3)" />
        <Check cx={deepX} cy={deepY} />
      </g>
    </svg>
  );
}

// ── Mini markdown ────────────────────────────────────────────────────────
function MiniMd({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-[2px]" />;
        if (line.startsWith("## "))
          return (
            <p
              key={i}
              className="font-serif text-[13px] font-medium"
              style={{ color: "var(--ink)" }}
            >
              {line.slice(3)}
            </p>
          );
        if (line.includes("**")) {
          const parts = line.split("**");
          return (
            <p
              key={i}
              className="text-[11.5px] leading-snug"
              style={{ color: "var(--ink-2)" }}
            >
              {parts.map((p, j) =>
                j % 2 === 1 ? (
                  <strong key={j} style={{ color: "var(--ink)", fontWeight: 600 }}>
                    {p}
                  </strong>
                ) : (
                  p
                ),
              )}
            </p>
          );
        }
        return (
          <p
            key={i}
            className="text-[11.5px] leading-snug"
            style={{ color: "var(--ink-2)" }}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}
