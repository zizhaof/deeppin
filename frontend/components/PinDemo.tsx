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
// 读字多的 phase（main-stream / *-underline 带说明字幕 / l*-stream）给
// 够时长，纯过渡（pick / enter）短一点。单位 ms。
// Phases with long captions or streaming text get enough time to read;
// pure transitions are snappy. Values in ms.
const DELAYS: Record<DemoPhase, number> = {
  blank: 1500,
  "main-stream": 5500,
  "p1-sweep": 1400,
  "p1-selpop": 2600,
  "p1-dialog": 3600,
  "p1-pick": 1200,
  "p1-underline": 1800,
  "p2-sweep": 1400,
  "p2-selpop": 2600,
  "p2-dialog": 3600,
  "p2-pick": 1200,
  "p2-underline": 4200,
  "l1-hover": 3200,
  "l1-enter": 1400,
  "l1-stream": 5000,
  "p3-sweep": 1400,
  "p3-selpop": 2600,
  "p3-dialog": 3600,
  "p3-pick": 1200,
  "p3-underline": 3600,
  "l2-hover": 3000,
  "l2-enter": 1400,
  "l2-stream": 5500,
  "graph-hint": 2500,
  "graph-nav-root": 3000,
  "graph-navigated": 1800,
  "merge-hint": 2500,
  "merge-modal": 3200,
  "merge-stream": 4500,
  "merge-done": 5500,
};

// ── 辅助：phase 分组 ─────────────────────────────────────────────────────
// 以 phase id 前缀判断视图层。
// Phase-prefix helpers for cleaner rendering logic.
const inMainView = (p: DemoPhase) =>
  p === "blank" ||
  p === "main-stream" ||
  p.startsWith("p1-") ||
  p.startsWith("p2-") ||
  p === "l1-hover" ||
  p === "l1-enter" ||
  p === "graph-navigated";
const inSub1View = (p: DemoPhase) =>
  p === "l1-stream" || p.startsWith("p3-") || p === "l2-hover" || p === "l2-enter";
const inDeepestView = (p: DemoPhase) =>
  p === "l2-stream" || p === "graph-hint" || p === "graph-nav-root";
const inMergeView = (p: DemoPhase) => p.startsWith("merge-");

