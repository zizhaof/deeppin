"use client";
// app/articles/ArticleDiagrams.tsx — SVG diagram components for articles

const C = {
  boxFill:   "rgba(99,102,241,0.12)",
  boxStroke: "rgba(99,102,241,0.40)",
  textHi:    "#e0e7ff",             // indigo-100
  textMid:   "#c7d2fe",             // indigo-200 — brighter than indigo-300
  textMut:   "rgba(199,210,254,0.70)",  // indigo-200 at 70% — was 45%
  arrow:     "rgba(129,140,248,0.80)",  // was 55%
  accent:    "#818cf8",             // indigo-400
  warn:      "#fb923c",             // orange-400
  ok:        "#6ee7b7",             // emerald-300
  grid:      "rgba(99,102,241,0.08)",
};

/* ─── shared primitives ─────────────────────────────────────────────────── */

function Box({
  x, y, w, h, label, sub, accent = false, warn = false,
}: {
  x: number; y: number; w: number; h: number;
  label: string; sub?: string; accent?: boolean; warn?: boolean;
}) {
  const fill   = warn ? "rgba(251,146,60,0.09)" : accent ? "rgba(99,102,241,0.16)" : C.boxFill;
  const stroke = warn ? "rgba(251,146,60,0.45)" : accent ? C.accent : C.boxStroke;
  const tColor = warn ? C.warn : accent ? C.textHi : C.textMid;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 5 : h / 2 + 4.5)}
        textAnchor="middle" fill={tColor} fontSize={11.5} fontWeight={sub ? 600 : 500} fontFamily="inherit">
        {label}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 11}
          textAnchor="middle" fill={C.textMut} fontSize={9.5} fontFamily="inherit">
          {sub}
        </text>
      )}
    </g>
  );
}

function ArrowV({ x, y1, y2, label }: { x: number; y1: number; y2: number; label?: string }) {
  const my = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2 - 7} stroke={C.arrow} strokeWidth={1.25} />
      <polygon points={`${x - 4},${y2 - 7} ${x + 4},${y2 - 7} ${x},${y2}`} fill={C.arrow} />
      {label && (
        <text x={x + 8} y={my + 4} fill={C.textMut} fontSize={9} fontFamily="inherit">{label}</text>
      )}
    </g>
  );
}

function ArrowH({ x1, x2, y, label }: { x1: number; x2: number; y: number; label?: string }) {
  const mx = (x1 + x2) / 2;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - 7} y2={y} stroke={C.arrow} strokeWidth={1.25} />
      <polygon points={`${x2 - 7},${y - 4} ${x2 - 7},${y + 4} ${x2},${y}`} fill={C.arrow} />
      {label && (
        <text x={mx} y={y - 5} textAnchor="middle" fill={C.textMut} fontSize={9} fontFamily="inherit">{label}</text>
      )}
    </g>
  );
}

function SvgWrap({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w, display: "block" }}
      xmlns="http://www.w3.org/2000/svg" fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace">
      {children}
    </svg>
  );
}

/* ─── SSE Pipeline ───────────────────────────────────────────────────────── */
export function SSEPipelineDiagram() {
  const bw = 290; const bx = 135; const bh = 44; const gap = 62;
  const stages = [
    { label: "Groq API",           sub: "stream=True  ·  token by token" },
    { label: "LiteLLM Router",     sub: "usage-based routing  ·  auto fallback 429" },
    { label: "FastAPI generator",  sub: 'StreamingResponse  ·  yield "data: {...}\\n\\n"' },
    { label: "Nginx",              sub: "proxy_buffering off  ←  critical", warn: true },
    { label: "Browser ReadableStream", sub: "fetch + POST  ·  decoder.decode()" },
    { label: "Zustand store",      sub: "streams[threadId].buffer += token" },
  ];
  const totalH = 30 + stages.length * (bh + gap) - gap + 30;
  return (
    <SvgWrap w={560} h={totalH}>
      {stages.map((s, i) => {
        const y = 20 + i * (bh + gap);
        return (
          <g key={i}>
            <Box x={bx} y={y} w={bw} h={bh} label={s.label} sub={s.sub} warn={s.warn} />
            {i < stages.length - 1 && (
              <ArrowV x={bx + bw / 2} y1={y + bh} y2={y + bh + gap} />
            )}
          </g>
        );
      })}
      {/* final arrow + label */}
      <ArrowV x={bx + bw / 2} y1={20 + stages.length * (bh + gap) - gap + bh} y2={totalH - 12} />
      <text x={bx + bw / 2} y={totalH - 4} textAnchor="middle" fill={C.ok} fontSize={11} fontFamily="inherit">
        token appears on screen
      </text>
    </SvgWrap>
  );
}

