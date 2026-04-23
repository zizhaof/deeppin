"use client";
// components/MobilePinDemo.tsx
// 欢迎页 mobile 演示：跟 desktop PinDemo 跑同一条 phase 列表，只是 UI
// 收成单栏 + Select FAB + 右抽屉 graph。手机端新增的「先点 Select」提示
// 融进每次 sweep phase 的前半段，不单独建 phase —— 跟 desktop 的 phase id
// 保持一一对应，方便一起维护。
//
// Mobile landing demo. Shares the phase list with desktop PinDemo; the
// mobile-specific "tap Select first" hint is folded into the first half of
// each sweep phase rather than a dedicated phase, so the two demos stay
// id-aligned and easy to maintain in lockstep.

import { useEffect, useRef, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import DemoTransport from "@/components/DemoTransport";
import { useDemoController } from "@/lib/useDemoController";
import { DEMO_CONTENT, type DemoContent } from "@/components/demoFlow/content";
import { DEMO_PHASES, type DemoPhase } from "@/components/demoFlow/types";

// ── Delays —— mobile sweep 稍长（要放完 Select FAB 点击再开始扫）
// Mobile delays — sweep phases are longer to cover the Select-FAB tap hint.
const DELAYS: Record<DemoPhase, number> = {
  blank: 1500,
  "main-stream": 5500,
  "p1-sweep": 2900,
  "p1-selpop": 3400,
  "p1-dialog": 4500,
  "p1-pick": 1400,
  "p1-underline": 3400,
  "p2-sweep": 2900,
  "p2-selpop": 3400,
  "p2-dialog": 4500,
  "p2-pick": 1400,
  "p2-underline": 4200,
  "l1-hover": 3400,
  "l1-enter": 1500,
  "l1-stream": 4000,
  "p3-sweep": 2900,
  "p3-selpop": 3400,
  "p3-dialog": 4500,
  "p3-pick": 1400,
  "p3-underline": 4000,
  "l2-hover": 3200,
  "l2-enter": 1500,
  "l2-stream": 4200,
  "graph-hint": 3000,
  "graph-nav-root": 4000,
  "graph-navigated": 3800,
  "merge-hint": 3500,
  "merge-modal": 3200,
  "merge-stream": 4800,
  "merge-done": 5500,
};

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
  p === "graph-navigated";
const inSub1View = (p: DemoPhase) =>
  p === "l1-stream" ||
  p.startsWith("p3-") ||
  p === "l2-hover" ||
  p === "l2-enter";
const inDeepestView = (p: DemoPhase) =>
  p === "l2-stream" || p === "graph-hint" || p === "graph-nav-root";
const inMergeView = (p: DemoPhase) => p.startsWith("merge-");

export default function MobilePinDemo() {
  const lang = useLangStore((s) => s.lang);
  const c: DemoContent = DEMO_CONTENT[lang] ?? DEMO_CONTENT.en;

  const control = useDemoController<DemoPhase>(DEMO_PHASES, DELAYS);
  const { phase } = control;

  useEffect(() => {
    control.goTo(0);
    control.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const [touchActive, setTouchActive] = useState(false);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTouch = () => {
    setTouchActive(true);
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => setTouchActive(false), 2500);
  };
  useEffect(
    () => () => {
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    },
    [],
  );

  // Sweep：每次 sweep phase 延后 900ms 开始（给 Select FAB 点击让路），
  // 然后 1200ms 扫完。非 sweep 阶段定格在 1 以保持高亮。
  // Each sweep waits 900ms for the Select-FAB tap hint, then runs 1200ms.
  // Outside of sweep, stays pinned at 1 so the selection stays lit.
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
    const SWEEP_DELAY = 900;
    const SWEEP_DUR = 1200;
    const step = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      if (elapsed < SWEEP_DELAY) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      const pct = Math.min(1, (elapsed - SWEEP_DELAY) / SWEEP_DUR);
      setSweepPct(pct);
      if (pct < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // Tap ring —— 每个有交互的 phase 在末尾挂一次 press + print + ring
  const [tapRing, setTapRing] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    setTapRing(false);
    const schedule: Partial<Record<DemoPhase, number>> = {
      "p1-sweep": 0,
      "p2-sweep": 0,
      "p3-sweep": 0,
      "p1-selpop": DELAYS["p1-selpop"] - 1100,
      "p2-selpop": DELAYS["p2-selpop"] - 1100,
      "p3-selpop": DELAYS["p3-selpop"] - 1100,
      "p1-pick": DELAYS["p1-pick"] - 800,
      "p2-pick": DELAYS["p2-pick"] - 800,
      "p3-pick": DELAYS["p3-pick"] - 800,
      "l1-enter": DELAYS["l1-enter"] - 900,
      "l2-enter": DELAYS["l2-enter"] - 900,
      "graph-hint": DELAYS["graph-hint"] - 1400,
      "graph-nav-root": DELAYS["graph-nav-root"] - 1300,
      "merge-hint": DELAYS["merge-hint"] - 1300,
    };
    const off = schedule[phase];
    if (off == null) return;
    tapTimerRef.current = setTimeout(() => setTapRing(true), Math.max(0, off));
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, [phase]);

  // ── 流式 —— 同 desktop 策略：main + merge 流式，l1 / l2 不流式
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
    return runStream(mainFullLen, DELAYS["main-stream"] * 0.8, setMainLen);
  }, [phase, mainFullLen]);

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

  useEffect(() => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    if (inDeepestView(phase) || inMergeView(phase)) {
      setSub2Len(c.sub2Reply.length);
    } else {
      setSub2Len(0);
    }
  }, [phase, c.sub2Reply]);

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

  // 选择高亮持续 sweep + selpop + dialog + pick
  const anchor1Selecting =
    phase === "p1-sweep" || phase === "p1-selpop" ||
    phase === "p1-dialog" || phase === "p1-pick";
  const anchor2Selecting =
    phase === "p2-sweep" || phase === "p2-selpop" ||
    phase === "p2-dialog" || phase === "p2-pick";
  const sub1AnchorSelecting =
    phase === "p3-sweep" || phase === "p3-selpop" ||
    phase === "p3-dialog" || phase === "p3-pick";

  const anchor1Visible = atOrAfter(phase, "p1-underline");
  const anchor2Visible = atOrAfter(phase, "p2-underline");
  const sub1AnchorVisible = atOrAfter(phase, "p3-underline");
  const anchor1Breathing = anchor1Visible && PHASE_IDX[phase] < PHASE_IDX["l1-enter"];
  const anchor2Breathing = anchor2Visible;
  const sub1AnchorBreathing =
    sub1AnchorVisible && PHASE_IDX[phase] < PHASE_IDX["l2-enter"];

  const nodePulse: "sub1" | "sub2" | "deep" | null =
    phase === "p1-underline" ? "sub1" :
    phase === "p2-underline" ? "sub2" :
    phase === "p3-underline" ? "deep" : null;

  const tapHintAnchor1 = phase === "l1-hover" || phase === "l1-enter";
  const tapHintSub1Anchor = phase === "l2-hover" || phase === "l2-enter";

  const activeNode: "main" | "sub1" | "sub2" | "deep" = viewMain
    ? "main"
    : viewDeep
      ? "deep"
      : viewSub1
        ? "sub1"
        : viewMerge
          ? "deep"
          : "main";

  const overviewBtnBreathing = phase === "graph-hint";
  const drawerOpen =
    phase === "graph-hint" ||
    phase === "graph-nav-root" ||
    phase === "graph-navigated";

  const mergeBtnPulse = phase === "merge-hint";
  const mergeModalOpen =
    phase === "merge-modal" || phase === "merge-stream" || phase === "merge-done";
  const mergeContentShown = phase === "merge-stream" || phase === "merge-done";
  const mergeDone = phase === "merge-done";

  const selectArmed = [
    "p1-sweep", "p1-selpop", "p1-dialog", "p1-pick",
    "p2-sweep", "p2-selpop", "p2-dialog", "p2-pick",
    "p3-sweep", "p3-selpop", "p3-dialog", "p3-pick",
  ].includes(phase);
  const tapOnSelect =
    (phase === "p1-sweep" || phase === "p2-sweep" || phase === "p3-sweep") &&
    tapRing;
  const tapOnOverview = phase === "graph-hint" && tapRing;
  const tapOnMerge = phase === "merge-hint" && tapRing;
  const showSelectFab = !viewDeep && !viewMerge && !drawerOpen;

  const TOPBAR_H = 40;
  const BODY_H = 340;
  const CAP_H = 40;
  const TOTAL_H = 38 + TOPBAR_H + BODY_H + CAP_H;

  return (
    <div
      className="w-full select-none"
      style={{ maxWidth: 380 }}
      onTouchStart={nudgeTouch}
      onPointerDown={nudgeTouch}
    >
      <div
        className="relative rounded-2xl overflow-hidden mx-auto"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          height: TOTAL_H,
          boxShadow: "0 12px 32px rgba(27,26,23,0.10)",
        }}
      >
        <div
          className="h-[38px] px-3 flex items-center gap-2"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="flex gap-1.5">
            {["#ff5f57", "#ffbd2e", "#28c840"].map((col) => (
              <span
                key={col}
                className="w-2 h-2 rounded-full"
                style={{ background: col, opacity: 0.85 }}
              />
            ))}
          </div>
          <span
            className="font-mono text-[10px] ml-1"
            style={{ color: "var(--ink-4)" }}
          >
            deeppin
          </span>
          <span className="flex-1" />
          <span
            className="font-mono text-[9px] uppercase tracking-[0.15em]"
            style={{ color: "var(--ink-4)" }}
          >
            demo
          </span>
        </div>

        {/* topbar with Merge + overview buttons */}
        <div
          className="flex items-center px-2 gap-1"
          style={{
            height: TOPBAR_H,
            borderBottom: "1px solid var(--rule)",
            background: "var(--paper)",
          }}
        >
          <span
            className="w-7 h-7 flex items-center justify-center rounded-md"
            style={{ color: "var(--ink-4)" }}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </span>
          <div className="flex-1 flex items-center justify-center gap-1.5">
            <span
              className="w-4 h-4 rounded-[3px] flex items-center justify-center"
              style={{
                background: "var(--card)",
                border: "1px solid var(--rule)",
              }}
            >
              <svg
                className="w-2 h-2"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ color: "var(--accent)" }}
              >
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
              </svg>
            </span>
            <span
              className="font-serif text-[12px]"
              style={{ color: "var(--ink)" }}
            >
              Deeppin
            </span>
            {/* Merge button —— demo-merge-hint 脉冲放大 */}
            <span
              className={`relative ml-2 inline-flex items-center gap-1 h-5 px-2 rounded text-[10px] font-medium ${
                mergeBtnPulse ? "demo-merge-hint" : ""
              } ${tapOnMerge ? "demo-tap-press" : ""}`}
              style={{
                background: mergeBtnPulse ? "var(--accent)" : "var(--ink)",
                color: "var(--paper)",
              }}
              aria-hidden
            >
              <svg
                className="w-2.5 h-2.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M4 4l8 9M20 4l-8 9m0 0v7" />
              </svg>
              {c.mergeLabel}
              {tapOnMerge && (
                <>
                  <span className="demo-tap-print demo-tap-print-sm" aria-hidden />
                  <span className="demo-tap-ring demo-tap-ring-sm" aria-hidden />
                </>
              )}
            </span>
          </div>
          <span
            className={`relative w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              overviewBtnBreathing ? "demo-tap-here" : ""
            } ${tapOnOverview ? "demo-tap-press" : ""}`}
            style={{
              color: overviewBtnBreathing ? "var(--accent)" : "var(--ink-4)",
              background:
                overviewBtnBreathing || drawerOpen
                  ? "var(--accent-soft)"
                  : "transparent",
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="5" r="2" />
              <circle cx="5" cy="19" r="2" />
              <circle cx="19" cy="19" r="2" />
              <path d="M12 7v4M12 11l-5 6M12 11l5 6" />
            </svg>
            {(anchor1Visible || anchor2Visible) && !drawerOpen && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
                aria-hidden
              />
            )}
            {tapOnOverview && (
              <>
                <span className="demo-tap-print demo-tap-print-sm" aria-hidden />
                <span className="demo-tap-ring demo-tap-ring-sm" aria-hidden />
              </>
            )}
          </span>
        </div>

        <div
          className="relative"
          style={{ height: BODY_H, background: "var(--paper)" }}
        >
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              viewMain ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <MobileMainView
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
              selpopTap={tapRing && (phase === "p1-selpop" || phase === "p2-selpop")}
              tapHintAnchor1={tapHintAnchor1}
              enterTap={phase === "l1-enter" && tapRing}
            />
          </div>
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              viewSub1 ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <MobileSub1View
              c={c}
              phase={phase}
              sweepPct={sweepPct}
              sub1Len={sub1Len}
              sub1AnchorVisible={sub1AnchorVisible}
              sub1AnchorBreathing={sub1AnchorBreathing}
              sub1AnchorSelecting={sub1AnchorSelecting}
              selpopOn={selpopOn}
              selpopTap={tapRing && phase === "p3-selpop"}
              tapHintSub1Anchor={tapHintSub1Anchor}
              enterTap={phase === "l2-enter" && tapRing}
            />
          </div>
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              viewDeep ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <MobileDeepestView c={c} phase={phase} sub2Len={sub2Len} />
          </div>

          {dialogOn !== 0 && (
            <MobileDialog
              c={c}
              dialogOn={dialogOn as 1 | 2 | 3}
              picked={dialogPicked}
              tapRing={tapRing && dialogPicked}
            />
          )}

          {showSelectFab && (
            <div
              className={`absolute bottom-3 right-3 z-25 inline-flex items-center gap-1 h-7 px-2.5 rounded-full font-mono text-[10px] uppercase tracking-wider transition-colors ${
                tapOnSelect ? "demo-tap-press" : ""
              }`}
              style={{
                background: selectArmed ? "var(--accent)" : "var(--ink)",
                color: "var(--paper)",
                boxShadow: "0 6px 18px rgba(27,26,23,0.22)",
              }}
              aria-hidden
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 5h4M7 19h4M9 5v14" />
                <path d="M14 8h6M14 16h6" strokeWidth={2.5} />
              </svg>
              <span>{c.selectLabel}</span>
              {tapOnSelect && (
                <>
                  <span className="demo-tap-print demo-tap-print-sm" aria-hidden />
                  <span className="demo-tap-ring demo-tap-ring-sm" aria-hidden />
                </>
              )}
            </div>
          )}

          {/* Right drawer Graph */}
          <div
            className="absolute top-0 right-0 bottom-0 transition-transform duration-300 ease-out flex flex-col"
            style={{
              width: "82%",
              background: "var(--card)",
              borderLeft: "1px solid var(--rule)",
              transform: drawerOpen ? "translateX(0)" : "translateX(105%)",
              boxShadow: drawerOpen ? "-12px 0 32px rgba(27,26,23,0.18)" : "none",
            }}
          >
            <div
              className="flex items-center justify-between px-3 h-9 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--rule)" }}
            >
              <span
                className="font-mono text-[9px] uppercase tracking-[0.2em]"
                style={{ color: "var(--ink-3)" }}
              >
                {c.overviewLabel}
              </span>
              <span
                className="w-5 h-5 flex items-center justify-center text-[10px]"
                style={{ color: "var(--ink-4)" }}
              >
                ×
              </span>
            </div>
            <div
              className="flex flex-shrink-0"
              style={{ borderBottom: "1px solid var(--rule-soft)" }}
            >
              <span
                className="flex-1 text-center py-1.5 font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{
                  color: "var(--ink-4)",
                  borderBottom: "2px solid transparent",
                }}
              >
                {c.listTabLabel}
              </span>
              <span
                className="flex-1 text-center py-1.5 font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{
                  color: "var(--ink)",
                  borderBottom: "2px solid var(--ink)",
                }}
              >
                {c.graphTabLabel}
              </span>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center p-2">
              <MiniGraph
                c={c}
                anchor1Visible={anchor1Visible}
                anchor2Visible={anchor2Visible}
                sub1AnchorVisible={sub1AnchorVisible}
                activeNode={activeNode}
                anchor1Breathing={anchor1Breathing}
                anchor2Breathing={anchor2Breathing}
                sub1AnchorBreathing={sub1AnchorBreathing}
                nodePulse={nodePulse}
                rootTapHint={phase === "graph-nav-root"}
                rootTap={phase === "graph-nav-root" && tapRing}
                atRootLabel={phase === "graph-navigated"}
              />
            </div>
            <div
              className="px-2 py-2 flex items-center gap-1.5 flex-shrink-0"
              style={{ borderTop: "1px solid var(--rule)" }}
            >
              <span
                className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-md text-[10px] font-medium"
                style={{ background: "var(--ink)", color: "var(--paper)" }}
              >
                <svg
                  className="w-2.5 h-2.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path d="M4 4l8 9M20 4l-8 9m0 0v7" />
                </svg>
                {c.mergeLabel}
              </span>
            </div>
          </div>

          {viewMerge && (
            <MobileMergeOverlay
              c={c}
              modalOpen={mergeModalOpen}
              contentShown={mergeContentShown}
              done={mergeDone}
              mergeLen={mergeLen}
            />
          )}
        </div>

        <div
          className="h-[40px] px-3 flex items-center font-mono text-[10.5px] leading-snug gap-2"
          style={{
            borderTop: "1px solid var(--rule)",
            background: "var(--paper-2)",
            color: "var(--ink-3)",
          }}
        >
          <span className="flex-1 truncate">{c.caption[phase]}</span>
          <DemoTransport control={control} active={touchActive} compact />
        </div>
      </div>

      <style jsx global>{`
        .demo-tap-here { animation: demo-tap-here 1.2s ease-in-out infinite; }
        @keyframes demo-tap-here {
          0%, 100% { box-shadow: 0 0 0 0 rgba(42, 42, 114, 0.50); }
          50%      { box-shadow: 0 0 0 8px rgba(42, 42, 114, 0); }
        }
        .demo-merge-hint {
          animation: demo-merge-hint 1.4s ease-in-out infinite;
        }
        @keyframes demo-merge-hint {
          0%, 100% { box-shadow: 0 0 0 0 rgba(42,42,114,0.50); transform: scale(1); }
          50%      { box-shadow: 0 0 0 10px rgba(42,42,114,0); transform: scale(1.05); }
        }
        .demo-tap-print-sm {
          width: 28px; height: 28px;
          margin-left: -14px; margin-top: -14px;
        }
        .demo-tap-ring-sm {
          width: 28px; height: 28px;
          margin-left: -14px; margin-top: -14px;
        }
      `}</style>
    </div>
  );
}

