"use client";
// components/PinDemo.tsx — 插针完整流程演示

import { useEffect, useRef, useState } from "react";

// ── 颜色常量（避免 Tailwind 变量在 demo 背景下失效）─────────────────────────
const C = {
  bg:        "#0d0e18",
  surface:   "#141626",
  border:    "rgba(255,255,255,0.08)",
  borderSub: "rgba(255,255,255,0.05)",
  textHi:    "rgb(226,232,240)",
  textMd:    "rgb(148,163,184)",
  textLo:    "rgb(100,116,139)",
  textFaint: "rgb(71,85,105)",
  indigo:    "rgba(99,102,241,",   // 后接透明度 + ")"
  indigoSolid: "rgb(99,102,241)",
  indigoText:  "rgb(165,180,252)",
  indigoLight: "rgb(199,210,254)",
};
const ind = (a: number) => `${C.indigo}${a})`;

// ── 阶段 ──────────────────────────────────────────────────────────────────────
type Phase =
  | "idle"           // 已有一根针，AI 回复完成
  | "sweeping"       // 鼠标扫选文字
  | "pin-menu"       // 浮动工具栏（复制 | 插针）
  | "pin-click"      // 点击插针按钮
  | "dialog-open"    // PinStartDialog 弹出，建议加载中
  | "dialog-ready"   // 推荐问题加载完成
  | "hover-suggest"  // 悬停第一个建议
  | "click-suggest"  // 点击建议
  | "card-in"        // 卡片滑入，概览节点同步出现
  | "streaming"      // AI 流式回复
  | "unread"         // 回复完成，红点闪烁
  | "card-hover"     // 鼠标移到卡片，曲线指向锚点
  | "card-click"     // 点击卡片
  | "thread-view"    // 进入子线程视图
  | "thread-done"    // 子线程视图展示完毕
  | "back-click"     // 点击面包屑「主线」返回
  | "back-main";     // 退出子线程，回到主线视图

const DELAYS: Record<Phase, number> = {
  "idle":          2000,
  "sweeping":      1400,
  "pin-menu":      1600,
  "pin-click":      600,
  "dialog-open":   1600,
  "dialog-ready":  1400,
  "hover-suggest": 1200,
  "click-suggest":  600,
  "card-in":       1200,
  "streaming":     3600,
  "unread":        1600,
  "card-hover":    2600,
  "card-click":     600,
  "thread-view":   4000,
  "thread-done":   2000,
  "back-click":     700,
  "back-main":     2200,
};
const NEXT: Record<Phase, Phase> = {
  "idle":          "sweeping",
  "sweeping":      "pin-menu",
  "pin-menu":      "pin-click",
  "pin-click":     "dialog-open",
  "dialog-open":   "dialog-ready",
  "dialog-ready":  "hover-suggest",
  "hover-suggest": "click-suggest",
  "click-suggest": "card-in",
  "card-in":       "streaming",
  "streaming":     "unread",
  "unread":        "card-hover",
  "card-hover":    "card-click",
  "card-click":    "thread-view",
  "thread-view":   "thread-done",
  "thread-done":   "back-click",
  "back-click":    "back-main",
  "back-main":     "idle",
};

// ── 内容 ──────────────────────────────────────────────────────────────────────
const AI_TEXT =
  "在分布式系统中，CAP 定理指出你只能同时保证「一致性」「可用性」「分区容忍性」三者中的两个。Raft 协议通过 Leader 选举解决了这一权衡，而一致性哈希让节点扩缩容时数据迁移量最小化。";

const ANCHOR = "CAP 定理";
const A_START = AI_TEXT.indexOf(ANCHOR);
const A_END   = A_START + ANCHOR.length;

const SUGGESTIONS = [
  "CAP 定理在实际系统中如何取舍？",
  "一致性和可用性哪个更重要？",
  "举个 CAP 权衡的真实案例？",
];

const CARD_REPLY =
  "CAP 由 Brewer 提出：发生网络分区（P）时，系统只能在一致性（C）和可用性（A）中选一。银行系统选 CP，保证每笔交易强一致；DNS 选 AP，即使部分节点宕机也能继续响应查询……";

const THREAD_REPLY_FULL =
  "CAP 定理（Consistency、Availability、Partition tolerance）由 Eric Brewer 在 2000 年提出，正式证明由 Gilbert 和 Lynch 在 2002 年完成。\n\n核心结论：当网络分区（P）不可避免时，系统设计者必须在一致性（C）和可用性（A）之间做出取舍。\n\n• **CP 系统**：HBase、ZooKeeper — 分区时拒绝写入，保证数据绝对一致\n• **AP 系统**：Cassandra、CouchDB — 分区时继续服务，但可能读到旧数据\n• **实践中**：大多数系统在 C 和 A 之间动态权衡，根据业务场景调整一致性级别";