/* ─── Thread Tree (between-thread context) ───────────────────────────────── */
export function ThreadTreeDiagram() {
  return (
    <SvgWrap w={640} h={420}>
      {/* ── tree nodes ── */}
      {/* Main thread */}
      <Box x={30} y={20} w={230} h={44} label="Main thread (depth 0)" sub='anchor: "attention mechanism"' />
      <text x={285} y={46} fill={C.textMut} fontSize={9.5} fontFamily="inherit">summary ≤ 150 tok</text>
      <line x1={310} y1={42} x2={590} y2={42} stroke={C.grid} strokeWidth={1} strokeDasharray="3 3" />
      <text x={595} y={46} fill={C.textMut} fontSize={9} fontFamily="inherit">↓</text>

      {/* Arrow + Pin A */}
      <line x1={90} y1={64} x2={90} y2={90} stroke={C.arrow} strokeWidth={1.25} strokeDasharray="0" />
      <line x1={90} y1={90} x2={110} y2={90} stroke={C.arrow} strokeWidth={1.25} />
      <polygon points="106,86 106,94 113,90" fill={C.arrow} />
      <Box x={115} y={70} w={200} h={44} label="Pin A (depth 1)" sub='anchor: "multi-head attention"' />
      <text x={338} y={96} fill={C.textMut} fontSize={9.5} fontFamily="inherit">summary ≤ 300 tok</text>

      {/* Arrow + Pin B */}
      <line x1={165} y1={114} x2={165} y2={140} stroke={C.arrow} strokeWidth={1.25} />
      <line x1={165} y1={140} x2={185} y2={140} stroke={C.arrow} strokeWidth={1.25} />
      <polygon points="181,136 181,144 188,140" fill={C.arrow} />
      <Box x={190} y={120} w={200} h={44} label="Pin B (depth 2)" sub='anchor: "vs CNN receptive field"' />
      <text x={413} y={146} fill={C.textMut} fontSize={9.5} fontFamily="inherit">summary ≤ 800 tok</text>

      {/* Arrow + Pin C (current) */}
      <line x1={240} y1={164} x2={240} y2={190} stroke={C.arrow} strokeWidth={1.25} />
      <line x1={240} y1={190} x2={260} y2={190} stroke={C.arrow} strokeWidth={1.25} />
      <polygon points="256,186 256,194 263,190" fill={C.arrow} />
      <Box x={265} y={170} w={200} h={44} label="Pin C (depth 3)" sub="← user asking here" accent />

      {/* Divider */}
      <line x1={20} y1={240} x2={620} y2={240} stroke={C.boxStroke} strokeWidth={1} strokeDasharray="4 3" />
      <text x={320} y={255} textAnchor="middle" fill={C.textMut} fontSize={9} fontFamily="inherit">
        assembled context  ·  root → parent order
      </text>

      {/* Context blocks */}
      {[
        { label: "[system] Main thread summary",    note: "≤ 150 tokens",  y: 262 },
        { label: "[system] Pin A summary",          note: "≤ 300 tokens",  y: 300 },
        { label: "[system] Pin B summary",          note: "≤ 800 tokens",  y: 338 },
        { label: "[system] Anchor text",            note: "full, no trim", y: 376, accent: true },
      ].map((r) => (
        <g key={r.y}>
          <Box x={20} y={r.y} w={380} h={26} label={r.label} accent={r.accent} />
          <text x={412} y={r.y + 17} fill={C.textMut} fontSize={9.5} fontFamily="inherit">{r.note}</text>
        </g>
      ))}
    </SvgWrap>
  );
}

