// components/demo/types.ts
// 三层 walkthrough 的共享 phase 机 —— PinDemo (desktop) 和 MobilePinDemo
// 共用同一条 phase 列表，只在渲染细节上分叉（例如 mobile 要提示先点 Select
// FAB，desktop 直接 sweep）。desktop 不需要的 phase 在其 delay map 中给
// 一个很短的时长即可（但 phase id 保持对齐，方便日后加逻辑）。
//
// Shared 3-layer walkthrough phase list. PinDemo and MobilePinDemo run on
// the same phase ids — they diverge only in how each phase is rendered.
// Phases a given demo doesn't need (e.g. mobile's `*-tap-select` hint on
// desktop) are folded into neighbor phases or given a tiny delay; keeping
// the ids aligned means future tweaks stay in lockstep across both demos.

export type DemoPhase =
  | "blank"
  | "main-stream"
  // L0 第一针 / first pin at L0
  | "p1-sweep"
  | "p1-selpop"
  | "p1-dialog"
  | "p1-pick"
  | "p1-underline"
  // L0 第二针 / second pin at L0
  | "p2-sweep"
  | "p2-selpop"
  | "p2-dialog"
  | "p2-pick"
  | "p2-underline"
  // L0 → L1 进入子线程 1 / enter sub-thread 1
  | "l1-hover"
  | "l1-enter"
  | "l1-stream"
  // L1 子线程里再插一针 / pin again inside sub-thread 1
  | "p3-sweep"
  | "p3-selpop"
  | "p3-dialog"
  | "p3-pick"
  | "p3-underline"
  // L1 → L2 进入子子线程 / enter the deepest sub-thread
  | "l2-hover"
  | "l2-enter"
  | "l2-stream"
  // Graph 演示：高亮右栏 → 点 root 回主线
  // Graph demo: highlight rail → click root to jump back
  | "graph-hint"
  | "graph-nav-root"
  | "graph-navigated"
  // Merge 演示：点合并 → 选线程 → 流式出报告 → 成品
  // Merge demo: click merge → pick threads → stream report → done
  | "merge-hint"
  | "merge-modal"
  | "merge-stream"
  | "merge-done";

export const DEMO_PHASES: readonly DemoPhase[] = [
  "blank",
  "main-stream",
  "p1-sweep", "p1-selpop", "p1-dialog", "p1-pick", "p1-underline",
  "p2-sweep", "p2-selpop", "p2-dialog", "p2-pick", "p2-underline",
  "l1-hover", "l1-enter", "l1-stream",
  "p3-sweep", "p3-selpop", "p3-dialog", "p3-pick", "p3-underline",
  "l2-hover", "l2-enter", "l2-stream",
  "graph-hint", "graph-nav-root", "graph-navigated",
  "merge-hint", "merge-modal", "merge-stream", "merge-done",
] as const;
