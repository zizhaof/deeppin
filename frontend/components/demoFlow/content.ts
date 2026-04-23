// components/demo/content.ts
// Welcome-page 三层 walkthrough 的 9 语种文案 —— PinDemo 和 MobilePinDemo 共用。
// 所有 UI 可见文字都在这里；两个组件只消费不生产。
//
// Nine-locale copy for the landing-page 3-layer walkthrough, shared by
// PinDemo (desktop) and MobilePinDemo. Any user-facing string lives here;
// the two components only consume this table.

import type { Lang } from "@/lib/i18n";
import type { DemoPhase } from "./types";

export interface DemoContent {
  // —— 主线问答 ———————————————————————————————————————————————
  mainQuestion: string;
  /** AI 主线回复拼接：aiBefore1 + anchor1 + aiBetween + anchor2 + aiAfter2 */
  aiBefore1: string;
  anchor1: string;
  aiBetween: string;
  anchor2: string;
  aiAfter2: string;
  /** L0 pin 1/2 各自 3 条 AI 推荐追问，picked = 第一条 */
  suggestions1: readonly [string, string, string];
  suggestions2: readonly [string, string, string];

  // —— 子线程 1（L1）内容 ——————————————————————————————————————
  /** sub1Before + sub1Anchor + sub1After —— 嵌入 L2 入口锚点 */
  sub1Before: string;
  sub1Anchor: string;
  sub1After: string;
  /** L1 里再插一针的 3 条追问 */
  suggestions3: readonly [string, string, string];

  // —— 子子线程 2（L2）回复 ——————————————————————————————————————
  sub2Reply: string;

  // —— 面包屑标题 ——————————————————————————————————————————
  subTitle1: string;
  subTitle2: string;
  deepTitle: string;
  mainCrumb: string;

  // —— UI 标签 ———————————————————————————————————————————
  /** selpop 上的「追问 / Question」按钮（取代旧的「插针」按钮） */
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
  replyingLabel: string;
  generatingLabel: string;

  // —— Merge 弹窗内容 ————————————————————————————————————————
  mergeSelectThreads: string;
  mergeAll: string;
  mergeGenerate: string;
  mergeDownload: string;
  mergeCopy: string;
  mergeFormats: readonly [string, string, string];
  mergeReport: string;

  // —— 每个 phase 的底栏 caption ————————————————————————————————
  caption: Record<DemoPhase, string>;
}

// 英文作为基准 locale —— 其它 9 种基于这份翻译。
// English is the base copy — the other eight locales are direct translations.
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
      "Highlight any text → Question → a focused sub-thread opens right there. It inherits the anchor and a main summary, but sees ",
    sub1Anchor: "none of your other pins",
    sub1After:
      " — full isolation. You can pin again inside, and the compact budget shrinks with depth so the prompt never blows up.",
    suggestions3: [
      "Show depth 2 working in practice",
      "What happens if context gets too long?",
      "Can I pin across a code block?",
    ],
    sub2Reply:
      "At depth 2 the ancestor summary chain stays under ~1.3K tokens — 800 for main, 500 for sub-1, 300 for sub-2. The anchors themselves never get summarized: they're quoted verbatim so the model always sees the exact phrase you cared about. Stack as many layers as you need; each one stays cheap.",
    subTitle1: "pin that detail",
    subTitle2: "keep digging",
    deepTitle: "none of your other pins",
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
    replyingLabel: "replying in sub-thread…",
    generatingLabel: "generating…",
    mergeSelectThreads: "Select threads",
    mergeAll: "All",
    mergeGenerate: "Generate",
    mergeDownload: "Download Markdown",
    mergeCopy: "Copy",
    mergeFormats: ["Free summary", "Bullet points", "Structured"],
    mergeReport:
