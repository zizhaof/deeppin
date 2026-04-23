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
// 整个 demo 循环：从新对话开始 → 插 2 次针 → 打开 overview 看 3 节点
// Full loop: new conversation → pin twice → open overview to reveal a
// 3-node graph (main + 2 subs).
type Phase =
  // —— 开场：新对话 ———————————————————————————————————————————————
  | "blank"            // 空对话（只有 breadcrumb）
  | "ai-stream"        // 用户气泡 + AI 流式主线回复
  // —— 第一次插针 ———————————————————————————————————————————————
  | "tap-select-1"
  | "sweep-1"
  | "selpop-1"
  | "dialog-1"
  | "pick-1"
  | "underline-1"
  | "ai-replying-1"    // 切到子线程视图，AI 回复
  | "back-1"           // 回主线，anchor 1 breathing
  // —— 第二次插针 ———————————————————————————————————————————————
  | "tap-select-2"
  | "sweep-2"
  | "selpop-2"
  | "dialog-2"
  | "pick-2"
  | "underline-2"
  | "ai-replying-2"
  | "back-both"        // 回主线，anchor 1 + 2 都 breathing
  // —— 打开概览：3 节点 graph ———————————————————————————————————
  | "tap-overview"
  | "drawer-shown"
  | "drawer-hidden";

const NEXT: Record<Phase, Phase> = {
  blank: "ai-stream",
  "ai-stream": "tap-select-1",
  "tap-select-1": "sweep-1",
  "sweep-1": "selpop-1",
  "selpop-1": "dialog-1",
  "dialog-1": "pick-1",
  "pick-1": "underline-1",
  "underline-1": "ai-replying-1",
  "ai-replying-1": "back-1",
  "back-1": "tap-select-2",
  "tap-select-2": "sweep-2",
  "sweep-2": "selpop-2",
  "selpop-2": "dialog-2",
  "dialog-2": "pick-2",
  "pick-2": "underline-2",
  "underline-2": "ai-replying-2",
  "ai-replying-2": "back-both",
  "back-both": "tap-overview",
  "tap-overview": "drawer-shown",
  "drawer-shown": "drawer-hidden",
  "drawer-hidden": "blank",
};

// 节奏原则：任何带新解释文字（caption）的阶段至少停留 5s，让用户看得完读得懂；
// 纯过渡（selpop / pick / underline-appear 这种 half-second transient）短一点。
// Pacing: any phase whose caption introduces new guidance text holds for ≥5s;
// pure transitions (selpop appear, suggestion pick, underline drop) stay short.
const DELAYS: Record<Phase, number> = {
  blank: 2500,
  "ai-stream": 5000,
  "tap-select-1": 5000,
  "sweep-1": 5000,
  "selpop-1": 2600,
  "dialog-1": 5000,
  "pick-1": 1500,
  "underline-1": 2400,
  "ai-replying-1": 5000,
  "back-1": 5000,
  "tap-select-2": 5000,
  "sweep-2": 5000,
  "selpop-2": 2600,
  "dialog-2": 5000,
  "pick-2": 1500,
  "underline-2": 2400,
  "ai-replying-2": 5000,
  "back-both": 5000,
  "tap-overview": 5000,
  "drawer-shown": 6500,
  "drawer-hidden": 1200,
};

// ── 桌面同款 9 语种 copy（手机文案略简）─────────────────────────────────
// Same 9-locale content as desktop PinDemo; trimmed where helpful.
interface Copy {
  mainQuestion: string;
  // AI 回复被拆成三段 + 两个锚点：{aiBefore1}{anchor1}{aiBetween}{anchor2}{aiAfter2}
  // AI reply split into three segments + two anchors for the two-pin demo.
  aiBefore1: string;
  anchor1: string;
  aiBetween: string;
  anchor2: string;
  aiAfter2: string;
  // 两条子线程各自的 AI 回复 + 标题
  threadReply1: string;
  threadReply2: string;
  subTitle1: string;
  subTitle2: string;
  mainCrumb: string;
  pinLabel: string;
  copyLabel: string;
  enterLabel: string;
  selectLabel: string;
  newReplyLabel: string;
  caption: Record<Phase, string>;
}

type Lang = "en" | "zh" | "ja" | "ko" | "es" | "fr" | "de" | "pt" | "ru";

// 每个 locale 的 caption 共享一个 helper，抽出共用 key 减少重复
// Captions share a shape across locales; collecting the per-locale strings
// inline here (as opposed to a factory) keeps the translation obvious.