/* ─── Semantic Chunking ───────────────────────────────────────────────────── */
export function SemanticChunkingDiagram() {
  // 8 sentences
  const sentences = ["s1","s2","s3","s4","s5","s6","s7","s8"];
  const sw = 52; const gap = 8;
  const totalSW = sentences.length * sw + (sentences.length - 1) * gap;
  const startX = (680 - totalSW) / 2;
  // distances (7 values)
  const dists = [0.12, 0.15, 0.44, 0.11, 0.09, 0.42, 0.17];
  const breakpoints = [2, 5]; // indices where dist > 0.3
  const maxBar = 55;

  return (
    <SvgWrap w={680} h={330}>
      {/* Step labels on left */}
      {[
        { y: 44,  label: "① split sentences" },
        { y: 156, label: "② cosine distances" },
        { y: 268, label: "③ merge by boundary" },
      ].map(r => (
        <text key={r.y} x={8} y={r.y} fill={C.textMut} fontSize={9} fontFamily="inherit"
          transform={`rotate(-90, 8, ${r.y})`} textAnchor="middle">
          {r.label}
        </text>
      ))}

      {/* Row 1: sentence boxes */}
      {sentences.map((s, i) => {
        const x = startX + i * (sw + gap);
        return <Box key={i} x={x} y={20} w={sw} h={36} label={s} />;
      })}

      {/* Row 2: distance bars */}
      {dists.map((d, i) => {
        const x1 = startX + i * (sw + gap) + sw / 2;
        const x2 = startX + (i + 1) * (sw + gap) + sw / 2;
        const cx = (x1 + x2) / 2 - 4;
        const barH = Math.round(d * maxBar);
        const isBreak = breakpoints.includes(i);
        const barColor = isBreak ? C.warn : "rgba(129,140,248,0.4)";
        const barStroke = isBreak ? C.warn : C.boxStroke;
        return (
          <g key={i}>
            <rect x={cx} y={100 + (maxBar - barH)} width={8} height={barH}
              rx={2} fill={barColor} stroke={barStroke} strokeWidth={0.5} />
            <text x={cx + 4} y={98} textAnchor="middle" fill={isBreak ? C.warn : C.textMut}
              fontSize={9} fontFamily="inherit">{d.toFixed(2)}</text>
            {isBreak && (
              <text x={cx + 4} y={172} textAnchor="middle" fill={C.warn} fontSize={8.5} fontFamily="inherit">
                boundary
              </text>
            )}
          </g>
        );
      })}
      {/* Row 2 axis label */}
      <text x={startX + totalSW + 12} y={155} fill={C.textMut} fontSize={9} fontFamily="inherit">
        distance
      </text>
      <text x={startX - 8} y={158} textAnchor="end" fill={C.textMut} fontSize={8} fontFamily="inherit">0.5</text>
      <text x={startX - 8} y={100 + maxBar} textAnchor="end" fill={C.textMut} fontSize={8} fontFamily="inherit">0</text>
      <line x1={startX - 4} y1={100} x2={startX - 4} y2={100 + maxBar} stroke={C.boxStroke} strokeWidth={0.75} />

      {/* threshold line */}
      <line x1={startX - 4} y1={100 + maxBar - Math.round(0.3 * maxBar)} x2={startX + totalSW + 10}
        y2={100 + maxBar - Math.round(0.3 * maxBar)}
        stroke={C.warn} strokeWidth={0.75} strokeDasharray="3 3" />
      <text x={startX + totalSW + 12} y={100 + maxBar - Math.round(0.3 * maxBar) + 4}
        fill={C.warn} fontSize={8.5} fontFamily="inherit">threshold 0.3</text>

      {/* Row 3: chunks */}
      {[
        { label: "Chunk A", from: 0, to: 2, color: "rgba(99,102,241,0.18)" },
        { label: "Chunk B", from: 3, to: 5, color: "rgba(129,140,248,0.14)" },
        { label: "Chunk C", from: 6, to: 7, color: "rgba(99,102,241,0.18)" },
      ].map((c) => {
        const x = startX + c.from * (sw + gap);
        const w2 = (c.to - c.from) * (sw + gap) + sw;
        return (
          <g key={c.label}>
            <rect x={x} y={198} width={w2} height={44} rx={8}
              fill={c.color} stroke={C.boxStroke} strokeWidth={1} />
            <text x={x + w2 / 2} y={218} textAnchor="middle" fill={C.textMid}
              fontSize={11.5} fontWeight={600} fontFamily="inherit">{c.label}</text>
            <text x={x + w2 / 2} y={232} textAnchor="middle" fill={C.textMut}
              fontSize={9} fontFamily="inherit">
              {c.label === "Chunk A" ? "s1 + s2 + s3" : c.label === "Chunk B" ? "s4 + s5 + s6" : "s7 + s8"}
            </text>
          </g>
        );
      })}

      {/* Arrows row1 → row2 */}
      {sentences.map((_, i) => {
        const x = startX + i * (sw + gap) + sw / 2;
        return <ArrowV key={i} x={x} y1={56} y2={96} />;
      })}

      {/* Arrows row2 → row3 */}
      {[
        { from: 0, to: 2, cx: startX + 1 * (sw + gap) + sw / 2 },
        { from: 3, to: 5, cx: startX + 4 * (sw + gap) + sw / 2 },
        { from: 6, to: 7, cx: startX + 6.5 * (sw + gap) + sw / 2 },
      ].map((c, i) => (
        <ArrowV key={i} x={c.cx} y1={163} y2={195} />
      ))}

      {/* embed → storage arrow */}
      <line x1={340} y1={242} x2={340} y2={268} stroke={C.arrow} strokeWidth={1.25} />
      <polygon points="336,262 344,262 340,268" fill={C.arrow} />
      <text x={354} y={262} fill={C.textMut} fontSize={9} fontFamily="inherit">embed each chunk</text>
      <Box x={270} y={272} w={140} h={32} label="pgvector storage" accent />
    </SvgWrap>
  );
}

