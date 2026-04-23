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

// ── Phase 沿用桌面 + 加入 drawer 演示环 ────────────────────────────────
// "back" 之后引导用户看 graph：右上角按钮呼吸 → 抽屉滑入展示 graph + merge/flatten → 滑出 → idle
// After "back": breathe the topbar right-button as a "tap here" hint, slide
// the right drawer in (graph + merge/flatten), then slide out and loop.
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
  | "back"
  | "tap-overview"
  | "drawer-shown"
  | "drawer-hidden";

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
  back: "tap-overview",
  "tap-overview": "drawer-shown",
  "drawer-shown": "drawer-hidden",
  "drawer-hidden": "idle",
};

const DELAYS: Record<Phase, number> = {
  idle: 1600,
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
  "tap-overview": 1800,
  "drawer-shown": 3600,
  "drawer-hidden": 700,
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
      "tap-overview": "Tap the overview button to see the thread graph.",
      "drawer-shown": "Graph view + Merge / Flatten — overview drawer.",
      "drawer-hidden": "Drawer closes.",
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
      "tap-overview": "点击右上角按钮看线程图。",
      "drawer-shown": "Graph 视图 + Merge / Flatten —— 概览抽屉。",
      "drawer-hidden": "抽屉关闭。",
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
      "tap-overview": "右上のボタンをタップしてスレッドグラフを表示。",
      "drawer-shown": "グラフ表示 + Merge / Flatten — 概要ドロワー。",
      "drawer-hidden": "ドロワーを閉じる。",
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
      "tap-overview": "오른쪽 상단 버튼을 탭해 스레드 그래프 보기.",
      "drawer-shown": "그래프 뷰 + Merge / Flatten — 개요 서랍.",
      "drawer-hidden": "서랍 닫힘.",
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
      "tap-overview": "Toca el botón de overview para ver el grafo.",
      "drawer-shown": "Vista de grafo + Merge / Flatten en el drawer.",
      "drawer-hidden": "El drawer se cierra.",
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
      "tap-overview": "Touche le bouton overview pour voir le graphe.",
      "drawer-shown": "Vue graphe + Merge / Flatten dans le drawer.",
      "drawer-hidden": "Le drawer se ferme.",
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
      "tap-overview": "Tippe auf Overview, um den Thread-Graphen zu sehen.",
      "drawer-shown": "Graph-Ansicht + Merge / Flatten im Drawer.",
      "drawer-hidden": "Drawer schließt.",
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
      "tap-overview": "Toque no botão overview para ver o grafo.",
      "drawer-shown": "Vista de grafo + Merge / Flatten no drawer.",
      "drawer-hidden": "Drawer fecha.",
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
      "tap-overview": "Коснитесь кнопки обзора, чтобы увидеть граф.",
      "drawer-shown": "Граф + Merge / Flatten в выдвижной панели.",
      "drawer-hidden": "Панель закрывается.",
    },
  },
};