const CONTENT: Record<Lang, Copy> = {
  en: {
    mainQuestion: "What makes Deeppin different?",
    aiBefore1: "Two bad options when you want to dig deeper — new chat (lose context) or ask in chat (drift). Deeppin lets you ",
    anchor1: "pin that detail",
    aiBetween: " and ",
    anchor2: "keep digging",
    aiAfter2: ". Main thread? Untouched.",
    threadReply1: "Pick any text → tap Pin. A focused sub-thread opens. Main stays put.",
    threadReply2: "No depth limit — pin again inside sub-threads, as deep as you need.",
    subTitle1: "pin that detail",
    subTitle2: "keep digging",
    mainCrumb: "Main",
    pinLabel: "Pin",
    copyLabel: "Copy",
    enterLabel: "Enter",
    selectLabel: "Select",
    newReplyLabel: "New",
    caption: {
      blank: "New conversation.",
      "ai-stream": "You ask a question. Deeppin replies in the main thread.",
      "tap-select-1": "Tap Select to arm text selection.",
      "sweep-1": "Drag across a phrase to select it.",
      "selpop-1": "Toolbar appears above the selection.",
      "dialog-1": "Pin opens follow-up questions for that phrase.",
      "pick-1": "Pick one.",
      "underline-1": "Anchor underline lands in the main reply.",
      "ai-replying-1": "Deeppin answers in a focused sub-thread — main untouched.",
      "back-1": "Back on main. Anchor pulses thick until you've seen the reply.",
      "tap-select-2": "Pin a second phrase — tap Select again.",
      "sweep-2": "Drag across another phrase.",
      "selpop-2": "Toolbar above the second selection.",
      "dialog-2": "Pick a follow-up for the second pin.",
      "pick-2": "Pick.",
      "underline-2": "Second anchor lands next to the first.",
      "ai-replying-2": "Second sub-thread replies in parallel.",
      "back-both": "Two live sub-threads, main thread still intact.",
      "tap-overview": "Tap overview to see the whole thread graph.",
      "drawer-shown": "Three nodes — main + two sub-threads. Pin again inside any of them.",
      "drawer-hidden": "Drawer closes.",
    },
  },
  zh: {
    mainQuestion: "Deeppin 有什么不一样？",
    aiBefore1: "想深挖一段 —— 两个烂选择：开新对话（丢上下文）或在原对话里问（话题漂移）。Deeppin 让你直接",
    anchor1: "钉住那个细节",
    aiBetween: "，然后",
    anchor2: "想挖多深挖多深",
    aiAfter2: "。主线？一个字都不会被打扰。",
    threadReply1: "选中文字 → 点「插针」。焦点子线程立刻打开，主线不动。",
    threadReply2: "无限嵌套 —— 子线程里还能再插针，想挖多深挖多深。",
    subTitle1: "钉住那个细节",
    subTitle2: "想挖多深挖多深",
    mainCrumb: "主线",
    pinLabel: "插针",
    copyLabel: "复制",
    enterLabel: "进入",
    selectLabel: "选取",
    newReplyLabel: "新",
    caption: {
      blank: "新对话。",
      "ai-stream": "你提问，Deeppin 在主线回答。",
      "tap-select-1": "先点「选取」开启文字选择。",
      "sweep-1": "拖选一段文字。",
      "selpop-1": "选区上方弹出小工具栏。",
      "dialog-1": "「插针」打开这段文字的追问选项。",
      "pick-1": "选一个。",
      "underline-1": "锚点下划线落在主线回复里。",
      "ai-replying-1": "Deeppin 在子线程里回答，主线不动。",
      "back-1": "回主线，锚点粗线，直到读过为止。",
      "tap-select-2": "再插一根针 —— 再点一次「选取」。",
      "sweep-2": "拖选第二段文字。",
      "selpop-2": "选区上方的工具栏。",
      "dialog-2": "为第二根针选一个追问。",
      "pick-2": "选。",
      "underline-2": "第二条下划线落在第一条旁边。",
      "ai-replying-2": "第二个子线程并行回答。",
      "back-both": "两个子线程同时活着，主线依然完整。",
      "tap-overview": "点右上角概览，看整棵线程图。",
      "drawer-shown": "三个节点 —— 主线 + 两个子线程。每个里面都能再插针。",
      "drawer-hidden": "抽屉关闭。",
    },
  },
  ja: {
    mainQuestion: "Deeppin は何が違う？",
    aiBefore1: "深掘りしたい時、二つの嫌な選択肢 —— 新しいチャット（文脈喪失）か、同じチャット（脱線）。Deeppin なら",
    anchor1: "そこをピン留め",
    aiBetween: "して、",
    anchor2: "好きなだけ掘れる",
    aiAfter2: "。メインは一言も乱されない。",
    threadReply1: "テキストを選び「ピン」をタップ。サブスレッドが開く。メインはそのまま。",
    threadReply2: "深さ制限なし —— サブスレッド内でさらにピン可能。",
    subTitle1: "そこをピン留め",
    subTitle2: "好きなだけ掘れる",
    mainCrumb: "メイン",
    pinLabel: "ピン",
    copyLabel: "コピー",
    enterLabel: "開く",
    selectLabel: "選択",
    newReplyLabel: "新着",
    caption: {
      blank: "新規会話。",
      "ai-stream": "質問するとDeeppinがメインで返答。",
      "tap-select-1": "まず「選択」をタップしてテキスト選択を有効化。",
      "sweep-1": "フレーズをドラッグして選択。",
      "selpop-1": "選択範囲の上にツールバー。",
      "dialog-1": "ピンでそのフレーズのフォローアップ表示。",
      "pick-1": "一つ選ぶ。",
      "underline-1": "アンカー下線がメインに表示。",
      "ai-replying-1": "Deeppin がサブスレッドで返答、メインはそのまま。",
      "back-1": "メインに戻ると、既読まで太線で点滅。",
      "tap-select-2": "二本目のピン —— もう一度「選択」をタップ。",
      "sweep-2": "別のフレーズをドラッグ。",
      "selpop-2": "二つ目の選択にツールバー。",
      "dialog-2": "二本目のフォローアップを選ぶ。",
      "pick-2": "選ぶ。",
      "underline-2": "二つ目の下線が一つ目の隣に。",
      "ai-replying-2": "二つ目のサブスレッドが並行して返答。",
      "back-both": "二本のサブスレッドが同時進行、メインは無傷。",
      "tap-overview": "右上の概要をタップしてスレッドグラフを表示。",
      "drawer-shown": "三つのノード —— メイン + 二つのサブ。各内部でさらにピン可能。",
      "drawer-hidden": "ドロワーを閉じる。",
    },
  },
  ko: {
    mainQuestion: "Deeppin이 무엇이 다른가?",
    aiBefore1: "깊게 파고들 때 두 가지 나쁜 선택 —— 새 대화(맥락 잃음) 또는 같은 대화(주제 흐트러짐). Deeppin은",
    anchor1: "그 부분을 고정",
    aiBetween: " 하고, ",
    anchor2: "깊이 제한 없이 파고들기",
    aiAfter2: "을 허용. 메인은 그대로.",
    threadReply1: "텍스트 선택 → 핀 탭. 집중 서브 스레드가 열림. 메인은 그대로.",
    threadReply2: "깊이 제한 없음 —— 서브 스레드 안에서 다시 핀 가능.",
    subTitle1: "그 부분을 고정",
    subTitle2: "깊이 제한 없이",
    mainCrumb: "메인",
    pinLabel: "핀",
    copyLabel: "복사",
    enterLabel: "열기",
    selectLabel: "선택",
    newReplyLabel: "새글",
    caption: {
      blank: "새 대화.",
      "ai-stream": "질문하면 Deeppin이 메인에서 답변.",
      "tap-select-1": "「선택」을 탭해 텍스트 선택 모드 켜기.",
      "sweep-1": "구절을 드래그해 선택.",
      "selpop-1": "선택 위에 툴바.",
      "dialog-1": "핀이 그 구절의 후속 질문 표시.",
      "pick-1": "하나 선택.",
      "underline-1": "앵커 밑줄이 메인에 표시.",
      "ai-replying-1": "Deeppin이 서브 스레드에서 답변, 메인은 그대로.",
      "back-1": "메인 복귀, 읽기 전까지 굵은 줄로 깜박임.",
      "tap-select-2": "두 번째 핀 —— 「선택」을 다시 탭.",
      "sweep-2": "다른 구절 드래그.",
      "selpop-2": "두 번째 선택 위 툴바.",
      "dialog-2": "두 번째 핀의 후속 질문 선택.",
      "pick-2": "선택.",
      "underline-2": "두 번째 밑줄이 첫 번째 옆에.",
      "ai-replying-2": "두 번째 서브 스레드가 병렬로 답변.",
      "back-both": "두 개의 서브 스레드 동시 진행, 메인은 유지.",
      "tap-overview": "오른쪽 상단 개요를 탭해 스레드 그래프 보기.",
      "drawer-shown": "세 노드 —— 메인 + 두 서브. 각 안에서 다시 핀 가능.",
      "drawer-hidden": "서랍 닫힘.",
    },
  },
  es: {
    mainQuestion: "¿Qué hace diferente a Deeppin?",
    aiBefore1: "Dos malas opciones para profundizar — chat nuevo (pierdes contexto) o mismo chat (deriva). Deeppin te deja ",
    anchor1: "anclar ese detalle",
    aiBetween: " y ",
    anchor2: "seguir cavando",
    aiAfter2: ", sin límite de profundidad. ¿El hilo principal? Intacto.",
    threadReply1: "Selecciona texto → toca Anclar. Sub-hilo enfocado. Principal intacto.",
    threadReply2: "Sin límite — puedes anclar dentro de sub-hilos también.",
    subTitle1: "anclar ese detalle",
    subTitle2: "seguir cavando",
    mainCrumb: "Principal",
    pinLabel: "Anclar",
    copyLabel: "Copiar",
    enterLabel: "Abrir",
    selectLabel: "Seleccionar",
    newReplyLabel: "Nuevo",
    caption: {
      blank: "Nueva conversación.",
      "ai-stream": "Preguntas algo y Deeppin responde en el principal.",
      "tap-select-1": "Toca Seleccionar para activar la selección.",
      "sweep-1": "Arrastra para seleccionar una frase.",
      "selpop-1": "Barra sobre la selección.",
      "dialog-1": "Anclar abre preguntas de seguimiento.",
      "pick-1": "Elige una.",
      "underline-1": "Subrayado del ancla en el principal.",
      "ai-replying-1": "Deeppin responde en sub-hilo, principal intacto.",
      "back-1": "De vuelta al principal. Ancla pulsa hasta leerla.",
      "tap-select-2": "Ancla otra frase — toca Seleccionar otra vez.",
      "sweep-2": "Arrastra otra frase.",
      "selpop-2": "Barra sobre la segunda selección.",
      "dialog-2": "Elige un seguimiento para la segunda ancla.",
      "pick-2": "Elige.",
      "underline-2": "Segunda ancla junto a la primera.",
      "ai-replying-2": "Segundo sub-hilo responde en paralelo.",
      "back-both": "Dos sub-hilos activos, el principal intacto.",
      "tap-overview": "Toca overview para ver el grafo completo.",
      "drawer-shown": "Tres nodos —— principal + dos sub-hilos. Anclar dentro de cualquiera.",
      "drawer-hidden": "El drawer se cierra.",
    },
  },
  fr: {
    mainQuestion: "Qu'est-ce qui rend Deeppin différent ?",
    aiBefore1: "Deux mauvais choix pour creuser — nouveau chat (perte de contexte) ou même chat (dérive). Deeppin te laisse ",
    anchor1: "épingler ce détail",
    aiBetween: " et ",
    anchor2: "continuer à creuser",
    aiAfter2: " sans limite. Le fil principal ? Intact.",
    threadReply1: "Sélectionne du texte → touche Épingler. Sous-fil ciblé s'ouvre. Principal reste.",
    threadReply2: "Pas de limite — épingle encore à l'intérieur des sous-fils.",
    subTitle1: "épingler ce détail",
    subTitle2: "continuer à creuser",
    mainCrumb: "Principal",
    pinLabel: "Épingler",
    copyLabel: "Copier",
    enterLabel: "Ouvrir",
    selectLabel: "Sélectionner",
    newReplyLabel: "Nouveau",
    caption: {
      blank: "Nouvelle conversation.",
      "ai-stream": "Tu poses une question, Deeppin répond dans le principal.",
      "tap-select-1": "Touche Sélectionner pour activer la sélection.",
      "sweep-1": "Glisse pour sélectionner une phrase.",
      "selpop-1": "Barre au-dessus de la sélection.",
      "dialog-1": "Épingler ouvre les suivis.",
      "pick-1": "Choisis-en un.",
      "underline-1": "Soulignement de l'ancre dans le principal.",
      "ai-replying-1": "Deeppin répond dans un sous-fil, principal intact.",
      "back-1": "Retour au principal. L'ancre pulse jusqu'à lecture.",
      "tap-select-2": "Une seconde épingle — retouche Sélectionner.",
      "sweep-2": "Glisse une autre phrase.",
      "selpop-2": "Barre au-dessus de la seconde sélection.",
      "dialog-2": "Choisis un suivi pour la seconde épingle.",
      "pick-2": "Choisis.",
      "underline-2": "Seconde ancre à côté de la première.",
      "ai-replying-2": "Le second sous-fil répond en parallèle.",
      "back-both": "Deux sous-fils actifs, le principal intact.",
      "tap-overview": "Touche overview pour voir le graphe complet.",
      "drawer-shown": "Trois nœuds —— principal + deux sous-fils. Épingler dans chacun.",
      "drawer-hidden": "Le drawer se ferme.",
    },
  },
  de: {
    mainQuestion: "Was macht Deeppin anders?",
    aiBefore1: "Zwei schlechte Optionen — neuer Chat (Kontext weg) oder gleicher Chat (Abdriften). Deeppin lässt dich ",
    anchor1: "dieses Detail anheften",
    aiBetween: " und ",
    anchor2: "beliebig tief weitergraben",
    aiAfter2: ". Der Haupt-Thread? Unberührt.",
    threadReply1: "Text markieren → Anheften tippen. Fokussierter Sub-Thread. Haupt bleibt.",
    threadReply2: "Keine Tiefenbegrenzung — anheften innerhalb von Sub-Threads möglich.",
    subTitle1: "dieses Detail anheften",
    subTitle2: "tief weitergraben",
    mainCrumb: "Haupt",
    pinLabel: "Anheften",
    copyLabel: "Kopieren",
    enterLabel: "Öffnen",
    selectLabel: "Auswählen",
    newReplyLabel: "Neu",
    caption: {
      blank: "Neue Unterhaltung.",
      "ai-stream": "Du stellst eine Frage. Deeppin antwortet im Haupt-Thread.",
      "tap-select-1": "Auf Auswählen tippen, um Text-Auswahl zu aktivieren.",
      "sweep-1": "Ziehe zum Markieren einer Phrase.",
      "selpop-1": "Toolbar über der Auswahl.",
      "dialog-1": "Anheften öffnet Folgefragen.",
      "pick-1": "Eine wählen.",
      "underline-1": "Anker-Unterstreichung erscheint im Haupt.",
      "ai-replying-1": "Deeppin antwortet im Sub-Thread, Haupt bleibt.",
      "back-1": "Zurück zum Haupt. Anker pulsiert dick bis gelesen.",
      "tap-select-2": "Zweites Anheften — Auswählen erneut tippen.",
      "sweep-2": "Eine weitere Phrase markieren.",
      "selpop-2": "Toolbar über der zweiten Auswahl.",
      "dialog-2": "Folgefrage für das zweite Anheften wählen.",
      "pick-2": "Wählen.",
      "underline-2": "Zweiter Anker neben dem ersten.",
      "ai-replying-2": "Zweiter Sub-Thread antwortet parallel.",
      "back-both": "Zwei aktive Sub-Threads, Haupt unberührt.",
      "tap-overview": "Auf Overview tippen, um den Thread-Graphen zu sehen.",
      "drawer-shown": "Drei Knoten —— Haupt + zwei Sub-Threads. Innerhalb jedes kann wieder angeheftet werden.",
      "drawer-hidden": "Drawer schließt.",
    },
  },
  pt: {
    mainQuestion: "O que faz o Deeppin diferente?",
    aiBefore1: "Duas opções ruins — novo chat (perde contexto) ou mesmo chat (desvio). Deeppin permite ",
    anchor1: "fixar esse detalhe",
    aiBetween: " e ",
    anchor2: "continuar cavando",
    aiAfter2: ", sem limite. O tópico principal? Intacto.",
    threadReply1: "Selecione texto → toque Fixar. Sub-tópico focado. Principal fica.",
    threadReply2: "Sem limite — fixe dentro de sub-tópicos também.",
    subTitle1: "fixar esse detalhe",
    subTitle2: "continuar cavando",
    mainCrumb: "Principal",
    pinLabel: "Fixar",
    copyLabel: "Copiar",
    enterLabel: "Abrir",
    selectLabel: "Selecionar",
    newReplyLabel: "Novo",
    caption: {
      blank: "Nova conversa.",
      "ai-stream": "Você pergunta, o Deeppin responde no principal.",
      "tap-select-1": "Toque em Selecionar para ativar a seleção.",
      "sweep-1": "Arraste para selecionar uma frase.",
      "selpop-1": "Barra acima da seleção.",
      "dialog-1": "Fixar abre acompanhamentos.",
      "pick-1": "Escolha um.",
      "underline-1": "Sublinhado da âncora no principal.",
      "ai-replying-1": "Deeppin responde no sub-tópico, principal intacto.",
      "back-1": "De volta ao principal. Âncora pulsa até ler.",
      "tap-select-2": "Segundo pin — toque Selecionar novamente.",
      "sweep-2": "Arraste outra frase.",
      "selpop-2": "Barra sobre a segunda seleção.",
      "dialog-2": "Escolha um acompanhamento para o segundo pin.",
      "pick-2": "Escolha.",
      "underline-2": "Segunda âncora ao lado da primeira.",
      "ai-replying-2": "Segundo sub-tópico responde em paralelo.",
      "back-both": "Dois sub-tópicos ativos, principal intacto.",
      "tap-overview": "Toque em overview para ver o grafo completo.",
      "drawer-shown": "Três nós —— principal + dois sub-tópicos. Fixar dentro de qualquer um.",
      "drawer-hidden": "Drawer fecha.",
    },
  },
  ru: {
    mainQuestion: "Чем Deeppin отличается?",
    aiBefore1: "Два плохих варианта — новый чат (теряете контекст) или тот же (тема уходит). Deeppin позволяет ",
    anchor1: "закрепить эту деталь",
    aiBetween: " и ",
    anchor2: "копать сколько угодно глубоко",
    aiAfter2: ". Основная ветка? Не тронута.",
    threadReply1: "Выделите текст → коснитесь Закрепить. Сфокусированная подветка. Основная остаётся.",
    threadReply2: "Без ограничений — закрепляйте внутри подветок тоже.",
    subTitle1: "закрепить эту деталь",
    subTitle2: "копать глубоко",
    mainCrumb: "Главная",
    pinLabel: "Закрепить",
    copyLabel: "Копировать",
    enterLabel: "Открыть",
    selectLabel: "Выбрать",
    newReplyLabel: "Новое",
    caption: {
      blank: "Новый разговор.",
      "ai-stream": "Вы задаёте вопрос, Deeppin отвечает в главной ветке.",
      "tap-select-1": "Коснитесь «Выбрать», чтобы включить выделение.",
      "sweep-1": "Проведите по фразе для выделения.",
      "selpop-1": "Панель над выделением.",
      "dialog-1": "Закрепить открывает уточняющие вопросы.",
      "pick-1": "Выберите один.",
      "underline-1": "Подчёркивание якоря в главной.",
      "ai-replying-1": "Deeppin отвечает в подветке, главная остаётся.",
      "back-1": "Назад в главную. Якорь пульсирует до прочтения.",
      "tap-select-2": "Вторая закладка — коснитесь «Выбрать» снова.",
      "sweep-2": "Проведите по другой фразе.",
      "selpop-2": "Панель над вторым выделением.",
      "dialog-2": "Выберите уточнение для второй закладки.",
      "pick-2": "Выбрать.",
      "underline-2": "Второй якорь рядом с первым.",
      "ai-replying-2": "Вторая подветка отвечает параллельно.",
      "back-both": "Две активные подветки, главная не тронута.",
      "tap-overview": "Коснитесь обзора, чтобы увидеть весь граф.",
      "drawer-shown": "Три узла —— главная + две подветки. Закрепляйте внутри любой.",
      "drawer-hidden": "Панель закрывается.",
    },
  },
};