/* ─── Sliding Window ─────────────────────────────────────────────────────── */
export function SlidingWindowDiagram() {
  const totalMsgs = 25;
  const windowSize = 10;
  const outsideCount = totalMsgs - windowSize;

  return (
    <SvgWrap w={640} h={170}>
      {/* full bar background */}
      <rect x={20} y={40} width={600} height={46} rx={8}
        fill="rgba(39,39,42,0.5)" stroke={C.boxStroke} strokeWidth={1} />

      {/* outside window (compressed) */}
      <rect x={20} y={40} width={360} height={46} rx={8}
        fill="rgba(63,63,70,0.6)" stroke={C.boxStroke} strokeWidth={1} />
      <text x={200} y={59} textAnchor="middle" fill={C.textMut} fontSize={10} fontFamily="inherit">
        msg 1 – {outsideCount}  (out of window)
      </text>
      <text x={200} y={74} textAnchor="middle" fill={C.textMut} fontSize={9} fontFamily="inherit">
        compressed → summary prefix
      </text>

      {/* window (kept) */}
      <rect x={380} y={40} width={240} height={46} rx={8}
        fill="rgba(99,102,241,0.14)" stroke={C.accent} strokeWidth={1.25} />
      <text x={500} y={58} textAnchor="middle" fill={C.textMid} fontSize={10.5} fontWeight={600} fontFamily="inherit">
        msg {outsideCount + 1} – {totalMsgs}
      </text>
      <text x={500} y={73} textAnchor="middle" fill={C.textMut} fontSize={9} fontFamily="inherit">
        sliding window  ·  last {windowSize} messages
      </text>

      {/* output boxes */}
      <Box x={20} y={120} w={200} h={34} label="[system] summary prefix" sub="≤ 800 tokens" />
      <Box x={350} y={120} w={200} h={34} label="[user/assistant]" sub={`last ${windowSize} messages`} accent />

      {/* arrows down */}
      <ArrowV x={120} y1={86} y2={118} />
      <ArrowV x={500} y1={86} y2={118} />

      {/* combine arrow */}
      <line x1={220} y1={137} x2={348} y2={137} stroke={C.arrow} strokeWidth={1} strokeDasharray="3 3" />
      <text x={285} y={133} textAnchor="middle" fill={C.textMut} fontSize={8.5} fontFamily="inherit">
        +
      </text>
      <text x={285} y={158} textAnchor="middle" fill={C.ok} fontSize={9.5} fontFamily="inherit">
        sent to LLM
      </text>
    </SvgWrap>
  );
}

/* ─── Two-Phase Truncation ───────────────────────────────────────────────── */
export function TwoPhaseDiagram() {
  return (
    <SvgWrap w={520} h={290}>
      {/* Phase 1 */}
      <text x={20} y={18} fill={C.textMut} fontSize={9.5} fontWeight={600} fontFamily="inherit">
        PHASE 1
      </text>
      <Box x={20} y={22} w={260} h={38} label="single message > 3,000 chars?" />
      {/* yes branch */}
      <ArrowH x1={280} x2={390} y={41} label="yes" />
      <Box x={390} y={22} w={110} h={38} label="→ placeholder" sub="+ RAG inject" warn />
      {/* no branch */}
      <ArrowV x={150} y1={60} y2={82} label="no" />
      <text x={160} y={78} fill={C.textMut} fontSize={9} fontFamily="inherit">keep original</text>

      {/* divider */}
      <line x1={20} y1={100} x2={500} y2={100} stroke={C.grid} strokeWidth={1} strokeDasharray="3 3" />

      {/* Phase 2 */}
      <text x={20} y={122} fill={C.textMut} fontSize={9.5} fontWeight={600} fontFamily="inherit">
        PHASE 2
      </text>
      <Box x={20} y={126} w={260} h={38} label="total chars > 18,000?" />
      {/* yes branch */}
      <ArrowH x1={280} x2={390} y={145} label="yes" />
      <Box x={390} y={126} w={110} h={38} label="drop oldest" sub="user/assistant msg" warn />
      {/* loop arrow */}
      <path d="M 445 164 Q 445 195 390 195 Q 335 195 335 145"
        fill="none" stroke={C.arrow} strokeWidth={1.25} />
      <polygon points="331,141 335,151 339,141" fill={C.arrow} />
      <text x={448} y={190} fill={C.textMut} fontSize={8.5} fontFamily="inherit">repeat</text>

      {/* no branch */}
      <ArrowV x={150} y1={164} y2={186} label="no" />

      {/* system msgs note */}
      <rect x={20} y={200} width={480} height={36} rx={6}
        fill="rgba(110,231,183,0.07)" stroke="rgba(110,231,183,0.25)" strokeWidth={1} />
      <text x={260} y={216} textAnchor="middle" fill="rgba(110,231,183,0.8)" fontSize={10} fontFamily="inherit">
        system messages are never dropped
      </text>
      <text x={260} y={229} textAnchor="middle" fill={C.textMut} fontSize={9} fontFamily="inherit">
        (summaries, anchors, RAG — the structural skeleton)
      </text>

      <text x={260} y={275} textAnchor="middle" fill={C.ok} fontSize={10} fontFamily="inherit">
        send to LLM
      </text>
      <ArrowV x={260} y1={238} y2={268} />
    </SvgWrap>
  );
}

