"use client";
// Landing-page desktop demo: 3-layer walkthrough — 2 pins at L0 → 1 pin
// inside sub-thread (L1) → deepest reply (L2) → click root to jump on the
// graph → merge output. Auto-plays; the bottom strip exposes prev/pause/next.
//
// Shared copy + phase list live in components/demoFlow/{types,content}.ts;
// playback control is in lib/useDemoController.ts; UI controls are in
// components/DemoTransport.tsx.

import { useEffect, useRef, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import DemoTransport from "@/components/DemoTransport";
import { useDemoController } from "@/lib/useDemoController";
import { DEMO_CONTENT, type DemoContent } from "@/components/demoFlow/content";
import { DEMO_PHASES, type DemoPhase } from "@/components/demoFlow/types";

// ── Delays ──────────────────────────────────────────────────────────────
// Phases with lots of reading get more time; pure transitions stay snappy.
// Units: ms.
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

// ── Phase order helpers — ordinal lookup so "has phase X already happened"
// becomes a simple comparison.
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
  // merge-hint keeps MainView as the backdrop so the left side doesn't go
  // blank while the top-right Merge button is pulsing. The modal fades in
  // on the next phase (merge-modal) and covers MainView then.
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

  // Transport visibility — active when the user is hovering the demo box.
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

  // Sweep percentage: each of the three sweep phases runs from 0 → 1, then stays at 1 until selpop.
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

  // ── Streaming typewriter ──────────────────────────────────────────
  // main-stream and merge-stream each fill ~80% of their phase duration
  // (works across languages — speed is derived from text length).
  // l1-stream / l2-stream don't stream: the user already waited on the
  // main thread, so the reply is "ready" the moment they enter.
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

  // Run one typewriter pass. fullMs is how long the stream should take; setter advances every tickMs.
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

  // Main AI reply: empty during `blank`, full-length in every other phase.
  // User feedback: a typewriter on the main reply made the first frame feel slow —
  // show the entire main response at once.
  // Main reply: empty on `blank`, full length everywhere else.
  // Per user feedback the typewriter on the first reply felt like waiting —
  // render the full paragraph immediately so the viewer can start reading.
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    setMainLen(phase === "blank" ? 0 : mainFullLen);
  }, [phase, mainFullLen]);

  // Sub-thread 1 — full length straight away, no typewriter.
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

  // Deepest reply — also not streamed; ready by the time the user enters L2.
  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (inDeepestView(phase) || inMergeView(phase)) {
      setSub2Len(c.sub2Reply.length);
    } else {
      setSub2Len(0);
    }
  }, [phase, c.sub2Reply]);

  // Merge report streaming.
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

  // ── Derived state ──────────────────────────────────────────────────
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

  // Selection highlight stays accent-tinted across sweep + selpop + dialog + pick.
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

  // Anchor visibility / breathing (decided by phase order; once an anchor lands, it stays).
  // Anchor visibility / breathing by phase ordinal — once planted, stays.
  const anchor1Visible = atOrAfter(phase, "p1-underline");
  const anchor2Visible = atOrAfter(phase, "p2-underline");
  const sub1AnchorVisible = atOrAfter(phase, "p3-underline");
  // Stop breathing before the hover phase: the popover is a child of the
  // anchor span and would inherit .anchor-breathing's opacity dip (down to
  // 0.78 at 50%), making chat text behind it flicker. Disabling breathing on
  // hover lets the popover sit stably and fully opaque on top.
  // Stop breathing at hover: the popover is nested inside the anchor span
  // and inherits .anchor-breathing's 0.78 opacity dip, which makes the
  // conversation behind the popover blink through. Disabling breathing on
  // hover lets the popover sit opaque and fully cover what's underneath.
  const anchor1Breathing = anchor1Visible && PHASE_IDX[phase] < PHASE_IDX["l1-hover"];
  const anchor2Breathing = anchor2Visible; // never entered — keep it unread
  const sub1AnchorBreathing =
    sub1AnchorVisible && PHASE_IDX[phase] < PHASE_IDX["l2-hover"];

  // *-underline phase: add a "just pinned" pulse to the matching graph node.
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
  // hereNode — "you are here" indicator on the current depth: l1-stream → sub1,
  // l2-stream → deep, graph-navigated → root. These frames draw a pulsing ring
  // around the node plus a "◉ you are here" label above it, so the user can
  // confirm their current depth on the graph.
  // hereNode anchors the "you are here" cue to the node that matches where
  // the user currently sits: sub1 during l1-stream, deep during l2-stream,
  // main after graph-navigated. Rendered as a gentle ring + label so the
  // viewer can confirm their depth against the tree without reading text.
  const hereNode: "main" | "sub1" | "deep" | null =
    phase === "graph-navigated" ? "main" :
    phase === "l1-stream" ? "sub1" :
    phase === "l2-stream" ? "deep" : null;

  // Fixed box dimensions (original sizing preserved).
  const GRID_H = 420;
  const RIGHT_W = 320;
  const TOTAL_H = 38 + GRID_H + 40;

  return (
    <div
      className="w-full select-none mx-auto"
      style={{
        maxWidth: 1080,
        // Pin text at the designed size — this demo behaves like a
        // video/screenshot, not readable prose. Needed so Android-tablet
        // Chrome Text Scaling / other accessibility font inflation can't
        // overflow the fixed-height body + overflow-hidden and crop rows.
        textSizeAdjust: "100%",
        WebkitTextSizeAdjust: "100%",
      }}
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
          {/* Title bar + Merge button. */}
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
            {/* Merge hint: thicker halo + slower, bigger pulse than tap-press.
                demo-merge-hint is already an outward halo + gentle scale and
                does not obscure the label, so we intentionally skip the nested
                tap-print / tap-ring here — those are 40px filled discs that
                would cover the button center and make the "Merge" label read
                as blank. */}
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

          {/* Two-column layout. */}
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

// ── MainView — L0 main thread (with two anchors) ──────────────────────
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
  // We render the full length during l2-stream (no typewriter), so streaming = false here.
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
// `selecting` covers all four stages — sweep + selpop + dialog + pick — so the
// highlight stays on screen all the way until the underline lands. sweepPct
// only animates while sweeping; otherwise it stays at 1.
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

// ── PinDialog — includes the custom-question input, mimicking the real PinStartDialog ──
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

// ── AnchorPopover — mimics AnchorPreviewPopover: shows Question + Answer ──
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
  // Render above the anchor (bottom: calc(100% + 6px)) so MainView's
  // overflow-hidden doesn't clip the bottom. Compressed to ~130px tall so it always fits.
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
      {/* YOU question + AI answer — compact, side-by-side. */}
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
// Four nodes: main → sub1 / sub2; sub1 → deep. nodePulse marks which node
// just received a pin and draws an extra accent pulse ring. rootTapHint adds a
// prominent pulse on root plus a "tap" tooltip below it during graph-nav-root.
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

// ── MergeOverlay — uses the real graph for thread selection instead of a flat list ──
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
        {/* Top bar: dot + title + count + close — mirrors the real MergeOutput.
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

        {/* Format-picker row — same card style as the real UI (label + one-line description). */}
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
          {/* Left: graph tree selection (all selected, pigment fills). */}
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

          {/* Right: output. */}
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

// ── MergeGraphPreview — thumbnail graph on the left of the merge modal; all four nodes shown selected ──
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