export default function MobilePinDemo() {
  const lang = useLangStore((s) => s.lang) as Lang;
  const c = CONTENT[lang] ?? CONTENT.en;

  const [phase, setPhase] = useState<Phase>("blank");
  const [sweepPct, setSweepPct] = useState(0);
  /** 当前在画字的气泡：'main' = 主线 AI 回复；'sub1' / 'sub2' = 子线程回复 */
  const [streamLen, setStreamLen] = useState(0);
  const [mainStreamLen, setMainStreamLen] = useState(0);
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
    // 值 = 距离 phase 结束前多少 ms 点亮 tap press —— 动画持续 1100ms，留够时间
    // 让用户看清"哪里被按下"，再过渡到下一个 phase
    // Value = ms-before-phase-end when the tap press lights up. Press animation
    // lasts ~1100ms, so the viewer has a clear look at "where the finger
    // landed" before the next phase takes over.
    // 值 = 距离 phase 结束前多少 ms 点亮 tap press
    const tapPhases: Partial<Record<Phase, number>> = {
      "tap-select-1": 1800,  // 第一次点 Select FAB
      "selpop-1":     1500,  // 第一次点 Pin chip
      "pick-1":       800,   // 第一次选 suggestion
      "tap-select-2": 1800,  // 第二次点 Select FAB
      "selpop-2":     1500,  // 第二次点 Pin chip
      "pick-2":       800,   // 第二次选 suggestion
      "tap-overview": 1800,  // 点右上概览
    };
    const offset = tapPhases[phase];
    if (offset == null) return;
    const fireAt = Math.max(0, DELAYS[phase] - offset);
    tapTimerRef.current = setTimeout(() => setTapRing(true), fireAt);
    return () => { if (tapTimerRef.current) clearTimeout(tapTimerRef.current); };
  }, [phase]);

  // Sweep 动画：两次 sweep phase 都跑
  useEffect(() => {
    const isSweep = phase === "sweep-1" || phase === "sweep-2";
    if (!isSweep) {
      setSweepPct(phase === "blank" || phase === "ai-stream" ? 0 : 1);
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

  // 主线 AI 回复的流式打字 —— 只在 "ai-stream" 跑；blank 之前清零
  // Main-thread AI reply streams during "ai-stream"; stays fully rendered after.
  useEffect(() => {
    if (phase === "blank") { setMainStreamLen(0); return; }
    const fullLen = c.aiBefore1.length + c.anchor1.length + c.aiBetween.length + c.anchor2.length + c.aiAfter2.length;
    if (phase !== "ai-stream") { setMainStreamLen(fullLen); return; }
    setMainStreamLen(0);
    let i = 0;
    const tick = () => {
      i = Math.min(fullLen, i + 5);
      setMainStreamLen(i);
      if (i < fullLen) timerRef.current = setTimeout(tick, 40);
    };
    tick();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, c.aiBefore1, c.anchor1, c.aiBetween, c.anchor2, c.aiAfter2]);

  // 子线程 AI 回复的流式打字 —— ai-replying-1 / -2 各自播放
  useEffect(() => {
    const sub1 = phase === "ai-replying-1";
    const sub2 = phase === "ai-replying-2";
    if (!sub1 && !sub2) {
      setStreamLen(phase === "blank" ? 0 : 9999);
      return;
    }
    const reply = sub1 ? c.threadReply1 : c.threadReply2;
    setStreamLen(0);
    const total = reply.length;
    let i = 0;
    const tick = () => {
      i = Math.min(total, i + 3);
      setStreamLen(i);
      if (i < total) timerRef.current = setTimeout(tick, 28);
    };
    tick();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, c.threadReply1, c.threadReply2]);

  // 当前 pin 轮次（1 或 2）—— driving 锚点指示、Dialog 标题、SubView 内容
  // Current pin round (1 or 2) — used by Dialog title, SubView content, etc.
  const currentPin: 1 | 2 = (phase === "sweep-2" || phase === "selpop-2" || phase === "dialog-2" ||
                             phase === "pick-2" || phase === "underline-2" || phase === "ai-replying-2")
    ? 2 : 1;

  // 哪些 phase 选区工具栏（Pin/Copy）露出
  // Selection toolbar visible during selpop-1 / selpop-2
  const showSelpop = phase === "selpop-1" || phase === "selpop-2";
  // Pin 追问弹窗 visible during dialog-1/pick-1 and dialog-2/pick-2
  const showDialog = phase === "dialog-1" || phase === "pick-1" ||
                     phase === "dialog-2" || phase === "pick-2";

  // anchor1 显示：任何 "underline-1 之后" 都显示（除了 blank/ai-stream 之前的帧）
  // anchor2 显示：任何 "underline-2 之后" 都显示
  const anchor1Shown = ![
    "blank", "ai-stream", "tap-select-1", "sweep-1", "selpop-1",
    "dialog-1", "pick-1"
  ].includes(phase);
  const anchor2Shown = ![
    "blank", "ai-stream", "tap-select-1", "sweep-1", "selpop-1", "dialog-1", "pick-1",
    "underline-1", "ai-replying-1", "back-1", "tap-select-2", "sweep-2",
    "selpop-2", "dialog-2", "pick-2"
  ].includes(phase);

  // 哪个锚点正在 breathing（未读）—— back-1 时 anchor1 呼吸；back-both 时两个都呼吸
  const anchor1Breathing = phase === "back-1" || phase === "back-both";
  const anchor2Breathing = phase === "back-both";

  // 是否在子线程视图
  const inSub = phase === "ai-replying-1" || phase === "ai-replying-2";

  // Mac chrome (38) + 移动 topbar (40) + body (320) + caption (36) = 434
  // Drops the static mini-graph strip; instead the body now has a real
  // mobile topbar at the top whose right-button breathes during
  // `tap-overview` and the right drawer slides in for `drawer-shown`.
  const TOPBAR_H = 40;
  const BODY_H = 320;
  const TOTAL_H = 38 + TOPBAR_H + BODY_H + 36;
  // 激活节点 —— MainView / SubView 切换；inSub 时 sub 节点 active
  const activeNode: "main" | "sub1" | "sub2" = phase === "ai-replying-1"
    ? "sub1"
    : phase === "ai-replying-2"
      ? "sub2"
      : "main";
  const breatheRightBtn = phase === "tap-overview";
  const drawerOpen = phase === "drawer-shown";
  // Select FAB 在任何 tap-select/sweep/selpop/dialog/pick 阶段都是 armed
  // Select FAB is armed during any pin flow phase.
  const selectArmed = [
    "tap-select-1", "sweep-1", "selpop-1", "dialog-1", "pick-1",
    "tap-select-2", "sweep-2", "selpop-2", "dialog-2", "pick-2",
  ].includes(phase);
  // 在 chat view 才显示 FAB（子线程/drawer 打开时隐藏）
  const showSelectFab = !inSub && !drawerOpen;
  const tapOnSelect = (phase === "tap-select-1" || phase === "tap-select-2") && tapRing;

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
            {(anchor1Shown || anchor2Shown) && !drawerOpen && (
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
                aria-hidden
              />
            )}
            {phase === "tap-overview" && tapRing && (
              <>
                <span key="tap-ov-print" className="demo-tap-print demo-tap-print-sm" aria-hidden />
                <span key="tap-ov-ring" className="demo-tap-ring demo-tap-ring-sm" aria-hidden />
              </>
            )}
          </span>
        </div>

        {/* Body — main view + sub view stacked, opacity crossfade */}
        <div className="relative" style={{ height: BODY_H, background: "var(--paper)" }}>
          <div className={`absolute inset-0 transition-opacity duration-200 ${inSub ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            <MainView
              c={c}
              sweepPct={sweepPct}
              mainStreamLen={mainStreamLen}
              anchor1Shown={anchor1Shown}
              anchor2Shown={anchor2Shown}
              anchor1Breathing={anchor1Breathing}
              anchor2Breathing={anchor2Breathing}
              currentPin={currentPin}
              showSelpop={showSelpop}
              phase={phase}
              tapRing={tapRing}
            />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-200 ${inSub ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <SubView c={c} streamLen={streamLen} phase={phase} currentPin={currentPin} />
          </div>

          {showDialog && (
            <Dialog
              c={c}
              currentPin={currentPin}
              picked={phase === "pick-1" || phase === "pick-2"}
              tapRing={tapRing && (phase === "pick-1" || phase === "pick-2")}
            />
          )}

          {/* 底部「Select」FAB —— 跟真实 MobileChatLayout 一致
              定位（absolute bottom-3 right-3）；tap-select phase 播放点击动画。
              armed=true 时 accent 底色 + "Cancel" 字样（选区模式开启状态）。
              Bottom-right Select FAB, mirroring the real MobileChatLayout FAB
              (same position). Plays the tap animation during tap-select; shows
              the armed accent fill when selection mode is on. */}
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
              {/* I-beam + highlight 小图标 */}
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 5h4M7 19h4M9 5v14" />
                <path d="M14 8h6M14 16h6" strokeWidth={2.5} />
              </svg>
              {/* 状态切换仅靠底色（accent=ON / ink=OFF），文字保持稳定避免抖
                  Label stays fixed; on/off state is carried by the fill color. */}
              <span>{c.selectLabel}</span>
              {tapOnSelect && (
                <>
                  <span key="tap-sel-print" className="demo-tap-print demo-tap-print-sm" aria-hidden />
                  <span key="tap-sel-ring" className="demo-tap-ring demo-tap-ring-sm" aria-hidden />
                </>
              )}
            </div>
          )}

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
                showSub1={anchor1Shown}
                showSub2={anchor2Shown}
                activeNode={activeNode}
                sub1Breathing={anchor1Breathing && !inSub}
                sub2Breathing={anchor2Breathing && !inSub}
                sub1Label={c.subTitle1}
                sub2Label={c.subTitle2}
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

        /* 触点主体 ——"手指按下"的实心圆盘 + 径向光晕，是这里被按下的
           primary visual。比纯 ripple 更"重"，远距离也能一眼看见。
           The main "finger-pressing-here" visual: a filled accent disc +
           radial halo. Heavier than a thin ring; reads from far away. */
        :global(.demo-tap-print) {
          pointer-events: none;
          position: absolute;
          left: 50%;
          top: 50%;
          width: 44px;
          height: 44px;
          margin-left: -22px;
          margin-top: -22px;
          border-radius: 9999px;
          background: radial-gradient(
            circle,
            color-mix(in oklch, var(--accent) 85%, transparent) 0%,
            color-mix(in oklch, var(--accent) 55%, transparent) 40%,
            color-mix(in oklch, var(--accent) 0%, transparent) 72%
          );
          animation: demo-tap-print 1100ms ease-out 1 forwards;
          z-index: 40;
        }
        :global(.demo-tap-print-sm) {
          width: 32px;
          height: 32px;
          margin-left: -16px;
          margin-top: -16px;
        }
        @keyframes demo-tap-print {
          0%   { transform: scale(0.4); opacity: 0; }
          15%  { transform: scale(0.9); opacity: 0.95; }
          55%  { transform: scale(1.0); opacity: 0.85; }
          100% { transform: scale(1.6); opacity: 0; }
        }

        /* 同步的细环 ripple ——"按下 → 扩散"的第二层反馈
           Concentric outward ring — secondary "it radiates" feedback. */
        :global(.demo-tap-ring) {
          pointer-events: none;
          position: absolute;
          left: 50%;
          top: 50%;
          width: 44px;
          height: 44px;
          margin-left: -22px;
          margin-top: -22px;
          border-radius: 9999px;
          border: 2.5px solid var(--accent);
          animation: demo-tap-ring 1100ms ease-out 1 forwards;
          z-index: 41;
        }
        :global(.demo-tap-ring-sm) {
          width: 32px;
          height: 32px;
          margin-left: -16px;
          margin-top: -16px;
        }
        @keyframes demo-tap-ring {
          0%   { transform: scale(0.35); opacity: 0; }
          20%  { transform: scale(0.85); opacity: 0.9; }
          100% { transform: scale(2.1); opacity: 0; }
        }

        /* 按下时目标元素本身的"发亮 + 缩压"高亮 —— 跟 MergeDemo 的 btnPulsing
           同一思路：accent 填充变浓 + 强 box-shadow 光晕 + 轻微 scale。
           On the tapped element itself: accent fill brightens, strong
           box-shadow glow, slight scale — mirrors MergeDemo.btnPulsing so
           the user's eye locks onto "this is what just got tapped". */
        :global(.demo-tap-press) {
          animation: demo-tap-press 1100ms ease-out 1;
        }
        @keyframes demo-tap-press {
          0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(42,42,114,0);   filter: brightness(1); }
          18%  { transform: scale(0.94); box-shadow: 0 0 0 6px rgba(42,42,114,0.35); filter: brightness(1.35); }
          40%  { transform: scale(1.06); box-shadow: 0 0 0 10px rgba(42,42,114,0.15); filter: brightness(1.25); }
          100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(42,42,114,0);   filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────
// 渲染主线 AI 回复，含两个锚点 inline。AI 流式打字时按 mainStreamLen 截取；
// sweep / selpop 高亮跟随 currentPin；已生成的锚点显示 border-bottom（加
// breathing 呼吸类）。
// Main chat view — AI reply with both anchors inline. During ai-stream it
// types out up to mainStreamLen. The sweep / selpop visual tracks whichever
// anchor is being pinned right now; landed anchors get a pigment underline
// (plus the breathing class when unread).
function MainView({
  c, sweepPct, mainStreamLen,
  anchor1Shown, anchor2Shown,
  anchor1Breathing, anchor2Breathing,
  currentPin,
  showSelpop,
  phase, tapRing,
}: {
  c: Copy;
  sweepPct: number;
  mainStreamLen: number;
  anchor1Shown: boolean;
  anchor2Shown: boolean;
  anchor1Breathing: boolean;
  anchor2Breathing: boolean;
  currentPin: 1 | 2;
  showSelpop: boolean;
  phase: Phase;
  tapRing: boolean;
}) {
  // 把 AI 文字拆成 5 段按 mainStreamLen 截取
  const totalLen = c.aiBefore1.length + c.anchor1.length + c.aiBetween.length + c.anchor2.length + c.aiAfter2.length;
  const streaming = phase === "ai-stream" && mainStreamLen < totalLen;
  const visible = phase === "ai-stream" ? mainStreamLen : totalLen;
  let rem = visible;
  const takeSlice = (s: string) => { const t = s.slice(0, rem); rem -= t.length; return t; };
  const seg0 = takeSlice(c.aiBefore1);
  const seg1 = takeSlice(c.anchor1);
  const seg2 = takeSlice(c.aiBetween);
  const seg3 = takeSlice(c.anchor2);
  const seg4 = takeSlice(c.aiAfter2);

  const sweeping1 = phase === "sweep-1";
  const sweeping2 = phase === "sweep-2";
  const sweepBg1 = sweeping1 ? `color-mix(in oklch, var(--accent) ${Math.round(sweepPct * 36)}%, transparent)` : undefined;
  const sweepBg2 = sweeping2 ? `color-mix(in oklch, var(--accent) ${Math.round(sweepPct * 36)}%, transparent)` : undefined;

  const renderAnchor = (
    which: 1 | 2,
    text: string,
    shown: boolean,
    breathing: boolean,
    sweepBg: string | undefined,
    sweeping: boolean,
  ) => {
    if (!text) return null;
    const color = which === 1 ? "var(--pig-1)" : "var(--pig-2)";
    const thickness = breathing ? 3 : 1;
    const bb = shown ? `${thickness}px solid ${color}` : sweeping ? "1px solid transparent" : "none";
    const thisPinActive = currentPin === which;
    // 未读时 border-bottom 让给 .anchor-breathing 的 box-shadow（来自 globals.css）
    // When breathing, the border is handled by the shared .anchor-breathing
    // rule (box-shadow + opacity loop) — skip the inline border to avoid
    // double underlines.
    const innerStyle: React.CSSProperties = breathing
      ? ({ background: sweepBg, paddingBottom: 1, color: "var(--ink)", "--anchor-color": color } as React.CSSProperties)
      : { background: sweepBg, borderBottom: bb, paddingBottom: 1, color: "var(--ink)", transition: "background 120ms ease-out, border-bottom 220ms ease-out" };
    return (
      <span
        className={`relative inline-block ${breathing ? "anchor-breathing" : ""}`}
        style={innerStyle}
      >
        {text}
        {showSelpop && thisPinActive && (
          <span
            className="absolute left-0 -top-9 z-20 inline-flex items-center gap-[2px] rounded-md shadow-[0_4px_14px_rgba(27,26,23,0.18)]"
            style={{ background: "var(--ink)", color: "var(--paper)", padding: 2 }}
          >
            <span className="px-2 py-1 text-[10px]">{c.copyLabel}</span>
            <span
              className={`relative px-2 py-1 rounded text-[10px] font-medium ${
                (phase === "selpop-1" || phase === "selpop-2") && tapRing ? "demo-tap-press" : ""
              }`}
              style={{ background: "var(--accent)" }}
            >
              {c.pinLabel}
              {(phase === "selpop-1" || phase === "selpop-2") && tapRing && (
                <>
                  <span key={`tap-pin-print-${which}`} className="demo-tap-print demo-tap-print-sm" aria-hidden />
                  <span key={`tap-pin-ring-${which}`} className="demo-tap-ring demo-tap-ring-sm" aria-hidden />
                </>
              )}
            </span>
            <span aria-hidden className="absolute left-3 -bottom-1 w-1.5 h-1.5 rotate-45" style={{ background: "var(--ink)" }} />
          </span>
        )}
      </span>
    );
  };

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

      {/* user —— blank phase 时也显示，作为"你刚发的那条"；只在 blank 前完全没了 */}
      {/* User bubble — shown from "blank" onward (the question's already sent). */}
      {phase !== "blank" && (
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
      )}

      {/* AI */}
      {phase !== "blank" && (
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
            {seg0}
            {renderAnchor(1, seg1, anchor1Shown || sweeping1, anchor1Breathing, sweepBg1, sweeping1)}
            {seg2}
            {renderAnchor(2, seg3, anchor2Shown || sweeping2, anchor2Breathing, sweepBg2, sweeping2)}
            {seg4}
            {streaming && (
              <span
                className="inline-block w-[2px] h-3 align-middle ml-[1px]"
                style={{ background: "var(--accent)", animation: "mp-caret 1s steps(2) infinite" }}
              />
            )}
          </div>
        </div>
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

// ── Sub-thread view ─────────────────────────────────────────────────────
// 两个子线程共用一个 view —— 用 currentPin 切换标题 + 回复文本 + pigment 色
// One view powers both sub-threads; currentPin selects title + reply text
// + pigment pill color for the breadcrumb.
function SubView({
  c, streamLen, phase, currentPin,
}: {
  c: Copy;
  streamLen: number;
  phase: Phase;
  currentPin: 1 | 2;
}) {
  const title = currentPin === 1 ? c.subTitle1 : c.subTitle2;
  const reply = currentPin === 1 ? c.threadReply1 : c.threadReply2;
  const pigColor = currentPin === 1 ? "var(--pig-1)" : "var(--pig-2)";
  const streaming = (phase === "ai-replying-1" || phase === "ai-replying-2") && streamLen < reply.length;
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
          <span className="w-[4px] h-[4px] rounded-full" style={{ background: pigColor }} />
          {title.length > 12 ? title.slice(0, 12) + "…" : title}
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
          {reply.slice(0, streamLen)}
          {streaming && (
            <span
              className="inline-block w-[2px] h-3 align-middle ml-[1px]"
              style={{ background: "var(--accent)", animation: "mp-sub-caret 1s steps(2) infinite" }}
            />
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes mp-sub-caret {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Pin dialog ──────────────────────────────────────────────────────────
// 根据 currentPin 切换标题颜色 + 引用的锚点文字 + 追问预览
// Dialog header pill + anchor quote + follow-up preview all keyed off currentPin.
function Dialog({
  c, picked, tapRing, currentPin,
}: {
  c: Copy;
  picked: boolean;
  tapRing: boolean;
  currentPin: 1 | 2;
}) {
  const anchorText = currentPin === 1 ? c.anchor1 : c.anchor2;
  const reply = currentPin === 1 ? c.threadReply1 : c.threadReply2;
  const pigColor = currentPin === 1 ? "var(--pig-1)" : "var(--pig-2)";
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center animate-in fade-in-0 duration-150">
      <div className="absolute inset-0" style={{ background: "rgba(27,26,23,0.35)" }} />
      <div
        className="relative w-[88%] max-w-[300px] rounded-xl shadow-[0_12px_36px_rgba(27,26,23,0.18)]"
        style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
      >
        <div className="px-3 pt-3 pb-2 flex items-start gap-2" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
          <span className="w-[3px] h-5 rounded-[1px] flex-shrink-0" style={{ background: pigColor }} />
          <div className="flex-1">
            <div className="font-mono text-[8.5px] uppercase tracking-[0.15em] mb-0.5" style={{ color: "var(--accent)" }}>
              {c.pinLabel}
            </div>
            <div className="font-serif text-[12px] italic leading-tight" style={{ color: "var(--ink-2)" }}>
              “{anchorText}”
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
            {reply.slice(0, 38)}…
            {tapRing && (
              <>
                <span key={`tap-pick-print-${currentPin}`} className="demo-tap-print" aria-hidden />
                <span key={`tap-pick-ring-${currentPin}`} className="demo-tap-ring" aria-hidden />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 三节点 mini graph：main + 可选 sub1 + 可选 sub2 ─────────────────────
// 布局：main 在左，两条 sub 呈 V 形向下右分叉；每个 sub 可独立 show/breathe。
// Layout: main on the left, two sub-nodes fanning down-right (classic V tree).
// Each sub toggles independently; breathing sub gets an accent unread halo.
function MiniGraph({
  showSub1,
  showSub2,
  activeNode,
  sub1Breathing,
  sub2Breathing,
  sub1Label,
  sub2Label,
  mainLabel,
  phase,
}: {
  showSub1: boolean;
  showSub2: boolean;
  activeNode: "main" | "sub1" | "sub2";
  sub1Breathing: boolean;
  sub2Breathing: boolean;
  sub1Label: string;
  sub2Label: string;
  mainLabel: string;
  phase: Phase;
}) {
  // 视口 240×80 —— main 在左中，sub1 右上，sub2 右下
  const W = 240, H = 80;
  const mainX = W * 0.18, mainY = H / 2;
  const sub1X = W * 0.72, sub1Y = H * 0.32;
  const sub2X = W * 0.72, sub2Y = H * 0.68;

  const renderSub = (
    cx: number,
    cy: number,
    id: "sub1" | "sub2",
    pigColor: string,
    label: string,
    show: boolean,
    breathing: boolean,
    appearPhase: Phase,
  ) => {
    if (!show) return null;
    const active = activeNode === id;
    // 节点从"刚 drop"时从主节点淡入（transition）
    const isDropping = phase === appearPhase;
    return (
      <g style={{
        opacity: isDropping ? 0 : 1,
        transform: isDropping ? "translateX(-4px)" : "translateX(0)",
        transition: "opacity 380ms ease, transform 380ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <circle
          cx={cx}
          cy={cy}
          r={active ? 5.5 : 4}
          fill={active ? pigColor : "var(--paper-2)"}
          stroke={pigColor}
          strokeWidth={active ? 0 : 1.25}
        />
        {breathing && (
          <circle cx={cx + 6} cy={cy - 4} r={3} fill="var(--accent)" stroke="var(--paper)" strokeWidth={1}>
            <animate attributeName="r" values="3;4;3" dur="1.6s" repeatCount="indefinite" />
          </circle>
        )}
        <text
          x={cx + 9}
          y={cy + 3.5}
          fontSize={9.5}
          style={{ fontFamily: "var(--font-serif)" }}
          fill={active ? "var(--ink)" : "var(--ink-3)"}
          fontWeight={active ? 500 : 400}
        >
          {label.length > 14 ? label.slice(0, 14) + "…" : label}
        </text>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      {/* edges —— main → sub1 / sub2 */}
      {showSub1 && (
        <path
          d={`M ${mainX} ${mainY} C ${mainX + 30} ${mainY}, ${sub1X - 30} ${sub1Y}, ${sub1X} ${sub1Y}`}
          fill="none"
          stroke="var(--rule-strong)"
          strokeWidth={1}
          style={{ opacity: phase === "underline-1" ? 0 : 1, transition: "opacity 320ms ease" }}
        />
      )}
      {showSub2 && (
        <path
          d={`M ${mainX} ${mainY} C ${mainX + 30} ${mainY}, ${sub2X - 30} ${sub2Y}, ${sub2X} ${sub2Y}`}
          fill="none"
          stroke="var(--rule-strong)"
          strokeWidth={1}
          style={{ opacity: phase === "underline-2" ? 0 : 1, transition: "opacity 320ms ease" }}
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

      {renderSub(sub1X, sub1Y, "sub1", "var(--pig-1)", sub1Label, showSub1, sub1Breathing, "underline-1")}
      {renderSub(sub2X, sub2Y, "sub2", "var(--pig-2)", sub2Label, showSub2, sub2Breathing, "underline-2")}
    </svg>
  );
}
