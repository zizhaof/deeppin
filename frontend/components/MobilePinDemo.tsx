"use client";
// components/MobilePinDemo.tsx
// 移动端欢迎页演示 —— 桌面 PinDemo 是 1080×498 固定盒子，在手机上塌缩；
// 这里给一个垂直、单栏、紧凑版本，复用桌面版的 phase + 9 locale 文案。
// 没有右栏 graph —— 关键卖点（Q→pin→sub-thread）放在垂直流里就够了。
//
// Mobile welcome-page demo. Desktop PinDemo is a fixed 1080×498 box that
// can't shrink to phone widths; this is a vertical, single-column,
// compact version. Same phases + same 9-locale copy. No right rail —
// the core story (Q → pin → sub-thread) reads cleanly in the vertical
// chat flow alone.

import { useEffect, useRef, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";

// ── Phase 沿用桌面 ──────────────────────────────────────────────────────
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
  idle: 1800,
  sweep: 1600,
  selpop: 2000,
  dialog: 2400,
  pick: 700,
  "underline-appear": 1300,
  "ai-replying": 2800,
  "unread-breathing": 2400,
  popover: 2800,
  enter: 700,
  "sub-thread": 2600,
  back: 1800,
};

// ── 桌面同款 9 语种 copy（手机文案略简）─────────────────────────────────
// Same 9-locale content as desktop PinDemo; trimmed where helpful.
interface Copy {
  mainQuestion: string;
  anchor: string;
  aiPre: string;
  aiPost: string;
  threadReply: string;
  subTitle: string;
  mainCrumb: string;
  pinLabel: string;
  copyLabel: string;
  enterLabel: string;
  newReplyLabel: string;
  caption: Record<Phase, string>;
}

type Lang = "en" | "zh" | "ja" | "ko" | "es" | "fr" | "de" | "pt" | "ru";