/* ─── Write-Time Summary ─────────────────────────────────────────────────── */
export function WriteTimeSummaryDiagram() {
  return (
    <SvgWrap w={620} h={300}>
      {/* ── write path (left) ── */}
      <text x={140} y={16} textAnchor="middle" fill={C.textMid} fontSize={10} fontWeight={600} fontFamily="inherit">
        write path
      </text>
      <Box x={30} y={22} w={220} h={38} label="AI reply stream done" />
      <ArrowV x={140} y1={60} y2={80} />
      <Box x={30} y={82} w={220} h={38} label="save_assistant_message()" sub="synchronous DB write" accent />
      <ArrowV x={140} y1={120} y2={140} />
      <Box x={30} y={142} w={220} h={38} label="asyncio.create_task()" sub="non-blocking, returns immediately" />
      <ArrowV x={140} y1={180} y2={200} />
      <Box x={30} y={202} w={220} h={38} label="update_summary_cache()" sub="background task" />
      <ArrowV x={140} y1={240} y2={258} />
      <Box x={30} y={260} w={220} h={30} label="DB: thread_summaries ✓" accent />

      {/* ── read path (right) ── */}
      <text x={470} y={16} textAnchor="middle" fill={C.textMid} fontSize={10} fontWeight={600} fontFamily="inherit">
        read path (next request)
      </text>
      <Box x={360} y={22} w={230} h={38} label="build_context() needs summary" />
      <ArrowV x={475} y1={60} y2={80} />

      {/* decision */}
      <rect x={370} y={82} width={210} height={38} rx={8}
        fill={C.boxFill} stroke={C.boxStroke} strokeWidth={1} />
      <text x={475} y={104} textAnchor="middle" fill={C.textMid} fontSize={11} fontFamily="inherit">
        cache hit?
      </text>

      {/* yes → fast */}
      <ArrowH x1={580} x2={615} y={101} label="yes" />
      <text x={616} y={100} fill={C.ok} fontSize={9.5} fontFamily="inherit">0ms ✓</text>

      {/* no → slow */}
      <ArrowV x={475} y1={120} y2={140} label="no" />
      <Box x={360} y={142} w={230} h={38} label="compute now (LLM call)" sub="+200–500ms latency" warn />
      <ArrowV x={475} y1={180} y2={200} />
      <Box x={360} y={202} w={230} h={38} label="cache async for next time" />

      {/* vertical divider */}
      <line x1={310} y1={10} x2={310} y2={290} stroke={C.grid} strokeWidth={1} strokeDasharray="4 3" />
    </SvgWrap>
  );
}

