"use client";
// components/PinDemo.tsx — 插针完整流程演示

import { useEffect, useRef, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import type { Lang } from "@/lib/i18n";

// ── 颜色常量 — 使用新 brand: warm paper + deep-ink indigo ──────────────────
// Colors — new brand palette (warm paper + deep-ink indigo).
const C = {
  bg:          "#f5f1ea",             // paper
  surface:     "#fbf8f2",             // card
  border:      "rgba(27,26,23,0.10)", // ink-10% (rule)
  borderSub:   "rgba(27,26,23,0.06)", // ink-6% (rule-soft)
  textHi:      "rgb(27,26,23)",       // ink
  textMd:      "rgb(68,65,60)",       // ink-2
  textLo:      "rgb(113,108,99)",     // ink-3
  textFaint:   "rgb(154,147,138)",    // ink-4
  // Deep-ink indigo (#2a2a72)
  indigo:      "rgba(42,42,114,",
  indigoSolid: "rgb(42,42,114)",
  indigoText:  "rgb(63,61,153)",      // accent-2 #3f3d99
  indigoLight: "rgb(224,220,241)",    // accent-soft #e0dcf1
};
const ind = (a: number) => `${C.indigo}${a})`;

// ── 阶段 ──────────────────────────────────────────────────────────────────────
type Phase =
  | "idle" | "sweeping" | "pin-menu" | "pin-click"
  | "dialog-open" | "dialog-ready" | "hover-suggest" | "click-suggest"
  | "card-in" | "streaming" | "unread" | "card-hover" | "card-click"
  | "thread-view" | "thread-done" | "back-click" | "back-main";

const DELAYS: Record<Phase, number> = {
  "idle": 2000, "sweeping": 1400, "pin-menu": 1600, "pin-click": 600,
  "dialog-open": 1600, "dialog-ready": 1400, "hover-suggest": 1200,
  "click-suggest": 600, "card-in": 1200, "streaming": 3600,
  "unread": 1600, "card-hover": 2600, "card-click": 600,
  "thread-view": 4000, "thread-done": 2000, "back-click": 700, "back-main": 2200,
};
const NEXT: Record<Phase, Phase> = {
  "idle": "sweeping", "sweeping": "pin-menu", "pin-menu": "pin-click",
  "pin-click": "dialog-open", "dialog-open": "dialog-ready",
  "dialog-ready": "hover-suggest", "hover-suggest": "click-suggest",
  "click-suggest": "card-in", "card-in": "streaming", "streaming": "unread",
  "unread": "card-hover", "card-hover": "card-click", "card-click": "thread-view",
  "thread-view": "thread-done", "thread-done": "back-click",
  "back-click": "back-main", "back-main": "idle",
};
const PHASE_ORDER: Phase[] = [
  "idle","sweeping","pin-menu","pin-click",
  "dialog-open","dialog-ready","hover-suggest","click-suggest",
  "card-in","streaming","unread","card-hover","card-click",
  "thread-view","thread-done","back-click","back-main",
];

// ── 多语种内容 / Multi-locale content ───────────────────────────────────────
type Content = {
  aiText: string;
  anchor: string;
  raftInText: string;
  hashInText: string;
  suggestions: readonly string[];
  cardReply: string;
  threadReplyFull: string;
  existingCard: { label: string; anchor: string; preview: string };
  nodeRaft: readonly [string, string];
  nodeHash: readonly [string, string];
  nodeCap: readonly [string, string];
  nodeLeader: string;
  nodeMain: string;
  questionTitle: string;
  subThreadsLabel: string;
  overviewLabel: string;
  listLabel: string;
  graphLabel: string;
  mergeLabel: string;
  mainLabel: string;
  hintText: string;
  customPlaceholder: string;
  continuePrompt: string;
  suggestionsLabel: string;
  copyLabel: string;
  pinLabel: string;
  preparingReply: string;
  captions: Record<Phase, string>;
};

const CONTENT: Record<Lang, Content> = {
  zh: {
    aiText:     "在分布式系统中，CAP 定理指出你只能同时保证「一致性」「可用性」「分区容忍性」三者中的两个。Raft 协议通过 Leader 选举解决了这一权衡，而一致性哈希让节点扩缩容时数据迁移量最小化。",
    anchor:     "CAP 定理",
    raftInText: "Raft 协议",
    hashInText: "一致性哈希",
    suggestions: [
      "CAP 定理在实际系统中如何取舍？",
      "一致性和可用性哪个更重要？",
      "举个 CAP 权衡的真实案例？",
    ],
    cardReply:  "CAP 由 Brewer 提出：发生网络分区（P）时，系统只能在一致性（C）和可用性（A）中选一。银行系统选 CP，保证每笔交易强一致；DNS 选 AP，即使部分节点宕机也能继续响应查询……",
    threadReplyFull: "CAP 定理（Consistency、Availability、Partition tolerance）由 Eric Brewer 在 2000 年提出，正式证明由 Gilbert 和 Lynch 在 2002 年完成。\n\n核心结论：当网络分区（P）不可避免时，系统设计者必须在一致性（C）和可用性（A）之间做出取舍。\n\n• **CP 系统**：HBase、ZooKeeper — 分区时拒绝写入，保证数据绝对一致\n• **AP 系统**：Cassandra、CouchDB — 分区时继续服务，但可能读到旧数据\n• **实践中**：大多数系统在 C 和 A 之间动态权衡，根据业务场景调整一致性级别",
    existingCard: {
      label:   "Raft 协议",
      anchor:  "Raft 协议",
      preview: "通过 Leader 选举 + 日志复制实现强一致性，相比 Paxos 实现更清晰……",
    },
    nodeRaft:   ["Raft", "协议"],
    nodeHash:   ["一致性", "哈希"],
    nodeCap:    ["CAP", "定理"],
    nodeLeader: "Leader 选举",
    nodeMain:   "主线对话",
    questionTitle:     "如何设计一个分布式系统？",
    subThreadsLabel:   "子问题",
    overviewLabel:     "概览",
    listLabel:         "列表",
    graphLabel:        "节点图",
    mergeLabel:        "合并输出",
    mainLabel:         "主线",
    hintText:          "选中任意文字即可插针深探",
    customPlaceholder: "或自己提问…",
    continuePrompt:    "继续追问 CAP 定理…",
    suggestionsLabel:  "推荐问题",
    copyLabel:         "复制",
    pinLabel:          "插针",
    preparingReply:    "正在准备回复…",
    captions: {
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
    },
  },
  en: {
    aiText:     "In distributed systems, Raft uses leader election for consensus, directly addressing trade-offs defined by the CAP theorem: you can only guarantee two of three — Consistency, Availability, or Partition tolerance. Consistent hashing then minimizes data movement as nodes scale.",
    anchor:     "CAP theorem",
    raftInText: "Raft",
    hashInText: "Consistent hashing",
    suggestions: [
      "How do you trade off CAP in practice?",
      "Which matters more: consistency or availability?",
      "Give a real-world CAP trade-off example?",
    ],
    cardReply:  "CAP, proposed by Brewer: when partitions (P) occur, you must choose Consistency (C) or Availability (A). Banks choose CP for strong transaction guarantees; DNS chooses AP to keep responding even when nodes go down…",
    threadReplyFull: "The CAP theorem (Consistency, Availability, Partition tolerance) was proposed by Eric Brewer in 2000 and formally proven by Gilbert and Lynch in 2002.\n\nCore conclusion: when network partitions (P) are unavoidable, architects must choose between Consistency (C) and Availability (A).\n\n• **CP systems**: HBase, ZooKeeper — reject writes during partitions to guarantee strong consistency\n• **AP systems**: Cassandra, CouchDB — keep serving during partitions, but may return stale data\n• **In practice**: most systems dynamically balance C and A, adjusting consistency levels per use case",
    existingCard: {
      label:   "Raft Protocol",
      anchor:  "Raft",
      preview: "Strong consistency via leader election + log replication; simpler than Paxos…",
    },
    nodeRaft:   ["Raft", "Protocol"],
    nodeHash:   ["Hash", "Ring"],
    nodeCap:    ["CAP", "Theorem"],
    nodeLeader: "Leader Election",
    nodeMain:   "Main thread",
    questionTitle:     "How do you design a distributed system?",
    subThreadsLabel:   "Threads",
    overviewLabel:     "Overview",
    listLabel:         "List",
    graphLabel:        "Graph",
    mergeLabel:        "Merge",
    mainLabel:         "Main",
    hintText:          "Select any text to open a sub-thread",
    customPlaceholder: "Or ask your own…",
    continuePrompt:    "Continue asking about CAP theorem…",
    suggestionsLabel:  "Suggestions",
    copyLabel:         "Copy",
    pinLabel:          "Pin",
    preparingReply:    "Preparing reply…",
    captions: {
      "idle":          "AI response complete. An existing pin 'Raft Protocol' is on the left, with its anchor highlighted in the main thread.",
      "sweeping":      "Click and drag over 'CAP theorem' — the blue highlight expands with the cursor as you select.",
      "pin-menu":      "Release the mouse. A floating toolbar appears above the selection: 'Copy' on the left, 'Pin' on the right.",
      "pin-click":     "Click 'Pin' — the button glows and the selection is locked.",
      "dialog-open":   "The pin dialog appears. Anchor text is quoted at top; AI is generating suggested follow-ups (loading).",
      "dialog-ready":  "Suggestions ready — three clickable follow-up options appear. You can also type your own.",
      "hover-suggest": "Hover over the first suggestion — background highlights.",
      "click-suggest": "Click to send. The question enters the sub-thread and the dialog closes.",
      "card-in":       "A sub-thread card slides in from the left. In the overview graph, the CAP theorem node appears alongside existing sub-questions.",
      "streaming":     "AI answers independently in the sub-thread. The card shows live output. The main thread is unaffected.",
      "unread":        "Reply complete — the card badge turns red, signaling unread content.",
      "card-hover":    "Hover over the card — a curved line extends from the card to the 'CAP theorem' anchor in the main thread.",
      "card-click":    "Click the card to enter the full sub-thread view.",
      "thread-view":   "The center column switches to the sub-thread: breadcrumb navigation at top, full Q&A below.",
      "thread-done":   "Full sub-thread content visible. Continue asking, or click 'Main' in the breadcrumb to return.",
      "back-click":    "Click 'Main' in the breadcrumb — button highlights and return triggers.",
      "back-main":     "The center slides back to the main thread. All anchor highlights remain. The card stays — click anytime to re-enter.",
    },
  },
  ja: {
    aiText:     "分散システムでは、Raft プロトコルが Leader 選挙でコンセンサスを実現し、CAP 定理が定める「一貫性・可用性・分断耐性」の三つのうち二つしか同時に保証できないというトレードオフを直接扱う。ノード追加・削減時のデータ移動はコンシステントハッシュで最小化される。",
    anchor:     "CAP 定理",
    raftInText: "Raft プロトコル",
    hashInText: "コンシステントハッシュ",
    suggestions: [
      "CAP 定理は実システムでどう選ぶ？",
      "一貫性と可用性、どちらが重要？",
      "CAP トレードオフの実例は？",
    ],
    cardReply:  "CAP は Brewer が提唱：ネットワーク分断（P）が発生すると、一貫性（C）か可用性（A）のどちらかしか選べない。銀行は CP を選び強一貫性を保証、DNS は AP を選び一部ノード停止時も応答を継続……",
    threadReplyFull: "CAP 定理（Consistency、Availability、Partition tolerance）は 2000 年に Eric Brewer が提唱し、2002 年に Gilbert と Lynch が正式に証明した。\n\n核心結論：ネットワーク分断（P）が避けられないとき、設計者は一貫性（C）と可用性（A）のどちらかを選ばなければならない。\n\n• **CP システム**：HBase、ZooKeeper — 分断時に書き込みを拒否し強一貫性を保証\n• **AP システム**：Cassandra、CouchDB — 分断時も応答を継続、ただし古いデータを返す可能性あり\n• **実践では**：多くのシステムは C と A を動的に調整し、ユースケースに応じて一貫性レベルを変える",
    existingCard: {
      label:   "Raft プロトコル",
      anchor:  "Raft プロトコル",
      preview: "Leader 選挙 + ログ複製で強一貫性を実現。Paxos より実装が明快……",
    },
    nodeRaft:   ["Raft", "プロトコル"],
    nodeHash:   ["一貫", "ハッシュ"],
    nodeCap:    ["CAP", "定理"],
    nodeLeader: "Leader 選挙",
    nodeMain:   "メインスレッド",
    questionTitle:     "分散システムはどう設計する？",
    subThreadsLabel:   "スレッド",
    overviewLabel:     "概要",
    listLabel:         "リスト",
    graphLabel:        "グラフ",
    mergeLabel:        "統合",
    mainLabel:         "メイン",
    hintText:          "テキストを選択してサブスレッドを開く",
    customPlaceholder: "自分で質問…",
    continuePrompt:    "CAP 定理についてさらに質問…",
    suggestionsLabel:  "候補",
    copyLabel:         "コピー",
    pinLabel:          "ピン",
    preparingReply:    "返信を準備中…",
    captions: {
      "idle":          "AI の回答が完了。左には既存のピン「Raft プロトコル」があり、本文中の対応語がハイライト表示されている。",
      "sweeping":      "マウスをドラッグして「CAP 定理」を選択、青色のハイライトがカーソルとともに広がる。",
      "pin-menu":      "マウスを離すと、選択範囲の上にツールバーが出現：左「コピー」、右「ピン」。",
      "pin-click":     "「ピン」をクリック、ボタンが発光し選択がロックされる。",
      "dialog-open":   "ピン作成ダイアログが出現。上部にアンカー原文、AI が候補質問を生成中（ローディング）。",
      "dialog-ready":  "候補が生成され、3 つのクリック可能な質問が表示される。自分で入力もできる。",
      "hover-suggest": "マウスを 1 番目の候補にホバー、背景がハイライト。",
      "click-suggest": "クリックして送信。質問はサブスレッドに入り、ダイアログが閉じる。",
      "card-in":       "左側にサブスレッドのカードがスライドイン。右の概要図では CAP 定理ノードが他の子問題と同じ階層に追加される。",
      "streaming":     "AI がサブスレッドで独立に回答、カードにはストリーミング出力が表示される。メインスレッドには影響なし。",
      "unread":        "回答が完了、カードの角バッジが赤に変わり未読を知らせる。",
      "card-hover":    "カードにホバーすると、カードから本文中の「CAP 定理」アンカー位置まで曲線が伸びる。",
      "card-click":    "カードをクリックしてサブスレッドの全体ビューへ。",
      "thread-view":   "中央カラムがサブスレッド対話に切り替わる：上部にパンくず、下に完全な問答。",
      "thread-done":   "サブスレッドの内容がすべて表示される。さらに追問するか、パンくずの「メイン」で戻れる。",
      "back-click":    "パンくずの「メイン」をクリック、ボタンがハイライトし戻りアクションが発動。",
      "back-main":     "中央がメインスレッドに戻る。すべてのアンカーハイライトは保持。左のカードはそのまま、いつでも再入場できる。",
    },
  },
  ko: {
    aiText:     "분산 시스템에서 Raft 프로토콜은 리더 선출로 합의를 달성하며, CAP 정리가 정의하는 트레이드오프를 직접 다룬다: 일관성·가용성·분할 내성 중 두 가지만 동시에 보장할 수 있다. 노드 확장·축소 시 데이터 이동은 일관성 해싱으로 최소화된다.",
    anchor:     "CAP 정리",
    raftInText: "Raft 프로토콜",
    hashInText: "일관성 해싱",
    suggestions: [
      "실제 시스템에서 CAP 정리를 어떻게 선택할까?",
      "일관성과 가용성 중 어느 것이 더 중요한가?",
      "CAP 트레이드오프의 실제 사례는?",
    ],
    cardReply:  "CAP는 Brewer가 제안: 네트워크 분할(P)이 발생하면 일관성(C)과 가용성(A) 중 하나만 선택 가능. 은행 시스템은 강한 일관성을 위해 CP를 선택하고, DNS는 일부 노드 장애에도 응답을 유지하기 위해 AP를 선택한다……",
    threadReplyFull: "CAP 정리(Consistency, Availability, Partition tolerance)는 2000년 Eric Brewer가 제안했고, 2002년 Gilbert와 Lynch가 정식으로 증명했다.\n\n핵심 결론: 네트워크 분할(P)이 불가피할 때, 설계자는 일관성(C)과 가용성(A) 중 하나를 선택해야 한다.\n\n• **CP 시스템**: HBase, ZooKeeper — 분할 시 쓰기를 거부하여 강한 일관성 보장\n• **AP 시스템**: Cassandra, CouchDB — 분할 중에도 서비스를 계속하지만 오래된 데이터를 반환할 수 있음\n• **실무에서는**: 대부분의 시스템이 C와 A를 동적으로 조정하며, 사용 사례에 따라 일관성 수준을 변경한다",
    existingCard: {
      label:   "Raft 프로토콜",
      anchor:  "Raft 프로토콜",
      preview: "리더 선출 + 로그 복제로 강한 일관성 구현. Paxos보다 명확한 구현……",
    },
    nodeRaft:   ["Raft", "프로토콜"],
    nodeHash:   ["일관성", "해싱"],
    nodeCap:    ["CAP", "정리"],
    nodeLeader: "리더 선출",
    nodeMain:   "메인 스레드",
    questionTitle:     "분산 시스템을 어떻게 설계할까?",
    subThreadsLabel:   "스레드",
    overviewLabel:     "개요",
    listLabel:         "목록",
    graphLabel:        "그래프",
    mergeLabel:        "병합",
    mainLabel:         "메인",
    hintText:          "텍스트를 선택하여 하위 스레드 열기",
    customPlaceholder: "직접 질문하기…",
    continuePrompt:    "CAP 정리에 대해 계속 질문…",
    suggestionsLabel:  "제안",
    copyLabel:         "복사",
    pinLabel:          "핀",
    preparingReply:    "답변 준비 중…",
    captions: {
      "idle":          "AI 답변 완료. 왼쪽에 기존 핀 'Raft 프로토콜'이 있고, 본문의 해당 단어가 하이라이트된다.",
      "sweeping":      "마우스를 드래그하여 'CAP 정리'를 선택, 파란 하이라이트가 커서를 따라 확장된다.",
      "pin-menu":      "마우스를 놓으면 선택 영역 위에 도구 모음이 나타난다: 왼쪽 '복사', 오른쪽 '핀'.",
      "pin-click":     "'핀' 버튼을 클릭, 버튼이 빛나고 선택이 잠긴다.",
      "dialog-open":   "핀 대화 상자 출현. 상단에 앵커 원문, AI가 제안 질문을 생성 중(로딩).",
      "dialog-ready":  "제안 준비 완료 — 클릭 가능한 후속 질문 세 개가 나타난다. 직접 입력할 수도 있다.",
      "hover-suggest": "첫 번째 제안 위에 호버, 배경이 하이라이트된다.",
      "click-suggest": "클릭하여 전송. 질문이 하위 스레드에 들어가고 대화 상자가 닫힌다.",
      "card-in":       "왼쪽에서 하위 스레드 카드가 슬라이드 인. 오른쪽 개요 그래프에 CAP 정리 노드가 기존 하위 질문과 같은 층에 나타난다.",
      "streaming":     "AI가 하위 스레드에서 독립적으로 답변하고, 카드는 스트리밍 출력을 표시한다. 메인 스레드는 영향받지 않는다.",
      "unread":        "답변 완료, 카드 배지가 빨간색으로 바뀌어 읽지 않은 내용을 알린다.",
      "card-hover":    "카드 위에 호버하면, 카드에서 본문의 'CAP 정리' 앵커 위치까지 곡선이 뻗는다.",
      "card-click":    "카드를 클릭하여 전체 하위 스레드 뷰로 진입.",
      "thread-view":   "중앙 열이 하위 스레드 대화로 전환된다: 상단 브레드크럼, 하단 전체 문답.",
      "thread-done":   "하위 스레드 내용이 모두 보인다. 추가 질문하거나 브레드크럼의 '메인'을 클릭해 돌아갈 수 있다.",
      "back-click":    "브레드크럼 '메인' 클릭 — 버튼이 하이라이트되고 복귀 동작이 촉발된다.",
      "back-main":     "중앙이 메인 스레드로 슬라이드 백. 모든 앵커 하이라이트가 유지된다. 카드는 남아 있어 언제든 다시 들어갈 수 있다.",
    },
  },
  es: {
    aiText:     "En los sistemas distribuidos, el protocolo Raft usa la elección de líder para lograr consenso, abordando directamente el compromiso definido por el teorema CAP: solo puedes garantizar dos de tres — consistencia, disponibilidad o tolerancia a particiones. El hashing consistente luego minimiza el movimiento de datos al escalar nodos.",
    anchor:     "teorema CAP",
    raftInText: "protocolo Raft",
    hashInText: "hashing consistente",
    suggestions: [
      "¿Cómo se negocia el CAP en la práctica?",
      "¿Qué importa más: consistencia o disponibilidad?",
      "¿Un ejemplo real de compromiso CAP?",
    ],
    cardReply:  "CAP, propuesto por Brewer: cuando ocurren particiones (P), debes elegir entre consistencia (C) y disponibilidad (A). Los bancos eligen CP para garantizar transacciones fuertes; DNS elige AP para seguir respondiendo incluso cuando caen nodos…",
    threadReplyFull: "El teorema CAP (Consistency, Availability, Partition tolerance) fue propuesto por Eric Brewer en 2000 y demostrado formalmente por Gilbert y Lynch en 2002.\n\nConclusión principal: cuando las particiones de red (P) son inevitables, los arquitectos deben elegir entre consistencia (C) y disponibilidad (A).\n\n• **Sistemas CP**: HBase, ZooKeeper — rechazan escrituras durante particiones para garantizar consistencia fuerte\n• **Sistemas AP**: Cassandra, CouchDB — siguen atendiendo durante particiones, pero pueden devolver datos obsoletos\n• **En la práctica**: la mayoría de los sistemas equilibran C y A dinámicamente, ajustando el nivel de consistencia según el caso de uso",
    existingCard: {
      label:   "Protocolo Raft",
      anchor:  "Raft",
      preview: "Consistencia fuerte vía elección de líder + replicación de log; más simple que Paxos…",
    },
    nodeRaft:   ["Raft", "Protocolo"],
    nodeHash:   ["Hash", "Anillo"],
    nodeCap:    ["CAP", "Teorema"],
    nodeLeader: "Elección de líder",
    nodeMain:   "Hilo principal",
    questionTitle:     "¿Cómo diseñar un sistema distribuido?",
    subThreadsLabel:   "Hilos",
    overviewLabel:     "Resumen",
    listLabel:         "Lista",
    graphLabel:        "Grafo",
    mergeLabel:        "Fusionar",
    mainLabel:         "Principal",
    hintText:          "Selecciona texto para abrir un sub-hilo",
    customPlaceholder: "O pregunta tú…",
    continuePrompt:    "Seguir preguntando sobre el teorema CAP…",
    suggestionsLabel:  "Sugerencias",
    copyLabel:         "Copiar",
    pinLabel:          "Anclar",
    preparingReply:    "Preparando respuesta…",
    captions: {
      "idle":          "Respuesta de la IA completa. Un anclaje existente 'Protocolo Raft' está a la izquierda, con su ancla resaltada en el hilo principal.",
      "sweeping":      "Haz clic y arrastra sobre 'teorema CAP' — el resaltado azul se expande con el cursor al seleccionar.",
      "pin-menu":      "Suelta el ratón. Una barra flotante aparece sobre la selección: 'Copiar' a la izquierda, 'Anclar' a la derecha.",
      "pin-click":     "Haz clic en 'Anclar' — el botón brilla y la selección queda bloqueada.",
      "dialog-open":   "Aparece el diálogo de anclaje. El texto ancla se cita arriba; la IA genera preguntas sugeridas (cargando).",
      "dialog-ready":  "Sugerencias listas — aparecen tres preguntas de seguimiento clicables. También puedes escribir la tuya.",
      "hover-suggest": "Pasa sobre la primera sugerencia — el fondo se resalta.",
      "click-suggest": "Haz clic para enviar. La pregunta entra al sub-hilo y el diálogo se cierra.",
      "card-in":       "Una tarjeta de sub-hilo entra desde la izquierda. En el grafo de resumen, el nodo del teorema CAP aparece junto a las sub-preguntas existentes.",
      "streaming":     "La IA responde de forma independiente en el sub-hilo. La tarjeta muestra la salida en vivo. El hilo principal no se altera.",
      "unread":        "Respuesta completa — la insignia de la tarjeta se vuelve roja, señalando contenido no leído.",
      "card-hover":    "Pasa sobre la tarjeta — una línea curva se extiende de la tarjeta hasta el ancla 'teorema CAP' en el hilo principal.",
      "card-click":    "Haz clic en la tarjeta para entrar en la vista completa del sub-hilo.",
      "thread-view":   "La columna central cambia al sub-hilo: navegación de migas arriba, Q&A completa debajo.",
      "thread-done":   "Contenido completo del sub-hilo visible. Sigue preguntando, o haz clic en 'Principal' en las migas para volver.",
      "back-click":    "Haz clic en 'Principal' en las migas — el botón se resalta y dispara el regreso.",
      "back-main":     "El centro vuelve al hilo principal. Todos los resaltados de anclas permanecen. La tarjeta sigue ahí — haz clic cuando quieras para volver a entrar.",
    },
  },
  fr: {
    aiText:     "Dans les systèmes distribués, le protocole Raft utilise l'élection d'un leader pour atteindre le consensus, ce qui traite directement le compromis défini par le théorème CAP : vous ne pouvez garantir que deux des trois — cohérence, disponibilité ou tolérance au partitionnement. Le hachage cohérent minimise ensuite le déplacement des données lors du passage à l'échelle.",
    anchor:     "théorème CAP",
    raftInText: "protocole Raft",
    hashInText: "hachage cohérent",
    suggestions: [
      "Comment arbitrer CAP en pratique ?",
      "Qu'est-ce qui compte le plus : cohérence ou disponibilité ?",
      "Un exemple concret de compromis CAP ?",
    ],
    cardReply:  "CAP, proposé par Brewer : en cas de partition (P), vous devez choisir entre cohérence (C) et disponibilité (A). Les banques choisissent CP pour des garanties transactionnelles fortes ; le DNS choisit AP pour continuer à répondre même quand des nœuds tombent…",
    threadReplyFull: "Le théorème CAP (Consistency, Availability, Partition tolerance) a été proposé par Eric Brewer en 2000 et formellement prouvé par Gilbert et Lynch en 2002.\n\nConclusion principale : lorsque les partitions réseau (P) sont inévitables, les architectes doivent choisir entre cohérence (C) et disponibilité (A).\n\n• **Systèmes CP** : HBase, ZooKeeper — refusent les écritures pendant les partitions pour garantir une cohérence forte\n• **Systèmes AP** : Cassandra, CouchDB — continuent à servir pendant les partitions, mais peuvent renvoyer des données obsolètes\n• **En pratique** : la plupart des systèmes équilibrent dynamiquement C et A, en ajustant le niveau de cohérence selon l'usage",
    existingCard: {
      label:   "Protocole Raft",
      anchor:  "Raft",
      preview: "Cohérence forte via élection de leader + réplication de journal ; plus simple que Paxos…",
    },
    nodeRaft:   ["Raft", "Protocole"],
    nodeHash:   ["Hachage", "Anneau"],
    nodeCap:    ["CAP", "Théorème"],
    nodeLeader: "Élection du leader",
    nodeMain:   "Fil principal",
    questionTitle:     "Comment concevoir un système distribué ?",
    subThreadsLabel:   "Fils",
    overviewLabel:     "Vue d'ensemble",
    listLabel:         "Liste",
    graphLabel:        "Graphe",
    mergeLabel:        "Fusionner",
    mainLabel:         "Principal",
    hintText:          "Sélectionnez du texte pour ouvrir un sous-fil",
    customPlaceholder: "Ou posez votre propre question…",
    continuePrompt:    "Continuer sur le théorème CAP…",
    suggestionsLabel:  "Suggestions",
    copyLabel:         "Copier",
    pinLabel:          "Épingler",
    preparingReply:    "Préparation de la réponse…",
    captions: {
      "idle":          "Réponse de l'IA terminée. Une épingle existante 'Protocole Raft' est à gauche, avec son ancre surlignée dans le fil principal.",
      "sweeping":      "Cliquez et faites glisser sur 'théorème CAP' — le surlignage bleu s'étend avec le curseur.",
      "pin-menu":      "Relâchez la souris. Une barre flottante apparaît au-dessus de la sélection : 'Copier' à gauche, 'Épingler' à droite.",
      "pin-click":     "Cliquez sur 'Épingler' — le bouton s'illumine et la sélection est verrouillée.",
      "dialog-open":   "Le dialogue d'épinglage apparaît. Le texte d'ancre est cité en haut ; l'IA génère des suggestions (chargement).",
      "dialog-ready":  "Suggestions prêtes — trois questions cliquables apparaissent. Vous pouvez aussi saisir la vôtre.",
      "hover-suggest": "Survolez la première suggestion — le fond se surligne.",
      "click-suggest": "Cliquez pour envoyer. La question entre dans le sous-fil et le dialogue se ferme.",
      "card-in":       "Une carte de sous-fil glisse depuis la gauche. Dans le graphe, le nœud du théorème CAP apparaît à côté des sous-questions existantes.",
      "streaming":     "L'IA répond indépendamment dans le sous-fil. La carte montre la sortie en direct. Le fil principal n'est pas affecté.",
      "unread":        "Réponse terminée — le badge de la carte devient rouge, signalant du contenu non lu.",
      "card-hover":    "Survolez la carte — une courbe s'étend de la carte jusqu'à l'ancre 'théorème CAP' dans le fil principal.",
      "card-click":    "Cliquez sur la carte pour entrer dans la vue complète du sous-fil.",
      "thread-view":   "La colonne centrale bascule sur le sous-fil : fil d'Ariane en haut, Q&R complète en dessous.",
      "thread-done":   "Contenu du sous-fil entièrement visible. Continuez à poser des questions, ou cliquez sur 'Principal' dans le fil d'Ariane pour revenir.",
      "back-click":    "Cliquez sur 'Principal' dans le fil d'Ariane — le bouton se surligne et déclenche le retour.",
      "back-main":     "Le centre revient au fil principal. Tous les surlignages d'ancre restent. La carte reste — cliquez à tout moment pour y revenir.",
    },
  },
  de: {
    aiText:     "In verteilten Systemen verwendet das Raft-Protokoll eine Leader-Wahl zur Konsensbildung und adressiert direkt den vom CAP-Theorem definierten Kompromiss: Sie können nur zwei von drei Eigenschaften garantieren — Konsistenz, Verfügbarkeit oder Partitionstoleranz. Konsistentes Hashing minimiert anschließend die Datenbewegung beim Skalieren von Knoten.",
    anchor:     "CAP-Theorem",
    raftInText: "Raft-Protokoll",
    hashInText: "Konsistentes Hashing",
    suggestions: [
      "Wie wägt man CAP in der Praxis ab?",
      "Was ist wichtiger: Konsistenz oder Verfügbarkeit?",
      "Ein reales Beispiel für einen CAP-Kompromiss?",
    ],
    cardReply:  "CAP, vorgeschlagen von Brewer: Tritt eine Partition (P) auf, muss man zwischen Konsistenz (C) und Verfügbarkeit (A) wählen. Banken wählen CP für starke Transaktionsgarantien; DNS wählt AP, um auch bei Knotenausfällen weiter zu antworten…",
    threadReplyFull: "Das CAP-Theorem (Consistency, Availability, Partition tolerance) wurde 2000 von Eric Brewer vorgeschlagen und 2002 von Gilbert und Lynch formal bewiesen.\n\nKernaussage: Wenn Netzwerkpartitionen (P) unvermeidlich sind, müssen Architekten zwischen Konsistenz (C) und Verfügbarkeit (A) wählen.\n\n• **CP-Systeme**: HBase, ZooKeeper — lehnen Schreibvorgänge bei Partitionen ab, um starke Konsistenz zu garantieren\n• **AP-Systeme**: Cassandra, CouchDB — bedienen weiter während Partitionen, können aber veraltete Daten liefern\n• **In der Praxis**: Die meisten Systeme balancieren C und A dynamisch und passen die Konsistenzstufe je Anwendungsfall an",
    existingCard: {
      label:   "Raft-Protokoll",
      anchor:  "Raft",
      preview: "Starke Konsistenz durch Leader-Wahl + Log-Replikation; einfacher als Paxos…",
    },
    nodeRaft:   ["Raft", "Protokoll"],
    nodeHash:   ["Hash", "Ring"],
    nodeCap:    ["CAP", "Theorem"],
    nodeLeader: "Leader-Wahl",
    nodeMain:   "Hauptthread",
    questionTitle:     "Wie entwirft man ein verteiltes System?",
    subThreadsLabel:   "Threads",
    overviewLabel:     "Übersicht",
    listLabel:         "Liste",
    graphLabel:        "Graph",
    mergeLabel:        "Zusammenführen",
    mainLabel:         "Haupt",
    hintText:          "Text markieren, um Unter-Thread zu öffnen",
    customPlaceholder: "Oder eigene Frage…",
    continuePrompt:    "Weiter zum CAP-Theorem fragen…",
    suggestionsLabel:  "Vorschläge",
    copyLabel:         "Kopieren",
    pinLabel:          "Anheften",
    preparingReply:    "Antwort wird vorbereitet…",
    captions: {
      "idle":          "KI-Antwort abgeschlossen. Eine vorhandene Pin 'Raft-Protokoll' ist links, mit markiertem Anker im Hauptthread.",
      "sweeping":      "Klicken und über 'CAP-Theorem' ziehen — die blaue Markierung erweitert sich mit dem Cursor.",
      "pin-menu":      "Maus loslassen. Eine schwebende Leiste erscheint über der Auswahl: 'Kopieren' links, 'Anheften' rechts.",
      "pin-click":     "'Anheften' klicken — der Button leuchtet und die Auswahl wird fixiert.",
      "dialog-open":   "Pin-Dialog erscheint. Ankertext oben zitiert; KI erzeugt Folgefragen (lädt).",
      "dialog-ready":  "Vorschläge bereit — drei klickbare Folgefragen erscheinen. Eigene Frage ist auch möglich.",
      "hover-suggest": "Über den ersten Vorschlag fahren — Hintergrund wird hervorgehoben.",
      "click-suggest": "Klicken zum Senden. Die Frage wandert in den Unter-Thread, der Dialog schließt.",
      "card-in":       "Eine Unter-Thread-Karte gleitet von links herein. Im Übersichtsgraphen erscheint der CAP-Theorem-Knoten neben bestehenden Unterfragen.",
      "streaming":     "KI antwortet unabhängig im Unter-Thread. Die Karte zeigt Live-Ausgabe. Der Hauptthread bleibt unberührt.",
      "unread":        "Antwort fertig — das Karten-Badge wird rot und signalisiert ungelesenen Inhalt.",
      "card-hover":    "Über die Karte fahren — eine Kurve zieht von der Karte zum 'CAP-Theorem'-Anker im Hauptthread.",
      "card-click":    "Karte klicken, um die vollständige Unter-Thread-Ansicht zu öffnen.",
      "thread-view":   "Die Mittelspalte wechselt in den Unter-Thread: Breadcrumb oben, komplette Q&A unten.",
      "thread-done":   "Unter-Thread vollständig sichtbar. Weiter fragen, oder auf 'Haupt' im Breadcrumb klicken, um zurückzukehren.",
      "back-click":    "'Haupt' im Breadcrumb klicken — Button leuchtet, Rücksprung wird ausgelöst.",
      "back-main":     "Die Mitte gleitet zurück zum Hauptthread. Alle Anker-Markierungen bleiben. Die Karte bleibt — jederzeit wieder aufrufbar.",
    },
  },
  pt: {
    aiText:     "Em sistemas distribuídos, o protocolo Raft usa eleição de líder para consenso, lidando diretamente com o compromisso definido pelo teorema CAP: você só pode garantir dois de três — consistência, disponibilidade ou tolerância a partições. O hashing consistente então minimiza a movimentação de dados ao escalar nós.",
    anchor:     "teorema CAP",
    raftInText: "protocolo Raft",
    hashInText: "hashing consistente",
    suggestions: [
      "Como negociar CAP na prática?",
      "O que importa mais: consistência ou disponibilidade?",
      "Um exemplo real de trade-off CAP?",
    ],
    cardReply:  "CAP, proposto por Brewer: quando ocorrem partições (P), você deve escolher entre consistência (C) e disponibilidade (A). Bancos escolhem CP para garantias fortes de transação; DNS escolhe AP para continuar respondendo mesmo com nós fora do ar…",
    threadReplyFull: "O teorema CAP (Consistency, Availability, Partition tolerance) foi proposto por Eric Brewer em 2000 e formalmente provado por Gilbert e Lynch em 2002.\n\nConclusão central: quando partições de rede (P) são inevitáveis, arquitetos devem escolher entre consistência (C) e disponibilidade (A).\n\n• **Sistemas CP**: HBase, ZooKeeper — rejeitam escritas durante partições para garantir consistência forte\n• **Sistemas AP**: Cassandra, CouchDB — continuam atendendo durante partições, mas podem retornar dados desatualizados\n• **Na prática**: a maioria dos sistemas equilibra C e A dinamicamente, ajustando o nível de consistência por caso de uso",
    existingCard: {
      label:   "Protocolo Raft",
      anchor:  "Raft",
      preview: "Consistência forte via eleição de líder + replicação de log; mais simples que Paxos…",
    },
    nodeRaft:   ["Raft", "Protocolo"],
    nodeHash:   ["Hash", "Anel"],
    nodeCap:    ["CAP", "Teorema"],
    nodeLeader: "Eleição de líder",
    nodeMain:   "Thread principal",
    questionTitle:     "Como projetar um sistema distribuído?",
    subThreadsLabel:   "Threads",
    overviewLabel:     "Visão geral",
    listLabel:         "Lista",
    graphLabel:        "Grafo",
    mergeLabel:        "Mesclar",
    mainLabel:         "Principal",
    hintText:          "Selecione qualquer texto para abrir um sub-thread",
    customPlaceholder: "Ou pergunte por conta própria…",
    continuePrompt:    "Continuar perguntando sobre o teorema CAP…",
    suggestionsLabel:  "Sugestões",
    copyLabel:         "Copiar",
    pinLabel:          "Fixar",
    preparingReply:    "Preparando resposta…",
    captions: {
      "idle":          "Resposta da IA concluída. Um pin existente 'Protocolo Raft' está à esquerda, com sua âncora destacada no thread principal.",
      "sweeping":      "Clique e arraste sobre 'teorema CAP' — o destaque azul se expande junto com o cursor.",
      "pin-menu":      "Solte o mouse. Uma barra flutuante aparece acima da seleção: 'Copiar' à esquerda, 'Fixar' à direita.",
      "pin-click":     "Clique em 'Fixar' — o botão brilha e a seleção é travada.",
      "dialog-open":   "O diálogo de fixação aparece. O texto âncora é citado no topo; a IA está gerando sugestões (carregando).",
      "dialog-ready":  "Sugestões prontas — três perguntas clicáveis aparecem. Você também pode digitar a sua.",
      "hover-suggest": "Passe o mouse sobre a primeira sugestão — o fundo destaca.",
      "click-suggest": "Clique para enviar. A pergunta entra no sub-thread e o diálogo fecha.",
      "card-in":       "Um card de sub-thread desliza da esquerda. No grafo de visão geral, o nó do teorema CAP surge junto às sub-perguntas existentes.",
      "streaming":     "A IA responde independentemente no sub-thread. O card mostra a saída ao vivo. O thread principal não é afetado.",
      "unread":        "Resposta concluída — o badge do card fica vermelho, sinalizando conteúdo não lido.",
      "card-hover":    "Passe o mouse sobre o card — uma linha curva se estende do card até a âncora 'teorema CAP' no thread principal.",
      "card-click":    "Clique no card para entrar na visão completa do sub-thread.",
      "thread-view":   "A coluna central troca para o sub-thread: migalhas no topo, Q&A completo abaixo.",
      "thread-done":   "Conteúdo do sub-thread totalmente visível. Continue perguntando ou clique em 'Principal' nas migalhas para voltar.",
      "back-click":    "Clique em 'Principal' nas migalhas — o botão destaca e dispara o retorno.",
      "back-main":     "O centro volta para o thread principal. Todos os destaques de âncora permanecem. O card continua — clique a qualquer momento para reentrar.",
    },
  },
  ru: {
    aiText:     "В распределённых системах протокол Raft использует выбор лидера для достижения консенсуса, напрямую решая компромисс, который формулирует теорема CAP: одновременно можно гарантировать только два свойства из трёх — согласованность, доступность или устойчивость к разделению. Согласованное хеширование затем минимизирует перемещение данных при масштабировании узлов.",
    anchor:     "теорема CAP",
    raftInText: "протокол Raft",
    hashInText: "Согласованное хеширование",
    suggestions: [
      "Как выбирать CAP на практике?",
      "Что важнее: согласованность или доступность?",
      "Реальный пример компромисса CAP?",
    ],
    cardReply:  "CAP, предложенная Брюером: при возникновении разделения (P) необходимо выбрать между согласованностью (C) и доступностью (A). Банки выбирают CP для строгих транзакционных гарантий; DNS выбирает AP, чтобы продолжать отвечать даже при падении узлов…",
    threadReplyFull: "Теорема CAP (Consistency, Availability, Partition tolerance) была предложена Эриком Брюером в 2000 году и формально доказана Гилбертом и Линчем в 2002 году.\n\nКлючевой вывод: когда сетевые разделения (P) неизбежны, архитекторы должны выбирать между согласованностью (C) и доступностью (A).\n\n• **CP-системы**: HBase, ZooKeeper — отклоняют записи при разделении, чтобы гарантировать строгую согласованность\n• **AP-системы**: Cassandra, CouchDB — продолжают обслуживать запросы при разделении, но могут возвращать устаревшие данные\n• **На практике**: большинство систем динамически балансируют C и A, подстраивая уровень согласованности под конкретный сценарий",
    existingCard: {
      label:   "Протокол Raft",
      anchor:  "Raft",
      preview: "Строгая согласованность через выбор лидера + репликацию журнала; проще Paxos…",
    },
    nodeRaft:   ["Raft", "Протокол"],
    nodeHash:   ["Hash", "Кольцо"],
    nodeCap:    ["CAP", "Теорема"],
    nodeLeader: "Выбор лидера",
    nodeMain:   "Главная ветка",
    questionTitle:     "Как спроектировать распределённую систему?",
    subThreadsLabel:   "Ветки",
    overviewLabel:     "Обзор",
    listLabel:         "Список",
    graphLabel:        "Граф",
    mergeLabel:        "Объединить",
    mainLabel:         "Главная",
    hintText:          "Выделите текст, чтобы открыть подветку",
    customPlaceholder: "Или задайте свой вопрос…",
    continuePrompt:    "Продолжить обсуждение теоремы CAP…",
    suggestionsLabel:  "Варианты",
    copyLabel:         "Копировать",
    pinLabel:          "Закрепить",
    preparingReply:    "Готовим ответ…",
    captions: {
      "idle":          "Ответ ИИ завершён. Слева уже есть булавка «Протокол Raft», соответствующее слово в главной ветке подсвечено.",
      "sweeping":      "Нажмите и протяните по «теорема CAP» — синяя подсветка растёт вместе с курсором.",
      "pin-menu":      "Отпустите мышь. Над выделением появляется панель: «Копировать» слева, «Закрепить» справа.",
      "pin-click":     "Нажмите «Закрепить» — кнопка засветится, выделение зафиксируется.",
      "dialog-open":   "Открывается диалог закрепления. Текст якоря цитируется сверху; ИИ генерирует подсказки (загрузка).",
      "dialog-ready":  "Подсказки готовы — появляются три кликабельных вопроса. Можно ввести свой.",
      "hover-suggest": "Наведите на первую подсказку — фон подсвечивается.",
      "click-suggest": "Кликните, чтобы отправить. Вопрос уходит в подветку, диалог закрывается.",
      "card-in":       "Карточка подветки вылетает слева. В обзорном графе узел «теорема CAP» появляется на одном уровне с другими подвопросами.",
      "streaming":     "ИИ отвечает в подветке независимо. Карточка показывает потоковый вывод. Главная ветка не тронута.",
      "unread":        "Ответ завершён — бейдж карточки становится красным, сигнализируя о непрочитанном.",
      "card-hover":    "Наведите на карточку — кривая линия тянется от карточки к якорю «теорема CAP» в главной ветке.",
      "card-click":    "Кликните по карточке, чтобы войти в полный вид подветки.",
      "thread-view":   "Центральная колонка переключается на подветку: хлебные крошки сверху, полный диалог снизу.",
      "thread-done":   "Подветка полностью видна. Продолжайте задавать вопросы или кликните «Главная» в крошках, чтобы вернуться.",
      "back-click":    "Клик по «Главная» в крошках — кнопка подсвечивается, срабатывает возврат.",
      "back-main":     "Центр возвращается к главной ветке. Все подсветки якорей сохраняются. Карточка на месте — в любой момент можно войти снова.",
    },
  },
};

// ── 组件 ──────────────────────────────────────────────────────────────────────
export default function PinDemo() {
  const lang    = useLangStore((s) => s.lang);
  const content = CONTENT[lang];

  // 从 content 中提取常用变量
  const AI_TEXT          = content.aiText;
  const ANCHOR           = content.anchor;
  const SUGGESTIONS      = content.suggestions;
  const CARD_REPLY       = content.cardReply;
  const THREAD_REPLY_FULL = content.threadReplyFull;
  const EXISTING_CARD    = content.existingCard;

  // 动态计算锚点位置
  const A_START  = AI_TEXT.indexOf(ANCHOR);
  const A_END    = A_START + ANCHOR.length;
  const before   = AI_TEXT.slice(0, A_START);
  const after    = AI_TEXT.slice(A_END);
  const raftIdx  = before.indexOf(content.raftInText);
  const hashIdx  = after.indexOf(content.hashInText);

  const [phase, setPhase]       = useState<Phase>("idle");
  const [sweepPct, setSweepPct] = useState(0);
  const [streamLen, setStreamLen] = useState(0);
  const [playing, setPlaying]   = useState(true);

  // 语言切换时重置 / Reset when the UI language changes
  useEffect(() => {
    setPhase("idle");
    setSweepPct(0);
    setStreamLen(0);
  }, [lang]);

  // 自动推进
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
  }, [phase, streamLen, CARD_REPLY.length]);

  const goTo = (p: Phase) => {
    setPhase(p);
    if (p === "idle") { setSweepPct(0); setStreamLen(0); }
    if (!["streaming","sweeping"].includes(p)) {
      if (p !== "streaming") setStreamLen(CARD_REPLY.length);
      if (p === "idle" || PHASE_ORDER.indexOf(p) < PHASE_ORDER.indexOf("streaming")) setStreamLen(0);
    }
  };

  const stepBy = (delta: number) => {
    const idx  = PHASE_ORDER.indexOf(phase);
    const next = PHASE_ORDER[Math.max(0, Math.min(PHASE_ORDER.length - 1, idx + delta))];
    goTo(next);
  };

  // ── 布尔状态 ────────────────────────────────────────────────────────────────
  const isSweeping     = phase === "sweeping";
  const isHighlit      = phase !== "idle";
  const showPinMenu    = ["pin-menu","pin-click"].includes(phase);
  const pinClicking    = phase === "pin-click";
  const showDialog     = ["dialog-open","dialog-ready","hover-suggest","click-suggest"].includes(phase);
  const dialogReady    = ["dialog-ready","hover-suggest","click-suggest"].includes(phase);
  const hoverIdx       = ["hover-suggest","click-suggest"].includes(phase) ? 0 : -1;
  const clickIdx       = phase === "click-suggest" ? 0 : -1;
  const showCard       = ["card-in","streaming","unread","card-hover","card-click","thread-view","thread-done","back-click","back-main"].includes(phase);
  const showStream     = ["streaming","unread","card-hover","card-click","thread-view","thread-done","back-click","back-main"].includes(phase);
  const showUnread     = ["unread","card-hover","card-click"].includes(phase);
  const cardHovering   = phase === "card-hover";
  const cardClicking   = phase === "card-click";
  const showThreadView = ["thread-view","thread-done","back-click"].includes(phase);
  const backClicking   = phase === "back-click";
  const showCap        = ["card-in","streaming","unread","card-hover","card-click","thread-view","thread-done","back-click","back-main"].includes(phase);

  return (
    <div className="w-full max-w-[960px] select-none">
      <div className="relative rounded-2xl border overflow-hidden"
        style={{ background: C.bg, borderColor: ind(0.12), boxShadow: `0 0 0 1px ${ind(0.1)}, 0 24px 64px rgba(0,0,0,0.4)` }}>

        {/* 顶部光线 */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg,transparent,rgba(99,102,241,0.45),transparent)" }} />

        {/* 标题栏 */}
        <div className="flex items-center gap-2 px-4 border-b" style={{ borderColor: C.border, height: 38 }}>
          <div className="flex gap-1.5">
            {["#ff5f57","#ffbd2e","#28c840"].map(c => (
              <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: 0.7 }} />
            ))}
          </div>
          <span className="text-[11px] font-medium ml-2" style={{ color: C.textFaint }}>
            {content.questionTitle}
          </span>
        </div>

        {/* ── 三栏 ── */}
        <div className="grid grid-cols-3 relative" style={{ height: 340 }}>

          {/* 跨栏曲线：悬停卡片 → 锚点 */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 300 340" preserveAspectRatio="none" style={{ zIndex: 15 }}>
            <path
              d="M 96 152 C 110 152, 110 95, 138 95"
              fill="none" stroke={C.indigoSolid} strokeWidth="0.8" strokeDasharray="4 3"
              strokeOpacity={cardHovering ? 0.7 : 0}
              style={{ transition: "stroke-opacity 0.3s ease" }}
            />
            <circle cx="138" cy="95" r="3.5" fill={C.indigoSolid}
              opacity={cardHovering ? 0.8 : 0}
              style={{ transition: "opacity 0.3s ease" }}
            />
          </svg>

          {/* ── 左：子线程列 ─────────────────────────────────────────── */}
          <div className="relative border-r flex flex-col overflow-hidden" style={{ borderColor: C.border }}>
            <div className="px-3 py-1.5 border-b" style={{ borderColor: C.borderSub }}>
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.textFaint }}>
                {content.subThreadsLabel}
              </span>
            </div>

            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ top: 28, zIndex: 0 }}>
              <path d="M 0 52 C 4 52, 4 52, 8 52"
                fill="none" stroke={C.indigoSolid} strokeWidth="0.9" strokeOpacity="0.4" />
              {showCard && (
                <path d="M 0 148 C 4 148, 4 148, 8 148"
                  fill="none" stroke={C.indigoSolid} strokeWidth="0.9" strokeOpacity="0.6"
                  style={{ transition: "stroke-opacity 0.3s" }} />
              )}
            </svg>

            <div className="relative flex-1 px-2 py-2 space-y-2 overflow-hidden" style={{ zIndex: 1 }}>
              {/* 已有针 */}
              <div className="rounded-xl border overflow-hidden text-xs"
                style={{ background: ind(0.06), borderColor: ind(0.2) }}>
                <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                  <DragHandle />
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ind(0.5) }} />
                  <p className="font-medium truncate flex-1 text-[10px]" style={{ color: C.textMd }}>{EXISTING_CARD.label}</p>
                </div>
                <div className="mx-2.5 mb-1.5 px-2 py-1 rounded-md text-[9px] leading-snug"
                  style={{ background: ind(0.06), border: `1px solid ${ind(0.12)}`, color: C.textFaint }}>
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
                <div className="rounded-xl border overflow-hidden text-xs cursor-pointer"
                  style={{
                    background:  cardClicking ? ind(0.2) : cardHovering ? ind(0.17) : ind(0.13),
                    borderColor: cardClicking ? ind(0.7) : cardHovering ? ind(0.55) : ind(0.35),
                    boxShadow:   cardClicking ? `0 0 0 2px ${ind(0.3)}` : cardHovering ? `0 0 0 1px ${ind(0.25)}, 0 0 12px ${ind(0.2)}` : "none",
                    transition: "all 0.15s ease",
                  }}>
                  <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                    <DragHandle />
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C.indigoSolid }} />
                    <p className="font-medium truncate flex-1 text-[10px]" style={{ color: C.indigoLight }}>{ANCHOR}</p>
                    {showCard && !showStream && (
                      <span className="w-4 h-4 rounded-full text-white text-[8px] flex items-center justify-center font-bold"
                        style={{ background: ind(0.6) }}>1</span>
                    )}
                    {showUnread && (
                      <span className="w-4 h-4 rounded-full text-white text-[8px] flex items-center justify-center font-bold"
                        style={{ background: "#2a2a72", boxShadow: "0 0 6px rgba(42,42,114,0.6)", animation: "ping 1s ease-in-out" }}>
                        1
                      </span>
                    )}
                  </div>

                  <div className="mx-2.5 mb-1.5 px-2 py-1 rounded-md text-[9px] leading-snug"
                    style={{ background: ind(0.07), border: `1px solid ${ind(0.13)}`, color: C.indigoText, opacity: 0.8 }}>
                    「{ANCHOR}」
                  </div>

                  {showStream && (
                    <div className="mx-2.5 mb-1 flex justify-end">
                      <div className="text-[9px] px-2 py-1 rounded-xl rounded-tr-sm leading-snug"
                        style={{ background: ind(0.25), border: `1px solid ${ind(0.2)}`, color: C.indigoLight, maxWidth: "92%" }}>
                        {SUGGESTIONS[0]}
                      </div>
                    </div>
                  )}

                  <div className="px-2.5 pb-2 text-[10px] leading-relaxed overflow-hidden" style={{ color: C.textMd, maxHeight: 52 }}>
                    {showStream
                      ? <>{CARD_REPLY.slice(0, streamLen)}{phase === "streaming" && streamLen < CARD_REPLY.length && <Cursor />}</>
                      : <span style={{ color: C.textFaint, fontStyle: "italic" }}>{content.preparingReply}</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 中：主线 / 子线程视图 ─────────────────────────────────── */}
          <div className="relative overflow-hidden">

            {/* 主线视图 */}
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
                  {content.questionTitle}
                </div>
              </div>

              {/* AI 气泡 */}
              <div className="flex gap-2.5">
                <AIAvatar />
                <div className="flex-1 text-[12.5px] leading-[1.75] relative" style={{ color: C.textMd }}>
                  {/* 前段，包含 Raft */}
                  {before.slice(0, raftIdx)}
                  <span className="px-0.5 rounded" style={{ color: C.indigoText, boxShadow: `inset 0 0 0 1px ${ind(0.3)}` }}>
                    {content.raftInText}
                  </span>
                  {before.slice(raftIdx + content.raftInText.length)}

                  {/* CAP 定理 / CAP theorem — 选中/高亮 */}
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
                        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg whitespace-nowrap" style={{ color: C.textMd }}>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                          </svg>
                          <span className="text-xs">{content.copyLabel}</span>
                        </span>
                        <span className="w-px h-4" style={{ background: C.border }} />
                        <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg whitespace-nowrap" style={{
                          background: pinClicking ? ind(0.3) : ind(0.1),
                          border: `1px solid ${ind(0.3)}`,
                          boxShadow: pinClicking ? `0 0 10px ${ind(0.4)}` : "none",
                          transition: "all 0.15s",
                        }}>
                          <StarIcon className="w-3.5 h-3.5" style={{ color: C.indigoText }} />
                          <span className="text-xs font-medium" style={{ color: "rgb(63,61,153)" }}>{content.pinLabel}</span>
                        </span>
                      </span>
                    </span>
                  </span>

                  {/* 后半段，包含 hash */}
                  {after.slice(0, hashIdx)}
                  <span className="px-0.5 rounded" style={{ color: C.textMd, boxShadow: `inset 0 0 0 1px ${ind(0.18)}` }}>
                    {content.hashInText}
                  </span>
                  {after.slice(hashIdx + content.hashInText.length)}

                  {phase === "idle" && <BlinkCursor />}
                </div>
              </div>

              {/* 提示文字 */}
              <div className="absolute bottom-3 left-5 flex items-center gap-1.5 text-[10px]" style={{ color: C.textFaint }}>
                <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                </svg>
                {content.hintText}
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
                <div className="px-5 pt-4 pb-3 flex gap-3 items-start">
                  <div className="w-0.5 flex-shrink-0 self-stretch rounded-full" style={{ background: ind(0.4) }} />
                  <p className="text-sm italic leading-relaxed flex-1" style={{ color: C.textMd }}>{ANCHOR}</p>
                  <span className="w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0" style={{ color: C.textFaint }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </span>
                </div>

                <div className="px-5 pb-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.textFaint }}>{content.suggestionsLabel}</span>
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

                <div className="px-5 py-3 flex gap-2 items-end">
                  <div className="flex-1 text-sm px-3 py-2 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.borderSub}`, color: "rgba(100,116,139,0.5)", minHeight: 36 }}>
                    {content.customPlaceholder}
                  </div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: ind(0.35), opacity: 0.4 }}>
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* 子线程视图 */}
            <div style={{
              position: "absolute", inset: 0,
              opacity: showThreadView ? 1 : 0,
              transform: showThreadView ? "translateX(0)" : "translateX(28px)",
              transition: "opacity 0.4s ease, transform 0.4s ease",
              pointerEvents: showThreadView ? "auto" : "none",
              display: "flex", flexDirection: "column",
            }}>
              <div className="flex items-center gap-1.5 px-4 py-2 border-b text-[11px]" style={{ borderColor: C.borderSub, color: C.textFaint }}>
                <span className="cursor-pointer rounded px-1 py-0.5 transition-all duration-150"
                  style={{
                    color: backClicking ? C.indigoLight : C.textMd,
                    background: backClicking ? ind(0.18) : "transparent",
                    boxShadow: backClicking ? `0 0 8px ${ind(0.3)}` : "none",
                    fontWeight: backClicking ? 600 : 400,
                  }}>
                  {content.mainLabel}
                </span>
                <span style={{ color: C.textFaint }}>›</span>
                <span style={{ color: C.indigoText, fontWeight: 500 }}>{ANCHOR}</span>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div className="flex gap-2.5">
                  <div className="w-0.5 flex-shrink-0 rounded-full self-stretch" style={{ background: ind(0.35) }} />
                  <p className="text-sm italic leading-relaxed" style={{ color: C.textMd }}>{ANCHOR}</p>
                </div>

                <div className="flex justify-end">
                  <div className="text-[12px] leading-relaxed px-3.5 py-2 rounded-2xl rounded-tr-sm max-w-[82%]"
                    style={{ background: ind(0.18), border: `1px solid ${ind(0.2)}`, color: C.indigoLight }}>
                    {SUGGESTIONS[0]}
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <AIAvatar />
                  <div className="flex-1 text-[12px] leading-[1.8]" style={{ color: C.textMd }}>
                    {THREAD_REPLY_FULL.split("\n").map((line, i) => {
                      if (!line) return <div key={i} className="h-2" />;
                      if (line.startsWith("•") || line.startsWith("• ")) {
                        const clean = line.startsWith("• ") ? line.slice(2) : line.slice(1).trimStart();
                        const parts = clean.split("**");
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

              <div className="px-4 py-2 border-t flex items-center gap-2" style={{ borderColor: C.borderSub }}>
                <div className="flex-1 text-[11px] px-3 py-2 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.borderSub}`, color: C.textFaint }}>
                  {content.continuePrompt}
                </div>
              </div>
            </div>
          </div>

          {/* ── 右：概览节点图 ────────────────────────────────────────── */}
          <div className="border-l flex flex-col overflow-hidden" style={{ borderColor: C.border }}>
            <div className="px-2 py-1.5 border-b flex items-center gap-1" style={{ borderColor: C.borderSub }}>
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] flex-1" style={{ color: C.textFaint }}>{content.overviewLabel}</span>
              <div className="flex gap-0.5 rounded-md p-0.5" style={{ border: `1px solid ${C.borderSub}`, background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-center gap-0.5 px-1 h-4 rounded" style={{ color: C.textFaint }}>
                  <svg className="w-2 h-2" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="5" r="2.5"/><circle cx="5" cy="12" r="2.5"/><circle cx="5" cy="19" r="2.5"/>
                    <circle cx="14" cy="9" r="2.5"/><circle cx="14" cy="19" r="2.5"/>
                  </svg>
                  <span className="text-[8px]">{content.listLabel}</span>
                </div>
                <div className="flex items-center gap-0.5 px-1 h-4 rounded" style={{ background: "rgba(255,255,255,0.08)", color: C.textHi }}>
                  <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
                    <path d="M12 7v4M12 11l-5 6M12 11l5 6"/>
                  </svg>
                  <span className="text-[8px]">{content.graphLabel}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 p-1.5">
              <svg viewBox="0 0 165 185" className="w-full h-full">
                {/* 主线 */}
                <rect x="32" y="8" width="100" height="22" rx="6" fill={ind(0.12)} stroke={ind(0.35)} strokeWidth="0.6"/>
                <text x="82" y="23" textAnchor="middle" fontSize="8" fill={C.indigoText} fontFamily="sans-serif" fontWeight="500">{content.nodeMain}</text>

                <line x1="82" y1="30" x2="82" y2="42" stroke={ind(0.25)} strokeWidth="0.6"/>
                <line x1="29" y1="42" x2="82" y2="42" stroke={ind(0.25)} strokeWidth="0.6"/>
                <line x1="82" y1="42" x2="135" y2="42"
                  stroke={ind(showCap ? 0.25 : 0.08)} strokeWidth="0.6"
                  style={{ transition: "stroke 0.4s" }}/>
                <line x1="29" y1="42" x2="29" y2="52" stroke={ind(0.25)} strokeWidth="0.6"/>
                <line x1="82" y1="42" x2="82" y2="52" stroke={ind(0.25)} strokeWidth="0.6"/>
                <line x1="135" y1="42" x2="135" y2="52"
                  stroke={ind(showCap ? 0.25 : 0.08)} strokeWidth="0.6"
                  style={{ transition: "stroke 0.4s" }}/>

                {/* Raft 节点 */}
                <rect x="7" y="52" width="44" height="22" rx="6" fill={ind(0.1)} stroke={ind(0.3)} strokeWidth="0.6"/>
                <text x="29" y="63" textAnchor="middle" fontSize="7" fill={C.textMd} fontFamily="sans-serif">{content.nodeRaft[0]}</text>
                <text x="29" y="71" textAnchor="middle" fontSize="7" fill={C.textMd} fontFamily="sans-serif">{content.nodeRaft[1]}</text>

                {/* Raft 子节点 */}
                <line x1="29" y1="74" x2="29" y2="86" stroke={ind(0.2)} strokeWidth="0.6"/>
                <rect x="7" y="86" width="44" height="20" rx="5" fill={ind(0.06)} stroke={ind(0.18)} strokeWidth="0.6"/>
                <text x="29" y="100" textAnchor="middle" fontSize="6.5" fill={C.textFaint} fontFamily="sans-serif">{content.nodeLeader}</text>

                {/* Hash 节点 */}
                <rect x="60" y="52" width="44" height="22" rx="6" fill={ind(0.08)} stroke={ind(0.22)} strokeWidth="0.6"/>
                <text x="82" y="63" textAnchor="middle" fontSize="7" fill={C.textLo} fontFamily="sans-serif">{content.nodeHash[0]}</text>
                <text x="82" y="71" textAnchor="middle" fontSize="7" fill={C.textLo} fontFamily="sans-serif">{content.nodeHash[1]}</text>

                {/* CAP 节点 */}
                <rect x="113" y="52" width="44" height="22" rx="6"
                  fill={showCap ? ind(0.22) : ind(0.03)}
                  stroke={showCap ? ind(0.65) : ind(0.1)}
                  strokeWidth="0.6"
                  style={{ transition: "fill 0.45s, stroke 0.45s" }}
                />
                <text x="135" y="63" textAnchor="middle" fontSize="7"
                  fill={showCap ? C.indigoLight : "rgba(99,102,241,0.15)"}
                  fontFamily="sans-serif" fontWeight={showCap ? "600" : "400"}
                  style={{ transition: "fill 0.45s" }}>{content.nodeCap[0]}</text>
                <text x="135" y="71" textAnchor="middle" fontSize="7"
                  fill={showCap ? C.indigoLight : "rgba(99,102,241,0.15)"}
                  fontFamily="sans-serif" fontWeight={showCap ? "600" : "400"}
                  style={{ transition: "fill 0.45s" }}>{content.nodeCap[1]}</text>
                {showUnread && <circle cx="152" cy="52" r="4" fill="#2a2a72" opacity="0.9"/>}
              </svg>
            </div>

            <div className="px-2 pb-2">
              <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer"
                style={{ background: ind(0.08), border: `1px solid ${ind(0.18)}` }}>
                <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={C.indigoText} strokeWidth={2} strokeLinecap="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                </svg>
                <span className="text-[9px] font-medium" style={{ color: C.indigoText }}>{content.mergeLabel}</span>
                <span className="ml-auto text-[9px] tabular-nums" style={{ color: ind(0.6) }}>
                  {showCap ? "3" : "2"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 底部：说明 + 控制栏 */}
        <div className="border-t" style={{ borderColor: C.border, background: "rgba(0,0,0,0.2)" }}>
          <div className="px-5 pt-3 pb-1 overflow-hidden" style={{ height: 50 }}>
            <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: C.textMd }}>
              {content.captions[phase]}
            </p>
          </div>

          <div className="px-5 flex items-center gap-3" style={{ height: 44 }}>
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {PHASE_ORDER.map(p => (
                <button key={p} onClick={() => goTo(p)}
                  className="h-1 rounded-full transition-all duration-300 flex-shrink-0 cursor-pointer"
                  style={{ width: phase === p ? "16px" : "4px", background: phase === p ? C.indigoSolid : ind(0.2) }} />
              ))}
            </div>

            <button onClick={() => stepBy(-1)}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.textLo }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>

            <button onClick={() => setPlaying(p => !p)}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-all flex-shrink-0"
              style={{
                background: playing ? ind(0.2) : "rgba(255,255,255,0.05)",
                border: `1px solid ${playing ? ind(0.4) : C.border}`,
                color: playing ? C.indigoText : C.textLo,
              }}>
              {playing
                ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>

            <button onClick={() => stepBy(1)}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.textLo }}>
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
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="rgb(63,61,153)">
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