const CONTENT: Record<Lang, Copy> = {
  en: {
    mainQuestion: "What makes Deeppin different?",
    anchor: "pin that detail",
    aiPre: "Two bad options when you want to dig deeper — new chat (lose context) or ask in chat (drift). Deeppin lets you ",
    aiPost: " and keep digging. Main thread? Untouched.",
    threadReply: "Highlight any text → tap Pin. A focused sub-thread opens. Main stays put. Pin again inside. No depth limit.",
    subTitle: "pin that detail",
    mainCrumb: "Main",
    pinLabel: "Pin",
    copyLabel: "Copy",
    enterLabel: "Enter",
    newReplyLabel: "New",
    caption: {
      idle: "Main thread reply.",
      sweep: "Drag across a phrase to select.",
      selpop: "Toolbar appears above the selection.",
      dialog: "Pin opens follow-ups.",
      pick: "Pick one.",
      "underline-appear": "Anchor underline lands.",
      "ai-replying": "Deeppin replies in the sub-thread — main untouched.",
      "unread-breathing": "Back in main, anchor pulses thick until seen.",
      popover: "Tap the underline → Q + A preview.",
      enter: "Tap Enter to open the sub-thread.",
      "sub-thread": "Full sub-thread view.",
      back: "Back to main. Pulse stops — read.",
    },
  },
  zh: {
    mainQuestion: "Deeppin 有什么不一样？",
    anchor: "钉住那个细节",
    aiPre: "想深挖一段 —— 两个烂选择：开新对话（丢上下文）或在原对话里问（话题漂移）。Deeppin 让你直接",
    aiPost: "，追问多深都可以。主线？一个字都不会被打扰。",
    threadReply: "选中任意文字 → 点「插针」。焦点子线程立刻打开，主线不动。子线程里还能再插针，深度不限。",
    subTitle: "钉住那个细节",
    mainCrumb: "主线",
    pinLabel: "插针",
    copyLabel: "复制",
    enterLabel: "进入",
    newReplyLabel: "新",
    caption: {
      idle: "主线 AI 回复。",
      sweep: "拖选一段文字。",
      selpop: "选区上方弹出小工具栏。",
      dialog: "「插针」打开追问选项。",
      pick: "选一个。",
      "underline-appear": "锚点下划线落地。",
      "ai-replying": "Deeppin 在子线程里回答，主线不动。",
      "unread-breathing": "回主线，锚点粗线，直到读过。",
      popover: "点下划线 → 弹出 Q + A 预览。",
      enter: "点「进入」跳进子线程。",
      "sub-thread": "完整子线程视图。",
      back: "回主线，粗线变细，已读。",
    },
  },
  ja: {
    mainQuestion: "Deeppin は何が違う？",
    anchor: "そこをピン留め",
    aiPre: "深掘りしたい時、二つの嫌な選択肢 —— 新しいチャット（文脈喪失）か、同じチャット（脱線）。Deeppin なら",
    aiPost: "して、好きなだけ掘れる。メインは一言も乱されない。",
    threadReply: "テキストを選び「ピン」をタップ。サブスレッドが開く。メインはそのまま。中でさらにピン可能、深さ制限なし。",
    subTitle: "そこをピン留め",
    mainCrumb: "メイン",
    pinLabel: "ピン",
    copyLabel: "コピー",
    enterLabel: "開く",
    newReplyLabel: "新着",
    caption: {
      idle: "メインの返答。",
      sweep: "フレーズをドラッグして選択。",
      selpop: "選択範囲上にツールバー。",
      dialog: "ピンでフォローアップを表示。",
      pick: "一つ選ぶ。",
      "underline-appear": "アンカー下線が表示。",
      "ai-replying": "Deeppin がサブスレッドで応答。",
      "unread-breathing": "メインに戻ると、既読まで太線で点滅。",
      popover: "下線をタップで Q+A プレビュー。",
      enter: "「開く」でサブスレッドへ。",
      "sub-thread": "サブスレッドの全表示。",
      back: "メインに戻ると太線が細くなり既読。",
    },
  },
  ko: {
    mainQuestion: "Deeppin이 무엇이 다른가?",
    anchor: "그 부분을 고정",
    aiPre: "깊게 파고들 때 두 가지 나쁜 선택 —— 새 대화(맥락 잃음) 또는 같은 대화(주제 흐트러짐). Deeppin은",
    aiPost: " 깊이 제한 없이 파고들 수 있다. 메인은 그대로.",
    threadReply: "텍스트 선택 → 핀 탭. 집중 서브 스레드가 열림. 메인은 그대로. 안에서 다시 핀 가능, 깊이 제한 없음.",
    subTitle: "그 부분을 고정",
    mainCrumb: "메인",
    pinLabel: "핀",
    copyLabel: "복사",
    enterLabel: "열기",
    newReplyLabel: "새글",
    caption: {
      idle: "메인 답변.",
      sweep: "구절을 드래그해 선택.",
      selpop: "선택 영역 위에 툴바.",
      dialog: "핀으로 후속 질문 표시.",
      pick: "하나 선택.",
      "underline-appear": "앵커 밑줄 표시.",
      "ai-replying": "Deeppin이 서브 스레드에서 답변.",
      "unread-breathing": "메인에서 읽기 전까지 굵은 줄로 깜박임.",
      popover: "밑줄 탭 → Q+A 미리보기.",
      enter: "열기로 서브 스레드 진입.",
      "sub-thread": "서브 스레드 전체 뷰.",
      back: "메인 복귀, 굵은 줄이 가는 줄로 — 읽음.",
    },
  },
  es: {
    mainQuestion: "¿Qué hace diferente a Deeppin?",
    anchor: "ancla ese detalle",
    aiPre: "Dos malas opciones para profundizar — chat nuevo (pierdes contexto) o mismo chat (deriva). Deeppin te deja",
    aiPost: " y seguir cavando, sin límite de profundidad. ¿El hilo principal? Intacto.",
    threadReply: "Selecciona texto → toca Anclar. Sub-hilo enfocado. Principal intacto. Anclar dentro de sub-preguntas, sin límite.",
    subTitle: "ancla ese detalle",
    mainCrumb: "Principal",
    pinLabel: "Anclar",
    copyLabel: "Copiar",
    enterLabel: "Abrir",
    newReplyLabel: "Nuevo",
    caption: {
      idle: "Respuesta principal.",
      sweep: "Arrastra para seleccionar.",
      selpop: "Barra sobre la selección.",
      dialog: "Anclar abre seguimientos.",
      pick: "Elige una.",
      "underline-appear": "Subrayado del ancla.",
      "ai-replying": "Deeppin responde en el sub-hilo.",
      "unread-breathing": "El ancla pulsa en grueso hasta verlo.",
      popover: "Toca el subrayado → vista Q+A.",
      enter: "Abrir lleva al sub-hilo.",
      "sub-thread": "Vista completa del sub-hilo.",
      back: "De vuelta al principal, fino — leído.",
    },
  },
  fr: {
    mainQuestion: "Qu'est-ce qui rend Deeppin différent ?",
    anchor: "épingle ce détail",
    aiPre: "Deux mauvais choix pour creuser — nouveau chat (perte de contexte) ou même chat (dérive). Deeppin te laisse",
    aiPost: " et continuer à creuser sans limite. Le fil principal ? Intact.",
    threadReply: "Sélectionne du texte → touche Épingler. Un sous-fil ciblé s'ouvre. Le principal reste. Épingler dedans, sans limite.",
    subTitle: "épingle ce détail",
    mainCrumb: "Principal",
    pinLabel: "Épingler",
    copyLabel: "Copier",
    enterLabel: "Ouvrir",
    newReplyLabel: "Nouveau",
    caption: {
      idle: "Réponse du fil principal.",
      sweep: "Glisse pour sélectionner.",
      selpop: "Barre au-dessus de la sélection.",
      dialog: "Épingler ouvre les suivis.",
      pick: "Choisis-en un.",
      "underline-appear": "Soulignement de l'ancre.",
      "ai-replying": "Deeppin répond dans le sous-fil.",
      "unread-breathing": "L'ancre pulse en gras jusqu'à lecture.",
      popover: "Touche le soulignement → aperçu Q+A.",
      enter: "Ouvrir pour entrer dans le sous-fil.",
      "sub-thread": "Vue complète du sous-fil.",
      back: "Retour au principal — fin, lu.",
    },
  },
  de: {
    mainQuestion: "Was macht Deeppin anders?",
    anchor: "Pin dieses Detail",
    aiPre: "Zwei schlechte Optionen — neuer Chat (Kontext weg) oder gleicher Chat (Abdriften). Deeppin lässt dich",
    aiPost: " und beliebig tief weitergraben. Der Haupt-Thread? Unberührt.",
    threadReply: "Text markieren → Anheften tippen. Fokussierter Sub-Thread öffnet. Haupt bleibt. Innerhalb wieder anheften, ohne Tiefenlimit.",
    subTitle: "Pin dieses Detail",
    mainCrumb: "Haupt",
    pinLabel: "Anheften",
    copyLabel: "Kopieren",
    enterLabel: "Öffnen",
    newReplyLabel: "Neu",
    caption: {
      idle: "Haupt-Thread-Antwort.",
      sweep: "Ziehe zum Markieren.",
      selpop: "Toolbar über der Auswahl.",
      dialog: "Anheften öffnet Folgefragen.",
      pick: "Eine wählen.",
      "underline-appear": "Anker-Unterstreichung erscheint.",
      "ai-replying": "Deeppin antwortet im Sub-Thread.",
      "unread-breathing": "Anker pulsiert dick bis gelesen.",
      popover: "Auf Unterstreichung tippen → Q+A.",
      enter: "Öffnen führt in den Sub-Thread.",
      "sub-thread": "Vollständige Sub-Thread-Ansicht.",
      back: "Zurück zum Haupt — dünn, gelesen.",
    },
  },
  pt: {
    mainQuestion: "O que faz o Deeppin diferente?",
    anchor: "fixe esse detalhe",
    aiPre: "Duas opções ruins — novo chat (perde contexto) ou mesmo chat (desvio). Deeppin permite",
    aiPost: " e continuar cavando, sem limite. O tópico principal? Intacto.",
    threadReply: "Selecione texto → toque Fixar. Sub-tópico focado abre. Principal fica. Fixar dentro, sem limite.",
    subTitle: "fixe esse detalhe",
    mainCrumb: "Principal",
    pinLabel: "Fixar",
    copyLabel: "Copiar",
    enterLabel: "Abrir",
    newReplyLabel: "Novo",
    caption: {
      idle: "Resposta do principal.",
      sweep: "Arraste para selecionar.",
      selpop: "Barra acima da seleção.",
      dialog: "Fixar abre acompanhamentos.",
      pick: "Escolha um.",
      "underline-appear": "Sublinhado da âncora.",
      "ai-replying": "Deeppin responde no sub-tópico.",
      "unread-breathing": "A âncora pulsa em grosso até leitura.",
      popover: "Toque no sublinhado → prévia Q+A.",
      enter: "Abrir leva ao sub-tópico.",
      "sub-thread": "Vista completa do sub-tópico.",
      back: "De volta ao principal — fino, lido.",
    },
  },
  ru: {
    mainQuestion: "Чем Deeppin отличается?",
    anchor: "закрепите эту деталь",
    aiPre: "Два плохих варианта — новый чат (теряете контекст) или тот же (тема уходит). Deeppin позволяет",
    aiPost: " и копать сколько угодно глубоко. Основная ветка? Не тронута.",
    threadReply: "Выделите текст → коснитесь Закрепить. Сфокусированная подветка. Основная остаётся. Можно закреплять внутри, без ограничений.",
    subTitle: "закрепите эту деталь",
    mainCrumb: "Главная",
    pinLabel: "Закрепить",
    copyLabel: "Копировать",
    enterLabel: "Открыть",
    newReplyLabel: "Новое",
    caption: {
      idle: "Ответ в главной ветке.",
      sweep: "Проведите для выделения.",
      selpop: "Панель над выделением.",
      dialog: "Закрепить открывает подсказки.",
      pick: "Выберите одну.",
      "underline-appear": "Подчёркивание якоря.",
      "ai-replying": "Deeppin отвечает в подветке.",
      "unread-breathing": "Якорь пульсирует жирно до прочтения.",
      popover: "Коснитесь подчёркивания → Q+A.",
      enter: "Открыть — войти в подветку.",
      "sub-thread": "Полный вид подветки.",
      back: "Назад в главную — тонко, прочитано.",
    },
  },
};