/* ─── Message Data Path ──────────────────────────────────────────────────── */
export function MessageDataPathDiagram() {
  const stages = [
    { label: "Frontend",     sub: "optimistic update · create AbortController",       time: "~0 ms",        parallel: false },
    { label: "Network",      sub: "Browser → Vercel → Nginx → FastAPI",               time: "~50–150 ms",   parallel: false },
    { label: "Backend",      sub: "verify JWT · create StreamingResponse",             time: "~1 ms",        parallel: false },
    { label: "build_context",sub: "DB ×3-8 reads  ·  summary cache lookup",           time: "~10–50 ms",    parallel: false },
    { label: "RAG + detection", sub: "pgvector ×2  +  rules/LLM classifier  (concurrent)", time: "~50–200 ms", parallel: true },
    { label: "LLM call",     sub: "LiteLLM → Groq  ·  stream=True",                   time: "50–500 ms",    parallel: false, accent: true },
    { label: "Stream",       sub: "token-by-token  ·  5–20 ms each",                  time: "variable",     parallel: false, accent: true },
    { label: "Persist + bg", sub: "DB ×2 writes  +  async summary/memory tasks",      time: "~10–30 ms",    parallel: true },
  ];

  const bh = 40; const vgap = 14; const bw = 370; const bx = 20;
  const totalH = 24 + stages.length * (bh + vgap);

  return (
    <SvgWrap w={580} h={totalH}>
      {stages.map((s, i) => {
        const y = 20 + i * (bh + vgap);
        const cx = bx + bw / 2;
        return (
          <g key={i}>
            {s.parallel ? (
              <>
                <rect x={bx} y={y} width={bw} height={bh} rx={8}
                  fill="rgba(251,146,60,0.07)" stroke="rgba(251,146,60,0.3)" strokeWidth={1} />
                <text x={cx} y={y + bh / 2 - 5} textAnchor="middle"
                  fill={C.warn} fontSize={11.5} fontWeight={600} fontFamily="inherit">{s.label}</text>
                <text x={cx} y={y + bh / 2 + 11} textAnchor="middle"
                  fill={C.textMut} fontSize={9} fontFamily="inherit">{s.sub}</text>
              </>
            ) : (
              <Box x={bx} y={y} w={bw} h={bh} label={s.label} sub={s.sub} accent={s.accent} />
            )}
            {/* time label */}
            <text x={bx + bw + 10} y={y + bh / 2 + 4} fill={s.accent ? C.accent : C.textMut}
              fontSize={9.5} fontFamily="inherit">{s.time}</text>
            {/* connector */}
            {i < stages.length - 1 && (
              <ArrowV x={cx} y1={y + bh} y2={y + bh + vgap} />
            )}
          </g>
        );
      })}
      {/* legend */}
      <rect x={420} y={20} width={140} height={52} rx={6}
        fill="rgba(15,15,20,0.4)" stroke={C.boxStroke} strokeWidth={0.75} />
      <rect x={430} y={30} width={12} height={10} rx={2}
        fill="rgba(99,102,241,0.16)" stroke={C.accent} strokeWidth={1} />
      <text x={447} y={40} fill={C.textMut} fontSize={8.5} fontFamily="inherit">sequential</text>
      <rect x={430} y={48} width={12} height={10} rx={2}
        fill="rgba(251,146,60,0.07)" stroke="rgba(251,146,60,0.3)" strokeWidth={1} />
      <text x={447} y={58} fill={C.textMut} fontSize={8.5} fontFamily="inherit">concurrent</text>
    </SvgWrap>
  );
}

