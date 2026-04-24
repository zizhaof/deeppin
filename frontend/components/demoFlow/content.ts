// Nine-locale copy for the landing-page 3-layer walkthrough, shared by
// PinDemo (desktop) and MobilePinDemo. Any user-facing string lives here;
// the two components only consume this table.

import type { Lang } from "@/lib/i18n";
import type { DemoPhase } from "./types";

export interface DemoContent {
  // ── Main thread Q&A ──────────────────────────────────────────────
  mainQuestion: string;
  /** Main AI reply concatenated as: aiBefore1 + anchor1 + aiBetween + anchor2 + aiAfter2. */
  aiBefore1: string;
  anchor1: string;
  aiBetween: string;
  anchor2: string;
  aiAfter2: string;
  /** Three AI follow-up suggestions for L0 pin 1/2; picked = the first. */
  suggestions1: readonly [string, string, string];
  suggestions2: readonly [string, string, string];

  // ── Sub-thread 1 (L1) content ────────────────────────────────────
  /** sub1Before + sub1Anchor + sub1After — sub1Anchor becomes the L2 entry anchor. */
  sub1Before: string;
  sub1Anchor: string;
  sub1After: string;
  /** Three follow-up suggestions for the L1-pin-again step. */
  suggestions3: readonly [string, string, string];

  // ── Deepest sub-thread (L2) reply ───────────────────────────────
  sub2Reply: string;

  // ── Breadcrumb titles ───────────────────────────────────────────
  subTitle1: string;
  subTitle2: string;
  deepTitle: string;
  mainCrumb: string;

  // ── UI labels ───────────────────────────────────────────────────
  /** "Question" button on selpop (replaces the old "Pin" button). */
  followupLabel: string;
  pinLabel: string;
  copyLabel: string;
  enterLabel: string;
  selectLabel: string;
  newReplyLabel: string;
  overviewLabel: string;
  graphTabLabel: string;
  listTabLabel: string;
  mergeLabel: string;
  mergeOutputLabel: string;
  suggestionsLabel: string;
  /** Placeholder for the pin dialog's custom-question input. */
  customQuestionPlaceholder: string;
  /** "YOU" / "Deeppin" sub-labels in the anchor popover. */
  youLabel: string;
  aiLabel: string;
  /** "You are here" marker on the drawer / large graph. */
  youAreHereLabel: string;
  /** "Tap here" hint for the graph-nav-root step. */
  tapLabel: string;
  /** Status words shown while streaming (right-rail generating indicator). */
  replyingLabel: string;
  generatingLabel: string;
  /** Indicator shown when the background reply is ready. */
  readyLabel: string;

  // ── Merge modal copy ────────────────────────────────────────────
  mergeSelectThreads: string;
  mergeAll: string;
  mergeGenerate: string;
  mergeDownload: string;
  mergeCopy: string;
  mergeFormats: readonly [string, string, string];
  mergeReport: string;
  /** "N branches selected" label at the bottom of the merge modal. */
  mergeBranchesSelected: string;

  // ── Bottom caption per phase ────────────────────────────────────
  caption: Record<DemoPhase, string>;
}