export default function MobilePinDemo() {
  const lang = useLangStore((s) => s.lang) as Lang;
  const c = CONTENT[lang] ?? CONTENT.en;

  const [phase, setPhase] = useState<Phase>("idle");
  const [sweepPct, setSweepPct] = useState(0);
  const [streamLen, setStreamLen] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPhase(NEXT[phase]), DELAYS[phase]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase]);

  useEffect(() => {
    if (phase !== "sweep") {
      setSweepPct(phase === "idle" ? 0 : 1);
      return;
    }
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const pct = Math.min(1, (ts - start) / 1100);
      setSweepPct(pct);
      if (pct < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]);

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
      if (i < total) timerRef.current = setTimeout(tick, 28);
    };
    tick();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, c.threadReply]);

  const showSelpop = phase === "selpop";
  const showDialog = phase === "dialog" || phase === "pick";
  const anchorVisible = ["underline-appear", "ai-replying", "unread-breathing", "popover", "enter", "sub-thread", "back"].includes(phase);
  const breathing = phase === "unread-breathing" || phase === "popover";
  const showPopover = phase === "popover" || phase === "enter";
  const inSub = phase === "ai-replying" || phase === "sub-thread" || phase === "enter";
  const showNewReplyTag = phase === "popover" || phase === "enter";

  const TOTAL_H = 38 + 360 + 36; // chrome + body + caption (固定)

  return (
    <div className="w-full select-none" style={{ maxWidth: 380 }}>
      <div
        className="relative rounded-2xl overflow-hidden mx-auto"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          height: TOTAL_H,
          boxShadow: "0 12px 32px rgba(27,26,23,0.10)",
        }}
      >
        {/* Mac chrome */}
        <div className="h-[38px] px-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--rule)" }}>
          <div className="flex gap-1.5">
            {["#ff5f57", "#ffbd2e", "#28c840"].map((col) => (
              <span key={col} className="w-2 h-2 rounded-full" style={{ background: col, opacity: 0.85 }} />
            ))}
          </div>
          <span className="font-mono text-[10px] ml-1" style={{ color: "var(--ink-4)" }}>
            deeppin
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--ink-4)" }}>
            demo
          </span>
        </div>

        {/* Body — main view + sub view stacked, opacity crossfade */}
        <div className="relative" style={{ height: 360, background: "var(--paper)" }}>
          <div className={`absolute inset-0 transition-opacity duration-200 ${inSub ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            <MainView
              c={c}
              sweepPct={sweepPct}
              anchorVisible={anchorVisible}
              breathing={breathing}
              showSelpop={showSelpop}
              showPopover={showPopover}
              showNewReplyTag={showNewReplyTag}
              phase={phase}
            />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-200 ${inSub ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <SubView c={c} streamLen={streamLen} phase={phase} />
          </div>

          {showDialog && <Dialog c={c} picked={phase === "pick"} />}
        </div>

        {/* Caption */}
        <div
          className="h-[36px] px-3 flex items-center font-mono text-[10.5px] leading-snug"
          style={{ borderTop: "1px solid var(--rule)", background: "var(--paper-2)", color: "var(--ink-3)" }}
        >
          <span className="truncate">{c.caption[phase]}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────
function MainView({
  c, sweepPct, anchorVisible, breathing, showSelpop, showPopover, showNewReplyTag, phase,
}: {
  c: Copy;
  sweepPct: number;
  anchorVisible: boolean;
  breathing: boolean;
  showSelpop: boolean;
  showPopover: boolean;
  showNewReplyTag: boolean;
  phase: Phase;
}) {
  const sweeping = phase === "sweep";
  const bg = sweeping ? `color-mix(in oklch, var(--accent) ${Math.round(sweepPct * 22)}%, transparent)` : undefined;
  const bb = anchorVisible ? `${breathing ? 3 : 1}px solid var(--pig-1)` : sweeping ? "1px solid transparent" : "none";
  return (
    <div className="h-full p-3 overflow-hidden">
      {/* breadcrumb */}
      <div className="flex items-center mb-2.5">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[2px] rounded font-mono text-[10px]"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--paper)" }} />
          {c.mainCrumb}
        </span>
      </div>

      {/* user */}
      <div className="flex flex-col items-end mb-2">
        <div className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--ink-3)" }} />YOU
        </div>
        <div
          className="max-w-[88%] px-3 py-2 text-[12px] leading-[1.5]"
          style={{ background: "var(--accent)", color: "var(--paper)", borderRadius: 12, borderBottomRightRadius: 3 }}
        >
          {c.mainQuestion}
        </div>
      </div>

      {/* AI */}
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--accent)" }} />
          <span style={{ fontFamily: "var(--font-serif)", textTransform: "none", letterSpacing: 0, fontSize: 10, color: "var(--ink-3)" }}>Deeppin</span>
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
          {c.aiPre}
          <span
            className="relative inline-block"
            style={{
              background: bg,
              borderBottom: bb,
              paddingBottom: 1,
              color: "var(--ink)",
              transition: "background 120ms ease-out, border-bottom 220ms ease-out",
            }}
          >
            {c.anchor}
            {showSelpop && (
              <span
                className="absolute left-0 -top-9 z-20 inline-flex items-center gap-[2px] rounded-md shadow-[0_4px_14px_rgba(27,26,23,0.18)]"
                style={{ background: "var(--ink)", color: "var(--paper)", padding: 2 }}
              >
                <span className="px-2 py-1 text-[10px]">{c.copyLabel}</span>
                <span className="px-2 py-1 rounded text-[10px] font-medium" style={{ background: "var(--accent)" }}>
                  {c.pinLabel}
                </span>
                <span aria-hidden className="absolute left-3 -bottom-1 w-1.5 h-1.5 rotate-45" style={{ background: "var(--ink)" }} />
              </span>
            )}
            {showPopover && (
              <span
                className="absolute left-0 top-[calc(100%+4px)] z-20 inline-block rounded-lg overflow-hidden shadow-[0_8px_24px_rgba(27,26,23,0.14)]"
                style={{ background: "var(--card)", border: "1px solid var(--rule)", width: 220 }}
              >
                <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--pig-1)" }} />
                  <span className="flex-1 font-serif text-[12px] truncate" style={{ color: "var(--ink)" }}>
                    {c.subTitle}
                  </span>
                  {showNewReplyTag && (
                    <span className="font-mono text-[8px] uppercase tracking-wider px-1 rounded-sm" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                      {c.newReplyLabel}
                    </span>
                  )}
                </div>
                <div className="px-2.5 py-1.5 text-[10.5px] leading-snug" style={{ borderTop: "1px solid var(--rule-soft)", color: "var(--ink-2)" }}>
                  {c.threadReply.slice(0, 70)}…
                </div>
                <div className="flex items-center justify-end px-2.5 py-1" style={{ borderTop: "1px solid var(--rule-soft)", background: "var(--paper-2)" }}>
                  <span className="font-medium text-[10px]" style={{ color: "var(--accent)" }}>
                    {c.enterLabel} →
                  </span>
                </div>
              </span>
            )}
          </span>
          {c.aiPost}
        </div>
      </div>
    </div>
  );
}

// ── Sub-thread view ─────────────────────────────────────────────────────
function SubView({ c, streamLen, phase }: { c: Copy; streamLen: number; phase: Phase }) {
  const streaming = phase === "sub-thread" && streamLen < c.threadReply.length;
  return (
    <div className="h-full p-3 overflow-hidden">
      <div className="flex items-center gap-1 mb-2.5 font-mono text-[10px]" style={{ color: "var(--ink-3)" }}>
        <span className="px-2 py-[2px] rounded" style={{ color: "var(--ink-3)" }}>
          <span className="inline-block w-[4px] h-[4px] rounded-full mr-1.5 align-middle" style={{ background: "var(--ink-5)" }} />
          {c.mainCrumb}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[2px] rounded"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--pig-1)" }} />
          {c.subTitle.length > 12 ? c.subTitle.slice(0, 12) + "…" : c.subTitle}
        </span>
      </div>

      <div className="flex flex-col items-end mb-2">
        <div className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--ink-3)" }} />YOU
        </div>
        <div
          className="max-w-[80%] px-3 py-2 text-[11.5px] leading-[1.5]"
          style={{ background: "var(--accent)", color: "var(--paper)", borderRadius: 12, borderBottomRightRadius: 3 }}
        >
          {c.mainQuestion}
        </div>
      </div>

      <div className="flex flex-col items-start">
        <div className="flex items-center gap-1.5 mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[4px] h-[4px] rounded-full" style={{ background: "var(--accent)" }} />
          <span style={{ fontFamily: "var(--font-serif)", textTransform: "none", letterSpacing: 0, fontSize: 10, color: "var(--ink-3)" }}>Deeppin</span>
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
          {c.threadReply.slice(0, streamLen)}
          {streaming && (
            <span
              className="inline-block w-[2px] h-3 align-middle ml-[1px]"
              style={{ background: "var(--accent)", animation: "mp-caret 1s steps(2) infinite" }}
            />
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes mp-caret {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Pin dialog ──────────────────────────────────────────────────────────
function Dialog({ c, picked }: { c: Copy; picked: boolean }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center animate-in fade-in-0 duration-150">
      <div className="absolute inset-0" style={{ background: "rgba(27,26,23,0.35)" }} />
      <div
        className="relative w-[88%] max-w-[300px] rounded-xl shadow-[0_12px_36px_rgba(27,26,23,0.18)]"
        style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
      >
        <div className="px-3 pt-3 pb-2 flex items-start gap-2" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
          <span className="w-[3px] h-5 rounded-[1px] flex-shrink-0" style={{ background: "var(--pig-1)" }} />
          <div className="flex-1">
            <div className="font-mono text-[8.5px] uppercase tracking-[0.15em] mb-0.5" style={{ color: "var(--accent)" }}>
              {c.pinLabel}
            </div>
            <div className="font-serif text-[12px] italic leading-tight" style={{ color: "var(--ink-2)" }}>
              “{c.anchor}”
            </div>
          </div>
        </div>
        <div className="px-3 py-2.5 flex flex-col gap-1.5">
          <div
            className="text-left px-2.5 py-1.5 rounded text-[11px] transition-colors"
            style={{
              background: picked ? "var(--accent-soft)" : "var(--paper-2)",
              border: `1px solid ${picked ? "var(--accent)" : "var(--rule-soft)"}`,
              color: picked ? "var(--accent)" : "var(--ink-2)",
            }}
          >
            {c.threadReply.slice(0, 38)}…
          </div>
        </div>
      </div>
    </div>
  );
}