// ── MobileMainView ───────────────────────────────────────────────────────
function MobileMainView({
  c, phase, sweepPct, mainLen,
  anchor1Visible, anchor2Visible,
  anchor1Breathing, anchor2Breathing,
  anchor1Selecting, anchor2Selecting,
  selpopOn, selpopTap,
  tapHintAnchor1, enterTap,
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
  selpopTap: boolean;
  tapHintAnchor1: boolean;
  enterTap: boolean;
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
    <div className="h-full p-3 overflow-hidden">
      <div className="flex items-center mb-2.5">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[2px] rounded font-mono text-[10px]"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <span
            className="w-[4px] h-[4px] rounded-full"
            style={{ background: "var(--paper)" }}
          />
          {c.mainCrumb}
        </span>
      </div>

      {phase !== "blank" && (
        <>
          <div className="flex flex-col items-end mb-2">
            <div
              className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]"
              style={{ color: "var(--ink-4)" }}
            >
              <span
                className="w-[4px] h-[4px] rounded-full"
                style={{ background: "var(--ink-3)" }}
              />
              {c.youLabel}
            </div>
            <div
              className="max-w-[88%] px-3 py-2 text-[12px] leading-[1.5]"
              style={{
                background: "var(--accent)",
                color: "var(--paper)",
                borderRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              {c.mainQuestion}
            </div>
          </div>

          <div className="flex flex-col items-start">
            <div
              className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]"
              style={{ color: "var(--ink-4)" }}
            >
              <span
                className="w-[4px] h-[4px] rounded-full"
                style={{ background: "var(--accent)" }}
              />
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontSize: 10,
                  color: "var(--ink-3)",
                }}
              >
                {c.aiLabel}
              </span>
            </div>
            <div
              className="relative max-w-[92%] px-3 py-2 text-[12px] leading-[1.55]"
              style={{
                background: "var(--card)",
                border: "1px solid var(--rule-soft)",
                color: "var(--ink)",
                borderRadius: 12,
                borderBottomLeftRadius: 3,
              }}
            >
              {s0}
              {s1 && (
                <MobileAnchor
                  text={s1}
                  pigment="var(--pig-1)"
                  selecting={anchor1Selecting}
                  sweeping={phase === "p1-sweep"}
                  sweepPct={sweepPct}
                  visible={anchor1Visible}
                  breathing={anchor1Breathing}
                  tapHint={tapHintAnchor1}
                  tapFiring={enterTap}
                >
                  {selpopOn === 1 && (
                    <MobileSelPop
                      label={c.followupLabel}
                      copy={c.copyLabel}
                      pulse={selpopTap}
                    />
                  )}
                </MobileAnchor>
              )}
              {s2}
              {s3 && (
                <MobileAnchor
                  text={s3}
                  pigment="var(--pig-2)"
                  selecting={anchor2Selecting}
                  sweeping={phase === "p2-sweep"}
                  sweepPct={sweepPct}
                  visible={anchor2Visible}
                  breathing={anchor2Breathing}
                  tapHint={false}
                  tapFiring={false}
                >
                  {selpopOn === 2 && (
                    <MobileSelPop
                      label={c.followupLabel}
                      copy={c.copyLabel}
                      pulse={selpopTap}
                    />
                  )}
                </MobileAnchor>
              )}
              {s4}
              {streaming && (
                <span
                  className="inline-block w-[2px] h-3 align-middle ml-[1px]"
                  style={{
                    background: "var(--accent)",
                    animation: "mp-caret 1s steps(2) infinite",
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}
      <style jsx>{`
        @keyframes mp-caret {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── MobileSub1View ───────────────────────────────────────────────────────
function MobileSub1View({
  c, phase, sweepPct, sub1Len,
  sub1AnchorVisible, sub1AnchorBreathing, sub1AnchorSelecting,
  selpopOn, selpopTap, tapHintSub1Anchor, enterTap,
}: {
  c: DemoContent;
  phase: DemoPhase;
  sweepPct: number;
  sub1Len: number;
  sub1AnchorVisible: boolean;
  sub1AnchorBreathing: boolean;
  sub1AnchorSelecting: boolean;
  selpopOn: 0 | 1 | 2 | 3;
  selpopTap: boolean;
  tapHintSub1Anchor: boolean;
  enterTap: boolean;
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
    <div className="h-full p-3 overflow-hidden">
      <div
        className="flex items-center gap-1 mb-2.5 font-mono text-[10px]"
        style={{ color: "var(--ink-3)" }}
      >
        <span
          className="px-2 py-[2px] rounded"
          style={{ color: "var(--ink-3)" }}
        >
          <span
            className="inline-block w-[4px] h-[4px] rounded-full mr-1.5 align-middle"
            style={{ background: "var(--ink-5)" }}
          />
          {c.mainCrumb}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[2px] rounded"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <span
            className="w-[4px] h-[4px] rounded-full"
            style={{ background: "var(--pig-1)" }}
          />
          {c.subTitle1.length > 12 ? c.subTitle1.slice(0, 12) + "…" : c.subTitle1}
        </span>
      </div>

      <div className="flex flex-col items-end mb-2">
        <div
          className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-4)" }}
        >
          <span
            className="w-[4px] h-[4px] rounded-full"
            style={{ background: "var(--ink-3)" }}
          />
          {c.youLabel}
        </div>
        <div
          className="max-w-[80%] px-3 py-2 text-[11.5px] leading-[1.5]"
          style={{
            background: "var(--accent)",
            color: "var(--paper)",
            borderRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          {c.suggestions1[0]}
        </div>
      </div>

      <div className="flex flex-col items-start">
        <div
          className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-4)" }}
        >
          <span
            className="w-[4px] h-[4px] rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span
            style={{
              fontFamily: "var(--font-serif)",
              textTransform: "none",
              letterSpacing: 0,
              fontSize: 10,
              color: "var(--ink-3)",
            }}
          >
            {c.aiLabel}
          </span>
        </div>
        <div
          className="max-w-[92%] px-3 py-2 text-[11.5px] leading-[1.55]"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            color: "var(--ink)",
            borderRadius: 12,
            borderBottomLeftRadius: 3,
          }}
        >
          {b}
          {a && (
            <MobileAnchor
              text={a}
              pigment="var(--pig-3)"
              selecting={sub1AnchorSelecting}
              sweeping={phase === "p3-sweep"}
              sweepPct={sweepPct}
              visible={sub1AnchorVisible}
              breathing={sub1AnchorBreathing}
              tapHint={tapHintSub1Anchor}
              tapFiring={enterTap}
            >
              {selpopOn === 3 && (
                <MobileSelPop
                  label={c.followupLabel}
                  copy={c.copyLabel}
                  pulse={selpopTap}
                />
              )}
            </MobileAnchor>
          )}
          {rest}
        </div>
      </div>
    </div>
  );
}

// ── MobileDeepestView ───────────────────────────────────────────────────
function MobileDeepestView({
  c, phase, sub2Len,
}: {
  c: DemoContent;
  phase: DemoPhase;
  sub2Len: number;
}) {
  void phase;
  return (
    <div className="h-full p-3 overflow-hidden">
      <div
        className="flex items-center gap-1 mb-2.5 font-mono text-[9.5px] flex-wrap"
        style={{ color: "var(--ink-3)" }}
      >
        <span
          className="px-1.5 py-[2px] rounded"
          style={{ color: "var(--ink-3)" }}
        >
          <span
            className="inline-block w-[4px] h-[4px] rounded-full mr-1 align-middle"
            style={{ background: "var(--ink-5)" }}
          />
          {c.mainCrumb}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="px-1.5 py-[2px] rounded"
          style={{ color: "var(--ink-3)" }}
        >
          <span
            className="inline-block w-[4px] h-[4px] rounded-full mr-1 align-middle"
            style={{ background: "var(--pig-1)" }}
          />
          {c.subTitle1.length > 10 ? c.subTitle1.slice(0, 10) + "…" : c.subTitle1}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <span
            className="w-[4px] h-[4px] rounded-full"
            style={{ background: "var(--pig-3)" }}
          />
          {c.deepTitle.length > 12 ? c.deepTitle.slice(0, 12) + "…" : c.deepTitle}
        </span>
      </div>

      <div className="flex flex-col items-end mb-2">
        <div
          className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-4)" }}
        >
          <span
            className="w-[4px] h-[4px] rounded-full"
            style={{ background: "var(--ink-3)" }}
          />
          {c.youLabel}
        </div>
        <div
          className="max-w-[80%] px-3 py-2 text-[11.5px] leading-[1.5]"
          style={{
            background: "var(--accent)",
            color: "var(--paper)",
            borderRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          {c.suggestions3[0]}
        </div>
      </div>

      <div className="flex flex-col items-start">
        <div
          className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]"
          style={{ color: "var(--ink-4)" }}
        >
          <span
            className="w-[4px] h-[4px] rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span
            style={{
              fontFamily: "var(--font-serif)",
              textTransform: "none",
              letterSpacing: 0,
              fontSize: 10,
              color: "var(--ink-3)",
            }}
          >
            {c.aiLabel}
          </span>
        </div>
        <div
          className="max-w-[94%] px-3 py-2 text-[11.5px] leading-[1.55]"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            color: "var(--ink)",
            borderRadius: 12,
            borderBottomLeftRadius: 3,
          }}
        >
          {c.sub2Reply.slice(0, sub2Len || c.sub2Reply.length)}
        </div>
      </div>
    </div>
  );
}

// ── MobileAnchor / SelPop / Dialog ──────────────────────────────────────
function MobileAnchor({
  text, pigment, selecting, sweeping, sweepPct,
  visible, breathing, tapHint, tapFiring, children,
}: {
  text: string;
  pigment: string;
  selecting: boolean;
  sweeping: boolean;
  sweepPct: number;
  visible: boolean;
  breathing: boolean;
  tapHint: boolean;
  tapFiring: boolean;
  children?: React.ReactNode;
}) {
  const pct = sweeping ? sweepPct : selecting ? 1 : 0;
  const bg = selecting
    ? `color-mix(in oklch, var(--accent) ${Math.round(pct * 36)}%, transparent)`
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
      className={`relative inline-block ${breathing ? "anchor-breathing" : ""} ${
        tapHint ? "demo-tap-here" : ""
      }`}
      style={innerStyle}
    >
      {text}
      {children}
      {tapFiring && (
        <>
          <span className="demo-tap-print demo-tap-print-sm" aria-hidden />
          <span className="demo-tap-ring demo-tap-ring-sm" aria-hidden />
        </>
      )}
    </span>
  );
}

function MobileSelPop({
  label, copy, pulse,
}: {
  label: string;
  copy: string;
  pulse: boolean;
}) {
  return (
    <span
      className="absolute left-0 -top-9 z-20 inline-flex items-center gap-[2px] rounded-md shadow-[0_4px_14px_rgba(27,26,23,0.18)]"
      style={{
        background: "var(--ink)",
        color: "var(--paper)",
        padding: 2,
      }}
    >
      <span className="px-2 py-1 text-[10px]">{copy}</span>
      <span
        className={`relative px-2 py-1 rounded text-[10px] font-medium ${
          pulse ? "demo-tap-press" : ""
        }`}
        style={{ background: "var(--accent)" }}
      >
        {label}
        {pulse && (
          <>
            <span className="demo-tap-print demo-tap-print-sm" aria-hidden />
            <span className="demo-tap-ring demo-tap-ring-sm" aria-hidden />
          </>
        )}
      </span>
      <span
        aria-hidden
        className="absolute left-3 -bottom-1 w-1.5 h-1.5 rotate-45"
        style={{ background: "var(--ink)" }}
      />
    </span>
  );
}

// Mobile pin dialog —— 3 条 suggestion + 输入框
function MobileDialog({
  c, dialogOn, picked, tapRing,
}: {
  c: DemoContent;
  dialogOn: 1 | 2 | 3;
  picked: boolean;
  tapRing: boolean;
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
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center animate-in fade-in-0 duration-150">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(27,26,23,0.35)" }}
      />
      <div
        className="relative w-[92%] max-w-[340px] rounded-xl shadow-[0_12px_36px_rgba(27,26,23,0.18)]"
        style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
      >
        <div
          className="px-3 pt-3 pb-2 flex items-start gap-2"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          <span
            className="w-[3px] h-5 rounded-[1px] flex-shrink-0"
            style={{ background: pigColor }}
          />
          <div className="flex-1">
            <div
              className="font-mono text-[8.5px] uppercase tracking-[0.15em] mb-0.5"
              style={{ color: "var(--accent)" }}
            >
              {c.pinLabel}
            </div>
            <div
              className="font-serif text-[11.5px] italic leading-tight"
              style={{ color: "var(--ink-2)" }}
            >
              “{anchorText}”
            </div>
          </div>
        </div>
        <div className="px-3 pt-2 flex flex-col gap-1.5">
          {suggestions.map((q, i) => (
            <div
              key={q}
              className={`relative text-left px-2.5 py-1.5 rounded text-[11px] ${
                picked && i === 0 && tapRing ? "demo-tap-press" : ""
              }`}
              style={{
                background: picked && i === 0 ? "var(--accent-soft)" : "var(--paper-2)",
                border: `1px solid ${picked && i === 0 ? "var(--accent)" : "var(--rule-soft)"}`,
                color: picked && i === 0 ? "var(--accent)" : "var(--ink-2)",
              }}
            >
              {q}
              {picked && i === 0 && tapRing && (
                <>
                  <span className="demo-tap-print" aria-hidden />
                  <span className="demo-tap-ring" aria-hidden />
                </>
              )}
            </div>
          ))}
        </div>
        {/* divider + input */}
        <div className="mx-3 my-2" style={{ borderTop: "1px solid var(--rule-soft)" }} />
        <div className="px-3 pb-3 flex items-end gap-1.5">
          <div
            className="flex-1 rounded-md px-2 py-1.5 text-[10.5px] leading-snug"
            style={{
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              color: "var(--ink-4)",
              minHeight: 32,
            }}
          >
            {c.customQuestionPlaceholder}
          </div>
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0"
            style={{ background: "var(--rule)", color: "var(--ink-4)" }}
          >
            <svg
              className="w-3 h-3"
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

// ── MiniGraph（drawer 内）—— 支持 nodePulse + rootTapHint + atRootLabel
function MiniGraph({
  c, anchor1Visible, anchor2Visible, sub1AnchorVisible,
  activeNode,
  anchor1Breathing, anchor2Breathing, sub1AnchorBreathing,
  nodePulse, rootTapHint, rootTap, atRootLabel,
}: {
  c: DemoContent;
  anchor1Visible: boolean;
  anchor2Visible: boolean;
  sub1AnchorVisible: boolean;
  activeNode: "main" | "sub1" | "sub2" | "deep";
  anchor1Breathing: boolean;
  anchor2Breathing: boolean;
  sub1AnchorBreathing: boolean;
  nodePulse: "sub1" | "sub2" | "deep" | null;
  rootTapHint: boolean;
  rootTap: boolean;
  atRootLabel: boolean;
}) {
  const W = 260, H = 200;
  const mainX = W * 0.24, mainY = H * 0.2;
  const sub1X = W * 0.28, sub1Y = H * 0.52;
  const sub2X = W * 0.7, sub2Y = H * 0.36;
  const deepX = W * 0.48, deepY = H * 0.82;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      {anchor1Visible && (
        <path
          d={`M ${mainX} ${mainY} C ${mainX} ${mainY + 30}, ${sub1X} ${sub1Y - 30}, ${sub1X} ${sub1Y}`}
          fill="none"
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
      )}
      {anchor2Visible && (
        <path
          d={`M ${mainX} ${mainY} C ${mainX + 30} ${mainY}, ${sub2X - 30} ${sub2Y}, ${sub2X} ${sub2Y}`}
          fill="none"
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
      )}
      {sub1AnchorVisible && (
        <path
          d={`M ${sub1X} ${sub1Y} C ${sub1X} ${sub1Y + 30}, ${deepX} ${deepY - 30}, ${deepX} ${deepY}`}
          fill="none"
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
      )}

      <g>
        {rootTapHint && (
          <>
            <circle
              cx={mainX}
              cy={mainY}
              r={12}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
            >
              <animate attributeName="r" values="8;18;8" dur="1.1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.85;0.05;0.85" dur="1.1s" repeatCount="indefinite" />
            </circle>
          </>
        )}
        <circle
          cx={mainX}
          cy={mainY}
          r={activeNode === "main" ? 5.5 : 4}
          fill={activeNode === "main" ? "var(--ink)" : "var(--paper-2)"}
          stroke="var(--ink)"
          strokeWidth={activeNode === "main" ? 0 : 1.25}
        />
        <text
          x={mainX + 8}
          y={mainY + 3.5}
          fontSize={9.5}
          style={{ fontFamily: "var(--font-serif)" }}
          fill={activeNode === "main" ? "var(--ink)" : "var(--ink-3)"}
          fontWeight={activeNode === "main" ? 500 : 400}
        >
          {c.mainCrumb}
        </text>
        {rootTapHint && (
          <g>
            <rect
              x={mainX - 18}
              y={mainY - 36}
              width={36}
              height={14}
              rx={4}
              fill="var(--accent)"
            />
            <text
              x={mainX}
              y={mainY - 26}
              fontSize={8.5}
              fill="var(--paper)"
              style={{ fontFamily: "var(--font-mono)" }}
              textAnchor="middle"
              fontWeight={600}
            >
              {c.tapLabel}
            </text>
          </g>
        )}
        {atRootLabel && (
          <text
            x={mainX}
            y={mainY - 16}
            fontSize={8.5}
            fill="var(--accent)"
            style={{ fontFamily: "var(--font-mono)" }}
            textAnchor="middle"
          >
            ◉ {c.youAreHereLabel}
          </text>
        )}
        {rootTap && (
          <circle cx={mainX} cy={mainY} r={2} fill="var(--accent)">
            <animate attributeName="r" values="2;16;2" dur="1.1s" repeatCount="1" />
            <animate attributeName="opacity" values="0.9;0;0.9" dur="1.1s" repeatCount="1" />
          </circle>
        )}
      </g>

      {anchor1Visible && (
        <g>
          {nodePulse === "sub1" && (
            <circle
              cx={sub1X}
              cy={sub1Y}
              r={9}
              fill="none"
              stroke="var(--pig-1)"
              strokeWidth={2}
            >
              <animate attributeName="r" values="6;14;6" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0;0.9" dur="1.2s" repeatCount="indefinite" />
            </circle>
          )}
          <circle
            cx={sub1X}
            cy={sub1Y}
            r={activeNode === "sub1" ? 5.5 : 4}
            fill={activeNode === "sub1" ? "var(--pig-1)" : "var(--paper-2)"}
            stroke="var(--pig-1)"
            strokeWidth={activeNode === "sub1" ? 0 : 1.25}
          />
          {anchor1Breathing && (
            <circle
              cx={sub1X + 6}
              cy={sub1Y - 4}
              r={3}
              fill="var(--accent)"
              stroke="var(--paper)"
              strokeWidth={1}
            >
              <animate attributeName="r" values="3;4;3" dur="1.6s" repeatCount="indefinite" />
            </circle>
          )}
          <text
            x={sub1X + 9}
            y={sub1Y + 3.5}
            fontSize={9}
            style={{ fontFamily: "var(--font-serif)" }}
            fill={activeNode === "sub1" ? "var(--ink)" : "var(--ink-3)"}
          >
            {c.subTitle1.length > 12 ? c.subTitle1.slice(0, 12) + "…" : c.subTitle1}
          </text>
        </g>
      )}

      {anchor2Visible && (
        <g>
          {nodePulse === "sub2" && (
            <circle
              cx={sub2X}
              cy={sub2Y}
              r={9}
              fill="none"
              stroke="var(--pig-2)"
              strokeWidth={2}
            >
              <animate attributeName="r" values="6;14;6" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0;0.9" dur="1.2s" repeatCount="indefinite" />
            </circle>
          )}
          <circle
            cx={sub2X}
            cy={sub2Y}
            r={activeNode === "sub2" ? 5.5 : 4}
            fill={activeNode === "sub2" ? "var(--pig-2)" : "var(--paper-2)"}
            stroke="var(--pig-2)"
            strokeWidth={activeNode === "sub2" ? 0 : 1.25}
          />
          {anchor2Breathing && (
            <circle
              cx={sub2X + 6}
              cy={sub2Y - 4}
              r={3}
              fill="var(--accent)"
              stroke="var(--paper)"
              strokeWidth={1}
            >
              <animate attributeName="r" values="3;4;3" dur="1.6s" repeatCount="indefinite" />
            </circle>
          )}
          <text
            x={sub2X + 9}
            y={sub2Y + 3.5}
            fontSize={9}
            style={{ fontFamily: "var(--font-serif)" }}
            fill={activeNode === "sub2" ? "var(--ink)" : "var(--ink-3)"}
          >
            {c.subTitle2.length > 12 ? c.subTitle2.slice(0, 12) + "…" : c.subTitle2}
          </text>
        </g>
      )}

      {sub1AnchorVisible && (
        <g>
          {nodePulse === "deep" && (
            <circle
              cx={deepX}
              cy={deepY}
              r={9}
              fill="none"
              stroke="var(--pig-3)"
              strokeWidth={2}
            >
              <animate attributeName="r" values="6;14;6" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0;0.9" dur="1.2s" repeatCount="indefinite" />
            </circle>
          )}
          <circle
            cx={deepX}
            cy={deepY}
            r={activeNode === "deep" ? 5.5 : 4}
            fill={activeNode === "deep" ? "var(--pig-3)" : "var(--paper-2)"}
            stroke="var(--pig-3)"
            strokeWidth={activeNode === "deep" ? 0 : 1.25}
          />
          {sub1AnchorBreathing && (
            <circle
              cx={deepX + 6}
              cy={deepY - 4}
              r={3}
              fill="var(--accent)"
              stroke="var(--paper)"
              strokeWidth={1}
            >
              <animate attributeName="r" values="3;4;3" dur="1.6s" repeatCount="indefinite" />
            </circle>
          )}
          <text
            x={deepX + 9}
            y={deepY + 3.5}
            fontSize={9}
            style={{ fontFamily: "var(--font-serif)" }}
            fill={activeNode === "deep" ? "var(--ink)" : "var(--ink-3)"}
          >
            {c.deepTitle.length > 12 ? c.deepTitle.slice(0, 12) + "…" : c.deepTitle}
          </text>
        </g>
      )}
    </svg>
  );
}

// ── MobileMergeOverlay —— 用实际 graph 代替 flat list（同 desktop）
function MobileMergeOverlay({
  c, modalOpen, contentShown, done, mergeLen,
}: {
  c: DemoContent;
  modalOpen: boolean;
  contentShown: boolean;
  done: boolean;
  mergeLen: number;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-stretch justify-center p-2"
      style={{
        background: "rgba(27,26,23,0.35)",
        opacity: modalOpen ? 1 : 0,
        transition: "opacity 240ms ease-out",
        pointerEvents: modalOpen ? "auto" : "none",
      }}
    >
      <div
        className="self-center w-full rounded-xl overflow-hidden"
        style={{
          background: "var(--card)",
          border: "1px solid var(--rule)",
          boxShadow: "0 12px 36px rgba(27,26,23,0.22)",
          transform: modalOpen ? "translateY(0)" : "translateY(12px)",
          transition: "transform 300ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* 顶栏：dot + 标题 + 数量 + 关闭 —— 对齐真实 MergeOutput */}
        <div
          className="flex items-center gap-1.5 px-3 py-2"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          <span
            className="w-[7px] h-[7px] rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span
            className="font-serif text-[13px] font-medium"
            style={{ color: "var(--ink)" }}
          >
            {c.mergeOutputLabel}
          </span>
          <span
            className="font-mono text-[9px] tabular-nums"
            style={{ color: "var(--ink-4)" }}
          >
            {c.mergeBranchesSelected}
          </span>
          <span className="flex-1" />
          <span
            className="w-5 h-5 flex items-center justify-center"
            style={{ color: "var(--ink-4)" }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        </div>

        {/* Format row —— 3 个选项卡 */}
        <div
          className="flex gap-1 px-2 py-1.5 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--rule-soft)" }}
        >
          {c.mergeFormats.map((f, i) => {
            const isActive = i === 0;
            return (
              <span
                key={f}
                className="flex-1 rounded px-1.5 py-1 text-center"
                style={{
                  background: isActive ? "var(--accent-soft)" : "var(--paper-2)",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--rule-soft)"}`,
                  color: isActive ? "var(--accent)" : "var(--ink-3)",
                }}
              >
                <div className="text-[10px] font-medium leading-tight">{f}</div>
              </span>
            );
          })}
        </div>

        {/* graph tree 选择（全选）*/}
        <div
          className="px-3 py-2"
          style={{ borderBottom: "1px solid var(--rule-soft)", background: "var(--paper-2)" }}
        >
          <div className="flex items-center mb-1.5">
            <span
              className="font-mono text-[8.5px] uppercase tracking-[0.14em]"
              style={{ color: "var(--ink-4)" }}
            >
              {c.mergeSelectThreads}
            </span>
          </div>
          <div style={{ height: 80 }}>
            <MergeGraphPreviewMobile c={c} />
          </div>
        </div>

        <div className="px-3 py-2 overflow-y-auto" style={{ height: 130 }}>
          {!contentShown ? (
            <div className="h-full flex items-center justify-center">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium"
                style={{ background: "var(--accent)", color: "var(--paper)" }}
              >
                <svg
                  className="w-3 h-3"
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
            <>
              <MiniMdMobile text={c.mergeReport.slice(0, mergeLen)} />
              {!done && (
                <span
                  className="inline-block w-[2px] h-3 align-middle ml-[1px]"
                  style={{
                    background: "var(--accent)",
                    animation: "mp-merge-caret 1s steps(2) infinite",
                  }}
                />
              )}
              {done && (
                <div
                  className="flex items-center gap-1.5 mt-2 pt-2"
                  style={{ borderTop: "1px solid var(--rule-soft)" }}
                >
                  <span
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-[3px] rounded"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                    }}
                  >
                    <svg
                      className="w-2.5 h-2.5"
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
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-[3px] rounded"
                    style={{
                      background: "var(--paper-2)",
                      color: "var(--ink-2)",
                      border: "1px solid var(--rule)",
                    }}
                  >
                    {c.mergeCopy}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <style jsx>{`
        @keyframes mp-merge-caret {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function MergeGraphPreviewMobile({ c }: { c: DemoContent }) {
  void c;
  const W = 320, H = 80;
  const mainX = W * 0.12, mainY = H * 0.5;
  const sub1X = W * 0.4, sub1Y = H * 0.25;
  const sub2X = W * 0.4, sub2Y = H * 0.75;
  const deepX = W * 0.72, deepY = H * 0.25;

  const Check = ({ cx, cy }: { cx: number; cy: number }) => (
    <g>
      <circle cx={cx + 5} cy={cy - 5} r={4} fill="var(--accent)" stroke="var(--paper)" strokeWidth={1.2} />
      <path
        d={`M ${cx + 3} ${cy - 5} L ${cx + 4.5} ${cy - 3.5} L ${cx + 7} ${cy - 7}`}
        stroke="var(--paper)"
        strokeWidth={1.2}
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
        d={`M ${mainX} ${mainY} C ${mainX + 30} ${mainY}, ${sub1X - 30} ${sub1Y}, ${sub1X} ${sub1Y}`}
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />
      <path
        d={`M ${mainX} ${mainY} C ${mainX + 30} ${mainY}, ${sub2X - 30} ${sub2Y}, ${sub2X} ${sub2Y}`}
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />
      <path
        d={`M ${sub1X} ${sub1Y} C ${sub1X + 30} ${sub1Y}, ${deepX - 30} ${deepY}, ${deepX} ${deepY}`}
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth={1}
      />

      <circle cx={mainX} cy={mainY} r={5} fill="var(--ink)" />
      <circle cx={sub1X} cy={sub1Y} r={5} fill="var(--pig-1)" />
      <Check cx={sub1X} cy={sub1Y} />
      <circle cx={sub2X} cy={sub2Y} r={5} fill="var(--pig-2)" />
      <Check cx={sub2X} cy={sub2Y} />
      <circle cx={deepX} cy={deepY} r={5} fill="var(--pig-3)" />
      <Check cx={deepX} cy={deepY} />
    </svg>
  );
}

function MiniMdMobile({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-[2px]" />;
        if (line.startsWith("## "))
          return (
            <p
              key={i}
              className="font-serif text-[11.5px] font-medium"
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
              className="text-[10.5px] leading-snug"
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
            className="text-[10.5px] leading-snug"
            style={{ color: "var(--ink-2)" }}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}
