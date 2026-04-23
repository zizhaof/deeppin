"use client";
// components/PinDemo.tsx
// Welcome-page 插针交互动画。
//
// 内容 = Deeppin 产品自述（用户: "Deeppin 有什么不一样？" → AI 给出
// 两个烂选择 / pin 解法 / 4 步用法 —— 等于把之前首页上那两块解释性 section
// 直接嵌进了 demo 里）。
//
// 设计特点：
//   - 2 栏（main + right overview）
//   - 右栏用 graph view（圆点 + bezier），不是 list
//   - 演示窗口固定高度，避免 phase 切换时抖动
//   - 9 语种 CONTENT 表内聚，不污染全局 i18n（本组件独立使用）
//
// The welcome-page demo, retooled for the new UI:
//   - 2-col (main + right overview), right rail in **graph** view
//   - Dialogue content is Deeppin's self-introduction (replacing the
//     old CAP-theorem demo). The "two bad options" + "pin" fix + how-it-works
//     flow lives inside the AI reply so the landing page no longer needs
//     separate Why / How sections.
//   - Fixed container height; content swaps via absolute-positioned panels
//     so the demo doesn't shrink/grow between phases.
//   - 9 locales baked into a local CONTENT table — this demo has a lot of
//     specific copy and doesn't belong in the global i18n dictionary.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import type { Lang } from "@/lib/i18n";

// ── Phases ──────────────────────────────────────────────────────────────
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
  idle: 1400,
  sweep: 1300,
  selpop: 1400,
  dialog: 1800,
  pick: 500,
  "underline-appear": 1100,
  "ai-replying": 2600,
  "unread-breathing": 2200,
  popover: 2800,
  enter: 500,
  "sub-thread": 3000,
  back: 1700,
};

// ── Copy type + 9 locales ───────────────────────────────────────────────
interface Copy {
  mainQuestion: string;
  anchor: string;
  aiPre: string;
  aiPost: string;
  suggestions: [string, string, string];
  threadReply: string;
  subTitle: string;
  questionTitle: string;
  mainCrumb: string;
  newReplyLabel: string;
  enterLabel: string;
  pinLabel: string;
  copyLabel: string;
  suggestionsLabel: string;
  overviewLabel: string;
  graphTabLabel: string;
  listTabLabel: string;
  replyingLabel: string;
  generatingLabel: string;
  caption: Record<Phase, string>;
}