`## Deeppin in one pass

**Pinning captures intent**
You pick the exact phrase you want more on, pop open a focused sub-thread, and the main stays untouched — no new tab, no reboot.

**Depth stays cheap**
Sub-threads inherit anchor + main summary only. Compact budgets shrink per level (800 → 500 → 300), so even a four-deep pin costs less than a full retry.

**Merge rebuilds the story**
When you're ready, select the branches you care about → one structured report, pigment-coded by depth. Pins become headings; replies become the body.

**Net result**
Three levels of digging, one coherent artifact, zero drift back in the main thread.`,
    caption: {
      blank: "Fresh conversation — you're about to ask the main question.",
      "main-stream": "Deeppin types out its reply on the main thread.",
      "p1-sweep": "Drag across the phrase you want to dig into.",
      "p1-selpop": "A compact toolbar rises above the selection — hit Question.",
      "p1-dialog": "Three follow-ups auto-generate for that exact phrase.",
      "p1-pick": "Pick the one you actually want to chase.",
      "p1-underline": "Anchor lands in the reply — AI is already answering in a sub-thread.",
      "p2-sweep": "Back on main, drag across a second phrase.",
      "p2-selpop": "Same toolbar, fresh phrase — hit Question again.",
      "p2-dialog": "New suggestions tuned to the second phrase.",
      "p2-pick": "Pick one.",
      "p2-underline": "Two anchors planted. AI is working on both in parallel — come back when you want to read.",
      "l1-hover": "Hover the first anchor — preview pops: title, snippet, Enter.",
      "l1-enter": "Click Enter — you're inside sub-thread 1.",
      "l1-stream": "Sub-thread 1 replies. Main thread stays untouched behind it.",
      "p3-sweep": "You can pin inside a sub-thread too — drag across.",
      "p3-selpop": "Same toolbar, same flow — nothing new to learn.",
      "p3-dialog": "Follow-ups focused on the sub-thread this time.",
      "p3-pick": "Pick one.",
      "p3-underline": "Depth 2 — you can keep going as deep as you need.",
      "l2-hover": "Hover the deeper anchor — preview, then Enter.",
      "l2-enter": "Click Enter — now you're at depth 2.",
      "l2-stream": "The deepest answer. Three layers of digging, zero topic drift.",
      "graph-hint": "The right rail tracked every branch all along.",
      "graph-nav-root": "Click any node to jump there — back to Main.",
      "graph-navigated": "Back on Main. All branches stay live.",
      "merge-hint": "Done exploring? Merge pulls it together.",
      "merge-modal": "Pick which branches to include — ancestors auto-roll up.",
      "merge-stream": "One structured report is generated from the selected branches.",
      "merge-done": "Three levels, one coherent artifact. That's the loop.",
    },
  },

  zh: {
    mainQuestion: "Deeppin 有什么不一样？",
    aiBefore1:
      "你在读 AI 回复，想深挖某一段 —— 两个烂选择：开新对话（上下文全丢），或者在原对话里问（主线被打断、话题漂移）。Deeppin 让你直接",
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
      "选中文字 → 点「追问」—— 焦点子线程在那里打开。它继承锚点和主线摘要，但",
    sub1Anchor: "看不到你别的针",
    sub1After:
      " —— 完全隔离。子线程里还能再插针，compact 预算随深度收缩，所以 prompt 永远不会爆。",
    suggestions3: [
      "给我看一次深度 2 的实战",
      "上下文太长会怎样？",
      "可以跨代码块插针吗？",
    ],
    sub2Reply:
      "在深度 2，祖先摘要链控制在约 1.3K token 以内 —— 主线 800、子线程 1 给 500、子线程 2 给 300。锚点本身永远不被摘要：它们逐字引用，所以模型始终看得到你关心的原话。想叠多少层都行，每一层都很便宜。",
    subTitle1: "钉住那个细节",
    subTitle2: "一直挖下去",
    deepTitle: "看不到你别的针",
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
    replyingLabel: "正在子线程回复…",
    generatingLabel: "生成中…",
    mergeSelectThreads: "选择线程",
    mergeAll: "全选",
    mergeGenerate: "开始生成",
    mergeDownload: "下载 Markdown",
    mergeCopy: "复制",
    mergeFormats: ["自由总结", "要点列表", "结构化分析"],
    mergeReport:
`## Deeppin 一次读懂

**插针抓住意图**
选中你想深挖的原话，打开一个焦点子线程，主线纹丝不动 —— 不用开新窗口、不用重起对话。

**深度保持便宜**
子线程只继承锚点 + 主线摘要；compact 预算逐层收缩（800 → 500 → 300），就算插 4 层也比全历史重发一遍便宜。

**合并把故事拼回来**
探索完毕，选出想保留的分支 → 一份结构化报告，按深度配色。针变成小标题，回复变成正文。

**最终结果**
三层深挖，一份完整成品，主线零漂移。`,
    caption: {
      blank: "新对话 —— 你即将提出主问题。",
      "main-stream": "Deeppin 在主线把回复打出来。",
      "p1-sweep": "拖选你想深挖的那段文字。",
      "p1-selpop": "选区上方弹出小工具栏 —— 点「追问」。",
      "p1-dialog": "围绕这段文字自动生成三条追问。",
      "p1-pick": "挑一条你真想追的。",
      "p1-underline": "锚点落在主线里 —— AI 已经在子线程开始回答。",
      "p2-sweep": "回到主线，再拖选第二段。",
      "p2-selpop": "同一工具栏，新的文字 —— 再点「追问」。",
      "p2-dialog": "为第二段文字生成新的追问。",
      "p2-pick": "挑一条。",
      "p2-underline": "两根针都埋好了。AI 在后台并行回答，等你想看再回来。",
      "l1-hover": "鼠标悬停第一根针 —— 浮出预览：标题、摘要、「进入」。",
      "l1-enter": "点「进入」—— 跳进子线程 1。",
      "l1-stream": "子线程 1 开始回答。主线在身后原封不动。",
      "p3-sweep": "子线程里也能再插针 —— 继续拖选。",
      "p3-selpop": "一样的工具栏，一样的流程 —— 没有新东西要学。",
      "p3-dialog": "这次是针对子线程的追问。",
      "p3-pick": "挑一条。",
      "p3-underline": "深度 2 —— 想挖多深挖多深。",
      "l2-hover": "悬停更深一层的锚点 —— 预览，再点「进入」。",
      "l2-enter": "点「进入」—— 你现在在深度 2。",
      "l2-stream": "最深一层的回答。三层深挖，零话题漂移。",
      "graph-hint": "右栏一直在跟着记录每条分支。",
      "graph-nav-root": "点任意节点就能跳过去 —— 先跳回主线。",
      "graph-navigated": "回到主线。所有分支依然活着。",
      "merge-hint": "探索完了？「合并」把所有分支拼成一份报告。",
      "merge-modal": "选要合并的分支 —— 祖先自动向上聚合。",
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
      "テキストを選ぶ → 質問 → その場に焦点サブスレッドが開く。アンカーとメイン要約だけを受け継ぎ、",
    sub1Anchor: "他のピンは見えない",
    sub1After:
      " —— 完全に隔離。中でさらにピン可能、compact 予算は深さに応じて縮むので prompt は決して膨張しない。",
    suggestions3: [
      "実際に深さ 2 が動くのを見せて",
      "文脈が長すぎたらどうなる？",
      "コードブロックをまたいでピンできる？",
    ],
    sub2Reply:
      "深さ 2 でも祖先要約チェーンは約 1.3K トークン以内 —— メイン 800、サブ 1 は 500、サブ 2 は 300。アンカー自体は決して要約されず、そのまま引用されるのでモデルは常にあなたが気にした原文を見る。何層でも積めるし、どの層も安価。",
    subTitle1: "そこをピン留め",
    subTitle2: "好きなだけ掘る",
    deepTitle: "他のピンは見えない",
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
    replyingLabel: "サブスレッドで応答中…",
    generatingLabel: "生成中…",
    mergeSelectThreads: "スレッドを選択",
    mergeAll: "全選択",
    mergeGenerate: "生成開始",
    mergeDownload: "Markdown ダウンロード",
    mergeCopy: "コピー",
    mergeFormats: ["自由要約", "箇条書き", "構造化"],
    mergeReport:
`## Deeppin を一気に

**ピン留めが意図を捕まえる**
掘りたい原文を選び、焦点サブスレッドを開く。メインはそのまま —— 新タブ不要、再起動不要。

**深さは安いまま**
サブスレッドはアンカー + メイン要約だけを受け継ぎ、compact 予算は層ごとに縮む（800 → 500 → 300）。4 層深掘りでも全履歴再送より安い。

**マージで物語を組み直す**
終わったら残したい枝を選ぶ → 一本の構造化レポート、深さで色分け。ピンが見出しに、返答が本文に。

**結果**
三層の深掘り、一つの成果物、メインでの話題漂流ゼロ。`,
    caption: {
      blank: "新規会話 —— メインの質問を投げる直前。",
      "main-stream": "Deeppin がメインで返答を打ち出す。",
      "p1-sweep": "掘りたいフレーズをドラッグして選択。",
      "p1-selpop": "選択範囲の上にツールバー —— 質問を押す。",
      "p1-dialog": "そのフレーズに合わせたフォローアップが 3 つ自動生成。",
      "p1-pick": "追いたいものを一つ選ぶ。",
      "p1-underline": "アンカーがメインに現れる —— AI はすでにサブで回答中。",
      "p2-sweep": "メインに戻って、二つ目のフレーズをドラッグ。",
      "p2-selpop": "同じツールバー、新しいフレーズ —— もう一度質問。",
      "p2-dialog": "二つ目に合わせた新しい提案。",
      "p2-pick": "一つ選ぶ。",
      "p2-underline": "二本のピンが立った。AI が並行で答えているので、読みたい時に戻ればいい。",
      "l1-hover": "一本目のアンカーにホバー —— プレビュー：タイトル、抜粋、開く。",
      "l1-enter": "開くを押す —— サブスレッド 1 に入る。",
      "l1-stream": "サブスレッド 1 が答える。メインは背後で無傷。",
      "p3-sweep": "サブスレッド内でもピン可能 —— ドラッグして選択。",
      "p3-selpop": "同じツールバー、同じ流れ —— 新しく覚えることはない。",
      "p3-dialog": "今回はサブスレッドに絞ったフォローアップ。",
      "p3-pick": "一つ選ぶ。",
      "p3-underline": "深さ 2 —— 好きなだけ深く潜れる。",
      "l2-hover": "深いアンカーにホバー —— プレビュー、そして開く。",
      "l2-enter": "開くを押す —— 今は深さ 2。",
      "l2-stream": "最深の答え。三層の深掘り、話題漂流はゼロ。",
      "graph-hint": "右側は全ての枝をずっと追跡していた。",
      "graph-nav-root": "どのノードをクリックしても飛べる —— まずメインに戻る。",
      "graph-navigated": "メインに戻った。すべての枝は生きたまま。",
      "merge-hint": "探索が終わったら —— マージが全部をまとめる。",
      "merge-modal": "含める枝を選ぶ —— 祖先は自動で統合。",
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
      "텍스트 선택 → 질문 → 그 자리에 집중 서브 스레드 열림. 앵커 + 메인 요약을 상속하지만,",
    sub1Anchor: "다른 핀은 전혀 보지 못함",
    sub1After:
      " —— 완전 격리. 안에서 다시 핀 가능, compact 예산은 깊이에 따라 줄어들어 prompt가 폭발하지 않음.",
    suggestions3: [
      "실제로 깊이 2가 동작하는 걸 보여줘",
      "맥락이 너무 길어지면 어떻게 되나?",
      "코드 블록을 가로질러 핀 가능한가?",
    ],
    sub2Reply:
      "깊이 2에서도 조상 요약 체인은 약 1.3K 토큰 이하 —— 메인 800, 서브 1은 500, 서브 2는 300. 앵커 자체는 결코 요약되지 않고 그대로 인용되어, 모델은 항상 당신이 관심 있는 원문을 본다. 원하는 만큼 층을 쌓아도 각 층은 저렴하다.",
    subTitle1: "그 부분을 고정",
    subTitle2: "계속 파고들기",
    deepTitle: "다른 핀은 안 보임",
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
    replyingLabel: "서브 스레드에서 응답 중…",
    generatingLabel: "생성 중…",
    mergeSelectThreads: "스레드 선택",
    mergeAll: "전체",
    mergeGenerate: "생성 시작",
    mergeDownload: "Markdown 다운로드",
    mergeCopy: "복사",
    mergeFormats: ["자유 요약", "요점 목록", "구조화"],
    mergeReport:
`## Deeppin 한 번에

**핀은 의도를 붙잡는다**
파고들고 싶은 원문을 고르고 집중 서브 스레드를 연다. 메인은 그대로 —— 새 탭 없음, 재시작 없음.

**깊이는 저렴하게 유지된다**
서브 스레드는 앵커 + 메인 요약만 상속. compact 예산이 층마다 줄어(800 → 500 → 300), 4층 핀이어도 전체 이력 재전송보다 싸다.

**병합이 이야기를 재구성**
준비되면 원하는 분기를 골라 → 깊이별 색상으로 코딩된 한 편의 구조화 리포트. 핀은 제목, 답변은 본문.

**최종 결과**
세 층의 파고들기, 하나의 일관된 산출물, 메인에서의 주제 표류 없음.`,
    caption: {
      blank: "새 대화 —— 메인 질문을 던질 참.",
      "main-stream": "Deeppin이 메인에 답변을 찍어낸다.",
      "p1-sweep": "파고들 구절을 드래그해 선택.",
      "p1-selpop": "선택 위에 툴바 —— 질문을 누른다.",
      "p1-dialog": "그 구절에 맞춘 후속 질문 세 개 자동 생성.",
      "p1-pick": "진짜 따라갈 한 개를 고른다.",
      "p1-underline": "앵커가 메인에 떨어진다 —— AI는 이미 서브 스레드에서 답변 중.",
      "p2-sweep": "메인에서 두 번째 구절을 드래그.",
      "p2-selpop": "같은 툴바, 새 구절 —— 다시 질문.",
      "p2-dialog": "두 번째 구절에 맞춘 새 후속 질문.",
      "p2-pick": "하나 고른다.",
      "p2-underline": "두 핀이 꽂혔다. AI가 병렬로 답하고 있으니, 읽고 싶을 때 오면 된다.",
      "l1-hover": "첫 앵커에 호버 —— 미리보기: 제목, 발췌, 열기.",
      "l1-enter": "열기 누름 —— 서브 스레드 1에 진입.",
      "l1-stream": "서브 스레드 1이 응답. 메인은 뒤에서 그대로.",
      "p3-sweep": "서브 스레드 안에서도 핀 가능 —— 드래그로 선택.",
      "p3-selpop": "같은 툴바, 같은 흐름 —— 새로 배울 것 없음.",
      "p3-dialog": "이번엔 서브 스레드에 초점을 둔 후속 질문.",
      "p3-pick": "하나 고른다.",
      "p3-underline": "깊이 2 —— 원하는 만큼 깊이 파고들 수 있다.",
      "l2-hover": "더 깊은 앵커에 호버 —— 미리보기, 그리고 열기.",
      "l2-enter": "열기 누름 —— 지금 깊이 2.",
      "l2-stream": "가장 깊은 답변. 세 층 파고들기, 주제 표류 없음.",
      "graph-hint": "오른쪽 레일이 모든 분기를 줄곧 추적해 왔다.",
      "graph-nav-root": "어느 노드든 클릭하면 점프 —— 메인으로 돌아간다.",
      "graph-navigated": "메인에 복귀. 모든 분기는 살아있다.",
      "merge-hint": "탐색 끝났어? 병합이 전부를 엮어준다.",
      "merge-modal": "포함할 분기를 고른다 —— 조상은 자동 집계.",
      "merge-stream": "선택된 분기로부터 구조화 리포트가 한 편 생성.",
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
      "Selecciona texto → Pregunta → se abre un sub-hilo enfocado allí mismo. Hereda el ancla y un resumen del principal, pero ",
    sub1Anchor: "no ve ninguno de tus otros pines",
    sub1After:
      " — aislamiento total. Puedes anclar otra vez dentro, y el presupuesto compacto se reduce con la profundidad, así el prompt no explota.",
    suggestions3: [
      "Muéstrame la profundidad 2 funcionando",
      "¿Qué pasa si el contexto se vuelve demasiado largo?",
      "¿Puedo anclar cruzando un bloque de código?",
    ],
    sub2Reply:
      "A profundidad 2 la cadena de resúmenes ancestrales se mantiene bajo ~1.3K tokens — 800 para el principal, 500 para sub-1, 300 para sub-2. Las anclas nunca se resumen: se citan literalmente, así que el modelo siempre ve la frase exacta que te importó. Apila tantas capas como necesites; cada una sigue siendo barata.",
    subTitle1: "anclar ese detalle",
    subTitle2: "seguir cavando",
    deepTitle: "sin ver otros pines",
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
    replyingLabel: "respondiendo en sub-hilo…",
    generatingLabel: "generando…",
    mergeSelectThreads: "Seleccionar hilos",
    mergeAll: "Todo",
    mergeGenerate: "Generar",
    mergeDownload: "Descargar Markdown",
    mergeCopy: "Copiar",
    mergeFormats: ["Resumen libre", "Puntos clave", "Estructurado"],
    mergeReport:
`## Deeppin de una pasada

**Anclar captura la intención**
Eliges la frase exacta que quieres expandir, abres un sub-hilo enfocado y el principal queda intacto — sin pestaña nueva, sin reinicio.

**La profundidad sigue siendo barata**
Los sub-hilos heredan ancla + resumen principal. El presupuesto compacto se reduce por nivel (800 → 500 → 300), así que incluso un pin de 4 niveles cuesta menos que un reintento completo.

**Fusionar reconstruye la historia**
Cuando estés listo, selecciona las ramas que te importan → un informe estructurado, codificado por profundidad. Los pines se vuelven títulos; las respuestas, el cuerpo.

**Resultado neto**
Tres niveles de exploración, un artefacto coherente, cero deriva en el hilo principal.`,
    caption: {
      blank: "Conversación nueva — estás a punto de hacer la pregunta principal.",
      "main-stream": "Deeppin escribe su respuesta en el hilo principal.",
      "p1-sweep": "Arrastra sobre la frase en la que quieres profundizar.",
      "p1-selpop": "Aparece una barra compacta sobre la selección — pulsa Pregunta.",
      "p1-dialog": "Tres seguimientos se generan para esa frase exacta.",
      "p1-pick": "Elige el que de verdad quieres perseguir.",
      "p1-underline": "El ancla cae en la respuesta — la IA ya está respondiendo en un sub-hilo.",
      "p2-sweep": "De vuelta al principal, arrastra sobre una segunda frase.",
      "p2-selpop": "La misma barra, frase nueva — pulsa Pregunta otra vez.",
      "p2-dialog": "Nuevas sugerencias ajustadas a la segunda frase.",
      "p2-pick": "Elige una.",
      "p2-underline": "Dos anclas plantadas. La IA trabaja en ambas en paralelo — vuelve cuando quieras leer.",
      "l1-hover": "Pasa el ratón por la primera ancla — vista previa: título, extracto, Abrir.",
      "l1-enter": "Pulsa Abrir — estás dentro del sub-hilo 1.",
      "l1-stream": "El sub-hilo 1 responde. El principal queda intacto detrás.",
      "p3-sweep": "También puedes anclar dentro de un sub-hilo — arrastra.",
      "p3-selpop": "Misma barra, mismo flujo — nada nuevo que aprender.",
      "p3-dialog": "Esta vez los seguimientos se centran en el sub-hilo.",
      "p3-pick": "Elige una.",
      "p3-underline": "Profundidad 2 — puedes seguir tan hondo como necesites.",
      "l2-hover": "Pasa el ratón por el ancla más profunda — vista previa, luego Abrir.",
      "l2-enter": "Pulsa Abrir — ahora estás a profundidad 2.",
      "l2-stream": "La respuesta más profunda. Tres niveles, cero deriva de tema.",
      "graph-hint": "La barra derecha ha seguido cada rama todo el tiempo.",
      "graph-nav-root": "Haz clic en cualquier nodo para saltar — vuelve al principal.",
      "graph-navigated": "De vuelta al principal. Todas las ramas siguen vivas.",
      "merge-hint": "¿Terminaste de explorar? Fusionar lo integra todo.",
      "merge-modal": "Elige qué ramas incluir — los ancestros se agregan solos.",
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
      "Sélectionne du texte → Question → un sous-fil ciblé s'ouvre sur place. Il hérite de l'ancre et d'un résumé du principal, mais ",
    sub1Anchor: "ne voit aucune de tes autres épingles",
    sub1After:
      " — isolation complète. Tu peux épingler à nouveau à l'intérieur, et le budget compact se réduit avec la profondeur, donc le prompt n'explose pas.",
    suggestions3: [
      "Montre-moi la profondeur 2 en pratique",
      "Que se passe-t-il si le contexte devient trop long ?",
      "Puis-je épingler à travers un bloc de code ?",
    ],
    sub2Reply:
      "À profondeur 2, la chaîne de résumés ancestraux reste sous ~1,3K tokens — 800 pour le principal, 500 pour sous-1, 300 pour sous-2. Les ancres elles-mêmes ne sont jamais résumées : elles sont citées à l'identique, donc le modèle voit toujours la phrase exacte qui t'importait. Empile autant de couches que nécessaire ; chacune reste bon marché.",
    subTitle1: "épingler ce détail",
    subTitle2: "continuer à creuser",
    deepTitle: "aucune autre épingle visible",
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
    replyingLabel: "réponse dans le sous-fil…",
    generatingLabel: "génération…",
    mergeSelectThreads: "Sélectionner les fils",
    mergeAll: "Tout",
    mergeGenerate: "Générer",
    mergeDownload: "Télécharger Markdown",
    mergeCopy: "Copier",
    mergeFormats: ["Résumé libre", "Points clés", "Structuré"],
    mergeReport:
`## Deeppin d'un trait

**L'épinglage capte l'intention**
Tu choisis la phrase exacte à creuser, tu ouvres un sous-fil ciblé, et le principal reste intact — pas de nouvel onglet, pas de redémarrage.

**La profondeur reste bon marché**
Les sous-fils héritent de l'ancre + résumé principal. Le budget compact se réduit par niveau (800 → 500 → 300), donc même une épingle de niveau 4 coûte moins qu'un renvoi complet.

**Fusionner reconstruit l'histoire**
Quand tu es prêt, sélectionne les branches qui comptent → un rapport structuré, coloré par profondeur. Les épingles deviennent titres ; les réponses, le corps.

**Résultat net**
Trois niveaux d'exploration, un artefact cohérent, zéro dérive sur le fil principal.`,
    caption: {
      blank: "Nouvelle conversation — tu vas poser la question principale.",
      "main-stream": "Deeppin tape sa réponse sur le fil principal.",
      "p1-sweep": "Glisse sur la phrase que tu veux creuser.",
      "p1-selpop": "Une barre compacte apparaît au-dessus de la sélection — clique Question.",
      "p1-dialog": "Trois suivis se génèrent pour cette phrase précise.",
      "p1-pick": "Choisis celui que tu veux vraiment poursuivre.",
      "p1-underline": "L'ancre tombe dans la réponse — l'IA répond déjà dans un sous-fil.",
      "p2-sweep": "Retour au principal, glisse sur une deuxième phrase.",
      "p2-selpop": "Même barre, nouvelle phrase — clique Question à nouveau.",
      "p2-dialog": "Nouvelles suggestions ajustées à la deuxième phrase.",
      "p2-pick": "Choisis-en une.",
      "p2-underline": "Deux ancres plantées. L'IA travaille sur les deux en parallèle — reviens quand tu veux lire.",
      "l1-hover": "Survole la première ancre — aperçu : titre, extrait, Ouvrir.",
      "l1-enter": "Clique Ouvrir — tu es dans le sous-fil 1.",
      "l1-stream": "Le sous-fil 1 répond. Le principal reste intact derrière.",
      "p3-sweep": "Tu peux aussi épingler dans un sous-fil — glisse.",
      "p3-selpop": "Même barre, même flux — rien de nouveau à apprendre.",
      "p3-dialog": "Cette fois les suivis se concentrent sur le sous-fil.",
      "p3-pick": "Choisis-en une.",
      "p3-underline": "Profondeur 2 — tu peux aller aussi profond que nécessaire.",
      "l2-hover": "Survole l'ancre plus profonde — aperçu, puis Ouvrir.",
      "l2-enter": "Clique Ouvrir — tu es maintenant à profondeur 2.",
      "l2-stream": "La réponse la plus profonde. Trois niveaux, zéro dérive.",
      "graph-hint": "La barre de droite a suivi chaque branche depuis le début.",
      "graph-nav-root": "Clique n'importe quel nœud pour sauter — retour au principal.",
      "graph-navigated": "Retour au principal. Toutes les branches restent vivantes.",
      "merge-hint": "Exploration terminée ? Fusionner assemble tout.",
      "merge-modal": "Choisis les branches à inclure — les ancêtres s'agrègent automatiquement.",
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
      "Text markieren → Frage → ein fokussierter Sub-Thread öffnet sich an Ort und Stelle. Er erbt den Anker plus eine Haupt-Zusammenfassung, aber ",
    sub1Anchor: "sieht keinen deiner anderen Pins",
    sub1After:
      " — vollständig isoliert. Du kannst innen wieder anheften, und das Compact-Budget schrumpft mit der Tiefe, sodass der Prompt nicht explodiert.",
    suggestions3: [
      "Zeig mir Tiefe 2 in der Praxis",
      "Was passiert, wenn der Kontext zu lang wird?",
      "Kann ich über einen Code-Block hinweg anheften?",
    ],
    sub2Reply:
      "Bei Tiefe 2 bleibt die Vorfahren-Zusammenfassungskette unter ~1,3K Tokens — 800 für Haupt, 500 für Sub-1, 300 für Sub-2. Die Anker selbst werden nie zusammengefasst: sie werden wortwörtlich zitiert, damit das Modell stets die exakte Phrase sieht, die dir wichtig war. Stapele so viele Schichten wie nötig; jede bleibt günstig.",
    subTitle1: "dieses Detail anheften",
    subTitle2: "tief weitergraben",
    deepTitle: "keine anderen Pins sichtbar",
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
    replyingLabel: "antwortet im Sub-Thread…",
    generatingLabel: "wird generiert…",
    mergeSelectThreads: "Threads wählen",
    mergeAll: "Alle",
    mergeGenerate: "Generieren",
    mergeDownload: "Markdown herunterladen",
    mergeCopy: "Kopieren",
    mergeFormats: ["Freies Resümee", "Stichpunkte", "Strukturiert"],
    mergeReport:
`## Deeppin auf einen Blick

**Anheften erfasst die Absicht**
Du wählst die exakte Phrase, die du vertiefen willst, öffnest einen fokussierten Sub-Thread, und der Haupt-Thread bleibt unberührt — kein neuer Tab, kein Neustart.

**Tiefe bleibt günstig**
Sub-Threads erben nur Anker + Haupt-Zusammenfassung. Das Compact-Budget schrumpft pro Ebene (800 → 500 → 300), sodass selbst ein Pin in Tiefe 4 weniger kostet als ein vollständiger erneuter Durchlauf.

**Zusammenführen baut die Geschichte zurück**
Wenn du fertig bist, wähle die Zweige, die zählen → ein strukturierter Bericht, nach Tiefe eingefärbt. Pins werden zu Überschriften; Antworten zum Körper.

**Nettoergebnis**
Drei Ebenen Erkundung, ein kohärentes Artefakt, null Drift im Haupt-Thread.`,
    caption: {
      blank: "Neue Unterhaltung — du stellst gleich die Hauptfrage.",
      "main-stream": "Deeppin tippt die Antwort im Haupt-Thread.",
      "p1-sweep": "Ziehe über die Phrase, die du vertiefen willst.",
      "p1-selpop": "Eine kompakte Toolbar erscheint über der Auswahl — klicke Frage.",
      "p1-dialog": "Drei Folgefragen werden für genau diese Phrase generiert.",
      "p1-pick": "Wähle die, die du wirklich verfolgen willst.",
      "p1-underline": "Der Anker landet in der Antwort — die KI antwortet schon im Sub-Thread.",
      "p2-sweep": "Zurück im Haupt, ziehe über eine zweite Phrase.",
      "p2-selpop": "Dieselbe Toolbar, neue Phrase — klicke Frage erneut.",
      "p2-dialog": "Neue Vorschläge passend zur zweiten Phrase.",
      "p2-pick": "Wähle eine.",
      "p2-underline": "Zwei Anker gesetzt. Die KI arbeitet parallel an beiden — komm zurück, wenn du lesen willst.",
      "l1-hover": "Den ersten Anker überfahren — Vorschau: Titel, Ausschnitt, Öffnen.",
      "l1-enter": "Öffnen klicken — du bist im Sub-Thread 1.",
      "l1-stream": "Sub-Thread 1 antwortet. Haupt-Thread bleibt dahinter unberührt.",
      "p3-sweep": "Auch im Sub-Thread kannst du anheften — ziehen.",
      "p3-selpop": "Gleiche Toolbar, gleicher Ablauf — nichts Neues zu lernen.",
      "p3-dialog": "Diesmal Folgefragen, die sich auf den Sub-Thread konzentrieren.",
      "p3-pick": "Wähle eine.",
      "p3-underline": "Tiefe 2 — du kannst so tief gehen, wie du willst.",
      "l2-hover": "Den tieferen Anker überfahren — Vorschau, dann Öffnen.",
      "l2-enter": "Öffnen klicken — jetzt bist du auf Tiefe 2.",
      "l2-stream": "Die tiefste Antwort. Drei Ebenen, null Thema-Drift.",
      "graph-hint": "Die rechte Leiste hat die ganze Zeit jeden Zweig verfolgt.",
      "graph-nav-root": "Klicke einen beliebigen Knoten, um dorthin zu springen — zurück zum Haupt.",
      "graph-navigated": "Zurück im Haupt. Alle Zweige bleiben aktiv.",
      "merge-hint": "Fertig erkundet? Zusammenführen fasst alles zusammen.",
      "merge-modal": "Wähle, welche Zweige enthalten sein sollen — Vorfahren werden automatisch aggregiert.",
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
      "Selecione texto → Pergunta → um sub-tópico focado abre ali mesmo. Herda a âncora e um resumo do principal, mas ",
    sub1Anchor: "não vê nenhum dos seus outros pins",
    sub1After:
      " — isolamento total. Pode fixar de novo por dentro, e o orçamento compact encolhe com a profundidade, então o prompt não explode.",
    suggestions3: [
      "Mostre a profundidade 2 em ação",
      "O que acontece se o contexto ficar longo demais?",
      "Posso fixar atravessando um bloco de código?",
    ],
    sub2Reply:
      "Na profundidade 2, a cadeia de resumos ancestrais fica abaixo de ~1.3K tokens — 800 para o principal, 500 para sub-1, 300 para sub-2. As âncoras nunca são resumidas: são citadas literalmente, então o modelo sempre vê a frase exata que você se importou. Empilhe quantas camadas precisar; cada uma continua barata.",
    subTitle1: "fixar esse detalhe",
    subTitle2: "continuar cavando",
    deepTitle: "sem ver outros pins",
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
    replyingLabel: "respondendo no sub-tópico…",
    generatingLabel: "gerando…",
    mergeSelectThreads: "Selecionar tópicos",
    mergeAll: "Tudo",
    mergeGenerate: "Gerar",
    mergeDownload: "Baixar Markdown",
    mergeCopy: "Copiar",
    mergeFormats: ["Resumo livre", "Tópicos", "Estruturado"],
    mergeReport:
`## Deeppin de uma só vez

**Fixar captura a intenção**
Você escolhe a frase exata para aprofundar, abre um sub-tópico focado, e o principal fica intacto — sem nova aba, sem reiniciar.

**Profundidade continua barata**
Sub-tópicos herdam apenas âncora + resumo principal. O orçamento compact encolhe por nível (800 → 500 → 300), então mesmo um pin de 4 níveis custa menos que uma repetição completa.

**Mesclar reconstrói a história**
Quando estiver pronto, selecione as ramificações relevantes → um relatório estruturado, codificado por profundidade. Pins viram títulos; respostas, corpo.

**Resultado líquido**
Três níveis de exploração, um artefato coerente, zero desvio no tópico principal.`,
    caption: {
      blank: "Conversa nova — você vai fazer a pergunta principal.",
      "main-stream": "O Deeppin escreve a resposta no tópico principal.",
      "p1-sweep": "Arraste sobre a frase que quer aprofundar.",
      "p1-selpop": "Uma barra compacta surge sobre a seleção — toque Pergunta.",
      "p1-dialog": "Três acompanhamentos são gerados para essa frase exata.",
      "p1-pick": "Escolha o que você realmente quer seguir.",
      "p1-underline": "A âncora cai na resposta — a IA já está respondendo num sub-tópico.",
      "p2-sweep": "De volta ao principal, arraste sobre uma segunda frase.",
      "p2-selpop": "Mesma barra, frase nova — toque Pergunta de novo.",
      "p2-dialog": "Novas sugestões ajustadas à segunda frase.",
      "p2-pick": "Escolha uma.",
      "p2-underline": "Duas âncoras plantadas. A IA trabalha em paralelo — volte quando quiser ler.",
      "l1-hover": "Passe o mouse na primeira âncora — prévia: título, trecho, Abrir.",
      "l1-enter": "Toque Abrir — você está dentro do sub-tópico 1.",
      "l1-stream": "O sub-tópico 1 responde. O principal fica intacto atrás.",
      "p3-sweep": "Também dá para fixar dentro de um sub-tópico — arraste.",
      "p3-selpop": "Mesma barra, mesmo fluxo — nada novo para aprender.",
      "p3-dialog": "Desta vez os acompanhamentos focam no sub-tópico.",
      "p3-pick": "Escolha uma.",
      "p3-underline": "Profundidade 2 — pode ir tão fundo quanto quiser.",
      "l2-hover": "Passe o mouse na âncora mais funda — prévia, depois Abrir.",
      "l2-enter": "Toque Abrir — agora você está na profundidade 2.",
      "l2-stream": "A resposta mais funda. Três níveis, zero desvio de tópico.",
      "graph-hint": "A barra direita vem rastreando cada ramo o tempo todo.",
      "graph-nav-root": "Toque em qualquer nó para saltar — de volta ao principal.",
      "graph-navigated": "De volta ao principal. Todos os ramos continuam vivos.",
      "merge-hint": "Terminou de explorar? Mesclar junta tudo.",
      "merge-modal": "Escolha os ramos a incluir — ancestrais agregam-se sozinhos.",
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
      "Выделите текст → Вопрос → сфокусированная подветка откроется прямо там. Она наследует якорь и сводку основной ветки, но ",
    sub1Anchor: "не видит других ваших закладок",
    sub1After:
      " — полная изоляция. Внутри можно закреплять ещё раз; compact-бюджет сокращается с глубиной, так что prompt не раздуется.",
    suggestions3: [
      "Покажи реальную работу глубины 2",
      "Что будет, если контекст станет слишком длинным?",
      "Можно ли закреплять через кодовый блок?",
    ],
    sub2Reply:
      "На глубине 2 цепочка сводок предков остаётся под ~1,3K токенов — 800 для основной, 500 для подветки 1, 300 для подветки 2. Сами якоря никогда не сжимаются: они цитируются дословно, поэтому модель всегда видит точную фразу, которая вас заинтересовала. Складывайте сколько угодно слоёв; каждый остаётся дешёвым.",
    subTitle1: "закрепить эту деталь",
    subTitle2: "копать дальше",
    deepTitle: "другие закладки не видно",
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
    replyingLabel: "отвечает в подветке…",
    generatingLabel: "генерация…",
    mergeSelectThreads: "Выбрать ветки",
    mergeAll: "Все",
    mergeGenerate: "Сгенерировать",
    mergeDownload: "Скачать Markdown",
    mergeCopy: "Копировать",
    mergeFormats: ["Свободное резюме", "Ключевые пункты", "Структурировано"],
    mergeReport:
`## Deeppin одним заходом

**Закрепление ловит намерение**
Вы выбираете точную фразу для углубления, открываете сфокусированную подветку, и основная остаётся нетронутой — ни новой вкладки, ни перезапуска.

**Глубина остаётся дешёвой**
Подветки наследуют только якорь + сводку основной. Compact-бюджет сокращается на уровне (800 → 500 → 300), так что даже закладка на глубине 4 стоит меньше полного повтора.

**Объединение собирает историю**
Когда готовы, выберите нужные ветви → один структурированный отчёт с кодировкой по глубине. Закладки становятся заголовками; ответы — телом.

**Итог**
Три уровня исследования, один связный артефакт, ноль дрейфа в основной ветке.`,
    caption: {
      blank: "Новый разговор — вы вот-вот зададите основной вопрос.",
      "main-stream": "Deeppin печатает ответ в основной ветке.",
      "p1-sweep": "Проведите по фразе, которую хотите углубить.",
      "p1-selpop": "Компактная панель появляется над выделением — нажмите Вопрос.",
      "p1-dialog": "Три уточняющих вопроса генерируются под эту фразу.",
      "p1-pick": "Выберите тот, что действительно хотите преследовать.",
      "p1-underline": "Якорь ложится в ответ — ИИ уже отвечает в подветке.",
      "p2-sweep": "Обратно на главной, проведите по второй фразе.",
      "p2-selpop": "Та же панель, новая фраза — нажмите Вопрос снова.",
      "p2-dialog": "Новые подсказки под вторую фразу.",
      "p2-pick": "Выберите одну.",
      "p2-underline": "Две закладки поставлены. ИИ работает параллельно — возвращайтесь, когда хотите прочитать.",
      "l1-hover": "Наведите на первый якорь — предпросмотр: заголовок, фрагмент, Открыть.",
      "l1-enter": "Нажмите Открыть — вы внутри подветки 1.",
      "l1-stream": "Подветка 1 отвечает. Основная остаётся нетронутой позади.",
      "p3-sweep": "Закреплять можно и внутри подветки — проведите.",
      "p3-selpop": "Та же панель, тот же поток — ничего нового учить не нужно.",
      "p3-dialog": "На этот раз уточнения заточены под подветку.",
      "p3-pick": "Выберите одну.",
      "p3-underline": "Глубина 2 — можно копать сколько угодно глубоко.",
      "l2-hover": "Наведите на более глубокий якорь — предпросмотр, затем Открыть.",
      "l2-enter": "Нажмите Открыть — теперь вы на глубине 2.",
      "l2-stream": "Самый глубокий ответ. Три уровня, ноль дрейфа темы.",
      "graph-hint": "Правая панель всё это время отслеживала каждую ветвь.",
      "graph-nav-root": "Щёлкните любой узел, чтобы прыгнуть — назад в основную.",
      "graph-navigated": "Снова на основной. Все ветви остаются живыми.",
      "merge-hint": "Закончили исследовать? Объединение собирает всё вместе.",
      "merge-modal": "Выберите, какие ветви включить — предки агрегируются автоматически.",
      "merge-stream": "Из выбранных ветвей генерируется один структурированный отчёт.",
      "merge-done": "Три уровня, один связный артефакт. Таков цикл.",
    },
  },
};