export default function MobilePinDemo() {
  const lang = useLangStore((s) => s.lang) as Lang;
  const c = CONTENT[lang] ?? CONTENT.en;

  const [phase, setPhase] = useState<Phase>("idle");
  const [sweepPct, setSweepPct] = useState(0);
  const [streamLen, setStreamLen] = useState(0);
  /** 每个 tap-式 phase 临转换前短暂 true —— 驱动目标按钮上的点击 ripple
   *  Flips true briefly before each tap-phase transitions out; drives the
   *  ripple animation on the button that's "being tapped". */
  const [tapRing, setTapRing] = useState(false);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPhase(NEXT[phase]), DELAYS[phase]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase]);

  // 每次 phase 变：清 ring，如果是 tap 类 phase → delay 到末尾再亮，让
  // 观看者的视线自然从"元素展现"落到"哪里被按下"
  // On each phase change: reset ring; for tap-like phases, fire ring near the
  // tail of the phase so the viewer's eye lands on "where it got tapped"
  // right before the transition plays out.
  useEffect(() => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    setTapRing(false);
    const tapPhases: Partial<Record<Phase, number>> = {
      // 值 = 距离 phase 结束前多少 ms 点亮 ripple（ripple 本身约 650ms）
      // Value = ms-before-phase-end to trigger ripple (ripple lasts ~650ms).
      selpop: 900,        // 点击 Pin 按钮 / tap on Pin chip
      pick: 300,          // 点击 suggestion / tap on suggestion
      popover: 900,       // 点击 Enter / tap on Enter button
      "tap-overview": 700, // 点击 overview / tap on overview button
    };
    const offset = tapPhases[phase];
    if (offset == null) return;
    const fireAt = Math.max(0, DELAYS[phase] - offset);
    tapTimerRef.current = setTimeout(() => setTapRing(true), fireAt);
    return () => { if (tapTimerRef.current) clearTimeout(tapTimerRef.current); };
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

  // Mac chrome (38) + 移动 topbar (40) + body (320) + caption (36) = 434
  // Drops the static mini-graph strip; instead the body now has a real
  // mobile topbar at the top whose right-button breathes during
  // `tap-overview` and the right drawer slides in for `drawer-shown`.
  const TOPBAR_H = 40;
  const BODY_H = 320;
  const TOTAL_H = 38 + TOPBAR_H + BODY_H + 36;
  const showCapNode = anchorVisible;
  const activeNode: "main" | "cap" = inSub ? "cap" : "main";
  const breatheRightBtn = phase === "tap-overview";
  const drawerOpen = phase === "drawer-shown";

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

        {/* 移动端 topbar — 跟真实 MobileChatLayout 一致：hamburger | brand | overview button
            Mobile topbar mirroring the real MobileChatLayout's chrome. The
            right "overview" button breathes during the tap-overview phase. */}
        <div
          className="flex items-center px-2 gap-1"
          style={{ height: TOPBAR_H, borderBottom: "1px solid var(--rule)", background: "var(--paper)" }}
        >
          {/* hamburger */}
          <span className="w-7 h-7 flex items-center justify-center rounded-md" style={{ color: "var(--ink-4)" }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </span>
          <div className="flex-1 flex items-center justify-center gap-1.5">
            <span className="w-4 h-4 rounded-[3px] flex items-center justify-center" style={{ background: "var(--card)", border: "1px solid var(--rule)" }}>
              <svg className="w-2 h-2" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--accent)" }}>
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
              </svg>
            </span>
            <span className="font-serif text-[12px]" style={{ color: "var(--ink)" }}>
              Deeppin
            </span>
          </div>
          {/* overview button — breathing 「tap here」hint at tap-overview phase */}
          <span
            className={`relative w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              breatheRightBtn ? "demo-tap-here" : ""
            } ${phase === "tap-overview" && tapRing ? "demo-tap-press" : ""}`}
            style={{
              color: breatheRightBtn ? "var(--accent)" : "var(--ink-4)",
              background: breatheRightBtn || drawerOpen ? "var(--accent-soft)" : "transparent",
            }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="2"/>
              <circle cx="5" cy="19" r="2"/>
              <circle cx="19" cy="19" r="2"/>
              <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
            </svg>
            {showCapNode && !drawerOpen && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
                aria-hidden
              />
            )}
            {phase === "tap-overview" && tapRing && (
              <span key="tap-ov" className="demo-tap-ripple demo-tap-ripple-sm" aria-hidden />
            )}
          </span>
        </div>

        {/* Body — main view + sub view stacked, opacity crossfade */}
        <div className="relative" style={{ height: BODY_H, background: "var(--paper)" }}>
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
              tapRing={tapRing}
            />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-200 ${inSub ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <SubView c={c} streamLen={streamLen} phase={phase} />
          </div>

          {showDialog && <Dialog c={c} picked={phase === "pick"} tapRing={tapRing && phase === "pick"} />}

          {/* 右抽屉 —— drawer-shown 时滑入；带 graph + Merge/Flatten
              Right drawer that slides in during drawer-shown — mirrors the
              real MobileChatLayout right drawer (graph view + bottom-pinned
              Merge / Flatten). */}
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
            {/* drawer head */}
            <div
              className="flex items-center justify-between px-3 h-9 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--rule)" }}
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: "var(--ink-3)" }}>
                overview
              </span>
              <span className="w-5 h-5 flex items-center justify-center text-[10px]" style={{ color: "var(--ink-4)" }}>×</span>
            </div>
            {/* tabs (graph active) */}
            <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
              <span
                className="flex-1 text-center py-1.5 font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{ color: "var(--ink-4)", borderBottom: "2px solid transparent" }}
              >
                list
              </span>
              <span
                className="flex-1 text-center py-1.5 font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{ color: "var(--ink)", borderBottom: "2px solid var(--ink)" }}
              >
                graph
              </span>
            </div>
            {/* graph body */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-2">
              <MiniGraph
                showCapNode={showCapNode}
                activeNode={activeNode}
                breathing={false}
                capLabel={c.subTitle}
                mainLabel={c.mainCrumb}
                phase={phase}
              />
            </div>
            {/* bottom Merge / Flatten */}
            <div className="px-2 py-2 flex items-center gap-1.5 flex-shrink-0" style={{ borderTop: "1px solid var(--rule)" }}>
              <span
                className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-md text-[10px] font-medium"
                style={{ background: "var(--ink)", color: "var(--paper)" }}
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <path d="M4 4l8 9M20 4l-8 9m0 0v7" />
                </svg>
                Merge
              </span>
              <span
                className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-md text-[10px]"
                style={{ background: "var(--paper-2)", color: "var(--ink-2)", border: "1px solid var(--rule)" }}
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
                Flatten
              </span>
            </div>
          </div>
        </div>

        {/* Caption */}
        <div
          className="h-[36px] px-3 flex items-center font-mono text-[10.5px] leading-snug"
          style={{ borderTop: "1px solid var(--rule)", background: "var(--paper-2)", color: "var(--ink-3)" }}
        >
          <span className="truncate">{c.caption[phase]}</span>
        </div>
      </div>

      <style jsx>{`
        /* "tap here" 呼吸：accent 阴影由小到大循环，像系统 hint
           Tap-here breathe: accent box-shadow ring expands then fades, pulling
           the user's eye to the right-overview button in tap-overview phase. */
        :global(.demo-tap-here) {
          animation: demo-tap-here 1.2s ease-in-out infinite;
        }
        @keyframes demo-tap-here {
          0%, 100% { box-shadow: 0 0 0 0 rgba(42, 42, 114, 0.50); }
          50%      { box-shadow: 0 0 0 8px rgba(42, 42, 114, 0); }
        }

        /* 一次性点击 ripple —— 中心从小环放大 + 淡出，代表"这里被按下"
           One-shot tap ripple: ring grows from center and fades out, marks
           where the user just tapped. */
        :global(.demo-tap-ripple) {
          pointer-events: none;
          position: absolute;
          left: 50%;
          top: 50%;
          width: 36px;
          height: 36px;
          margin-left: -18px;
          margin-top: -18px;
          border-radius: 9999px;
          border: 2px solid var(--accent);
          animation: demo-tap-ripple 640ms ease-out 1 forwards;
          z-index: 40;
        }
        :global(.demo-tap-ripple-sm) {
          width: 26px;
          height: 26px;
          margin-left: -13px;
          margin-top: -13px;
        }
        @keyframes demo-tap-ripple {
          0%   { transform: scale(0.35); opacity: 0.95; }
          60%  { opacity: 0.75; }
          100% { transform: scale(1.55); opacity: 0; }
        }

        /* 按下瞬间：目标元素本体的"被按下"缩压反馈（与 ripple 同步）
           Press-down scale on the tapped element itself (sync with ripple). */
        :global(.demo-tap-press) {
          animation: demo-tap-press 640ms ease-out 1;
        }
        @keyframes demo-tap-press {
          0%   { transform: scale(1); }
          30%  { transform: scale(0.92); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────
function MainView({
  c, sweepPct, anchorVisible, breathing, showSelpop, showPopover, showNewReplyTag, phase, tapRing,
}: {
  c: Copy;
  sweepPct: number;
  anchorVisible: boolean;
  breathing: boolean;
  showSelpop: boolean;
  showPopover: boolean;
  showNewReplyTag: boolean;
  phase: Phase;
  tapRing: boolean;
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
                <span
                  className={`relative px-2 py-1 rounded text-[10px] font-medium ${
                    phase === "selpop" && tapRing ? "demo-tap-press" : ""
                  }`}
                  style={{ background: "var(--accent)" }}
                >
                  {c.pinLabel}
                  {phase === "selpop" && tapRing && (
                    <span key="tap-pin" className="demo-tap-ripple demo-tap-ripple-sm" aria-hidden />
                  )}
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
                  <span
                    className={`relative font-medium text-[10px] inline-flex items-center px-1 rounded ${
                      phase === "popover" && tapRing ? "demo-tap-press" : ""
                    }`}
                    style={{ color: "var(--accent)" }}
                  >
                    {c.enterLabel} →
                    {phase === "popover" && tapRing && (
                      <span key="tap-enter" className="demo-tap-ripple demo-tap-ripple-sm" aria-hidden />
                    )}
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
function Dialog({ c, picked, tapRing }: { c: Copy; picked: boolean; tapRing: boolean }) {
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
            className={`relative text-left px-2.5 py-1.5 rounded text-[11px] transition-colors ${
              tapRing ? "demo-tap-press" : ""
            }`}
            style={{
              background: picked ? "var(--accent-soft)" : "var(--paper-2)",
              border: `1px solid ${picked ? "var(--accent)" : "var(--rule-soft)"}`,
              color: picked ? "var(--accent)" : "var(--ink-2)",
            }}
          >
            {c.threadReply.slice(0, 38)}…
            {tapRing && (
              <span key="tap-pick" className="demo-tap-ripple" aria-hidden />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 横向 mini graph：main 节点 + 可选 sub 节点 + bezier 边 ──────────────
// Horizontal mini graph for the bottom strip of MobilePinDemo: main node
// at left, optional sub node at right (when sub-thread spawns), connected
// with a smooth curve. Active node fills with pigment + breathing pulse.
function MiniGraph({
  showCapNode,
  activeNode,
  breathing,
  capLabel,
  mainLabel,
  phase,
}: {
  showCapNode: boolean;
  activeNode: "main" | "cap";
  breathing: boolean;
  capLabel: string;
  mainLabel: string;
  phase: string;
}) {
  // 视口 240×60 —— 在 30% 和 70% 处放两个圆
  const W = 240, H = 60;
  const mainX = W * 0.18, mainY = H / 2;
  const capX = W * 0.78, capY = H / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      {/* edge */}
      {showCapNode && (
        <path
          d={`M ${mainX} ${mainY} C ${mainX + 30} ${mainY}, ${capX - 30} ${capY}, ${capX} ${capY}`}
          fill="none"
          stroke="var(--rule-strong)"
          strokeWidth={1}
          style={{ opacity: phase === "underline-appear" ? 0 : 1, transition: "opacity 320ms ease" }}
        />
      )}

      {/* main */}
      <g>
        <circle
          cx={mainX}
          cy={mainY}
          r={activeNode === "main" ? 5.5 : 4}
          fill={activeNode === "main" ? "var(--ink)" : "var(--paper-2)"}
          stroke="var(--ink)"
          strokeWidth={activeNode === "main" ? 0 : 1.25}
        />
        <text
          x={mainX + 9}
          y={mainY + 3.5}
          fontSize={9.5}
          style={{ fontFamily: "var(--font-serif)" }}
          fill={activeNode === "main" ? "var(--ink)" : "var(--ink-3)"}
          fontWeight={activeNode === "main" ? 500 : 400}
        >
          {mainLabel}
        </text>
      </g>

      {/* cap (sub-thread) */}
      {showCapNode && (
        <g style={{
          opacity: phase === "underline-appear" ? 0 : 1,
          transform: phase === "underline-appear" ? "translateX(-4px)" : "translateX(0)",
          transition: "opacity 380ms ease, transform 380ms cubic-bezier(0.16, 1, 0.3, 1)",
          transformOrigin: `${capX}px ${capY}px`,
        }}>
          <circle
            cx={capX}
            cy={capY}
            r={activeNode === "cap" ? 5.5 : 4}
            fill={activeNode === "cap" ? "var(--pig-1)" : "var(--paper-2)"}
            stroke="var(--pig-1)"
            strokeWidth={activeNode === "cap" ? 0 : 1.25}
          />
          {breathing && (
            <circle cx={capX + 6} cy={capY - 4} r={3} fill="var(--accent)" stroke="var(--paper)" strokeWidth={1}>
              <animate attributeName="r" values="3;4;3" dur="1.6s" repeatCount="indefinite" />
            </circle>
          )}
          <text
            x={capX + 9}
            y={capY + 3.5}
            fontSize={9.5}
            style={{ fontFamily: "var(--font-serif)" }}
            fill={activeNode === "cap" ? "var(--ink)" : "var(--ink-3)"}
            fontWeight={activeNode === "cap" ? 500 : 400}
          >
            {capLabel.length > 12 ? capLabel.slice(0, 12) + "…" : capLabel}
          </text>
        </g>
      )}
    </svg>
  );
}