const CONTENT: Record<Lang, Copy> = {
  en: {
    mainQuestion: "What makes Deeppin different?",
    anchor: "pin that detail",
    aiPre:
      "When you're reading an AI reply and want to dig deeper into one part, you have two bad options — start a new chat (lose all context) or ask in the same chat (interrupt the main thread, topic drifts). Deeppin lets you ",
    aiPost:
      " and keep digging — as deep as you want. The main thread? Not a word interrupted.",
    suggestions: [
      "Show me exactly how pinning works, step by step",
      "How deep can sub-threads go?",
      "What happens when I merge everything?",
    ],
    threadReply:
      "Highlight any text in an AI reply, click 'Question' — a focused sub-thread opens right there. The main chat stays untouched. You can pin again inside sub-questions — no limit on depth. When you're done exploring, merge everything into one structured report.",
    subTitle: "pin that detail",
    questionTitle: "deeppin — product intro",
    mainCrumb: "Main",
    newReplyLabel: "New",
    enterLabel: "Enter",
    pinLabel: "Pin",
    copyLabel: "Copy",
    suggestionsLabel: "suggestions",
    overviewLabel: "overview",
    graphTabLabel: "graph",
    listTabLabel: "list",
    replyingLabel: "replying in sub-thread…",
    generatingLabel: "generating…",
    caption: {
      idle: "Main thread shows the reply. Right rail tracks the thread graph.",
      sweep: "Drag across a phrase to select it.",
      selpop: "A compact toolbar appears above the selection.",
      dialog: "Pin opens a dialog with three auto-generated follow-ups.",
      pick: "Pick the one you want.",
      "underline-appear": "The anchor gets an underline in its pigment color.",
      "ai-replying": "AI answers in the sub-thread — main stays untouched.",
      "unread-breathing": "Back in main, the anchor breathes until you see the reply.",
      popover: "Hover the underline for a preview — title, snippet, Enter.",
      enter: "Click Enter to jump into the sub-thread.",
      "sub-thread": "Full sub-thread view. Breadcrumb shows Main › pin that detail.",
      back: "Click Main to return. Breathing stops — the reply is seen.",
    },
  },
  zh: {
    mainQuestion: "Deeppin 有什么不一样？",
    anchor: "钉住那个细节",
    aiPre:
      "你在读 AI 回复，想深挖某一部分 —— 两个烂选择：开新对话（上下文全丢），或者在原对话里问（主线被打断、话题漂移）。Deeppin 让你直接",
    aiPost: "，然后追问多深都可以。主线？一个字都不会被打扰。",
    suggestions: [
      "具体演示一下插针怎么用",
      "子线程能嵌多深？",
      "「合并」后会得到什么？",
    ],
    threadReply:
      "在 AI 回复里选中任意一段文字，点「插针」—— 焦点子线程立刻在旁边打开。主线原封不动。子线程里还能再插针，深度不限。读完再把所有分支一键合并成一份结构化报告。",
    subTitle: "钉住那个细节",
    questionTitle: "deeppin — 产品介绍",
    mainCrumb: "主线",
    newReplyLabel: "新",
    enterLabel: "进入",
    pinLabel: "插针",
    copyLabel: "复制",
    suggestionsLabel: "推荐问题",
    overviewLabel: "概览",
    graphTabLabel: "图",
    listTabLabel: "列表",
    replyingLabel: "正在子线程回复…",
    generatingLabel: "生成中…",
    caption: {
      idle: "主线显示 AI 回复，右栏是整个线程的图。",
      sweep: "拖选一段文字。",
      selpop: "选区上方自动弹出小工具栏。",
      dialog: "点击「插针」打开对话框，AI 已生成 3 条追问。",
      pick: "选一个你想问的。",
      "underline-appear": "锚点立刻浮现 —— 颜料色下划线。",
      "ai-replying": "AI 在子线程里独立回答，主线不受打扰。",
      "unread-breathing": "回到主线，锚点呼吸直到你看过回复。",
      popover: "悬停下划线 —— 浮出预览：标题、摘要、进入按钮。",
      enter: "点击「进入」跳进子线程。",
      "sub-thread": "完整子线程视图。面包屑：主线 › 钉住那个细节。",
      back: "点「主线」返回。呼吸停下 —— 表示已读。",
    },
  },
  ja: {
    mainQuestion: "Deeppin は何が違う？",
    anchor: "そこをピン留め",
    aiPre:
      "AI の返答を読んでいて、ある部分をもっと深掘りしたい時、選択肢は二つしかない —— 新しいチャットを開く（文脈が全て失われる）か、同じチャットで聞く（メインが中断され、話題がずれる）。Deeppin なら",
    aiPost: "して、好きなだけ掘り下げられる。メインスレッドは一言も遮られない。",
    suggestions: [
      "ピン留めの手順をステップごとに見せて",
      "サブスレッドはどこまで深くできる？",
      "マージするとどうなる？",
    ],
    threadReply:
      "AI の返答から任意のテキストを選択し、「ピン」をクリック —— その場に焦点を絞ったサブスレッドが開く。メインのチャットはそのまま。サブ質問の中でさらにピン留めもでき、深さに制限なし。探索が終わったら、すべてを一つの構造化レポートにマージできる。",
    subTitle: "そこをピン留め",
    questionTitle: "deeppin — 製品紹介",
    mainCrumb: "メイン",
    newReplyLabel: "新着",
    enterLabel: "開く",
    pinLabel: "ピン",
    copyLabel: "コピー",
    suggestionsLabel: "提案",
    overviewLabel: "概要",
    graphTabLabel: "グラフ",
    listTabLabel: "リスト",
    replyingLabel: "サブスレッドで応答中…",
    generatingLabel: "生成中…",
    caption: {
      idle: "メインが返答を表示、右側がスレッドのグラフ。",
      sweep: "フレーズをドラッグして選択。",
      selpop: "選択範囲の上に小さなツールバーが現れる。",
      dialog: "ピンを押すと自動生成されたフォローアップが 3 つ出る。",
      pick: "欲しいものを選ぶ。",
      "underline-appear": "アンカーに顔料色の下線が浮かぶ。",
      "ai-replying": "AI がサブスレッドで答える —— メインは触れない。",
      "unread-breathing": "メインに戻ると、既読になるまでアンカーが呼吸する。",
      popover: "下線にホバーでプレビュー —— タイトル、抜粋、Enter。",
      enter: "Enter をクリックしてサブスレッドに入る。",
      "sub-thread": "サブスレッドの完全ビュー。パンくず：メイン › ここをピン留め。",
      back: "メインをクリックで戻る。呼吸は止まり、既読を示す。",
    },
  },
  ko: {
    mainQuestion: "Deeppin은 무엇이 다른가?",
    anchor: "그 부분을 고정",
    aiPre:
      "AI 답변을 읽다가 어느 부분을 더 파고들고 싶을 때, 나쁜 선택지 두 가지 —— 새 대화 시작(맥락 전부 잃음), 같은 대화에서 질문(메인이 끊기고 주제가 흔들림). Deeppin은 당신이",
    aiPost: "하고 원하는 만큼 깊게 파고들 수 있게 한다. 메인 스레드? 단 한 단어도 방해받지 않는다.",
    suggestions: [
      "핀 작동 방식을 단계별로 보여줘",
      "서브 스레드는 얼마나 깊어질 수 있나?",
      "모든 걸 병합하면 어떻게 되나?",
    ],
    threadReply:
      "AI 답변에서 아무 텍스트나 선택하고 '핀'을 클릭 —— 집중된 서브 스레드가 그 자리에 열린다. 메인 대화는 그대로. 서브 질문 안에서 다시 핀 가능하고 깊이 제한 없다. 다 탐색한 뒤 모든 걸 하나의 구조화된 보고서로 병합하면 끝.",
    subTitle: "그 부분을 고정",
    questionTitle: "deeppin — 제품 소개",
    mainCrumb: "메인",
    newReplyLabel: "새글",
    enterLabel: "열기",
    pinLabel: "핀",
    copyLabel: "복사",
    suggestionsLabel: "제안",
    overviewLabel: "개요",
    graphTabLabel: "그래프",
    listTabLabel: "목록",
    replyingLabel: "서브 스레드에서 답변 중…",
    generatingLabel: "생성 중…",
    caption: {
      idle: "메인이 답변을 표시하고 오른쪽 레일이 스레드 그래프를 보여준다.",
      sweep: "구절을 가로질러 드래그해 선택.",
      selpop: "선택 영역 위에 작은 도구 모음이 나타남.",
      dialog: "핀을 누르면 자동 생성된 후속 질문 3개가 나온다.",
      pick: "원하는 걸 선택.",
      "underline-appear": "앵커에 안료색 밑줄이 떠오른다.",
      "ai-replying": "AI가 서브 스레드에서 답변 —— 메인은 건드리지 않음.",
      "unread-breathing": "메인에 돌아오면 앵커가 읽기 전까지 호흡한다.",
      popover: "밑줄에 호버하면 미리보기 —— 제목, 발췌, Enter.",
      enter: "Enter 클릭으로 서브 스레드 진입.",
      "sub-thread": "서브 스레드 전체 뷰. 브레드크럼: 메인 › 그 부분을 고정.",
      back: "메인 클릭으로 돌아가기. 호흡 멈춤 —— 읽음 표시.",
    },
  },
  es: {
    mainQuestion: "¿Qué hace diferente a Deeppin?",
    anchor: "ancla ese detalle",
    aiPre:
      "Cuando lees una respuesta de IA y quieres profundizar en una parte, tienes dos malas opciones — iniciar un chat nuevo (pierdes todo el contexto) o preguntar en el mismo chat (interrumpes el hilo principal, el tema se desvía). Deeppin te deja",
    aiPost: " y seguir profundizando — tan profundo como quieras. ¿El hilo principal? Ni una palabra interrumpida.",
    suggestions: [
      "Muéstrame exactamente cómo funciona anclar",
      "¿Hasta qué profundidad llegan los sub-hilos?",
      "¿Qué pasa cuando fusiono todo?",
    ],
    threadReply:
      "Selecciona cualquier texto en una respuesta de IA, haz clic en 'Anclar' — se abre un sub-hilo enfocado allí mismo. El chat principal permanece intacto. Puedes anclar de nuevo dentro de las sub-preguntas, sin límite de profundidad. Cuando termines, fusiona todo en un informe estructurado.",
    subTitle: "ancla ese detalle",
    questionTitle: "deeppin — presentación del producto",
    mainCrumb: "Principal",
    newReplyLabel: "Nuevo",
    enterLabel: "Abrir",
    pinLabel: "Anclar",
    copyLabel: "Copiar",
    suggestionsLabel: "sugerencias",
    overviewLabel: "resumen",
    graphTabLabel: "grafo",
    listTabLabel: "lista",
    replyingLabel: "respondiendo en sub-hilo…",
    generatingLabel: "generando…",
    caption: {
      idle: "El hilo principal muestra la respuesta. La barra derecha sigue el grafo de hilos.",
      sweep: "Arrastra sobre una frase para seleccionarla.",
      selpop: "Una barra de herramientas compacta aparece sobre la selección.",
      dialog: "Anclar abre un diálogo con tres preguntas de seguimiento generadas.",
      pick: "Elige la que quieras.",
      "underline-appear": "El ancla se subraya con su color pigmentado.",
      "ai-replying": "IA responde en el sub-hilo — el principal queda intacto.",
      "unread-breathing": "De vuelta al principal, el ancla respira hasta que vea la respuesta.",
      popover: "Pasa el ratón por el subrayado — título, extracto, Abrir.",
      enter: "Haz clic en Abrir para saltar al sub-hilo.",
      "sub-thread": "Vista completa del sub-hilo. Miga: Principal › ancla ese detalle.",
      back: "Haz clic en Principal para volver. La respiración para — respuesta vista.",
    },
  },
  fr: {
    mainQuestion: "Qu'est-ce qui rend Deeppin différent ?",
    anchor: "épingle ce détail",
    aiPre:
      "En lisant une réponse d'IA et en voulant creuser une partie, tu as deux mauvais choix — ouvrir un nouveau chat (tu perds tout le contexte) ou demander dans le même chat (tu coupes le fil principal, le sujet dérive). Deeppin te laisse",
    aiPost: " et continuer à creuser — aussi loin que tu veux. Le fil principal ? Pas un mot interrompu.",
    suggestions: [
      "Montre-moi exactement comment fonctionne l'épinglage",
      "Jusqu'à quelle profondeur les sous-fils vont-ils ?",
      "Que se passe-t-il quand je fusionne tout ?",
    ],
    threadReply:
      "Sélectionne n'importe quel texte dans une réponse d'IA, clique sur 'Épingler' — un sous-fil ciblé s'ouvre sur place. Le chat principal reste intact. Tu peux épingler à nouveau dans les sous-questions — sans limite de profondeur. Quand c'est fini, fusionne tout en un rapport structuré.",
    subTitle: "épingle ce détail",
    questionTitle: "deeppin — présentation du produit",
    mainCrumb: "Principal",
    newReplyLabel: "Nouveau",
    enterLabel: "Ouvrir",
    pinLabel: "Épingler",
    copyLabel: "Copier",
    suggestionsLabel: "suggestions",
    overviewLabel: "vue d'ensemble",
    graphTabLabel: "graphe",
    listTabLabel: "liste",
    replyingLabel: "réponse dans le sous-fil…",
    generatingLabel: "génération…",
    caption: {
      idle: "Le fil principal affiche la réponse. La barre droite suit le graphe des fils.",
      sweep: "Glisse sur une phrase pour la sélectionner.",
      selpop: "Une barre d'outils compacte apparaît au-dessus de la sélection.",
      dialog: "Épingler ouvre une boîte avec trois suivis générés.",
      pick: "Choisis celui que tu veux.",
      "underline-appear": "L'ancre se souligne dans sa couleur de pigment.",
      "ai-replying": "L'IA répond dans le sous-fil — le principal reste intact.",
      "unread-breathing": "De retour dans le principal, l'ancre respire jusqu'à la lecture.",
      popover: "Survole le soulignement pour un aperçu — titre, extrait, Ouvrir.",
      enter: "Clique sur Ouvrir pour entrer dans le sous-fil.",
      "sub-thread": "Vue complète du sous-fil. Fil d'ariane : Principal › épingle ce détail.",
      back: "Clique sur Principal pour revenir. La respiration s'arrête — réponse vue.",
    },
  },
  de: {
    mainQuestion: "Was macht Deeppin anders?",
    anchor: "Pin dieses Detail",
    aiPre:
      "Wenn du eine KI-Antwort liest und tiefer in einen Teil eintauchen willst, hast du zwei schlechte Optionen — neuen Chat starten (gesamter Kontext weg) oder im selben Chat fragen (Hauptthread unterbrochen, Thema driftet). Mit Deeppin kannst du",
    aiPost: " und so tief weitergraben, wie du willst. Der Hauptthread? Kein Wort unterbrochen.",
    suggestions: [
      "Zeig mir Schritt für Schritt, wie Anheften funktioniert",
      "Wie tief können Sub-Threads gehen?",
      "Was passiert, wenn ich alles zusammenführe?",
    ],
    threadReply:
      "Markiere beliebigen Text in einer KI-Antwort, klicke 'Anheften' — ein fokussierter Sub-Thread öffnet sich an Ort und Stelle. Der Haupt-Chat bleibt unberührt. Du kannst innerhalb von Unterfragen erneut anheften — keine Tiefenbegrenzung. Zum Schluss alles in einen strukturierten Bericht zusammenführen.",
    subTitle: "Pin dieses Detail",
    questionTitle: "deeppin — Produktvorstellung",
    mainCrumb: "Haupt",
    newReplyLabel: "Neu",
    enterLabel: "Öffnen",
    pinLabel: "Anheften",
    copyLabel: "Kopieren",
    suggestionsLabel: "Vorschläge",
    overviewLabel: "Übersicht",
    graphTabLabel: "Graph",
    listTabLabel: "Liste",
    replyingLabel: "antwortet im Sub-Thread…",
    generatingLabel: "wird generiert…",
    caption: {
      idle: "Haupt-Thread zeigt die Antwort. Rechts läuft der Thread-Graph mit.",
      sweep: "Ziehe über einen Satz, um ihn zu markieren.",
      selpop: "Eine kompakte Toolbar erscheint über der Auswahl.",
      dialog: "Anheften öffnet einen Dialog mit drei generierten Folgefragen.",
      pick: "Wähle die gewünschte.",
      "underline-appear": "Der Anker bekommt eine Unterstreichung in seiner Pigmentfarbe.",
      "ai-replying": "KI antwortet im Sub-Thread — Haupt bleibt unberührt.",
      "unread-breathing": "Zurück im Haupt, atmet der Anker bis zur Lektüre.",
      popover: "Fahre über die Unterstreichung für eine Vorschau — Titel, Ausschnitt, Öffnen.",
      enter: "Klicke auf Öffnen, um in den Sub-Thread zu springen.",
      "sub-thread": "Vollständige Sub-Thread-Ansicht. Breadcrumb: Haupt › Pin dieses Detail.",
      back: "Klicke auf Haupt, um zurückzukehren. Atmen stoppt — Antwort gesehen.",
    },
  },
  pt: {
    mainQuestion: "O que faz o Deeppin diferente?",
    anchor: "fixe esse detalhe",
    aiPre:
      "Quando você lê uma resposta de IA e quer aprofundar uma parte, tem duas opções ruins — começar um novo chat (perde todo o contexto) ou perguntar no mesmo chat (interrompe o tópico principal, o assunto desvia). O Deeppin permite que você",
    aiPost: " e continue cavando — tão fundo quanto quiser. O tópico principal? Nenhuma palavra interrompida.",
    suggestions: [
      "Mostre-me exatamente como fixar funciona",
      "Quão profundos os sub-tópicos podem ir?",
      "O que acontece quando eu mesclo tudo?",
    ],
    threadReply:
      "Selecione qualquer texto numa resposta da IA, clique em 'Fixar' — um sub-tópico focado abre ali mesmo. O chat principal permanece intacto. Você pode fixar de novo dentro de sub-perguntas, sem limite de profundidade. Quando terminar, mescle tudo num relatório estruturado.",
    subTitle: "fixe esse detalhe",
    questionTitle: "deeppin — apresentação do produto",
    mainCrumb: "Principal",
    newReplyLabel: "Novo",
    enterLabel: "Abrir",
    pinLabel: "Fixar",
    copyLabel: "Copiar",
    suggestionsLabel: "sugestões",
    overviewLabel: "visão geral",
    graphTabLabel: "grafo",
    listTabLabel: "lista",
    replyingLabel: "respondendo no sub-tópico…",
    generatingLabel: "gerando…",
    caption: {
      idle: "O tópico principal mostra a resposta. A barra direita acompanha o grafo.",
      sweep: "Arraste sobre uma frase para selecioná-la.",
      selpop: "Uma barra de ferramentas compacta aparece sobre a seleção.",
      dialog: "Fixar abre um diálogo com três perguntas de seguimento geradas.",
      pick: "Escolha a que quiser.",
      "underline-appear": "A âncora ganha um sublinhado na sua cor de pigmento.",
      "ai-replying": "IA responde no sub-tópico — o principal fica intacto.",
      "unread-breathing": "Voltando ao principal, a âncora respira até você ler.",
      popover: "Passe o mouse no sublinhado para uma prévia — título, trecho, Abrir.",
      enter: "Clique em Abrir para entrar no sub-tópico.",
      "sub-thread": "Vista completa do sub-tópico. Navegação: Principal › fixe esse detalhe.",
      back: "Clique em Principal para voltar. A respiração para — lido.",
    },
  },
  ru: {
    mainQuestion: "Чем Deeppin отличается?",
    anchor: "закрепите эту деталь",
    aiPre:
      "Когда вы читаете ответ ИИ и хотите углубиться в один момент, есть два плохих варианта — начать новый чат (потеряете весь контекст) или спросить в этом же (прервёте основную ветку, тема уйдёт в сторону). Deeppin позволяет вам",
    aiPost: " и копать глубже — как угодно глубоко. Основная ветка? Ни одно слово не прервано.",
    suggestions: [
      "Покажи пошагово, как работает закрепление",
      "Насколько глубоко могут идти подветки?",
      "Что происходит, когда я объединяю всё?",
    ],
    threadReply:
      "Выделите любой текст в ответе ИИ, нажмите «Закрепить» — сфокусированная подветка откроется тут же. Основной чат остаётся нетронутым. Можно закреплять внутри подвопросов — без ограничений по глубине. Когда закончите, объедините всё в один структурированный отчёт.",
    subTitle: "закрепите эту деталь",
    questionTitle: "deeppin — презентация продукта",
    mainCrumb: "Главная",
    newReplyLabel: "Новое",
    enterLabel: "Открыть",
    pinLabel: "Закрепить",
    copyLabel: "Копировать",
    suggestionsLabel: "подсказки",
    overviewLabel: "обзор",
    graphTabLabel: "граф",
    listTabLabel: "список",
    replyingLabel: "отвечает в подветке…",
    generatingLabel: "генерация…",
    caption: {
      idle: "Главная ветка показывает ответ. Правая панель следит за графом.",
      sweep: "Проведите по фразе для выделения.",
      selpop: "Над выделением появляется компактная панель.",
      dialog: "Закрепить открывает диалог с тремя сгенерированными подсказками.",
      pick: "Выберите нужную.",
      "underline-appear": "Якорь получает подчёркивание пигментного цвета.",
      "ai-replying": "ИИ отвечает в подветке — главная не трогается.",
      "unread-breathing": "Вернувшись, якорь «дышит» пока не прочитан.",
      popover: "Наведите на подчёркивание для предпросмотра — заголовок, фрагмент, Открыть.",
      enter: "Щёлкните «Открыть», чтобы войти в подветку.",
      "sub-thread": "Полный вид подветки. Хлебные крошки: Главная › закрепите эту деталь.",
      back: "Щёлкните «Главная», чтобы вернуться. Дыхание прекращается — прочитано.",
    },
  },
};

