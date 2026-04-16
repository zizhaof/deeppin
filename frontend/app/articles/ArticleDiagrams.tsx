"use client";
// app/articles/ArticleDiagrams.tsx — SVG diagram components for articles

const C = {
  boxFill:   "rgba(99,102,241,0.08)",
  boxStroke: "rgba(99,102,241,0.28)",
  textHi:    "#e0e7ff",             // indigo-100
  textMid:   "#a5b4fc",             // indigo-300
  textMut:   "rgba(165,180,252,0.45)",
  arrow:     "rgba(129,140,248,0.55)",
  accent:    "#818cf8",             // indigo-400
  warn:      "#fb923c",             // orange-400 — warnings / critical
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
  const BW = 374; const BH = 38; const BX = 20; const CX = BX + BW / 2;
  const NX = BX + BW + 10; // right-side note x

  // 章节标题
  function SecTitle({ y, text }: { y: number; text: string }) {
    return (
      <text x={BX} y={y} fill={C.textMut} fontSize={8} fontWeight={700}
        fontFamily="inherit" letterSpacing="0.12em">
        {text}
      </text>
    );
  }

  // 网络边界（两条虚线 + 中间标签）
  function NetBoundary({ y, label }: { y: number; label: string }) {
    return (
      <g>
        <line x1={BX} y1={y}      x2={BX + BW} y2={y}      stroke={C.boxStroke} strokeWidth={0.75} strokeDasharray="4 3" />
        <text x={CX} y={y + 12}  textAnchor="middle" fill={C.textMut} fontSize={8.5} fontFamily="inherit">{label}</text>
        <line x1={BX} y1={y + 20} x2={BX + BW} y2={y + 20} stroke={C.boxStroke} strokeWidth={0.75} strokeDasharray="4 3" />
      </g>
    );
  }

  // 并发框（橙色）
  function ConcBox({ x, y, w, h, label, sub }: { x: number; y: number; w: number; h: number; label: string; sub: string }) {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={8}
          fill="rgba(251,146,60,0.07)" stroke="rgba(251,146,60,0.3)" strokeWidth={1} />
        <text x={x + w / 2} y={y + h / 2 - 5} textAnchor="middle"
          fill={C.warn} fontSize={11.5} fontWeight={600} fontFamily="inherit">{label}</text>
        <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle"
          fill={C.textMut} fontSize={9} fontFamily="inherit">{sub}</text>
      </g>
    );
  }

  // right-side note
  function Note({ y, text, color }: { y: number; text: string; color?: string }) {
    return (
      <text x={NX} y={y} fill={color ?? C.textMut} fontSize={8.5} fontFamily="inherit">{text}</text>
    );
  }

  // 计算 y 坐标（向下累计）
  // Section 1 ─────────────────────────────────────────────────────────────────
  const t1 = 14;                        // 标题
  const y_input  = t1 + 12;            // 26
  const y_send   = y_input  + BH + 12; // 76
  const y_sse_s  = y_send   + BH + 12; // 126
  const nb1      = y_sse_s  + BH + 10; // 174  网络边界1
  // Section 2 ─────────────────────────────────────────────────────────────────
  const t2       = nb1 + 30;           // 204
  const y_router = t2 + 10;            // 214
  const y_ctx    = y_router + BH + 12; // 264
  const y_gather = y_ctx    + BH + 12; // 314
  const y_llm    = y_gather + BH + 12; // 364
  const y_groq   = y_llm    + BH + 12; // 414
  const nb2      = y_groq   + BH + 10; // 462  网络边界2
  // Section 3 ─────────────────────────────────────────────────────────────────
  const t3        = nb2 + 30;           // 492
  const y_sse_r   = t3 + 10;            // 502
  const y_store   = y_sse_r  + BH + 12; // 552
  const y_list    = y_store  + BH + 12; // 602
  const y_md      = y_list   + BH + 12; // 652
  // Section 4 ─────────────────────────────────────────────────────────────────
  const divider4  = y_md + BH + 18;     // 708
  const t4        = divider4 + 12;      // 720
  const y_fin     = t4 + 10;            // 730
  const y_save    = y_fin  + BH + 12;   // 780
  const y_bg      = y_save + BH + 12;   // 830

  const totalH = y_bg + BH + 16;       // 884

  return (
    <SvgWrap w={560} h={totalH}>

      {/* ── ① SEND PATH · frontend ─────────────────────────────────────── */}
      <SecTitle y={t1} text="① SEND PATH · frontend" />

      <Box x={BX} y={y_input} w={BW} h={BH} accent
        label="InputBar.tsx"
        sub="components/MainThread/InputBar.tsx · onSend(content, display?, ragFilename?)" />
      <Note y={y_input + BH / 2 + 4} text="user input" />
      <ArrowV x={CX} y1={y_input + BH} y2={y_send} />

      <Box x={BX} y={y_send} w={BW} h={BH}
        label="handleSend() — page.tsx"
        sub="app/chat/[sessionId]/page.tsx · addUserMessage() · setStreamStatus()" />
      <Note y={y_send + BH / 2 + 4} text="optimistic UI" />
      <ArrowV x={CX} y1={y_send + BH} y2={y_sse_s} />

      <Box x={BX} y={y_sse_s} w={BW} h={BH}
        label="sendMessageStream() — sse.ts"
        sub="lib/sse.ts · fetch POST · ReadableStream consumer · AbortController" />
      <Note y={y_sse_s + BH / 2 + 4} text="~0 ms" />

      {/* 网络边界 1 */}
      <ArrowV x={CX} y1={y_sse_s + BH} y2={nb1} />
      <NetBoundary y={nb1} label="fetch POST /threads/{id}/chat · Vercel CDN · Nginx reverse proxy (proxy_buffering off)" />
      <ArrowV x={CX} y1={nb1 + 20} y2={y_router} />

      {/* ── ② BACKEND · processing ─────────────────────────────────────── */}
      <SecTitle y={t2} text="② BACKEND · processing" />

      <Box x={BX} y={y_router} w={BW} h={BH}
        label="routers/stream.py — POST /threads/{id}/chat"
        sub="verify_jwt() · create StreamingResponse · launch chat_stream() generator" />
      <Note y={y_router + BH / 2 + 4} text="~1 ms" />
      <ArrowV x={CX} y1={y_router + BH} y2={y_ctx} />

      <Box x={BX} y={y_ctx} w={BW} h={BH}
        label="context_builder.py — build_context()"
        sub="services/context_builder.py · DB reads ×3–8 · ancestor chain · summary cache" />
      <Note y={y_ctx + BH / 2 + 4} text="~10–50 ms" />
      <ArrowV x={CX} y1={y_ctx + BH} y2={y_gather} />

      <ConcBox x={BX} y={y_gather} w={BW} h={BH}
        label="asyncio.gather — RAG retrieval + query detection"
        sub="attachment_processor.py retrieve_rag()  ·  llm_client.py classify_search_intent()" />
      <Note y={y_gather + BH / 2 + 4} text="concurrent" color={C.warn} />
      <ArrowV x={CX} y1={y_gather + BH} y2={y_llm} />

      <Box x={BX} y={y_llm} w={BW} h={BH}
        label="llm_client.py — router.acompletion(stream=True)"
        sub="services/llm_client.py · LiteLLM Router · usage-based routing · 429 auto-fallback" />
      <Note y={y_llm + BH / 2 + 4} text="model select" />
      <ArrowV x={CX} y1={y_llm + BH} y2={y_groq} />

      <Box x={BX} y={y_groq} w={BW} h={BH} accent
        label="Groq API — stream=True"
        sub="first-token latency 50–500 ms · token by token per model / account key" />
      <Note y={y_groq + BH / 2 + 4} text="bottleneck ⚡" color={C.accent} />

      {/* 网络边界 2 */}
      <ArrowV x={CX} y1={y_groq + BH} y2={nb2} />
      <NetBoundary y={nb2} label="SSE events  data: {type, text}  ·  Nginx (no buffer)  ·  browser ReadableStream" />
      <ArrowV x={CX} y1={nb2 + 20} y2={y_sse_r} />

      {/* ── ③ RECEIVE PATH · frontend ──────────────────────────────────── */}
      <SecTitle y={t3} text="③ RECEIVE PATH · frontend" />

      <Box x={BX} y={y_sse_r} w={BW} h={BH}
        label="consumeStream() — sse.ts"
        sub="lib/sse.ts · TextDecoder · parse SSE events · call appendChunk() / finalizeStream()" />
      <Note y={y_sse_r + BH / 2 + 4} text="~5–20 ms/tok" />
      <ArrowV x={CX} y1={y_sse_r + BH} y2={y_store} />

      <Box x={BX} y={y_store} w={BW} h={BH}
        label="appendChunk() — useThreadStore.ts"
        sub="stores/useThreadStore.ts · streamingByThread[threadId] += token · trigger re-render" />
      <Note y={y_store + BH / 2 + 4} text="Zustand" />
      <ArrowV x={CX} y1={y_store + BH} y2={y_list} />

      <Box x={BX} y={y_list} w={BW} h={BH}
        label="MessageList.tsx → MessageBubble.tsx"
        sub="components/MainThread/ · streaming cursor · anchor highlight · onTextSelect for pins" />
      <ArrowV x={CX} y1={y_list + BH} y2={y_md} />

      <Box x={BX} y={y_md} w={BW} h={BH} accent
        label="MarkdownContent.tsx"
        sub="components/MarkdownContent.tsx · react-markdown · remark-gfm · syntax highlight" />
      <Note y={y_md + BH / 2 + 4} text="→ screen ✓" color={C.ok} />

      {/* ── ④ POST-STREAM · parallel persistence ───────────────────────── */}
      <line x1={BX} y1={divider4} x2={BX + BW} y2={divider4}
        stroke={C.grid} strokeWidth={0.75} strokeDasharray="3 3" />
      <SecTitle y={t4} text="④ POST-STREAM · parallel persistence" />

      <Box x={BX} y={y_fin} w={BW} h={BH}
        label="finalizeStream() — useThreadStore.ts"
        sub="clear streamingByThread · push full assistant message · reset status" />
      <ArrowV x={CX} y1={y_fin + BH} y2={y_save} />

      <ConcBox x={BX} y={y_save} w={BW} h={BH}
        label="stream_manager.py — asyncio.gather"
        sub="save_user_message(thread_id)  +  save_assistant_message(thread_id)  →  Supabase" />
      <Note y={y_save + BH / 2 + 4} text="concurrent" color={C.warn} />
      <ArrowV x={CX} y1={y_save + BH} y2={y_bg} />

      <ConcBox x={BX} y={y_bg} w={BW} h={BH}
        label="asyncio.create_task() — background"
        sub="summarizer.py update_summary_cache()  ·  memory_service.py extract_memory()" />
      <Note y={y_bg + BH / 2 + 4} text="non-blocking" color={C.textMut} />

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