// English is the base copy — the other eight locales mirror it.
export const DEMO_CONTENT: Record<Lang, DemoContent> = {
  en: {
    mainQuestion: "What makes Deeppin different?",
    aiBefore1:
      "When you're deep in an AI reply and want to dig into one part, you've got two bad options — new chat (lose context) or same chat (topic drifts). Deeppin lets you ",
    anchor1: "pin that detail",
    aiBetween: " and ",
    anchor2: "keep digging",
    aiAfter2:
      " — no matter how deep. Your main thread? Not a word interrupted.",
    suggestions1: [
      "Show me the pin flow step by step",
      "How is context kept focused in a sub-thread?",
      "What if I want to share the whole exploration?",
    ],
    suggestions2: [
      "How do I spot which anchors still have unread replies?",
      "Can I drag pins between threads?",
      "What if I change my mind and want to close one?",
    ],
    sub1Before:
      "Welcome to the sub-thread. Your question stays focused here — the main thread above is completely untouched. Any time you want to go deeper, ",
    sub1Anchor: "pin a phrase and dig another level",
    sub1After:
      ". You can nest as many layers as you need, and nothing you do here leaks back up.",
    suggestions3: [
      "Show me this works the same one layer deeper",
      "How far can I actually go?",
      "Can I branch sideways inside this one?",
    ],
    sub2Reply:
      "Exactly the same pattern. Pin any phrase here and another focused sub-thread opens below — this layer stays untouched, just like the main did. You're now at depth 2, and there's no cap: keep going, branch sideways, or stop here. Three levels up, your main thread is exactly where you left it.",
    subTitle1: "pin that detail",
    subTitle2: "keep digging",
    deepTitle: "dig another level",
    mainCrumb: "Main",
    followupLabel: "Question",
    pinLabel: "Pin",
    copyLabel: "Copy",
    enterLabel: "Enter",
    selectLabel: "Select",
    newReplyLabel: "New",
    overviewLabel: "overview",
    graphTabLabel: "graph",
    listTabLabel: "list",
    mergeLabel: "Merge",
    mergeOutputLabel: "Merge Output",
    suggestionsLabel: "suggestions",
    customQuestionPlaceholder: "Or type your own follow-up…",
    youLabel: "YOU",
    aiLabel: "Deeppin",
    youAreHereLabel: "you are here",
    tapLabel: "tap",
    replyingLabel: "replying in sub-thread…",
    generatingLabel: "generating…",
    readyLabel: "ready",
    mergeSelectThreads: "Branches in this merge",
    mergeAll: "All",
    mergeGenerate: "Generate",
    mergeDownload: "Download Markdown",
    mergeCopy: "Copy",
    mergeFormats: ["Free summary", "Bullet points", "Structured"],
    mergeBranchesSelected: "3 branches, 1 root",
    mergeReport:
`## Deeppin in one pass

**Pinning captures intent**
You pick the exact phrase worth expanding, pop a focused sub-thread, and the main stays untouched — no new tab, no reboot.

**Every layer works the same**
In any sub-thread, your question stays focused. Want to go deeper? Pin another phrase and open another layer. Depth 2 behaves exactly like depth 1, and so does depth 4.

**Merge rebuilds the story**
Pick the branches that matter → one structured report, pigment-coded by depth. Pins become headings; replies become the body.

**Net result**
Three levels of digging, one coherent artifact, zero drift in the main thread.`,
    caption: {
      blank: "Fresh conversation — you're about to ask the main question.",
      "main-stream": "Deeppin's reply on the main thread — give it a quick read.",
      "p1-sweep": "Drag across the phrase you want to dig into — it stays highlighted.",
      "p1-selpop": "Selection stays lit; a toolbar rises above it. Hit Question.",
      "p1-dialog": "Three follow-ups auto-generate — or type your own in the box.",
      "p1-pick": "Pick the one you actually want to chase.",
      "p1-underline": "Notice two changes at once: the anchor underlines here, and a node appears on the right.",
      "p2-sweep": "Back on main — drag across a second phrase.",
      "p2-selpop": "Same toolbar, fresh phrase — highlight stays, hit Question again.",
      "p2-dialog": "New suggestions — or type your own in the box.",
      "p2-pick": "Pick one.",
      "p2-underline": "Two anchors, two parallel sub-threads. Come back when ready.",
      "l1-hover": "Hover the first anchor — a preview shows your question and the reply.",
      "l1-enter": "Click Enter — you're inside sub-thread 1.",
      "l1-stream": "You're on layer 2 now — the tree marks your spot. The reply was ready while you stayed on main.",
      "p3-sweep": "You can pin inside a sub-thread too — drag across.",
      "p3-selpop": "Same toolbar, same flow — highlight holds, hit Question.",
      "p3-dialog": "Follow-ups tuned to the sub-thread — or type your own.",
      "p3-pick": "Pick one.",
      "p3-underline": "Depth 2 — watch the new underline here and the third layer on the tree.",
      "l2-hover": "Hover the deeper anchor — preview shows question + answer.",
      "l2-enter": "Click Enter — now you're at depth 2.",
      "l2-stream": "Layer 3 — the tree keeps track of your depth. The deepest answer was already waiting.",
      "graph-hint": "Right rail has tracked every branch all along.",
      "graph-nav-root": "Tap any node to jump there — notice the pulse on Main.",
      "graph-navigated": "Back at the Main node. All three branches stay live on the tree.",
      "merge-hint": "Top-right — tap Merge to assemble everything you pinned.",
      "merge-modal": "The tree shows every branch; ancestors roll up automatically.",
      "merge-stream": "A structured report is generated from the selected branches.",
      "merge-done": "Three levels, one coherent artifact. That's the loop.",
    },
  },

  zh: {
    mainQuestion: "Deeppin 有什么不一样？",
    aiBefore1:
      "你在读 AI 回复，想深挖某一段 —— 两个不太好的选择：开新对话（上下文全丢），或者在原对话里问（主线被打断、话题漂移）。Deeppin 让你直接",
    anchor1: "钉住那个细节",
    aiBetween: "，然后",
    anchor2: "一直挖下去",
    aiAfter2: " —— 多深都可以。主线？一个字都不会被打扰。",
    suggestions1: [
      "一步一步演示插针流程",
      "子线程的上下文怎么保持聚焦？",
      "想把整个探索过程分享出去怎么做？",
    ],
    suggestions2: [
      "怎么看哪些锚点还有没读的回复？",
      "可以把插针在不同线程之间拖吗？",
      "改变主意想关掉一根针怎么办？",
    ],
    sub1Before:
      "进入了子线程。你的问题在这里保持聚焦 —— 主线原封不动。想继续往深挖，随时可以",
    sub1Anchor: "再钉一段话，再开一层",
    sub1After:
      "。想嵌几层都行，你在这里做的任何动作都不会回流到上面。",
    suggestions3: [
      "演示同样的操作在更深一层也能用",
      "实际能挖多深？",
      "这一层里还能再横向分支吗？",
    ],
    sub2Reply:
      "完全一样的玩法：在这里选中一段话再插针，又会开一层焦点子线程，这一层原封不动 —— 跟主线刚才那样。你现在在深度 2，没有上限：继续往下、横向分支、或者停在这里都行。三层之上的主线，还停在你刚才离开的位置。",
    subTitle1: "钉住那个细节",
    subTitle2: "一直挖下去",
    deepTitle: "再钉一段继续挖",
    mainCrumb: "主线",
    followupLabel: "追问",
    pinLabel: "插针",
    copyLabel: "复制",
    enterLabel: "进入",
    selectLabel: "选取",
    newReplyLabel: "新",
    overviewLabel: "概览",
    graphTabLabel: "图",
    listTabLabel: "列表",
    mergeLabel: "合并",
    mergeOutputLabel: "合并输出",
    suggestionsLabel: "推荐追问",
    customQuestionPlaceholder: "或者自己输入追问…",
    youLabel: "你",
    aiLabel: "Deeppin",
    youAreHereLabel: "你在这里",
    tapLabel: "点这里",
    replyingLabel: "正在子线程回复…",
    generatingLabel: "生成中…",
    readyLabel: "已就绪",
    mergeSelectThreads: "本次合并的分支",
    mergeAll: "全选",
    mergeGenerate: "开始生成",
    mergeDownload: "下载 Markdown",
    mergeCopy: "复制",
    mergeFormats: ["自由总结", "要点列表", "结构化分析"],
    mergeBranchesSelected: "3 条分支 + 1 条主线",
    mergeReport:
`## Deeppin 一次读懂

**插针抓住意图**
选中你想深挖的原话，打开一个焦点子线程，主线纹丝不动 —— 不用开新窗口、不用重起对话。

**每一层都一样工作**
在任何子线程里，问题保持聚焦。想继续挖深？再钉一段话，再开一层。深度 2 和深度 1 感受一模一样，深度 4 也一样。

**合并把故事拼回来**
选出想保留的分支 → 一份结构化报告，按深度配色。针变成小标题，回复变成正文。

**最终结果**
三层深挖，一份完整成品，主线零漂移。`,
    caption: {
      blank: "新对话 —— 你即将提出主问题。",
      "main-stream": "Deeppin 在主线的回复 —— 先读一下。",
      "p1-sweep": "拖选你想深挖的那段文字 —— 会一直高亮。",
      "p1-selpop": "选中保持高亮，选区上方弹出工具栏。点「追问」。",
      "p1-dialog": "自动生成三条追问 —— 也可以在下方输入框写自己的。",
      "p1-pick": "挑一条你真想追的。",
      "p1-underline": "同时注意两处变化：这里的锚点多了下划线，右边也多出一个节点。",
      "p2-sweep": "回到主线 —— 拖选第二段。",
      "p2-selpop": "同一工具栏，新的文字 —— 高亮保持，再点「追问」。",
      "p2-dialog": "新的推荐 —— 也可以自己输入。",
      "p2-pick": "挑一条。",
      "p2-underline": "两根针、两个并行子线程。想看再回来。",
      "l1-hover": "悬停第一根针 —— 预览里能看见你的提问和回答。",
      "l1-enter": "点「进入」—— 跳进子线程 1。",
      "l1-stream": "你现在在第 2 层 —— 树上高亮了当前位置。你还在主线的时候回答就写完了。",
      "p3-sweep": "子线程里也能再插针 —— 继续拖选。",
      "p3-selpop": "一样的工具栏、一样的流程 —— 高亮保持，点「追问」。",
      "p3-dialog": "针对子线程的推荐 —— 也可以自己输入。",
      "p3-pick": "挑一条。",
      "p3-underline": "深度 2 —— 注意这里的新下划线和树上的第三层。",
      "l2-hover": "悬停更深的锚点 —— 预览里就有问答。",
      "l2-enter": "点「进入」—— 你现在在深度 2。",
      "l2-stream": "第 3 层 —— 树上实时标出你当前的深度。最深这层的回答也早就备好了。",
      "graph-hint": "右栏一直在跟着记录每条分支。",
      "graph-nav-root": "点任意节点就能跳过去 —— 看「主线」节点的脉冲提示。",
      "graph-navigated": "回到「主线」节点，三条分支全在树上。",
      "merge-hint": "右上角 —— 点「合并」把所有针拼到一起。",
      "merge-modal": "树上显示每条分支；祖先自动向上聚合。",
      "merge-stream": "基于选中的分支，流式生成结构化报告。",
      "merge-done": "三层深挖，一份完整成品。循环就这样。",
    },
  },

  ja: {
    mainQuestion: "Deeppin は何が違う？",
    aiBefore1:
      "AI の返答を読んでいて、ある部分をもっと深掘りしたい時 —— 選択肢は二つしかない。新しいチャット（文脈喪失）か、同じチャット（話題のずれ）。Deeppin なら",
    anchor1: "そこをピン留め",
    aiBetween: "して、",
    anchor2: "好きなだけ掘れる",
    aiAfter2: " —— どれだけ深くても。メインスレッドは一言も遮られない。",
    suggestions1: [
      "ピン留めの流れをステップごとに見せて",
      "サブスレッドの文脈はどう絞られるの？",
      "探索の全体を共有するには？",
    ],
    suggestions2: [
      "まだ未読のアンカーをどう見分ける？",
      "ピンをスレッド間でドラッグできる？",
      "気が変わって閉じたいときは？",
    ],
    sub1Before:
      "サブスレッドに入った。ここでは質問が絞られた状態で続けられる —— 上のメインスレッドには一切影響しない。さらに深掘りしたくなったら、",
    sub1Anchor: "フレーズをピン留めしてもう一層開く",
    sub1After:
      "。何層でもネストできるし、ここでの操作は上に漏れない。",
    suggestions3: [
      "もう一層深くても同じように動くのを見せて",
      "どこまで潜れる？",
      "このサブ内でも横に分岐できる？",
    ],
    sub2Reply:
      "まったく同じ仕組み。ここでフレーズをピン留めすると、下にまた焦点サブスレッドが開く —— この層はそのまま、さっきのメインと同じ。今、深さ 2 にいる。上限なし：続けて掘る、横に分岐、ここで止めるも自由。三層上のメインスレッドは、離れた時のまま。",
    subTitle1: "そこをピン留め",
    subTitle2: "好きなだけ掘る",
    deepTitle: "もう一層開く",
    mainCrumb: "メイン",
    followupLabel: "質問",
    pinLabel: "ピン",
    copyLabel: "コピー",
    enterLabel: "開く",
    selectLabel: "選択",
    newReplyLabel: "新着",
    overviewLabel: "概要",
    graphTabLabel: "グラフ",
    listTabLabel: "リスト",
    mergeLabel: "マージ",
    mergeOutputLabel: "統合出力",
    suggestionsLabel: "提案",
    customQuestionPlaceholder: "自分で質問を書く…",
    youLabel: "あなた",
    aiLabel: "Deeppin",
    youAreHereLabel: "ここにいます",
    tapLabel: "タップ",
    replyingLabel: "サブスレッドで応答中…",
    generatingLabel: "生成中…",
    readyLabel: "準備完了",
    mergeSelectThreads: "マージ対象の枝",
    mergeAll: "全選択",
    mergeGenerate: "生成開始",
    mergeDownload: "Markdown ダウンロード",
    mergeCopy: "コピー",
    mergeFormats: ["自由要約", "箇条書き", "構造化"],
    mergeBranchesSelected: "3 本の枝 + 1 本の主線",
    mergeReport:
`## Deeppin を一気に

**ピン留めが意図を捕まえる**
掘りたい原文を選び、焦点サブスレッドを開く。メインはそのまま —— 新タブ不要、再起動不要。

**どの層も同じように動く**
どのサブスレッドでも、質問は絞られたまま。さらに深掘りしたい？別のフレーズをピン留めして、また一層開く。深さ 2 は深さ 1 と同じ体験、深さ 4 も同じ。

**マージで物語を組み直す**
残したい枝を選ぶ → 一本の構造化レポート、深さで色分け。ピンが見出しに、返答が本文に。

**結果**
三層の深掘り、一つの成果物、メインでの話題漂流ゼロ。`,
    caption: {
      blank: "新規会話 —— メインの質問を投げる直前。",
      "main-stream": "Deeppin のメイン返答 —— さっと読んで。",
      "p1-sweep": "掘りたいフレーズをドラッグ選択 —— ハイライトは残る。",
      "p1-selpop": "選択はハイライトしたまま、上にツールバー。質問を押す。",
      "p1-dialog": "フォローアップが 3 つ自動生成 —— 下の欄で自分で書くことも。",
      "p1-pick": "追いたいものを一つ選ぶ。",
      "p1-underline": "二箇所を同時に：ここのアンカー下線と、右の新ノード。",
      "p2-sweep": "メインに戻って、二つ目のフレーズをドラッグ。",
      "p2-selpop": "同じツールバー、新しいフレーズ —— ハイライト保持、もう一度質問。",
      "p2-dialog": "新しい提案 —— 自分で書いてもよい。",
      "p2-pick": "一つ選ぶ。",
      "p2-underline": "二本のピン、並行する二つのサブ。読みたい時に戻ればいい。",
      "l1-hover": "一本目のアンカーにホバー —— プレビューに質問と返答。",
      "l1-enter": "開くを押す —— サブスレッド 1 に入る。",
      "l1-stream": "今いるのは第 2 層 —— ツリーが現在地を示している。メインにいる間に返答は完成していた。",
      "p3-sweep": "サブ内でもピン可能 —— ドラッグして選択。",
      "p3-selpop": "同じツールバー、同じ流れ —— ハイライト保持、質問を押す。",
      "p3-dialog": "サブに特化した提案 —— 自分で書いてもよい。",
      "p3-pick": "一つ選ぶ。",
      "p3-underline": "深さ 2 —— ここの新しい下線と、ツリーの第三層を見て。",
      "l2-hover": "深いアンカーにホバー —— プレビューに質問と答え。",
      "l2-enter": "開くを押す —— 深さ 2 にいる。",
      "l2-stream": "第 3 層 —— ツリーが深さをリアルタイム表示。最深層の答えも既に待機済み。",
      "graph-hint": "右側はずっと全ての枝を追跡していた。",
      "graph-nav-root": "どのノードをタップしても飛べる —— メインノードの脈動に注目。",
      "graph-navigated": "メインノードに戻った。三本の枝はすべてツリー上に健在。",
      "merge-hint": "右上 —— マージをタップして、ピンしたものを全部まとめる。",
      "merge-modal": "ツリーが全ての枝を表示、祖先は自動で統合。",
      "merge-stream": "選ばれた枝から構造化レポートが一本生成される。",
      "merge-done": "三層、一つの成果物。これがループ。",
    },
  },

  ko: {
    mainQuestion: "Deeppin은 무엇이 다른가?",
    aiBefore1:
      "AI 답변을 읽다가 한 부분을 더 파고들고 싶을 때, 나쁜 선택지 두 가지 —— 새 대화(맥락 잃음), 같은 대화(주제 흐트러짐). Deeppin은 당신이",
    anchor1: "그 부분을 고정",
    aiBetween: " 하고, ",
    anchor2: "계속 파고드는 것",
    aiAfter2: "을 허용한다 —— 얼마나 깊든. 메인 스레드? 단 한 단어도 끊기지 않는다.",
    suggestions1: [
      "핀 흐름을 단계별로 보여줘",
      "서브 스레드의 맥락은 어떻게 좁혀지나?",
      "전체 탐색을 공유하려면?",
    ],
    suggestions2: [
      "아직 안 읽은 앵커를 어떻게 구분해?",
      "핀을 스레드 간에 드래그할 수 있나?",
      "마음이 바뀌어 닫고 싶으면?",
    ],
    sub1Before:
      "서브 스레드에 들어왔다. 여기서 질문은 집중된 상태로 이어진다 —— 위의 메인은 그대로. 더 깊이 파고들고 싶으면 언제든 ",
    sub1Anchor: "구절을 고정하고 한 층 더 열 수 있다",
    sub1After:
      ". 몇 층이든 중첩 가능하고, 여기서의 동작은 위로 새지 않는다.",
    suggestions3: [
      "한 층 더 깊어도 똑같이 동작하는지 보여줘",
      "얼마나 깊이 갈 수 있나?",
      "이 안에서 옆으로 분기할 수도 있나?",
    ],
    sub2Reply:
      "정확히 같은 패턴. 여기서 구절을 고정하면 아래에 또 집중 서브 스레드가 열린다 —— 이 층은 그대로, 방금 메인이 그랬던 것처럼. 지금 깊이 2. 상한 없음: 계속 가든, 옆으로 분기하든, 여기서 멈추든 자유. 세 층 위의 메인 스레드는, 네가 떠난 곳에 그대로 있다.",
    subTitle1: "그 부분을 고정",
    subTitle2: "계속 파고들기",
    deepTitle: "한 층 더 열기",
    mainCrumb: "메인",
    followupLabel: "질문",
    pinLabel: "핀",
    copyLabel: "복사",
    enterLabel: "열기",
    selectLabel: "선택",
    newReplyLabel: "새글",
    overviewLabel: "개요",
    graphTabLabel: "그래프",
    listTabLabel: "목록",
    mergeLabel: "병합",
    mergeOutputLabel: "병합 출력",
    suggestionsLabel: "추천 질문",
    customQuestionPlaceholder: "직접 후속 질문 입력…",
    youLabel: "당신",
    aiLabel: "Deeppin",
    youAreHereLabel: "여기 있음",
    tapLabel: "탭",
    replyingLabel: "서브 스레드에서 응답 중…",
    generatingLabel: "생성 중…",
    readyLabel: "준비됨",
    mergeSelectThreads: "병합 대상 분기",
    mergeAll: "전체",
    mergeGenerate: "생성 시작",
    mergeDownload: "Markdown 다운로드",
    mergeCopy: "복사",
    mergeFormats: ["자유 요약", "요점 목록", "구조화"],
    mergeBranchesSelected: "3개 분기 + 1개 메인",
    mergeReport:
`## Deeppin 한 번에

**핀은 의도를 붙잡는다**
파고들 원문을 고르고 집중 서브 스레드를 연다. 메인은 그대로 —— 새 탭 없음, 재시작 없음.

**어느 층이든 똑같이 동작**
어느 서브 스레드든 질문은 집중된 상태로 유지. 더 깊이 가고 싶어? 다른 구절을 고정하고 한 층 더 연다. 깊이 2는 깊이 1과 똑같이 동작하고, 깊이 4도 마찬가지.

**병합이 이야기를 재구성**
원하는 분기를 고르면 → 깊이별 색상의 구조화 리포트 한 편. 핀은 제목, 답변은 본문.

**결과**
세 층의 파고들기, 하나의 일관된 산출물, 메인에서의 주제 표류 없음.`,
    caption: {
      blank: "새 대화 —— 메인 질문을 던질 참.",
      "main-stream": "Deeppin의 메인 답변 —— 빠르게 훑어봐.",
      "p1-sweep": "파고들 구절을 드래그해 선택 —— 하이라이트 유지.",
      "p1-selpop": "선택은 하이라이트 유지, 위에 툴바. 질문을 누른다.",
      "p1-dialog": "후속 질문 세 개 자동 생성 —— 아래 상자에 직접 입력도 가능.",
      "p1-pick": "진짜 따라갈 한 개를 고른다.",
      "p1-underline": "두 곳을 동시에: 여기 앵커 밑줄과, 오른쪽에 새 노드.",
      "p2-sweep": "메인으로 돌아가 두 번째 구절을 드래그.",
      "p2-selpop": "같은 툴바, 새 구절 —— 하이라이트 유지, 다시 질문.",
      "p2-dialog": "새 제안 —— 직접 입력도 가능.",
      "p2-pick": "하나 고른다.",
      "p2-underline": "두 개의 핀, 두 개의 병렬 서브. 준비되면 돌아온다.",
      "l1-hover": "첫 앵커에 호버 —— 미리보기에 질문과 답변.",
      "l1-enter": "열기 누름 —— 서브 스레드 1에 진입.",
      "l1-stream": "지금 2층에 있음 —— 트리가 현재 위치를 표시. 메인에 있는 동안 답변은 이미 완성.",
      "p3-sweep": "서브 안에서도 핀 가능 —— 드래그로 선택.",
      "p3-selpop": "같은 툴바, 같은 흐름 —— 하이라이트 유지, 질문.",
      "p3-dialog": "서브에 맞춘 후속 —— 직접 입력도 가능.",
      "p3-pick": "하나 고른다.",
      "p3-underline": "깊이 2 —— 여기 새 밑줄과 트리의 세 번째 층을 보라.",
      "l2-hover": "더 깊은 앵커에 호버 —— 미리보기에 질문과 답.",
      "l2-enter": "열기 누름 —— 지금 깊이 2.",
      "l2-stream": "3층 —— 트리가 네 깊이를 실시간으로 따라간다. 가장 깊은 답변도 이미 대기 중이었다.",
      "graph-hint": "오른쪽 레일이 줄곧 모든 분기를 추적했다.",
      "graph-nav-root": "어느 노드든 탭하면 이동 —— 메인 노드의 맥동 주목.",
      "graph-navigated": "메인 노드에 복귀. 세 분기 모두 트리에 살아있다.",
      "merge-hint": "오른쪽 상단 —— 병합을 탭해 모든 핀을 조립.",
      "merge-modal": "트리가 모든 분기를 표시, 조상은 자동 집계.",
      "merge-stream": "선택된 분기에서 구조화 리포트가 생성.",
      "merge-done": "세 층, 하나의 산출물. 루프는 이렇게.",
    },
  },

  es: {
    mainQuestion: "¿Qué hace diferente a Deeppin?",
    aiBefore1:
      "Cuando lees una respuesta de IA y quieres profundizar en una parte, tienes dos malas opciones — chat nuevo (pierdes contexto) o el mismo chat (el tema deriva). Deeppin te deja ",
    anchor1: "anclar ese detalle",
    aiBetween: " y ",
    anchor2: "seguir cavando",
    aiAfter2: " — por muy profundo que vayas. ¿El hilo principal? Ni una palabra interrumpida.",
    suggestions1: [
      "Muéstrame el flujo de anclado paso a paso",
      "¿Cómo se mantiene enfocado el contexto en un sub-hilo?",
      "¿Y si quiero compartir toda la exploración?",
    ],
    suggestions2: [
      "¿Cómo identifico anclas con respuestas aún sin leer?",
      "¿Puedo arrastrar anclas entre hilos?",
      "¿Y si cambio de opinión y quiero cerrar una?",
    ],
    sub1Before:
      "Entraste al sub-hilo. Tu pregunta se mantiene enfocada aquí — el principal arriba queda intacto. Cuando quieras ir más profundo, ",
    sub1Anchor: "ancla una frase y abre otro nivel",
    sub1After:
      ". Puedes anidar tantas capas como necesites, y nada de lo que hagas aquí sube.",
    suggestions3: [
      "Muéstrame que funciona igual un nivel más abajo",
      "¿Hasta dónde puedo llegar?",
      "¿Puedo ramificar lateralmente dentro de este?",
    ],
    sub2Reply:
      "Exactamente el mismo patrón. Ancla cualquier frase aquí y se abre otro sub-hilo enfocado debajo — esta capa queda intacta, como el principal antes. Ahora estás a profundidad 2, sin tope: sigue, ramifica lateralmente o detente aquí. Tres niveles arriba, tu principal está exactamente donde lo dejaste.",
    subTitle1: "anclar ese detalle",
    subTitle2: "seguir cavando",
    deepTitle: "abrir otro nivel",
    mainCrumb: "Principal",
    followupLabel: "Pregunta",
    pinLabel: "Anclar",
    copyLabel: "Copiar",
    enterLabel: "Abrir",
    selectLabel: "Seleccionar",
    newReplyLabel: "Nuevo",
    overviewLabel: "resumen",
    graphTabLabel: "grafo",
    listTabLabel: "lista",
    mergeLabel: "Fusionar",
    mergeOutputLabel: "Fusionar salida",
    suggestionsLabel: "sugerencias",
    customQuestionPlaceholder: "O escribe tu propia pregunta…",
    youLabel: "TÚ",
    aiLabel: "Deeppin",
    youAreHereLabel: "estás aquí",
    tapLabel: "toca",
    replyingLabel: "respondiendo en sub-hilo…",
    generatingLabel: "generando…",
    readyLabel: "listo",
    mergeSelectThreads: "Ramas en esta fusión",
    mergeAll: "Todo",
    mergeGenerate: "Generar",
    mergeDownload: "Descargar Markdown",
    mergeCopy: "Copiar",
    mergeFormats: ["Resumen libre", "Puntos clave", "Estructurado"],
    mergeBranchesSelected: "3 ramas + 1 principal",
    mergeReport:
`## Deeppin de una pasada

**Anclar captura la intención**
Eliges la frase exacta que quieres expandir, abres un sub-hilo enfocado, y el principal queda intacto — sin pestaña nueva, sin reinicio.

**Cada capa funciona igual**
En cualquier sub-hilo, tu pregunta se mantiene enfocada. ¿Quieres ir más profundo? Ancla otra frase y abre otra capa. Profundidad 2 se comporta igual que profundidad 1, y profundidad 4 también.

**Fusionar reconstruye la historia**
Elige las ramas que importan → un informe estructurado, coloreado por profundidad. Los pines se vuelven títulos; las respuestas, el cuerpo.

**Resultado neto**
Tres niveles de exploración, un artefacto coherente, cero deriva en el hilo principal.`,
    caption: {
      blank: "Conversación nueva — estás a punto de hacer la pregunta principal.",
      "main-stream": "Respuesta de Deeppin en el principal — échale un vistazo.",
      "p1-sweep": "Arrastra sobre la frase a profundizar — queda resaltada.",
      "p1-selpop": "El resalte se queda, una barra aparece arriba. Pulsa Pregunta.",
      "p1-dialog": "Tres seguimientos se generan — o escribe el tuyo abajo.",
      "p1-pick": "Elige el que de verdad quieres perseguir.",
      "p1-underline": "Dos cambios a la vez: el ancla se subraya aquí y un nodo aparece a la derecha.",
      "p2-sweep": "De vuelta al principal — arrastra sobre una segunda frase.",
      "p2-selpop": "Misma barra, frase nueva — resalte se mantiene, pulsa Pregunta.",
      "p2-dialog": "Nuevas sugerencias — o escribe la tuya.",
      "p2-pick": "Elige una.",
      "p2-underline": "Dos anclas, dos sub-hilos paralelos. Vuelve cuando estés listo.",
      "l1-hover": "Pasa el ratón por la primera ancla — la vista muestra tu pregunta y la respuesta.",
      "l1-enter": "Pulsa Abrir — estás dentro del sub-hilo 1.",
      "l1-stream": "Ahora estás en la capa 2 — el árbol marca tu lugar. La respuesta ya estaba lista mientras seguías en el principal.",
      "p3-sweep": "También puedes anclar dentro de un sub-hilo — arrastra.",
      "p3-selpop": "Misma barra, mismo flujo — resalte se mantiene, pulsa Pregunta.",
      "p3-dialog": "Seguimientos centrados en el sub-hilo — o escribe el tuyo.",
      "p3-pick": "Elige una.",
      "p3-underline": "Profundidad 2 — mira el nuevo subrayado y la tercera capa del árbol.",
      "l2-hover": "Pasa el ratón por el ancla más profunda — vista con pregunta y respuesta.",
      "l2-enter": "Pulsa Abrir — ahora estás a profundidad 2.",
      "l2-stream": "Capa 3 — el árbol sigue tu profundidad en vivo. La respuesta más profunda ya estaba esperando.",
      "graph-hint": "La barra derecha siguió cada rama todo el tiempo.",
      "graph-nav-root": "Toca cualquier nodo para saltar — fíjate en el pulso sobre Principal.",
      "graph-navigated": "De vuelta al nodo Principal. Las tres ramas siguen vivas en el árbol.",
      "merge-hint": "Arriba a la derecha — toca Fusionar para ensamblar todos los pines.",
      "merge-modal": "El árbol muestra cada rama; los ancestros se agregan solos.",
      "merge-stream": "Se genera un informe estructurado a partir de las ramas elegidas.",
      "merge-done": "Tres niveles, un artefacto coherente. Ese es el bucle.",
    },
  },

  fr: {
    mainQuestion: "Qu'est-ce qui rend Deeppin différent ?",
    aiBefore1:
      "Quand tu lis une réponse d'IA et que tu veux creuser une partie, tu as deux mauvais choix — nouveau chat (perte de contexte) ou même chat (le sujet dérive). Deeppin te laisse ",
    anchor1: "épingler ce détail",
    aiBetween: " et ",
    anchor2: "continuer à creuser",
    aiAfter2: " — aussi profond que tu veux. Le fil principal ? Pas un mot interrompu.",
    suggestions1: [
      "Montre-moi le flux d'épinglage étape par étape",
      "Comment le contexte reste-t-il focalisé dans un sous-fil ?",
      "Et si je veux partager toute l'exploration ?",
    ],
    suggestions2: [
      "Comment repérer les ancres avec des réponses non lues ?",
      "Puis-je glisser les épingles entre les fils ?",
      "Et si je change d'avis et que je veux en fermer une ?",
    ],
    sub1Before:
      "Tu es dans le sous-fil. Ta question reste concentrée ici — le principal au-dessus reste intact. Quand tu veux aller plus profond, ",
    sub1Anchor: "épingle une phrase et ouvre un autre niveau",
    sub1After:
      ". Tu peux imbriquer autant de couches que tu veux, et rien de ce que tu fais ici ne remonte.",
    suggestions3: [
      "Montre-moi que ça marche pareil un niveau plus profond",
      "Jusqu'où je peux aller ?",
      "Puis-je me ramifier latéralement dedans ?",
    ],
    sub2Reply:
      "Exactement le même schéma. Épingle n'importe quelle phrase ici et un autre sous-fil ciblé s'ouvre en dessous — cette couche reste intacte, comme le principal tout à l'heure. Tu es maintenant à profondeur 2, sans plafond : continue, ramifie, ou arrête ici. Trois niveaux plus haut, ton fil principal est exactement là où tu l'as laissé.",
    subTitle1: "épingler ce détail",
    subTitle2: "continuer à creuser",
    deepTitle: "ouvrir un autre niveau",
    mainCrumb: "Principal",
    followupLabel: "Question",
    pinLabel: "Épingler",
    copyLabel: "Copier",
    enterLabel: "Ouvrir",
    selectLabel: "Sélectionner",
    newReplyLabel: "Nouveau",
    overviewLabel: "vue d'ensemble",
    graphTabLabel: "graphe",
    listTabLabel: "liste",
    mergeLabel: "Fusionner",
    mergeOutputLabel: "Fusionner la sortie",
    suggestionsLabel: "suggestions",
    customQuestionPlaceholder: "Ou tape ta propre question…",
    youLabel: "TOI",
    aiLabel: "Deeppin",
    youAreHereLabel: "tu es ici",
    tapLabel: "clique",
    replyingLabel: "réponse dans le sous-fil…",
    generatingLabel: "génération…",
    readyLabel: "prêt",
    mergeSelectThreads: "Branches dans cette fusion",
    mergeAll: "Tout",
    mergeGenerate: "Générer",
    mergeDownload: "Télécharger Markdown",
    mergeCopy: "Copier",
    mergeFormats: ["Résumé libre", "Points clés", "Structuré"],
    mergeBranchesSelected: "3 branches + 1 principal",
    mergeReport:
`## Deeppin d'un trait

**L'épinglage capte l'intention**
Tu choisis la phrase exacte à creuser, tu ouvres un sous-fil ciblé, et le principal reste intact — pas de nouvel onglet, pas de redémarrage.

**Chaque couche marche pareil**
Dans n'importe quel sous-fil, ta question reste concentrée. Tu veux aller plus loin ? Épingle une autre phrase et ouvre une autre couche. Profondeur 2 se comporte comme profondeur 1, et profondeur 4 aussi.

**Fusionner reconstruit l'histoire**
Choisis les branches qui comptent → un rapport structuré, coloré par profondeur. Les épingles deviennent titres ; les réponses, le corps.

**Résultat net**
Trois niveaux d'exploration, un artefact cohérent, zéro dérive sur le fil principal.`,
    caption: {
      blank: "Nouvelle conversation — tu vas poser la question principale.",
      "main-stream": "Réponse de Deeppin sur le principal — jette un œil.",
      "p1-sweep": "Glisse sur la phrase à creuser — la surbrillance reste.",
      "p1-selpop": "La sélection reste en surbrillance, une barre apparaît au-dessus. Clique Question.",
      "p1-dialog": "Trois suivis se génèrent — ou tape le tien dans la boîte.",
      "p1-pick": "Choisis celui que tu veux vraiment poursuivre.",
      "p1-underline": "Deux changements à la fois : l'ancre se souligne ici, un nœud apparaît à droite.",
      "p2-sweep": "Retour au principal — glisse sur une deuxième phrase.",
      "p2-selpop": "Même barre, phrase nouvelle — la surbrillance reste, clique Question.",
      "p2-dialog": "Nouvelles suggestions — ou écris la tienne.",
      "p2-pick": "Choisis-en une.",
      "p2-underline": "Deux ancres, deux sous-fils parallèles. Reviens quand prêt.",
      "l1-hover": "Survole la première ancre — un aperçu montre question et réponse.",
      "l1-enter": "Clique Ouvrir — tu es dans le sous-fil 1.",
      "l1-stream": "Tu es sur la couche 2 — l'arbre marque ta position. La réponse était prête pendant que tu restais sur le principal.",
      "p3-sweep": "Tu peux aussi épingler dans un sous-fil — glisse.",
      "p3-selpop": "Même barre, même flux — surbrillance maintenue, clique Question.",
      "p3-dialog": "Suivis centrés sur le sous-fil — ou écris le tien.",
      "p3-pick": "Choisis-en une.",
      "p3-underline": "Profondeur 2 — regarde le nouveau soulignement et la troisième couche de l'arbre.",
      "l2-hover": "Survole l'ancre plus profonde — aperçu avec question et réponse.",
      "l2-enter": "Clique Ouvrir — tu es maintenant à profondeur 2.",
      "l2-stream": "Couche 3 — l'arbre suit ta profondeur en direct. La réponse la plus profonde attendait déjà.",
      "graph-hint": "La barre de droite a suivi chaque branche depuis le début.",
      "graph-nav-root": "Clique n'importe quel nœud pour sauter — note le pulse sur Principal.",
      "graph-navigated": "Retour au nœud Principal. Les trois branches restent vivantes dans l'arbre.",
      "merge-hint": "En haut à droite — clique Fusionner pour assembler toutes les épingles.",
      "merge-modal": "L'arbre montre chaque branche ; les ancêtres s'agrègent automatiquement.",
      "merge-stream": "Un rapport structuré est généré à partir des branches choisies.",
      "merge-done": "Trois niveaux, un artefact cohérent. C'est la boucle.",
    },
  },

  de: {
    mainQuestion: "Was macht Deeppin anders?",
    aiBefore1:
      "Wenn du eine KI-Antwort liest und einen Teil vertiefen willst, hast du zwei schlechte Optionen — neuer Chat (Kontext verloren) oder selber Chat (Thema driftet). Mit Deeppin kannst du ",
    anchor1: "dieses Detail anheften",
    aiBetween: " und ",
    anchor2: "beliebig tief weitergraben",
    aiAfter2: " — egal wie tief. Der Haupt-Thread? Kein Wort unterbrochen.",
    suggestions1: [
      "Zeig mir den Pin-Ablauf Schritt für Schritt",
      "Wie bleibt der Kontext im Sub-Thread fokussiert?",
      "Was, wenn ich die ganze Erkundung teilen will?",
    ],
    suggestions2: [
      "Wie erkenne ich Anker mit noch ungelesenen Antworten?",
      "Kann ich Pins zwischen Threads ziehen?",
      "Was, wenn ich es mir anders überlege und einen schließen will?",
    ],
    sub1Before:
      "Im Sub-Thread. Deine Frage bleibt hier fokussiert — der Haupt-Thread oben bleibt unberührt. Wenn du tiefer willst, ",
    sub1Anchor: "hefte eine Phrase an und öffne eine weitere Ebene",
    sub1After:
      ". Du kannst so viele Ebenen verschachteln wie du willst, und nichts davon fließt nach oben zurück.",
    suggestions3: [
      "Zeig, dass es auf einer Ebene tiefer genauso funktioniert",
      "Wie tief kann ich wirklich gehen?",
      "Kann ich hier drin auch seitlich verzweigen?",
    ],
    sub2Reply:
      "Exakt dasselbe Muster. Hefte hier eine Phrase an und darunter öffnet sich ein weiterer fokussierter Sub-Thread — diese Ebene bleibt unberührt, wie der Haupt vorhin. Du bist jetzt auf Tiefe 2, ohne Obergrenze: weitergehen, seitlich verzweigen oder hier stoppen. Drei Ebenen höher ist dein Haupt-Thread genau da, wo du ihn verlassen hast.",
    subTitle1: "dieses Detail anheften",
    subTitle2: "tief weitergraben",
    deepTitle: "eine Ebene öffnen",
    mainCrumb: "Haupt",
    followupLabel: "Frage",
    pinLabel: "Anheften",
    copyLabel: "Kopieren",
    enterLabel: "Öffnen",
    selectLabel: "Auswählen",
    newReplyLabel: "Neu",
    overviewLabel: "Übersicht",
    graphTabLabel: "Graph",
    listTabLabel: "Liste",
    mergeLabel: "Zusammenführen",
    mergeOutputLabel: "Ausgabe zusammenführen",
    suggestionsLabel: "Vorschläge",
    customQuestionPlaceholder: "Oder tipp deine eigene Frage…",
    youLabel: "DU",
    aiLabel: "Deeppin",
    youAreHereLabel: "du bist hier",
    tapLabel: "klick",
    replyingLabel: "antwortet im Sub-Thread…",
    generatingLabel: "wird generiert…",
    readyLabel: "bereit",
    mergeSelectThreads: "Zweige in dieser Zusammenführung",
    mergeAll: "Alle",
    mergeGenerate: "Generieren",
    mergeDownload: "Markdown herunterladen",
    mergeCopy: "Kopieren",
    mergeFormats: ["Freies Resümee", "Stichpunkte", "Strukturiert"],
    mergeBranchesSelected: "3 Zweige + 1 Haupt",
    mergeReport:
`## Deeppin auf einen Blick

**Anheften erfasst die Absicht**
Du wählst die exakte Phrase, die du vertiefen willst, öffnest einen fokussierten Sub-Thread, und der Haupt-Thread bleibt unberührt — kein neuer Tab, kein Neustart.

**Jede Ebene funktioniert gleich**
In jedem Sub-Thread bleibt deine Frage fokussiert. Willst du tiefer? Hefte eine weitere Phrase an und öffne die nächste Ebene. Tiefe 2 verhält sich genau wie Tiefe 1, Tiefe 4 ebenso.

**Zusammenführen baut die Geschichte zurück**
Wähle die Zweige, die zählen → ein strukturierter Bericht, nach Tiefe eingefärbt. Pins werden zu Überschriften; Antworten zum Körper.

**Nettoergebnis**
Drei Ebenen Erkundung, ein kohärentes Artefakt, null Drift im Haupt-Thread.`,
    caption: {
      blank: "Neue Unterhaltung — du stellst gleich die Hauptfrage.",
      "main-stream": "Deeppins Antwort im Haupt-Thread — lies kurz mit.",
      "p1-sweep": "Ziehe über die Phrase, die du vertiefen willst — Markierung bleibt.",
      "p1-selpop": "Auswahl bleibt markiert, Toolbar erscheint oben. Klicke Frage.",
      "p1-dialog": "Drei Folgefragen werden generiert — oder tippe unten deine eigene.",
      "p1-pick": "Wähle die, die du wirklich verfolgen willst.",
      "p1-underline": "Zwei Änderungen gleichzeitig: der Anker wird hier unterstrichen, ein Knoten taucht rechts auf.",
      "p2-sweep": "Zurück im Haupt — ziehe über eine zweite Phrase.",
      "p2-selpop": "Dieselbe Toolbar, neue Phrase — Markierung bleibt, klicke Frage.",
      "p2-dialog": "Neue Vorschläge — oder tippe deine eigene.",
      "p2-pick": "Wähle eine.",
      "p2-underline": "Zwei Anker, zwei parallele Sub-Threads. Komm zurück, wenn bereit.",
      "l1-hover": "Fahre über den ersten Anker — Vorschau zeigt Frage und Antwort.",
      "l1-enter": "Öffnen klicken — du bist im Sub-Thread 1.",
      "l1-stream": "Du bist jetzt auf Ebene 2 — der Baum markiert deinen Platz. Die Antwort war fertig, während du im Haupt bliebst.",
      "p3-sweep": "Auch im Sub-Thread kannst du anheften — ziehen.",
      "p3-selpop": "Gleiche Toolbar, gleicher Ablauf — Markierung bleibt, klicke Frage.",
      "p3-dialog": "Folgefragen auf den Sub-Thread fokussiert — oder tippe deine eigene.",
      "p3-pick": "Wähle eine.",
      "p3-underline": "Tiefe 2 — schau die neue Unterstreichung und die dritte Ebene im Baum.",
      "l2-hover": "Fahre über den tieferen Anker — Vorschau mit Frage und Antwort.",
      "l2-enter": "Öffnen klicken — jetzt bist du auf Tiefe 2.",
      "l2-stream": "Ebene 3 — der Baum verfolgt deine Tiefe live. Die tiefste Antwort wartete schon.",
      "graph-hint": "Die rechte Leiste hat die ganze Zeit jeden Zweig verfolgt.",
      "graph-nav-root": "Klicke einen beliebigen Knoten zum Springen — beachte den Puls auf Haupt.",
      "graph-navigated": "Zurück am Haupt-Knoten. Alle drei Zweige bleiben im Baum aktiv.",
      "merge-hint": "Oben rechts — klicke Zusammenführen, um alles Angeheftete zusammenzubauen.",
      "merge-modal": "Der Baum zeigt jeden Zweig; Vorfahren werden automatisch aggregiert.",
      "merge-stream": "Aus den gewählten Zweigen wird ein strukturierter Bericht generiert.",
      "merge-done": "Drei Ebenen, ein kohärentes Artefakt. Das ist der Loop.",
    },
  },

  pt: {
    mainQuestion: "O que faz o Deeppin diferente?",
    aiBefore1:
      "Ao ler uma resposta de IA e querer aprofundar uma parte, você tem duas opções ruins — novo chat (perde contexto) ou mesmo chat (o tema desvia). O Deeppin permite ",
    anchor1: "fixar esse detalhe",
    aiBetween: " e ",
    anchor2: "continuar cavando",
    aiAfter2: " — por mais fundo que vá. O tópico principal? Nenhuma palavra interrompida.",
    suggestions1: [
      "Mostre o fluxo de fixar passo a passo",
      "Como o contexto fica focado num sub-tópico?",
      "E se eu quiser compartilhar toda a exploração?",
    ],
    suggestions2: [
      "Como identifico âncoras com respostas ainda não lidas?",
      "Posso arrastar pins entre tópicos?",
      "E se eu mudar de ideia e quiser fechar um?",
    ],
    sub1Before:
      "Entrou no sub-tópico. Sua pergunta fica focada aqui — o principal acima permanece intacto. Quando quiser ir mais fundo, ",
    sub1Anchor: "fixe uma frase e abra outro nível",
    sub1After:
      ". Pode aninhar quantas camadas precisar, e nada do que fizer aqui vaza para cima.",
    suggestions3: [
      "Mostre que funciona igual um nível mais fundo",
      "Até onde dá para ir?",
      "Dá para ramificar lateralmente dentro deste?",
    ],
    sub2Reply:
      "Exatamente o mesmo padrão. Fixe qualquer frase aqui e outro sub-tópico focado abre abaixo — esta camada fica intacta, como o principal fez antes. Você está agora na profundidade 2, sem teto: continue, ramifique lateralmente, ou pare aqui. Três níveis acima, seu principal está exatamente onde você deixou.",
    subTitle1: "fixar esse detalhe",
    subTitle2: "continuar cavando",
    deepTitle: "abrir outro nível",
    mainCrumb: "Principal",
    followupLabel: "Pergunta",
    pinLabel: "Fixar",
    copyLabel: "Copiar",
    enterLabel: "Abrir",
    selectLabel: "Selecionar",
    newReplyLabel: "Novo",
    overviewLabel: "visão geral",
    graphTabLabel: "grafo",
    listTabLabel: "lista",
    mergeLabel: "Mesclar",
    mergeOutputLabel: "Mesclar saída",
    suggestionsLabel: "sugestões",
    customQuestionPlaceholder: "Ou escreva sua própria pergunta…",
    youLabel: "VOCÊ",
    aiLabel: "Deeppin",
    youAreHereLabel: "você está aqui",
    tapLabel: "toque",
    replyingLabel: "respondendo no sub-tópico…",
    generatingLabel: "gerando…",
    readyLabel: "pronto",
    mergeSelectThreads: "Ramos nesta mesclagem",
    mergeAll: "Tudo",
    mergeGenerate: "Gerar",
    mergeDownload: "Baixar Markdown",
    mergeCopy: "Copiar",
    mergeFormats: ["Resumo livre", "Tópicos", "Estruturado"],
    mergeBranchesSelected: "3 ramos + 1 principal",
    mergeReport:
`## Deeppin de uma só vez

**Fixar captura a intenção**
Você escolhe a frase exata para aprofundar, abre um sub-tópico focado, e o principal fica intacto — sem nova aba, sem reiniciar.

**Cada camada funciona igual**
Em qualquer sub-tópico, sua pergunta fica focada. Quer ir mais fundo? Fixe outra frase e abra outra camada. Profundidade 2 se comporta igual à profundidade 1, e profundidade 4 também.

**Mesclar reconstrói a história**
Selecione as ramificações que importam → um relatório estruturado, codificado por profundidade. Pins viram títulos; respostas, corpo.

**Resultado líquido**
Três níveis de exploração, um artefato coerente, zero desvio no tópico principal.`,
    caption: {
      blank: "Conversa nova — você vai fazer a pergunta principal.",
      "main-stream": "Resposta do Deeppin no principal — dá uma lida rápida.",
      "p1-sweep": "Arraste sobre a frase a aprofundar — fica destacada.",
      "p1-selpop": "A seleção fica destacada, uma barra surge acima. Toque Pergunta.",
      "p1-dialog": "Três acompanhamentos são gerados — ou escreva o seu na caixa.",
      "p1-pick": "Escolha o que você realmente quer seguir.",
      "p1-underline": "Duas mudanças ao mesmo tempo: a âncora é sublinhada aqui e um nó aparece à direita.",
      "p2-sweep": "De volta ao principal — arraste sobre uma segunda frase.",
      "p2-selpop": "Mesma barra, frase nova — destaque permanece, toque Pergunta.",
      "p2-dialog": "Novas sugestões — ou escreva a sua.",
      "p2-pick": "Escolha uma.",
      "p2-underline": "Duas âncoras, dois sub-tópicos paralelos. Volte quando pronto.",
      "l1-hover": "Passe o mouse na primeira âncora — a prévia mostra pergunta e resposta.",
      "l1-enter": "Toque Abrir — você está dentro do sub-tópico 1.",
      "l1-stream": "Você está na camada 2 — a árvore marca sua posição. A resposta já estava pronta enquanto você ficava no principal.",
      "p3-sweep": "Também dá para fixar dentro de um sub-tópico — arraste.",
      "p3-selpop": "Mesma barra, mesmo fluxo — destaque permanece, toque Pergunta.",
      "p3-dialog": "Acompanhamentos focados no sub-tópico — ou escreva o seu.",
      "p3-pick": "Escolha uma.",
      "p3-underline": "Profundidade 2 — veja o novo sublinhado e a terceira camada na árvore.",
      "l2-hover": "Passe o mouse na âncora mais funda — prévia com pergunta e resposta.",
      "l2-enter": "Toque Abrir — agora você está na profundidade 2.",
      "l2-stream": "Camada 3 — a árvore segue sua profundidade ao vivo. A resposta mais funda já esperava.",
      "graph-hint": "A barra direita vem rastreando cada ramo o tempo todo.",
      "graph-nav-root": "Toque em qualquer nó para saltar — repare no pulso sobre o Principal.",
      "graph-navigated": "De volta ao nó Principal. Os três ramos continuam vivos na árvore.",
      "merge-hint": "Canto superior direito — toque Mesclar para juntar tudo que você fixou.",
      "merge-modal": "A árvore mostra cada ramo; ancestrais agregam-se sozinhos.",
      "merge-stream": "Um relatório estruturado é gerado a partir dos ramos escolhidos.",
      "merge-done": "Três níveis, um artefato coerente. Esse é o loop.",
    },
  },

  ru: {
    mainQuestion: "Чем Deeppin отличается?",
    aiBefore1:
      "Читая ответ ИИ и желая углубиться в какую-то часть, у вас два плохих варианта — новый чат (теряете контекст) или тот же чат (тема уходит). Deeppin позволяет вам ",
    anchor1: "закрепить эту деталь",
    aiBetween: " и ",
    anchor2: "копать дальше",
    aiAfter2: " — как угодно глубоко. Основная ветка? Ни одно слово не прервано.",
    suggestions1: [
      "Покажи пошагово процесс закрепления",
      "Как контекст остаётся сфокусированным в подветке?",
      "А если я захочу поделиться всей экспедицией?",
    ],
    suggestions2: [
      "Как понять, у каких якорей есть непрочитанные ответы?",
      "Можно ли перетаскивать закладки между ветками?",
      "А если я передумаю и захочу закрыть одну?",
    ],
    sub1Before:
      "Вы в подветке. Ваш вопрос остаётся сфокусированным здесь — основная ветка наверху не тронута. Когда захотите глубже, ",
    sub1Anchor: "закрепите фразу и откройте ещё уровень",
    sub1After:
      ". Можно вложить сколько угодно слоёв, и ничего из того, что вы здесь делаете, не течёт обратно наверх.",
    suggestions3: [
      "Покажи, что на уровень глубже работает так же",
      "Насколько глубоко реально уйти?",
      "Можно ли внутри этого ответвиться в бок?",
    ],
    sub2Reply:
      "Ровно тот же шаблон. Закрепите любую фразу здесь — и ниже откроется ещё одна сфокусированная подветка, этот уровень останется нетронутым, как основная ранее. Сейчас вы на глубине 2, без потолка: продолжайте, ответвляйтесь, или остановитесь здесь. Три уровня выше, ваша основная ветка ровно там, где вы её оставили.",
    subTitle1: "закрепить эту деталь",
    subTitle2: "копать дальше",
    deepTitle: "открыть ещё уровень",
    mainCrumb: "Главная",
    followupLabel: "Вопрос",
    pinLabel: "Закрепить",
    copyLabel: "Копировать",
    enterLabel: "Открыть",
    selectLabel: "Выбрать",
    newReplyLabel: "Новое",
    overviewLabel: "обзор",
    graphTabLabel: "граф",
    listTabLabel: "список",
    mergeLabel: "Объединить",
    mergeOutputLabel: "Объединить вывод",
    suggestionsLabel: "подсказки",
    customQuestionPlaceholder: "Или введите свой вопрос…",
    youLabel: "ВЫ",
    aiLabel: "Deeppin",
    youAreHereLabel: "вы здесь",
    tapLabel: "нажмите",
    replyingLabel: "отвечает в подветке…",
    generatingLabel: "генерация…",
    readyLabel: "готово",
    mergeSelectThreads: "Ветви в этом объединении",
    mergeAll: "Все",
    mergeGenerate: "Сгенерировать",
    mergeDownload: "Скачать Markdown",
    mergeCopy: "Копировать",
    mergeFormats: ["Свободное резюме", "Ключевые пункты", "Структурировано"],
    mergeBranchesSelected: "3 ветви + 1 главная",
    mergeReport:
`## Deeppin одним заходом

**Закрепление ловит намерение**
Вы выбираете точную фразу для углубления, открываете сфокусированную подветку, и основная остаётся нетронутой — ни новой вкладки, ни перезапуска.

**Каждый слой работает одинаково**
В любой подветке ваш вопрос остаётся сфокусированным. Хотите глубже? Закрепите другую фразу и откройте следующий уровень. Глубина 2 работает так же, как глубина 1, и глубина 4 тоже.

**Объединение собирает историю**
Выберите нужные ветви → один структурированный отчёт с кодировкой по глубине. Закладки становятся заголовками; ответы — телом.

**Итог**
Три уровня исследования, один связный артефакт, ноль дрейфа в основной ветке.`,
    caption: {
      blank: "Новый разговор — вы вот-вот зададите основной вопрос.",
      "main-stream": "Ответ Deeppin в основной ветке — быстро пробегись глазами.",
      "p1-sweep": "Проведите по фразе для углубления — подсветка остаётся.",
      "p1-selpop": "Выделение подсвечено, сверху появляется панель. Нажмите Вопрос.",
      "p1-dialog": "Три уточнения генерируются — или впишите свой в поле ниже.",
      "p1-pick": "Выберите тот, что действительно хотите преследовать.",
      "p1-underline": "Два изменения сразу: якорь подчёркивается здесь, и справа появляется узел.",
      "p2-sweep": "Обратно на главной — проведите по второй фразе.",
      "p2-selpop": "Та же панель, новая фраза — подсветка сохраняется, нажмите Вопрос.",
      "p2-dialog": "Новые подсказки — или впишите свой.",
      "p2-pick": "Выберите одну.",
      "p2-underline": "Две закладки, две параллельные подветки. Возвращайтесь, когда будете готовы.",
      "l1-hover": "Наведите на первый якорь — в предпросмотре вопрос и ответ.",
      "l1-enter": "Нажмите Открыть — вы в подветке 1.",
      "l1-stream": "Вы сейчас на 2-м уровне — дерево отмечает ваше место. Ответ был готов, пока вы оставались на главной.",
      "p3-sweep": "Закреплять можно и внутри подветки — проведите.",
      "p3-selpop": "Та же панель, тот же поток — подсветка сохраняется, нажмите Вопрос.",
      "p3-dialog": "Уточнения, заточенные под подветку — или впишите свой.",
      "p3-pick": "Выберите одну.",
      "p3-underline": "Глубина 2 — посмотрите на новое подчёркивание и третий уровень дерева.",
      "l2-hover": "Наведите на более глубокий якорь — предпросмотр с вопросом и ответом.",
      "l2-enter": "Нажмите Открыть — вы теперь на глубине 2.",
      "l2-stream": "3-й уровень — дерево следит за вашей глубиной в реальном времени. Самый глубокий ответ уже ждал.",
      "graph-hint": "Правая панель всё это время отслеживала каждую ветвь.",
      "graph-nav-root": "Щёлкните любой узел, чтобы прыгнуть — обратите внимание на пульс на Главной.",
      "graph-navigated": "Снова на узле «Главная». Все три ветви живы в дереве.",
      "merge-hint": "Вверху справа — нажмите Объединить, чтобы собрать всё, что вы закрепили.",
      "merge-modal": "Дерево показывает каждую ветвь; предки агрегируются автоматически.",
      "merge-stream": "Из выбранных ветвей генерируется один структурированный отчёт.",
      "merge-done": "Три уровня, один связный артефакт. Таков цикл.",
    },
  },
};