/* ─── Component Chain ────────────────────────────────────────────────────── */
export function ComponentChainDiagram() {
  const BH = 36;
  // Three columns
  const C1x = 17,  C1w = 158, C1cx = 96;   // Frontend
  const C2x = 221, C2w = 158, C2cx = 300;  // Backend
  const C3x = 425, C3w = 158, C3cx = 504;  // AI / Storage

  // Node Y positions
  const y0 = 28;   // Input Bar            (C1)
  const y1 = 98;   // Chat Orchestrator (C1), API Router (C2)
  const y2 = 178;  // Context Builder (C2), RAG Retriever (C3)
  const y3 = 258;  // Search Classifier    (C3)
  const y4 = 338;  // LLM Router           (C2)
  const y5 = 413;  // Groq API (C2), SSE Client (C1), Persistence Layer (C3)
  const y6 = 488;  // State Store (C1), Summary Cache (C3)
  const y7 = 558;  // Message Renderer     (C1)

  // Vertical centers
  const cy1 = y1 + BH / 2;  // 116
  const cy2 = y2 + BH / 2;  // 196
  const cy3 = y3 + BH / 2;  // 276
  const cy4 = y4 + BH / 2;  // 356
  const cy5 = y5 + BH / 2;  // 431

  const H = y7 + BH + 20;   // 614

  // Arrow primitive helpers
  function lpath(d: string) {
    return <path d={d} stroke={C.arrow} strokeWidth={1.25} fill="none" />;
  }
  function tipDown(x: number, y: number) {
    return <polygon points={`${x - 4},${y - 7} ${x + 4},${y - 7} ${x},${y}`} fill={C.arrow} />;
  }
  function tipRight(x: number, y: number) {
    return <polygon points={`${x - 7},${y - 4} ${x - 7},${y + 4} ${x},${y}`} fill={C.arrow} />;
  }
  function tipLeft(x: number, y: number) {
    return <polygon points={`${x + 7},${y - 4} ${x + 7},${y + 4} ${x},${y}`} fill={C.arrow} />;
  }

  return (
    <SvgWrap w={600} h={H}>

      {/* ── Column headers ───────────────────────────────────────────────── */}
      <text x={C1cx} y={14} textAnchor="middle" fill={C.textMut} fontSize={8.5} fontWeight={700} fontFamily="inherit" letterSpacing="0.1em">FRONTEND</text>
      <text x={C2cx} y={14} textAnchor="middle" fill={C.textMut} fontSize={8.5} fontWeight={700} fontFamily="inherit" letterSpacing="0.1em">BACKEND</text>
      <text x={C3cx} y={14} textAnchor="middle" fill={C.textMut} fontSize={8.5} fontWeight={700} fontFamily="inherit" letterSpacing="0.1em">STORAGE</text>
      <line x1={0} y1={19} x2={600} y2={19} stroke={C.grid} strokeWidth={0.75} />

      {/* ── Nodes ───────────────────────────────────────────────────────── */}
      {/* C1 — Frontend (top) + AI Workers (middle) + Stream Handler (bottom) */}
      <Box x={C1x} y={y0} w={C1w} h={BH} accent label="Input Bar"         sub="text + file input" />
      <Box x={C1x} y={y1} w={C1w} h={BH}       label="Chat Orchestrator"  sub="session + stream state" />
      {/* AI Workers section label */}
      <text x={C1cx} y={y2 - 8} textAnchor="middle" fill={C.warn} fontSize={7.5} fontWeight={700} fontFamily="inherit" letterSpacing="0.1em">AI WORKERS</text>
      <Box x={C1x} y={y2} w={C1w} h={BH} warn label="RAG Retriever"      sub="vector similarity" />
      <Box x={C1x} y={y3} w={C1w} h={BH} warn label="Search Classifier"  sub="intent detection" />
      <Box x={C1x} y={y5} w={C1w} h={BH}       label="SSE Client"         sub="stream reader" />
      <Box x={C1x} y={y6} w={C1w} h={BH}       label="State Store"        sub="Zustand thread tree" />
      <Box x={C1x} y={y7} w={C1w} h={BH} accent label="Message Renderer"  sub="Markdown + highlights" />

      {/* C2 — Backend */}
      <Box x={C2x} y={y1} w={C2w} h={BH}       label="API Router"         sub="auth + routing" />
      <Box x={C2x} y={y2} w={C2w} h={BH}       label="Context Builder"    sub="compact + ancestor chain" />
      <Box x={C2x} y={y4} w={C2w} h={BH}       label="LLM Router"         sub="LiteLLM + fallback" />
      <Box x={C2x} y={y5} w={C2w} h={BH} accent label="Groq API"          sub="streaming completion" />

      {/* C3 — Storage */}
      <Box x={C3x} y={y5} w={C3w} h={BH}      label="Persistence Layer"  sub="Supabase messages" />
      <Box x={C3x} y={y6} w={C3w} h={BH}      label="Summary Cache"      sub="compact summaries" />

      {/* ── Arrows ──────────────────────────────────────────────────────── */}

      {/* 1 — Input Bar ↓ Chat Orchestrator */}
      <line x1={C1cx} y1={y0 + BH} x2={C1cx} y2={y1 - 7} stroke={C.arrow} strokeWidth={1.25} />
      {tipDown(C1cx, y1)}

      {/* 2 — Chat Orchestrator → API Router  (→ right, HTTP POST) */}
      <line x1={C1x + C1w} y1={cy1} x2={C2x - 7} y2={cy1} stroke={C.arrow} strokeWidth={1.25} />
      {tipRight(C2x, cy1)}
      <text x={(C1x + C1w + C2x) / 2} y={cy1 - 5} textAnchor="middle" fill={C.textMut} fontSize={8.5} fontFamily="inherit">HTTP POST</text>

      {/* 3 — API Router ↓ Context Builder */}
      <line x1={C2cx} y1={y1 + BH} x2={C2cx} y2={y2 - 7} stroke={C.arrow} strokeWidth={1.25} />
      {tipDown(C2cx, y2)}

      {/* 4 — Context Builder → RAG Retriever  (← left at cy2) */}
      <line x1={C2x} y1={cy2} x2={C1x + C1w + 7} y2={cy2} stroke={C.arrow} strokeWidth={1.25} />
      {tipLeft(C1x + C1w, cy2)}

      {/* 5 — Context Builder → Search Classifier  (exit C2 left then ↓ then ←) */}
      {lpath(`M ${C2x} ${cy2 + 10} L 207 ${cy2 + 10} L 207 ${cy3} L ${C1x + C1w + 7} ${cy3}`)}
      {tipLeft(C1x + C1w, cy3)}

      {/* "parallel" label between RAG and Search (in C1) */}
      <text x={C1cx} y={(cy2 + cy3) / 2 + 4} textAnchor="middle" fill={C.warn} fontSize={8} fontFamily="inherit" letterSpacing="0.05em">parallel</text>

      {/* 6 — RAG Retriever → LLM Router  (exit C1 right then ↓ then → into C2) */}
      {lpath(`M ${C1x + C1w} ${cy2 + 8} L 190 ${cy2 + 8} L 190 ${cy4 - 3} L ${C2x - 7} ${cy4 - 3}`)}
      {tipRight(C2x, cy4 - 3)}

      {/* 7 — Search Classifier → LLM Router  (exit C1 right then ↓ then → into C2) */}
      {lpath(`M ${C1x + C1w} ${cy3 + 8} L 196 ${cy3 + 8} L 196 ${cy4 + 3} L ${C2x - 7} ${cy4 + 3}`)}
      {tipRight(C2x, cy4 + 3)}

      {/* 8 — LLM Router ↓ Groq API */}
      <line x1={C2cx} y1={y4 + BH} x2={C2cx} y2={y5 - 7} stroke={C.arrow} strokeWidth={1.25} />
      {tipDown(C2cx, y5)}

      {/* 9 — Groq API ← SSE Client  (← left, SSE stream) */}
      <line x1={C2x} y1={cy5} x2={C1x + C1w + 7} y2={cy5} stroke={C.arrow} strokeWidth={1.25} />
      {tipLeft(C1x + C1w, cy5)}
      <text x={(C2x + C1x + C1w) / 2} y={cy5 - 5} textAnchor="middle" fill={C.accent} fontSize={8.5} fontFamily="inherit">SSE stream</text>

      {/* 10 — Groq API → Persistence Layer  (→ right, write) */}
      <line x1={C2x + C2w} y1={cy5} x2={C3x - 7} y2={cy5} stroke={C.arrow} strokeWidth={1.25} />
      {tipRight(C3x, cy5)}
      <text x={(C2x + C2w + C3x) / 2} y={cy5 - 5} textAnchor="middle" fill={C.warn} fontSize={8} fontFamily="inherit">write</text>

      {/* 11 — SSE Client ↓ State Store */}
      <line x1={C1cx} y1={y5 + BH} x2={C1cx} y2={y6 - 7} stroke={C.arrow} strokeWidth={1.25} />
      {tipDown(C1cx, y6)}

      {/* 12 — State Store ↓ Message Renderer */}
      <line x1={C1cx} y1={y6 + BH} x2={C1cx} y2={y7 - 7} stroke={C.arrow} strokeWidth={1.25} />
      {tipDown(C1cx, y7)}

      {/* 13 — Persistence Layer ↓ Summary Cache  (write) */}
      <line x1={C3cx} y1={y5 + BH} x2={C3cx} y2={y6 - 7} stroke={C.arrow} strokeWidth={1.25} />
      {tipDown(C3cx, y6)}
      <text x={C3cx + 8} y={(y5 + BH + y6) / 2 + 4} fill={C.warn} fontSize={8} fontFamily="inherit">write</text>

      {/* 14 — Summary Cache → Context Builder  (dashed read, routing around right edge) */}
      <path
        d={`M ${C3x + C3w} ${y6 + BH / 2} L 592 ${y6 + BH / 2} L 592 168 L 386 168 L 386 ${cy2}`}
        stroke={C.arrow} strokeWidth={1} fill="none" strokeDasharray="5 3"
      />
      {tipLeft(C2x + C2w, cy2)}
      <text x={489} y={162} textAnchor="middle" fill={C.accent} fontSize={8} fontFamily="inherit">read (history + summary)</text>

    </SvgWrap>
  );
}

/* ─── registry ───────────────────────────────────────────────────────────── */
export const DIAGRAMS: Record<string, React.ComponentType> = {
  "sse-pipeline":       SSEPipelineDiagram,
  "thread-tree":        ThreadTreeDiagram,
  "semantic-chunking":  SemanticChunkingDiagram,
  "sliding-window":     SlidingWindowDiagram,
  "two-phase":          TwoPhaseDiagram,
  "write-time-summary": WriteTimeSummaryDiagram,
  "message-datapath":   MessageDataPathDiagram,
  "component-chain":    ComponentChainDiagram,
};