// ── Component ────────────────────────────────────────────────────────────
export default function PinDemo() {
  const lang = useLangStore((s) => s.lang);
  const c: DemoContent = DEMO_CONTENT[lang] ?? DEMO_CONTENT.en;

  const control = useDemoController<DemoPhase>(DEMO_PHASES, DELAYS);
  const { phase } = control;

  // 语言切换 → 回到开头（避免撞上一半翻译的流式文字）
  // Reset to start when the UI language changes.
  useEffect(() => {
    control.goTo(0);
    control.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // 鼠标进入 demo → transport 完整显示；2.5s 无动静淡出。
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

  // Sweep 百分比：三次 sweep phase 都从 0 → 1
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

  // 流式打字长度 —— 每个 stream phase 独立
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

  // 主线流式
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (phase === "blank") {
      setMainLen(0);
      return;
    }
    if (phase !== "main-stream") {
      setMainLen(mainFullLen);
      return;
    }
    setMainLen(0);
    let i = 0;
    const tick = () => {
      i = Math.min(mainFullLen, i + 5);
      setMainLen(i);
      if (i < mainFullLen) streamTimerRef.current = setTimeout(tick, 32);
    };
    tick();
    return () => {
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    };
  }, [phase, mainFullLen]);

  // 子线程 1 流式
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (phase !== "l1-stream") {
      setSub1Len(
        inSub1View(phase) || inDeepestView(phase) || inMergeView(phase)
          ? sub1FullLen
          : 0,
      );
      return;
    }
    setSub1Len(0);
    let i = 0;
    const tick = () => {
      i = Math.min(sub1FullLen, i + 4);
      setSub1Len(i);
      if (i < sub1FullLen) streamTimerRef.current = setTimeout(tick, 34);
    };
    tick();
    return () => {
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    };
  }, [phase, sub1FullLen]);

  // L2 流式
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (phase !== "l2-stream") {
      setSub2Len(
        inDeepestView(phase) || inMergeView(phase) ? c.sub2Reply.length : 0,
      );
      return;
    }
    setSub2Len(0);
    let i = 0;
    const tick = () => {
      i = Math.min(c.sub2Reply.length, i + 4);
      setSub2Len(i);
      if (i < c.sub2Reply.length) streamTimerRef.current = setTimeout(tick, 30);
    };
    tick();
    return () => {
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    };
  }, [phase, c.sub2Reply]);

  // Merge 报告流式
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (phase === "merge-stream") {
      setMergeLen(0);
      let i = 0;
      const tick = () => {
        i = Math.min(c.mergeReport.length, i + 8);
        setMergeLen(i);
        if (i < c.mergeReport.length)
          streamTimerRef.current = setTimeout(tick, 22);
      };
      tick();
      return () => {
        if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
      };
    }
    if (phase === "merge-done") {
      setMergeLen(c.mergeReport.length);
      return;
    }
    setMergeLen(0);
  }, [phase, c.mergeReport]);

  // 派生 state
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

  // 锚点 visibility / breathing
  const anchor1Visible = ![
    "blank", "main-stream",
    "p1-sweep", "p1-selpop", "p1-dialog", "p1-pick",
  ].includes(phase);
  const anchor2Visible = ![
    "blank", "main-stream",
    "p1-sweep", "p1-selpop", "p1-dialog", "p1-pick", "p1-underline",
    "p2-sweep", "p2-selpop", "p2-dialog", "p2-pick",
  ].includes(phase);
  const anchor1Breathing = [
    "p1-underline",
    "p2-sweep", "p2-selpop", "p2-dialog", "p2-pick", "p2-underline",
    "l1-hover",
  ].includes(phase);
  const anchor2Breathing = [
    "p2-underline",
    "l1-hover", "l1-enter", "l1-stream",
    "p3-sweep", "p3-selpop", "p3-dialog", "p3-pick", "p3-underline",
    "l2-hover", "l2-enter", "l2-stream",
    "graph-hint", "graph-nav-root", "graph-navigated",
  ].includes(phase);

  const sub1AnchorShown =
    (viewSub1 || viewDeep || viewMerge) &&
    !["l1-stream", "p3-sweep", "p3-selpop", "p3-dialog", "p3-pick"].includes(
      phase,
    );
  const sub1AnchorBreathing = ["p3-underline", "l2-hover"].includes(phase);

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
    phase === "merge-modal" || phase === "merge-stream" || phase === "merge-done";
  const mergeContentShown = phase === "merge-stream" || phase === "merge-done";
  const mergeDone = phase === "merge-done";

  const rootTapHint = phase === "graph-nav-root";

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
          {/* 标题栏 —— 带 Merge 按钮 */}
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
            <span
              className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-md font-medium text-[10.5px] transition-all ${
                mergeBtnPulse ? "demo-tap-press" : ""
              }`}
              style={{
                background: mergeBtnPulse ? "var(--accent)" : "var(--ink)",
                color: "var(--paper)",
                boxShadow: mergeBtnPulse
                  ? "0 0 0 4px rgba(42,42,114,0.22)"
                  : "none",
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
                  sub1AnchorShown={sub1AnchorShown}
                  sub1AnchorBreathing={sub1AnchorBreathing}
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
                <PinDialog c={c} dialogOn={dialogOn as 1 | 2 | 3} picked={dialogPicked} />
              )}
            </div>

            <RightRail
              c={c}
              phase={phase}
              activeNode={activeNode}
              anchor1Visible={anchor1Visible}
              anchor2Visible={anchor2Visible}
              sub1AnchorShown={sub1AnchorShown}
              anchor1Breathing={anchor1Breathing}
              anchor2Breathing={anchor2Breathing}
              sub1AnchorBreathing={sub1AnchorBreathing}
              rootTapHint={rootTapHint}
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

  const sweep1 = phase === "p1-sweep";
  const sweep2 = phase === "p2-sweep";

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
              <span>YOU</span>
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
              <span>Deeppin</span>
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
                  sweeping={sweep1}
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
                  sweeping={sweep2}
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

// ── Sub1View —— L1 子线程（来自 pin1）────────────────────────────────────
function Sub1View({
  c, phase, sweepPct, sub1Len,
  sub1AnchorShown, sub1AnchorBreathing,
  selpopOn, showPopoverDeep, enterPulseDeep,
}: {
  c: DemoContent;
  phase: DemoPhase;
  sweepPct: number;
  sub1Len: number;
  sub1AnchorShown: boolean;
  sub1AnchorBreathing: boolean;
  selpopOn: 0 | 1 | 2 | 3;
  showPopoverDeep: boolean;
  enterPulseDeep: boolean;
}) {
  const full = c.sub1Before.length + c.sub1Anchor.length + c.sub1After.length;
  const streaming = phase === "l1-stream" && sub1Len < full;
  const show = phase === "l1-stream" ? sub1Len : full;
  let rem = show;
  const slice = (s: string) => {
    const t = s.slice(0, rem);
    rem -= t.length;
    return t;
  };
  const [b, a, rest] = [c.sub1Before, c.sub1Anchor, c.sub1After].map(slice);
  const sweep3 = phase === "p3-sweep";

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
          <span>YOU</span>
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
          <span>Deeppin</span>
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
              sweeping={sweep3}
              sweepPct={sweepPct}
              visible={sub1AnchorShown}
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
                  showNew
                  enterPulse={enterPulseDeep}
                />
              )}
            </AnchorSpan>
          )}
          {rest}
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
    </div>
  );
}

// ── DeepestView —— L2 最深一层 ───────────────────────────────────────────
function DeepestView({
  c, phase, sub2Len,
}: {
  c: DemoContent;
  phase: DemoPhase;
  sub2Len: number;
}) {
  const streaming = phase === "l2-stream" && sub2Len < c.sub2Reply.length;
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
          <span>YOU</span>
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
          <span>Deeppin</span>
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
          {c.sub2Reply.slice(0, sub2Len)}
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
    </div>
  );
}

// ── AnchorSpan ───────────────────────────────────────────────────────────
function AnchorSpan({
  text, pigment, sweeping, sweepPct,
  visible, breathing, children,
}: {
  text: string;
  pigment: string;
  sweeping: boolean;
  sweepPct: number;
  visible: boolean;
  breathing: boolean;
  children?: React.ReactNode;
}) {
  const bg = sweeping
    ? `color-mix(in oklch, var(--accent) ${Math.round(sweepPct * 22)}%, transparent)`
    : undefined;
  const bb = visible
    ? `${breathing ? 3 : 1}px solid ${pigment}`
    : sweeping
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

// ── PinDialog ────────────────────────────────────────────────────────────
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
        className="relative w-[84%] max-w-[440px] rounded-xl shadow-[0_16px_48px_rgba(27,26,23,0.18)]"
        style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
      >
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
        <div className="px-5 py-4 flex flex-col gap-[6px]">
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
      </div>
    </div>
  );
}

// ── AnchorPopover ────────────────────────────────────────────────────────
function AnchorPopover({
  c, title, pigment, showNew, enterPulse,
}: {
  c: DemoContent;
  title: string;
  pigment: string;
  showNew: boolean;
  enterPulse: boolean;
}) {
  return (
    <span
      className="absolute left-0 top-[calc(100%+4px)] z-20 inline-block rounded-xl overflow-hidden shadow-[0_10px_32px_rgba(27,26,23,0.12)] animate-in fade-in-0 duration-150"
      style={{
        background: "var(--card)",
        border: "1px solid var(--rule)",
        width: 280,
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: pigment }}
        />
        <span
          className="flex-1 font-serif text-[13px] font-medium truncate"
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
      <div
        className="px-3 py-2 text-[11.5px] leading-snug"
        style={{
          borderTop: "1px solid var(--rule-soft)",
          color: "var(--ink-2)",
        }}
      >
        {c.sub1Before.slice(0, 70)}…
      </div>
      <div
        className={`relative flex items-center justify-end px-3 py-2 ${
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

// ── RightRail （graph）───────────────────────────────────────────────────
function RightRail({
  c, phase, activeNode,
  anchor1Visible, anchor2Visible, sub1AnchorShown,
  anchor1Breathing, anchor2Breathing, sub1AnchorBreathing,
  rootTapHint,
}: {
  c: DemoContent;
  phase: DemoPhase;
  activeNode: "main" | "sub1" | "sub2" | "deep";
  anchor1Visible: boolean;
  anchor2Visible: boolean;
  sub1AnchorShown: boolean;
  anchor1Breathing: boolean;
  anchor2Breathing: boolean;
  sub1AnchorBreathing: boolean;
  rootTapHint: boolean;
}) {
  const W = 300;
  const mainX = W / 2;
  const mainY = 50;
  const sub1X = W * 0.3;
  const sub1Y = 140;
  const sub2X = W * 0.72;
  const sub2Y = 140;
  const deepX = W * 0.3;
  const deepY = 230;

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
          viewBox={`0 0 ${W} 300`}
          style={{ width: "100%", height: "100%", maxHeight: 300 }}
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
          {sub1AnchorShown && (
            <path
              d={`M ${sub1X} ${sub1Y} C ${sub1X} ${sub1Y + 40}, ${deepX} ${deepY - 40}, ${deepX} ${deepY}`}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
          )}

          <g>
            {rootTapHint && (
              <circle
                cx={mainX}
                cy={mainY}
                r={10}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
              >
                <animate
                  attributeName="r"
                  values="8;14;8"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.65;0.05;0.65"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </circle>
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
          </g>

          {anchor1Visible && (
            <g>
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
            </g>
          )}

          {anchor2Visible && (
            <g>
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

          {sub1AnchorShown && (
            <g style={{ animation: "pin-demo-fade-in 320ms ease-out both" }}>
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
            </g>
          )}

          {phase === "l1-stream" && (
            <text
              x={sub1X}
              y={sub1Y + 38}
              fontSize={9}
              fill="var(--accent)"
              style={{ fontFamily: "var(--font-mono)" }}
              textAnchor="middle"
            >
              {c.generatingLabel}
            </text>
          )}
          {phase === "l2-stream" && (
            <text
              x={deepX}
              y={deepY + 38}
              fontSize={9}
              fill="var(--accent)"
              style={{ fontFamily: "var(--font-mono)" }}
              textAnchor="middle"
            >
              {c.generatingLabel}
            </text>
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

// ── MergeOverlay ─────────────────────────────────────────────────────────
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
        className="self-center w-[80%] max-w-[720px] rounded-xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--rule)",
          boxShadow: "0 16px 48px rgba(27,26,23,0.22)",
          transform: modalOpen ? "translateY(0)" : "translateY(24px)",
          transition: "transform 300ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M4 4l8 9M20 4l-8 9m0 0v7" />
          </svg>
          <span
            className="font-serif text-[13px] font-medium"
            style={{ color: "var(--ink)" }}
          >
            {c.mergeOutputLabel}
          </span>
          <span className="flex-1" />
          {c.mergeFormats.map((f, i) => (
            <span
              key={f}
              className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-[2px] rounded-sm"
              style={{
                background: i === 0 ? "var(--accent-soft)" : "transparent",
                color: i === 0 ? "var(--accent)" : "var(--ink-4)",
                border: i === 0 ? "1px solid var(--accent)" : "1px solid var(--rule-soft)",
              }}
            >
              {f}
            </span>
          ))}
        </div>

        <div className="flex" style={{ height: 280 }}>
          <div
            className="flex-shrink-0 px-3 py-3 space-y-1.5 overflow-y-auto"
            style={{ width: 200, borderRight: "1px solid var(--rule-soft)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{ color: "var(--ink-4)" }}
              >
                {c.mergeSelectThreads}
              </span>
              <span
                className="font-mono text-[9px]"
                style={{ color: "var(--accent)" }}
              >
                {c.mergeAll}
              </span>
            </div>
            {[
              { label: c.mainCrumb, depth: 0, checked: false, color: "var(--ink-3)" },
              { label: c.subTitle1, depth: 1, checked: true, color: "var(--pig-1)" },
              { label: c.subTitle2, depth: 1, checked: true, color: "var(--pig-2)" },
              { label: c.deepTitle, depth: 2, checked: true, color: "var(--pig-3)" },
            ].map((th, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5"
                style={{ paddingLeft: th.depth * 10 }}
              >
                <div
                  className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    background: th.checked ? "var(--accent)" : "var(--paper-2)",
                    border: `1px solid ${th.checked ? "var(--accent)" : "var(--rule)"}`,
                  }}
                >
                  {th.checked && (
                    <svg
                      className="w-2 h-2"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="var(--paper)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    >
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </div>
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: th.color }}
                />
                <span
                  className="text-[11px] truncate"
                  style={{
                    color: th.checked ? "var(--ink-2)" : "var(--ink-4)",
                  }}
                >
                  {trunc(th.label, 18)}
                </span>
              </div>
            ))}
          </div>

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

// ── Mini markdown renderer ───────────────────────────────────────────────
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