// ── Component ────────────────────────────────────────────────────────────
export default function PinDemo() {
  const lang = useLangStore((s) => s.lang);
  const c = CONTENT[lang] ?? CONTENT.en;

  const [phase, setPhase] = useState<Phase>("idle");
  const [sweepPct, setSweepPct] = useState(0);
  const [streamLen, setStreamLen] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 自动前进 / Auto-advance phases
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPhase(NEXT[phase]), DELAYS[phase]);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase]);

  // sweep 动画：0 → 1
  useEffect(() => {
    if (phase !== "sweep") {
      setSweepPct(phase === "idle" ? 0 : 1);
      return;
    }
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

  // streaming 子线程回复：逐字打出
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
      if (i < total) timerRef.current = setTimeout(tick, 22);
    };
    tick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, c.threadReply]);

  // 布尔 state 派生 / Derived phase booleans
  const showSelpop = phase === "selpop";
  const showDialog = phase === "dialog" || phase === "pick";
  const pickedIdx = phase === "pick" ? 0 : -1;
  const anchorVisible = [
    "underline-appear",
    "ai-replying",
    "unread-breathing",
    "popover",
    "enter",
    "sub-thread",
    "back",
  ].includes(phase);
  const anchorBreathing = phase === "unread-breathing" || phase === "popover";
  const showPopover = phase === "popover" || phase === "enter";
  const inSub = phase === "ai-replying" || phase === "sub-thread" || phase === "enter";
  const showNewReplyTag = phase === "popover" || phase === "enter";
  const showCapNode = anchorVisible;
  const activeThread: "main" | "cap" = inSub ? "cap" : "main";

  const goToSubThread = useCallback(() => setPhase("sub-thread"), []);

  return (
    <div className="w-full max-w-[1080px] select-none">
      <div
        className="relative rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(27,26,23,0.12)]"
        style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
      >
        {/* Mac 窗口标题栏 / Mac window chrome — 固定 38px 高 */}
        <div
          className="flex items-center gap-2 px-4 h-[38px]"
          style={{ borderBottom: "1px solid var(--rule)" }}
        >
          <div className="flex gap-1.5">
            {["#ff5f57", "#ffbd2e", "#28c840"].map((col) => (
              <span key={col} className="w-2.5 h-2.5 rounded-full" style={{ background: col, opacity: 0.85 }} />
            ))}
          </div>
          <span className="font-mono text-[11px] ml-2" style={{ color: "var(--ink-4)" }}>
            {c.questionTitle}
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.15em]" style={{ color: "var(--ink-4)" }}>
            demo
          </span>
        </div>

        {/* ── 两栏：main + 更宽 right overview，固定高度 / 2-col, fixed height ── */}
        <div
          className="grid"
          style={{ gridTemplateColumns: "1fr 300px", height: 420 }}
        >
          {/* Main 栏 — relative 容器，两个视图绝对定位叠加，不影响外层高度
              Relative container; main + sub views are absolutely layered so
              swapping between them doesn't reflow the demo. */}
          <div
            className="relative overflow-hidden"
            style={{ background: "var(--paper)" }}
          >
            <div className={`absolute inset-0 transition-opacity duration-200 ${inSub ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
              <MainView
                c={c}
                sweepPct={sweepPct}
                anchorVisible={anchorVisible}
                anchorBreathing={anchorBreathing}
                showSelpop={showSelpop}
                phase={phase}
                showPopover={showPopover}
                showNewReplyTag={showNewReplyTag}
                onEnter={goToSubThread}
              />
            </div>
            <div className={`absolute inset-0 transition-opacity duration-200 ${inSub ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
              <SubThreadView c={c} streamLen={streamLen} phase={phase} />
            </div>

            {/* Pin dialog 浮层 */}
            {showDialog && <PinDialog c={c} pickedIdx={pickedIdx} />}
          </div>

          {/* 右栏 — graph view */}
          <RightRail c={c} activeThread={activeThread} showCapNode={showCapNode} phase={phase} />
        </div>

        {/* Caption — 底部提示条，固定高度 */}
        <div
          className="px-5 h-[40px] flex items-center font-mono text-[11px] leading-snug tracking-wide"
          style={{
            borderTop: "1px solid var(--rule)",
            color: "var(--ink-3)",
            background: "var(--paper-2)",
          }}
        >
          <span className="truncate">{c.caption[phase]}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main view (主线) ────────────────────────────────────────────────────
function MainView({
  c,
  sweepPct,
  anchorVisible,
  anchorBreathing,
  showSelpop,
  phase,
  showPopover,
  showNewReplyTag,
  onEnter,
}: {
  c: Copy;
  sweepPct: number;
  anchorVisible: boolean;
  anchorBreathing: boolean;
  showSelpop: boolean;
  phase: Phase;
  showPopover: boolean;
  showNewReplyTag: boolean;
  onEnter: () => void;
}) {
  void onEnter;
  return (
    <div className="relative h-full p-6 overflow-hidden">
      {/* 面包屑 Main */}
      <div className="flex items-center gap-2 mb-4 font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}
        >
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--paper)" }} />
          {c.mainCrumb}
        </span>
      </div>

      {/* User question */}
      <div className="flex flex-col items-end mb-4">
        <div className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--ink-3)" }} />
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

      {/* AI bubble */}
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--accent)" }} />
          <span>AI</span>
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
          {c.aiPre}
          <AnchorSpan
            text={c.anchor}
            sweepPct={sweepPct}
            visible={anchorVisible}
            breathing={anchorBreathing}
            phase={phase}
          />
          {c.aiPost}

          {/* selpop */}
          {showSelpop && <SelPop c={c} />}

          {/* hover popover */}
          {showPopover && <AnchorPopover c={c} showNew={showNewReplyTag} />}
        </div>
      </div>

      {/* Replying indicator（仅 ai-replying phase）*/}
      {phase === "ai-replying" && (
        <div
          className="absolute bottom-3 left-6 font-mono text-[10px] flex items-center gap-2"
          style={{ color: "var(--accent)" }}
        >
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-[4px] h-[4px] rounded-full"
                style={{
                  background: "var(--accent)",
                  animation: "pin-demo-dot 900ms ease-in-out infinite",
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </span>
          <span style={{ opacity: 0.8 }}>{c.replyingLabel}</span>
        </div>
      )}

      <style jsx>{`
        @keyframes pin-demo-dot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-3px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Anchor span — 文字里带下划线的高亮 ──
function AnchorSpan({
  text,
  sweepPct,
  visible,
  breathing,
  phase,
}: {
  text: string;
  sweepPct: number;
  visible: boolean;
  breathing: boolean;
  phase: Phase;
}) {
  const sweeping = phase === "sweep";
  const bg = sweeping
    ? `color-mix(in oklch, var(--accent) ${Math.round(sweepPct * 22)}%, transparent)`
    : undefined;
  const bb = visible || sweeping ? `2px solid ${visible ? "var(--pig-1)" : "transparent"}` : "none";
  return (
    <span
      className={`relative inline ${breathing ? "pin-demo-anchor-unread" : ""}`}
      style={{
        background: bg,
        borderBottom: bb,
        paddingBottom: 1,
        transition: "background 120ms ease-out, border-bottom 220ms ease-out",
      }}
    >
      {text}
      <style jsx>{`
        .pin-demo-anchor-unread {
          animation: pin-demo-pulse 0.95s ease-in-out infinite;
        }
        @keyframes pin-demo-pulse {
          0%, 100% { filter: brightness(0.85); }
          50% { filter: brightness(1.15); }
        }
      `}</style>
    </span>
  );
}

// ── Selpop ──────────────────────────────────────────────────────────────
function SelPop({ c }: { c: Copy }) {
  return (
    <span
      className="absolute left-0 -top-11 z-20 inline-flex items-center gap-[2px] rounded-md shadow-[0_6px_20px_rgba(27,26,23,0.18)]"
      style={{ background: "var(--ink)", color: "var(--paper)", padding: 3 }}
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px]" style={{ color: "var(--paper)" }}>
        <svg className="w-3 h-3" style={{ opacity: 0.75 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
        {c.copyLabel}
      </span>
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-medium"
        style={{ background: "var(--accent)", color: "var(--paper)" }}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
        </svg>
        {c.pinLabel}
      </span>
      <span aria-hidden className="absolute left-[22px] -bottom-1 w-2 h-2 rotate-45" style={{ background: "var(--ink)" }} />
    </span>
  );
}

// ── Pin dialog ──────────────────────────────────────────────────────────
function PinDialog({ c, pickedIdx }: { c: Copy; pickedIdx: number }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center animate-in fade-in-0 duration-150">
      <div className="absolute inset-0" style={{ background: "rgba(27,26,23,0.35)" }} />
      <div
        className="relative w-[84%] max-w-[440px] rounded-xl shadow-[0_16px_48px_rgba(27,26,23,0.18)]"
        style={{ background: "var(--card)", border: "1px solid var(--rule)" }}
      >
        <div className="px-5 pt-4 pb-3 flex items-start gap-3" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
          <span className="w-[3px] h-7 rounded-[2px] flex-shrink-0" style={{ background: "var(--pig-1)" }} />
          <div className="flex-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-1" style={{ color: "var(--accent)" }}>
              {c.pinLabel}
            </div>
            <div className="font-serif text-[13px] italic leading-snug" style={{ color: "var(--ink-2)" }}>
              “{c.anchor}”
            </div>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-[6px]">
          <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-[2px]" style={{ color: "var(--ink-4)" }}>
            {c.suggestionsLabel}
          </div>
          {c.suggestions.map((q, i) => (
            <div
              key={q}
              className="text-left px-3 py-2 rounded-md text-[12.5px] transition-colors"
              style={{
                background: pickedIdx === i ? "var(--accent-soft)" : "var(--paper-2)",
                border: `1px solid ${pickedIdx === i ? "var(--accent)" : "var(--rule-soft)"}`,
                color: pickedIdx === i ? "var(--accent)" : "var(--ink-2)",
              }}
            >
              {q}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Anchor preview popover ────────────────────────────────────────────
function AnchorPopover({ c, showNew }: { c: Copy; showNew: boolean }) {
  return (
    <span
      className="absolute left-0 top-[calc(100%+4px)] z-20 inline-block rounded-xl overflow-hidden shadow-[0_10px_32px_rgba(27,26,23,0.12)] animate-in fade-in-0 duration-150"
      style={{ background: "var(--card)", border: "1px solid var(--rule)", width: 280 }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--pig-1)" }} />
        <span className="flex-1 font-serif text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>
          {c.subTitle}
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
      <div className="px-3 py-2 text-[11.5px] leading-snug" style={{ borderTop: "1px solid var(--rule-soft)", color: "var(--ink-2)" }}>
        {c.threadReply.slice(0, 88)}…
      </div>
      <div className="flex items-center justify-end px-3 py-2" style={{ borderTop: "1px solid var(--rule-soft)", background: "var(--paper-2)" }}>
        <span className="inline-flex items-center gap-1 font-medium text-[11px]" style={{ color: "var(--accent)" }}>
          {c.enterLabel}
          <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </span>
  );
}

// ── Sub-thread view ─────────────────────────────────────────────────────
function SubThreadView({ c, streamLen, phase }: { c: Copy; streamLen: number; phase: Phase }) {
  const streaming = phase === "sub-thread" && streamLen < c.threadReply.length;
  return (
    <div className="relative h-full p-6 overflow-hidden">
      {/* 面包屑 main / sub */}
      <div className="flex items-center gap-1.5 mb-4 font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{ border: "1px solid transparent", color: "var(--ink-3)" }}
        >
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--ink-5)" }} />
          {c.mainCrumb}
        </span>
        <span style={{ color: "var(--ink-5)" }}>›</span>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded"
          style={{ background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" }}
        >
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--pig-1)" }} />
          {c.subTitle}
        </span>
      </div>

      {/* User question in sub */}
      <div className="flex flex-col items-end mb-3">
        <div className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--ink-3)" }} />
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
          {c.suggestions[0]}
        </div>
      </div>

      {/* AI reply */}
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-[7px] mb-[4px] font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-4)" }}>
          <span className="w-[5px] h-[5px] rounded-full" style={{ background: "var(--accent)" }} />
          <span>AI</span>
        </div>
        <div
          className="max-w-[86%] px-[14px] py-[11px] text-[13px] leading-[1.6]"
          style={{
            background: "var(--card)",
            border: "1px solid var(--rule-soft)",
            color: "var(--ink)",
            borderRadius: 14,
            borderBottomLeftRadius: 4,
          }}
        >
          {c.threadReply.slice(0, streamLen)}
          {streaming && (
            <span
              className="inline-block w-[2px] h-3 align-middle ml-[1px]"
              style={{ background: "var(--accent)", animation: "pin-demo-caret 1s steps(2) infinite" }}
            />
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes pin-demo-caret {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Right rail — graph view（圆点 + bezier）─────────────────────────────
function RightRail({
  c,
  activeThread,
  showCapNode,
  phase,
}: {
  c: Copy;
  activeThread: "main" | "cap";
  showCapNode: boolean;
  phase: Phase;
}) {
  const capBreathing = phase === "unread-breathing" || phase === "popover";
  const W = 300;
  const mainX = W / 2;
  const mainY = 80;
  const subX = W / 2;
  const subY = 180;

  return (
    <div className="flex flex-col" style={{ background: "var(--paper-2)", borderLeft: "1px solid var(--rule)" }}>
      {/* rail-head */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--rule)" }}>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--ink-3)" }}>
          {c.overviewLabel}
        </span>
      </div>
      {/* rail-tabs — graph active */}
      <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
        <div
          className="flex-1 text-center py-2 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--ink-4)", borderBottom: "2px solid transparent" }}
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
      {/* rail-body — graph SVG */}
      <div className="flex-1 relative flex items-center justify-center">
        <svg
          viewBox={`0 0 ${W} 300`}
          style={{ width: "100%", height: "100%", maxHeight: 300 }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* edge main → cap */}
          {showCapNode && (
            <path
              d={`M ${mainX} ${mainY} C ${mainX} ${mainY + 45}, ${subX} ${subY - 45}, ${subX} ${subY}`}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth={1}
              style={{ opacity: phase === "underline-appear" ? 0 : 1, transition: "opacity 400ms ease" }}
            />
          )}

          {/* main node */}
          <g>
            <circle
              cx={mainX}
              cy={mainY}
              r={activeThread === "main" ? 6 : 4.5}
              fill={activeThread === "main" ? "var(--ink)" : "var(--paper-2)"}
              stroke="var(--ink)"
              strokeWidth={activeThread === "main" ? 0 : 1.25}
            />
            <text
              x={mainX}
              y={mainY + 22}
              fontSize={11}
              fill={activeThread === "main" ? "var(--ink)" : "var(--ink-3)"}
              style={{ fontFamily: "var(--font-serif)" }}
              textAnchor="middle"
              fontWeight={activeThread === "main" ? 500 : 400}
            >
              {c.mainCrumb}
            </text>
          </g>

          {/* cap node */}
          {showCapNode && (
            <g
              style={{
                opacity: phase === "underline-appear" ? 0 : 1,
                transform: phase === "underline-appear" ? "translateY(-6px)" : "translateY(0)",
                transition: "opacity 400ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
                transformOrigin: `${subX}px ${subY}px`,
              }}
            >
              <circle
                cx={subX}
                cy={subY}
                r={activeThread === "cap" ? 6 : 4.5}
                fill={activeThread === "cap" ? "var(--pig-1)" : "var(--paper-2)"}
                stroke="var(--pig-1)"
                strokeWidth={activeThread === "cap" ? 0 : 1.25}
              />
              {/* unread pulse */}
              {capBreathing && (
                <circle cx={subX + 7} cy={subY - 5} r={3.5} fill="var(--accent)" stroke="var(--paper)" strokeWidth={1.25}>
                  <animate attributeName="r" values="3.5;4.5;3.5" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <text
                x={subX}
                y={subY + 22}
                fontSize={11}
                fill={activeThread === "cap" ? "var(--ink)" : "var(--ink-3)"}
                style={{ fontFamily: "var(--font-serif)" }}
                textAnchor="middle"
                fontWeight={activeThread === "cap" ? 500 : 400}
              >
                {c.subTitle.length > 18 ? c.subTitle.slice(0, 17) + "…" : c.subTitle}
              </text>
              {/* generating label */}
              {phase === "ai-replying" && (
                <text
                  x={subX}
                  y={subY + 38}
                  fontSize={9}
                  fill="var(--accent)"
                  style={{ fontFamily: "var(--font-mono)" }}
                  textAnchor="middle"
                >
                  {c.generatingLabel}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