const EXISTING_CARD = {
  label:   "Raft 协议",
  anchor:  "Raft 协议",
  preview: "通过 Leader 选举 + 日志复制实现强一致性，相比 Paxos 实现更清晰……",
};

// 阶段文字说明
const CAPTIONS: Record<Phase, string> = {
  "idle":          "AI 回复完成。已有一根针「Raft 协议」挂在左侧，主线文字中对应词语显示高亮轮廓。",
  "sweeping":      "鼠标按住拖过「CAP 定理」，蓝色高亮随光标展开，这就是选中的过程。",
  "pin-menu":      "松开鼠标，浮动工具栏自动出现在选区上方：左侧「复制」，右侧「插针」。",
  "pin-click":     "点击「插针」按钮，按钮发光高亮，选区被锁定。",
  "dialog-open":   "插针弹窗出现。顶部引用锚点原文，AI 正在后台生成推荐追问（三点加载中）。",
  "dialog-ready":  "推荐问题生成完毕，三个可点击的追问选项出现，也可以自己输入。",
  "hover-suggest": "鼠标悬停第一个推荐问题，背景高亮。",
  "click-suggest": "点击发送，问题进入子线程，弹窗关闭。",
  "card-in":       "左侧子线程卡片从左边滑入。右侧概览图中，CAP 定理节点同步出现在与其他子问题同一层。",
  "streaming":     "AI 在子线程里独立回答，左侧卡片实时显示流式输出。主线对话完全不受影响。",
  "unread":        "回复完成，卡片角标变红，提示有未读内容。",
  "card-hover":    "鼠标移到卡片上，一条曲线从卡片延伸、指向主线中「CAP 定理」的锚点位置。",
  "card-click":    "点击卡片，进入子线程完整视图。",
  "thread-view":   "中间栏切换为子线程对话：顶部面包屑导航，下方展示完整问答。",
  "thread-done":   "子线程内容完整可见。可以继续追问，也可以点击面包屑中的「主线」返回。",
  "back-click":    "点击面包屑「主线」——按钮高亮，触发返回动作。",
  "back-main":     "中间栏滑回主线对话，所有锚点高亮保留。左侧卡片仍在，随时可以再次点击进入子线程。",
};

// 阶段顺序列表（用于前进/后退）
const PHASE_ORDER: Phase[] = [
  "idle","sweeping","pin-menu","pin-click",
  "dialog-open","dialog-ready","hover-suggest","click-suggest",
  "card-in","streaming","unread","card-hover","card-click",
  "thread-view","thread-done","back-click","back-main",
];

// ── 组件 ──────────────────────────────────────────────────────────────────────
export default function PinDemo() {
  const [phase, setPhase]         = useState<Phase>("idle");
  const [sweepPct, setSweepPct]   = useState(0);
  const [streamLen, setStreamLen] = useState(0);
  const [playing, setPlaying]     = useState(true);

  // 自动推进（暂停时不推进）
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPhase(p => NEXT[p]), DELAYS[phase]);
    return () => clearTimeout(t);
  }, [phase, playing]);

  useEffect(() => {
    if (phase === "idle") { setSweepPct(0); setStreamLen(0); }
  }, [phase]);

  const sweepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (phase !== "sweeping") { setSweepPct(0); return; }
    let v = 0;
    sweepTimer.current = setInterval(() => {
      v += 9; setSweepPct(Math.min(v, 100));
      if (v >= 100) clearInterval(sweepTimer.current!);
    }, 42);
    return () => clearInterval(sweepTimer.current!);
  }, [phase]);

  useEffect(() => {
    if (phase !== "streaming") return;
    if (streamLen >= CARD_REPLY.length) return;
    const t = setTimeout(() => setStreamLen(n => n + 2), 30);
    return () => clearTimeout(t);
  }, [phase, streamLen]);

  const goTo = (p: Phase) => {
    setPhase(p);
    if (p === "idle") { setSweepPct(0); setStreamLen(0); }
    if (!["streaming","sweeping"].includes(p)) {
      if (p !== "streaming") setStreamLen(CARD_REPLY.length); // 非流式阶段显示完整
      if (p === "idle" || PHASE_ORDER.indexOf(p) < PHASE_ORDER.indexOf("streaming")) setStreamLen(0);
    }
  };

  const stepBy = (delta: number) => {
    const idx = PHASE_ORDER.indexOf(phase);
    const next = PHASE_ORDER[Math.max(0, Math.min(PHASE_ORDER.length - 1, idx + delta))];
    goTo(next);
  };

  // ── 布尔 ──────────────────────────────────────────────────────────────────
  const isSweeping    = phase === "sweeping";
  const isHighlit     = phase !== "idle";
  const showPinMenu   = ["pin-menu","pin-click"].includes(phase);
  const pinClicking   = phase === "pin-click";
  const showDialog    = ["dialog-open","dialog-ready","hover-suggest","click-suggest"].includes(phase);
  const dialogReady   = ["dialog-ready","hover-suggest","click-suggest"].includes(phase);
  const hoverIdx      = ["hover-suggest","click-suggest"].includes(phase) ? 0 : -1;
  const clickIdx      = phase === "click-suggest" ? 0 : -1;
  const showCard       = ["card-in","streaming","unread","card-hover","card-click","thread-view","thread-done","back-click","back-main"].includes(phase);
  const showStream     = ["streaming","unread","card-hover","card-click","thread-view","thread-done","back-click","back-main"].includes(phase);
  const showUnread     = ["unread","card-hover","card-click"].includes(phase);
  const cardHovering   = phase === "card-hover";
  const cardClicking   = phase === "card-click";
  const showThreadView = ["thread-view","thread-done","back-click"].includes(phase);
  const backClicking   = phase === "back-click";
  // showCap: 卡片出现时概览节点同步出现
  const showCap        = ["card-in","streaming","unread","card-hover","card-click","thread-view","thread-done","back-click","back-main"].includes(phase);

  const before = AI_TEXT.slice(0, A_START);
  const after  = AI_TEXT.slice(A_END);

  // ── Raft 在文字里的位置
  const raftIdx = before.indexOf("Raft 协议");

  return (
    <div className="w-full max-w-[960px] select-none">
      <div className="relative rounded-2xl border overflow-hidden"
        style={{ background: C.bg, borderColor: ind(0.12), boxShadow: `0 0 0 1px ${ind(0.1)}, 0 24px 64px rgba(0,0,0,0.4)` }}>

        {/* 顶部光线 */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg,transparent,rgba(99,102,241,0.45),transparent)" }} />

        {/* 标题栏 — 固定高度 */}
        <div className="flex items-center gap-2 px-4 border-b" style={{ borderColor: C.border, height: 38 }}>
          <div className="flex gap-1.5">
            {["#ff5f57","#ffbd2e","#28c840"].map(c => (
              <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: 0.7 }} />
            ))}
          </div>
          <span className="text-[11px] font-medium ml-2" style={{ color: C.textFaint }}>
            如何设计一个分布式系统？
          </span>
        </div>

        {/* ── 三栏 — grid 强制等宽，内容不影响列宽 ── */}
        <div className="grid grid-cols-3 relative" style={{ height: 340 }}>

          {/* ── 跨栏曲线：悬停卡片 → 锚点 ──────────────────────── */}
          {/* viewBox 300×340，每栏 = 100 单位 */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 300 340" preserveAspectRatio="none" style={{ zIndex: 15 }}>
            <path
              d="M 96 152 C 110 152, 110 95, 138 95"
              fill="none"
              stroke={C.indigoSolid}
              strokeWidth="0.8"
              strokeDasharray="4 3"
              strokeOpacity={cardHovering ? 0.7 : 0}
              style={{ transition: "stroke-opacity 0.3s ease" }}
            />
            {/* 锚点终端圆点 */}
            <circle cx="138" cy="95" r="3.5"
              fill={C.indigoSolid}
              opacity={cardHovering ? 0.8 : 0}
              style={{ transition: "opacity 0.3s ease" }}
            />
          </svg>

          {/* ── 左：子线程列 ──────────────────────────────────────── */}
          <div className="relative border-r flex flex-col overflow-hidden" style={{ borderColor: C.border }}>
            <div className="px-3 py-1.5 border-b" style={{ borderColor: C.borderSub }}>
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.textFaint }}>子问题</span>
            </div>

            {/* 曲线 SVG — x0=0(列左边缘) → x1=8(卡片左边)，与真实代码一致 */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ top: 28, zIndex: 0 }}>
              {/* 已有针：y=52 对应 Raft 卡片中心 */}
              <path d="M 0 52 C 4 52, 4 52, 8 52"
                fill="none" stroke={C.indigoSolid} strokeWidth="1.5" strokeOpacity="0.4" />
              {/* 新针曲线（卡片出现后显示） */}
              {showCard && (
                <path d="M 0 148 C 4 148, 4 148, 8 148"
                  fill="none" stroke={C.indigoSolid} strokeWidth="1.5" strokeOpacity="0.6"
                  style={{ transition: "stroke-opacity 0.3s" }} />
              )}
            </svg>

            {/* 卡片 */}
            <div className="relative flex-1 px-2 py-2 space-y-2 overflow-hidden" style={{ zIndex: 1 }}>

              {/* 已有针 */}
              <div className="rounded-xl border overflow-hidden text-xs"
                style={{ background: ind(0.06), borderColor: ind(0.2) }}>
                <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                  <DragHandle />
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ind(0.5) }} />
                  <p className="font-medium truncate flex-1 text-[10px]" style={{ color: C.textMd }}>{EXISTING_CARD.label}</p>
                </div>
                <div className="mx-2.5 mb-1.5 px-2 py-1 rounded-md text-[9px] leading-snug" style={{ background: ind(0.06), border: `1px solid ${ind(0.12)}`, color: C.textFaint }}>
                  「{EXISTING_CARD.anchor}」
                </div>
                <p className="px-2.5 pb-2 text-[10px] leading-relaxed" style={{ color: C.textFaint }}>{EXISTING_CARD.preview}</p>
              </div>

              {/* 新针卡片 */}
              <div style={{
                opacity: showCard ? 1 : 0,
                transform: showCard ? "translateX(0)" : "translateX(-14px)",
                transition: "opacity 0.3s ease, transform 0.35s ease",
              }}>
                <div
                  className="rounded-xl border overflow-hidden text-xs cursor-pointer"
                  style={{
                    background: cardClicking ? ind(0.2) : cardHovering ? ind(0.17) : ind(0.13),
                    borderColor: cardClicking ? ind(0.7) : cardHovering ? ind(0.55) : ind(0.35),
                    boxShadow: cardClicking ? `0 0 0 2px ${ind(0.3)}` : cardHovering ? `0 0 0 1px ${ind(0.25)}, 0 0 12px ${ind(0.2)}` : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* 标题行 */}
                  <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                    <DragHandle />
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C.indigoSolid }} />
                    <p className="font-medium truncate flex-1 text-[10px]" style={{ color: C.indigoLight }}>CAP 定理</p>
                    {/* 未读角标 */}
                    {showCard && !showStream && (
                      <span className="w-4 h-4 rounded-full text-white text-[8px] flex items-center justify-center font-bold"
                        style={{ background: ind(0.6) }}>1</span>
                    )}
                    {showUnread && (
                      <span className="w-4 h-4 rounded-full text-white text-[8px] flex items-center justify-center font-bold"
                        style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.6)", animation: showUnread ? "ping 1s ease-in-out" : "none" }}>
                        1
                      </span>
                    )}
                  </div>

                  {/* 锚点引用 */}
                  <div className="mx-2.5 mb-1.5 px-2 py-1 rounded-md text-[9px] leading-snug"
                    style={{ background: ind(0.07), border: `1px solid ${ind(0.13)}`, color: C.indigoText, opacity: 0.8 }}>
                    「{ANCHOR}」
                  </div>

                  {/* 用户问题气泡 */}
                  {showStream && (
                    <div className="mx-2.5 mb-1 flex justify-end">
                      <div className="text-[9px] px-2 py-1 rounded-xl rounded-tr-sm leading-snug"
                        style={{ background: ind(0.25), border: `1px solid ${ind(0.2)}`, color: C.indigoLight, maxWidth: "92%" }}>
                        {SUGGESTIONS[0]}
                      </div>
                    </div>
                  )}

                  {/* AI 回复预览 */}
                  <div className="px-2.5 pb-2 text-[10px] leading-relaxed overflow-hidden" style={{ color: C.textMd, maxHeight: 52 }}>
                    {showStream
                      ? <>{CARD_REPLY.slice(0, streamLen)}{phase === "streaming" && streamLen < CARD_REPLY.length && <Cursor />}</>
                      : <span style={{ color: C.textFaint, fontStyle: "italic" }}>正在准备回复…</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 中：主线 / 子线程视图 ─────────────────────────────── */}
          <div className="relative overflow-hidden">

            {/* 主线视图（子线程视图打开时淡出并向左滑出，返回时从左滑入） */}
            <div style={{
              position: "absolute", inset: 0, padding: 20,
              opacity: showThreadView ? 0 : 1,
              transform: showThreadView ? "translateX(-24px)" : "translateX(0)",
              transition: "opacity 0.4s ease, transform 0.4s ease",
              pointerEvents: showThreadView ? "none" : "auto",
            }}>
              {/* 用户气泡 */}
              <div className="flex justify-end mb-4">
                <div className="text-[12px] leading-relaxed px-3.5 py-2 rounded-2xl rounded-tr-sm max-w-[80%]"
                  style={{ background: ind(0.18), border: `1px solid ${ind(0.2)}`, color: C.indigoLight }}>
                  如何设计一个分布式系统？
                </div>
              </div>

              {/* AI 气泡 */}
              <div className="flex gap-2.5">
                <AIAvatar />
                <div className="flex-1 text-[12.5px] leading-[1.75] relative" style={{ color: C.textMd }}>
                  {/* 前段：Raft 已有针，高亮轮廓 */}
                  {before.slice(0, raftIdx)}
                  <span className="px-0.5 rounded" style={{ color: C.indigoText, boxShadow: `inset 0 0 0 1px ${ind(0.3)}` }}>
                    Raft 协议
                  </span>
                  {before.slice(raftIdx + "Raft 协议".length)}

                  {/* CAP 定理 — 选中/高亮 */}
                  <span className="relative inline">
                    <span className="relative">
                      {isSweeping && (
                        <span className="absolute inset-y-0 left-0 rounded pointer-events-none"
                          style={{ width: `${sweepPct}%`, background: ind(0.45), transition: "width 0.04s linear" }} />
                      )}
                      <span className="relative px-0.5 rounded" style={{
                        background: isHighlit && !isSweeping ? ind(0.28) : "transparent",
                        color: isHighlit ? C.indigoLight : "inherit",
                        boxShadow: (showCard && !showThreadView) ? `inset 0 0 0 1px ${ind(0.3)}` : "none",
                        transition: "background 0.2s, color 0.2s",
                      }}>
                        {ANCHOR}
                      </span>
                    </span>

                    {/* PinMenu */}
                    <span className="absolute left-1/2 z-30 pointer-events-none" style={{
                      bottom: "calc(100% + 8px)",
                      transform: `translateX(-50%) translateY(${showPinMenu ? 0 : 6}px)`,
                      opacity: showPinMenu ? 1 : 0,
                      transition: "opacity 0.18s, transform 0.18s",
                    }}>
                      <span className="flex items-center gap-0.5 rounded-xl px-1.5 py-1.5"
                        style={{ background: "rgba(18,20,34,0.97)", border: `1px solid ${C.border}`, boxShadow: "0 8px 40px rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}>
                        {/* 复制 */}
                        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg whitespace-nowrap" style={{ color: C.textMd }}>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                          </svg>
                          <span className="text-xs">复制</span>
                        </span>
                        <span className="w-px h-4" style={{ background: C.border }} />
                        {/* 插针 */}
                        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg whitespace-nowrap" style={{
                          background: pinClicking ? ind(0.3) : ind(0.1),
                          border: `1px solid ${ind(0.3)}`,
                          boxShadow: pinClicking ? `0 0 10px ${ind(0.4)}` : "none",
                          transition: "all 0.15s",
                        }}>
                          <StarIcon className="w-3.5 h-3.5" style={{ color: C.indigoText }} />
                          <span className="text-xs font-medium" style={{ color: "rgb(165,180,252)" }}>插针</span>
                        </span>
                      </span>
                    </span>
                  </span>

                  {/* 后半段：一致性哈希 */}
                  {after.slice(0, after.indexOf("一致性哈希"))}
                  <span className="px-0.5 rounded" style={{ color: C.textMd, boxShadow: `inset 0 0 0 1px ${ind(0.18)}` }}>
                    一致性哈希
                  </span>
                  {after.slice(after.indexOf("一致性哈希") + "一致性哈希".length)}

                  {phase === "idle" && <BlinkCursor />}
                </div>
              </div>

              {/* 提示文字 */}
              <div className="absolute bottom-3 left-5 flex items-center gap-1.5 text-[10px]" style={{ color: C.textFaint }}>
                <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                </svg>
                选中任意文字即可插针深探
              </div>

              {/* PinStartDialog */}
              <div className="absolute inset-x-3 z-20 rounded-2xl overflow-hidden" style={{
                top: showDialog ? "50%" : "110%",
                transform: showDialog ? "translateY(-50%)" : "translateY(0)",
                transition: "top 0.35s cubic-bezier(0.16,1,0.3,1), transform 0.35s cubic-bezier(0.16,1,0.3,1)",
                background: C.surface,
                border: `1px solid rgba(255,255,255,0.09)`,
                boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
              }}>
                {/* 锚点引用 */}
                <div className="px-5 pt-4 pb-3 flex gap-3 items-start">
                  <div className="w-0.5 flex-shrink-0 self-stretch rounded-full" style={{ background: ind(0.4) }} />
                  <p className="text-sm italic leading-relaxed flex-1" style={{ color: C.textMd }}>{ANCHOR}</p>
                  <span className="w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0" style={{ color: C.textFaint }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </span>
                </div>

                {/* 推荐问题 */}
                <div className="px-5 pb-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.textFaint }}>推荐问题</span>
                    {!dialogReady && (
                      <span className="flex gap-0.5 items-center">
                        {[0,150,300].map(d => (
                          <span key={d} className="w-1 h-1 rounded-full animate-bounce"
                            style={{ background: C.textFaint, animationDelay: `${d}ms`, animationDuration: "800ms" }} />
                        ))}
                      </span>
                    )}
                  </div>
                  {SUGGESTIONS.map((q, i) => (
                    <div key={q} className="text-left text-sm rounded-xl px-4 py-2.5 leading-snug"
                      style={{
                        background: i === hoverIdx || i === clickIdx ? "rgba(255,255,255,0.07)" : dialogReady ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
                        border: `1px solid ${i === hoverIdx || i === clickIdx ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}`,
                        color: dialogReady ? (i === hoverIdx || i === clickIdx ? C.textHi : C.textMd) : "rgba(100,116,139,0.4)",
                        transform: i === clickIdx ? "scale(0.98)" : "scale(1)",
                        transition: "all 0.15s",
                      }}>
                      {q}
                    </div>
                  ))}
                </div>

                <div className="mx-5 border-t" style={{ borderColor: C.borderSub }} />

                {/* 自定义输入 */}
                <div className="px-5 py-3 flex gap-2 items-end">
                  <div className="flex-1 text-sm px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.borderSub}`, color: "rgba(100,116,139,0.5)", minHeight: 36 }}>
                    或自己提问…
                  </div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: ind(0.35), opacity: 0.4 }}>
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* 子线程视图（进入子线程后显示，返回时向右滑出） */}
            <div style={{
              position: "absolute", inset: 0,
              opacity: showThreadView ? 1 : 0,
              transform: showThreadView ? "translateX(0)" : "translateX(28px)",
              transition: "opacity 0.4s ease, transform 0.4s ease",
              pointerEvents: showThreadView ? "auto" : "none",
              display: "flex", flexDirection: "column",
            }}>
              {/* 面包屑导航 */}
              <div className="flex items-center gap-1.5 px-4 py-2 border-b text-[11px]" style={{ borderColor: C.borderSub, color: C.textFaint }}>
                <span
                  className="cursor-pointer rounded px-1 py-0.5 transition-all duration-150"
                  style={{
                    color: backClicking ? C.indigoLight : C.textMd,
                    background: backClicking ? ind(0.18) : "transparent",
                    boxShadow: backClicking ? `0 0 8px ${ind(0.3)}` : "none",
                    fontWeight: backClicking ? 600 : 400,
                  }}
                >主线</span>
                <span style={{ color: C.textFaint }}>›</span>
                <span style={{ color: C.indigoText, fontWeight: 500 }}>CAP 定理</span>
              </div>

              {/* 对话内容 */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* 锚点引用块 */}
                <div className="flex gap-2.5">
                  <div className="w-0.5 flex-shrink-0 rounded-full self-stretch" style={{ background: ind(0.35) }} />
                  <p className="text-sm italic leading-relaxed" style={{ color: C.textMd }}>{ANCHOR}</p>
                </div>

                {/* 用户问题 */}
                <div className="flex justify-end">
                  <div className="text-[12px] leading-relaxed px-3.5 py-2 rounded-2xl rounded-tr-sm max-w-[82%]"
                    style={{ background: ind(0.18), border: `1px solid ${ind(0.2)}`, color: C.indigoLight }}>
                    {SUGGESTIONS[0]}
                  </div>
                </div>

                {/* AI 回复 */}
                <div className="flex gap-2.5">
                  <AIAvatar />
                  <div className="flex-1 text-[12px] leading-[1.8]" style={{ color: C.textMd }}>
                    {THREAD_REPLY_FULL.split("\n").map((line, i) => {
                      if (!line) return <div key={i} className="h-2" />;
                      if (line.startsWith("•")) {
                        const parts = line.slice(2).split("**");
                        return (
                          <div key={i} className="flex gap-2 mb-1">
                            <span style={{ color: C.indigoText, flexShrink: 0 }}>•</span>
                            <span>
                              {parts.map((p, j) => j % 2 === 1
                                ? <strong key={j} style={{ color: C.indigoText, fontWeight: 600 }}>{p}</strong>
                                : <span key={j}>{p}</span>
                              )}
                            </span>
                          </div>
                        );
                      }
                      return <p key={i} className="mb-1">{line}</p>;
                    })}
                  </div>
                </div>
              </div>

              {/* 继续追问提示 */}
              <div className="px-4 py-2 border-t flex items-center gap-2" style={{ borderColor: C.borderSub }}>
                <div className="flex-1 text-[11px] px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.borderSub}`, color: C.textFaint }}>
                  继续追问 CAP 定理…
                </div>
              </div>
            </div>
          </div>

          {/* ── 右：概览节点图 ────────────────────────────────────── */}
          <div className="border-l flex flex-col overflow-hidden" style={{ borderColor: C.border }}>
            <div className="px-2 py-1.5 border-b flex items-center gap-1" style={{ borderColor: C.borderSub }}>
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] flex-1" style={{ color: C.textFaint }}>概览</span>
              <div className="flex gap-0.5 rounded-md p-0.5" style={{ border: `1px solid ${C.borderSub}`, background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-center gap-0.5 px-1 h-4 rounded" style={{ color: C.textFaint }}>
                  <svg className="w-2 h-2" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="5" r="2.5"/><circle cx="5" cy="12" r="2.5"/><circle cx="5" cy="19" r="2.5"/>
                    <circle cx="14" cy="9" r="2.5"/><circle cx="14" cy="19" r="2.5"/>
                  </svg>
                  <span className="text-[8px]">列表</span>
                </div>
                <div className="flex items-center gap-0.5 px-1 h-4 rounded" style={{ background: "rgba(255,255,255,0.08)", color: C.textHi }}>
                  <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
                    <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
                  </svg>
                  <span className="text-[8px]">节点图</span>
                </div>
              </div>
            </div>

            <div className="flex-1 p-1.5">
              {/*
                Tree layout (viewBox 165 × 185):
                  主线 (center=82, y=8..30)
                  Level-1: Raft(x=7,cx=29) | 一致性哈希(x=60,cx=82) | CAP定理(x=113,cx=135)
                           all at y=52..74
                  Level-2: Leader选举 under Raft, y=88..108
              */}
              <svg viewBox="0 0 165 185" className="w-full h-full">
                {/* 主线 */}
                <rect x="32" y="8" width="100" height="22" rx="6" fill={ind(0.12)} stroke={ind(0.35)} strokeWidth="1"/>
                <text x="82" y="23" textAnchor="middle" fontSize="8" fill={C.indigoText} fontFamily="sans-serif" fontWeight="500">主线对话</text>

                {/* 干线：主线→横梁 */}
                <line x1="82" y1="30" x2="82" y2="42" stroke={ind(0.25)} strokeWidth="1"/>
                {/* 横梁：Raft-cx 到 Hash-cx */}
                <line x1="29" y1="42" x2="82" y2="42" stroke={ind(0.25)} strokeWidth="1"/>
                {/* CAP 那段横梁（出现时淡入） */}
                <line x1="82" y1="42" x2="135" y2="42"
                  stroke={ind(showCap ? 0.25 : 0.08)} strokeWidth="1"
                  style={{ transition: "stroke 0.4s" }}/>
                {/* 竖线到各节点 */}
                <line x1="29" y1="42" x2="29" y2="52" stroke={ind(0.25)} strokeWidth="1"/>
                <line x1="82" y1="42" x2="82" y2="52" stroke={ind(0.25)} strokeWidth="1"/>
                <line x1="135" y1="42" x2="135" y2="52"
                  stroke={ind(showCap ? 0.25 : 0.08)} strokeWidth="1"
                  style={{ transition: "stroke 0.4s" }}/>

                {/* ── Raft 协议 ── */}
                <rect x="7" y="52" width="44" height="22" rx="6" fill={ind(0.1)} stroke={ind(0.3)} strokeWidth="1"/>
                <text x="29" y="63" textAnchor="middle" fontSize="7" fill={C.textMd} fontFamily="sans-serif">Raft</text>
                <text x="29" y="71" textAnchor="middle" fontSize="7" fill={C.textMd} fontFamily="sans-serif">协议</text>

                {/* Raft 子节点：Leader 选举 */}
                <line x1="29" y1="74" x2="29" y2="86" stroke={ind(0.2)} strokeWidth="1"/>
                <rect x="7" y="86" width="44" height="20" rx="5" fill={ind(0.06)} stroke={ind(0.18)} strokeWidth="1"/>
                <text x="29" y="100" textAnchor="middle" fontSize="6.5" fill={C.textFaint} fontFamily="sans-serif">Leader 选举</text>

                {/* ── 一致性哈希 ── */}
                <rect x="60" y="52" width="44" height="22" rx="6" fill={ind(0.08)} stroke={ind(0.22)} strokeWidth="1"/>
                <text x="82" y="63" textAnchor="middle" fontSize="7" fill={C.textLo} fontFamily="sans-serif">一致性</text>
                <text x="82" y="71" textAnchor="middle" fontSize="7" fill={C.textLo} fontFamily="sans-serif">哈希</text>

                {/* ── CAP 定理（与 Raft 同一层 y=52，出现时点亮） ── */}
                <rect x="113" y="52" width="44" height="22" rx="6"
                  fill={showCap ? ind(0.22) : ind(0.03)}
                  stroke={showCap ? ind(0.65) : ind(0.1)}
                  strokeWidth="1"
                  style={{ transition: "fill 0.45s, stroke 0.45s" }}
                />
                <text x="135" y="63" textAnchor="middle" fontSize="7"
                  fill={showCap ? C.indigoLight : "rgba(99,102,241,0.15)"}
                  fontFamily="sans-serif" fontWeight={showCap ? "600" : "400"}
                  style={{ transition: "fill 0.45s" }}>CAP</text>
                <text x="135" y="71" textAnchor="middle" fontSize="7"
                  fill={showCap ? C.indigoLight : "rgba(99,102,241,0.15)"}
                  fontFamily="sans-serif" fontWeight={showCap ? "600" : "400"}
                  style={{ transition: "fill 0.45s" }}>定理</text>
                {/* 未读指示点 */}
                {showUnread && (
                  <circle cx="152" cy="52" r="4" fill="#ef4444" opacity="0.9"/>
                )}
              </svg>
            </div>

            {/* 合并按钮 */}
            <div className="px-2 pb-2">
              <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer"
                style={{ background: ind(0.08), border: `1px solid ${ind(0.18)}` }}>
                <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={C.indigoText} strokeWidth={2} strokeLinecap="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                </svg>
                <span className="text-[9px] font-medium" style={{ color: C.indigoText }}>合并输出</span>
                <span className="ml-auto text-[9px] tabular-nums" style={{ color: ind(0.6) }}>
                  {showCap ? "3" : "2"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 底部：说明文字 + 控制栏 */}
        <div className="border-t" style={{ borderColor: C.border, background: "rgba(0,0,0,0.2)" }}>
          {/* 说明文字 — 固定高度 */}
          <div className="px-5 pt-3 pb-1 overflow-hidden" style={{ height: 50 }}>
            <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: C.textMd }}>
              {CAPTIONS[phase]}
            </p>
          </div>

          {/* 控制栏 — 固定高度 44px */}
          <div className="px-5 flex items-center gap-3" style={{ height: 44 }}>
            {/* 进度点 */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {PHASE_ORDER.map(p => (
                <button key={p} onClick={() => goTo(p)}
                  className="h-1 rounded-full transition-all duration-300 flex-shrink-0 cursor-pointer"
                  style={{ width: phase === p ? "16px" : "4px", background: phase === p ? C.indigoSolid : ind(0.2) }} />
              ))}
            </div>

            {/* 后退 */}
            <button onClick={() => stepBy(-1)}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.textLo }}
              title="上一步">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>

            {/* 播放/暂停 */}
            <button onClick={() => setPlaying(p => !p)}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all flex-shrink-0"
              style={{
                background: playing ? ind(0.2) : "rgba(255,255,255,0.05)",
                border: `1px solid ${playing ? ind(0.4) : C.border}`,
                color: playing ? C.indigoText : C.textLo,
              }}
              title={playing ? "暂停" : "播放"}>
              {playing
                ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>

            {/* 前进 */}
            <button onClick={() => stepBy(1)}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.textLo }}
              title="下一步">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 小组件 ────────────────────────────────────────────────────────────────────
function DragHandle() {
  return (
    <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 16" fill="rgb(71,85,105)">
      <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
      <circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/>
      <circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/>
    </svg>
  );
}

function AIAvatar() {
  return (
    <div className="w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ background: "rgba(99,102,241,0.1)", borderColor: "rgba(255,255,255,0.08)" }}>
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="rgb(165,180,252)">
        <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
      </svg>
    </div>
  );
}

function StarIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
    </svg>
  );
}

function Cursor() {
  return <span className="inline-block w-0.5 h-2.5 ml-0.5 align-middle animate-pulse" style={{ background: "rgb(99,102,241)" }} />;
}

function BlinkCursor() {
  return <span className="inline-block w-0.5 h-3 ml-0.5 align-middle animate-pulse" style={{ background: "rgb(99,102,241)" }} />;
}
