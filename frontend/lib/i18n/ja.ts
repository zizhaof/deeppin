// lib/i18n/ja.ts — 日本語翻訳 / Japanese translations
// 这是第三种语言的 demo，证明多语种 pipeline 可扩展
// Third-language demo proving the pipeline scales to more locales.

import type { T } from "./en";

export const ja: T = {
  // ナビゲーション
  back: "戻る",
  forward: "進む",
  mainThread: "メイン",
  noTitle: "新規チャット",
  switchThread: "切替",
  // サイドバー見出し
  subQuestions: "質問",
  overview: "概要",
  viewList: "リスト",
  viewGraph: "グラフ",
  // 空状態
  selectToPin: "テキストを選択して質問を開く",
  noThreads: "スレッドなし",
  // Welcome
  welcomeTitle: "深い思考はここから",
  welcomeSub: "Deeppin に何でも聞いてください。返信のテキストを選択してサブ質問を開けます。",
  chooseQuestion: "掘り下げる質問を選択",
  tagline: "任意のテキストを選んで深掘り",
  // InputBar
  inputPlaceholder: "メッセージを入力… (Enter で送信、Shift+Enter で改行)",
  webSearchPlaceholder: "ウェブ検索…",
  webSearchOn: "ウェブ検索を無効化",
  webSearchOff: "ウェブ検索を有効化",
  longTextLabel: "長文",
  fileParseError: "ファイルからのテキスト抽出に失敗しました",
  fileUploadError: "ファイルのアップロードに失敗しました",
  // セッション一覧
  newChat: "新規チャット",
  recentSessions: "最近の会話",
  noSessions: "まだ会話がありません。ボタンを押して開始してください。",
  untitled: "無題",
  yesterday: "昨日",
  daysAgo: "日前",
  // 状態
  loading: "読み込み中…",
  creating: "セッションを作成中…",
  errorPrefix: "エラー: ",
  processing: "処理中…",
  streamError: "[エラー]",
  // スレッド
  mainConversation: "メインの会話",
  subThread: "サブスレッド",
  // ピンメニュー
  pinAction: "質問",
  copy: "コピー",
  goToThread: "質問へ移動",
  // 推奨質問
  suggestedQuestions: "推奨質問",
  customQuestion: "または自分で質問を書く…",
  // メッセージバブル
  collapse: "折りたたむ",
  expandFull: "全文表示",
  chars: "文字",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "生テキスト表示",
  showMd: "Markdown レンダリング",
  // 添付
  extracting: "テキストを抽出中…",
  // マージ出力
  mergeButton: "マージ",
  mergeTitle: "マージ出力",
  mergeAngles: "個のサブ質問",
  mergeHint: "フォーマットを選択して生成を押すと、すべてのピン内容が 1 つのレポートにまとまります",
  mergePreparing: "準備中…",
  mergeCopyMd: "Markdown をコピー",
  mergeDownload: ".md をダウンロード",
  mergeGenerating: "生成中…",
  mergeRegenerate: "再生成",
  mergeGenerate: "生成",
  mergeFormatFree: "自由要約",
  mergeFormatFreeDesc: "各視点を織り交ぜた流れるような文章",
  mergeFormatBullets: "箇条書き",
  mergeFormatBulletsDesc: "トピック別に要点を整理",
  mergeFormatStructured: "構造化分析",
  mergeFormatStructuredDesc: "課題 → 解決策 → トレードオフ → 結論",
  mergeFormatCustom: "カスタム",
  mergeFormatCustomDesc: "あなた流にまとめる",
  mergeFormatTranscript: "会話そのまま",
  mergeFormatTranscriptDesc: "元の会話をそのまま出力",
  mergeCustomPromptPlaceholder: "要約の仕方を指定してください。例：チーム宛のメモとして、アクションアイテム中心に…",
  // ランディングの課題提示
  problemSetup: "AI の返信で特定の部分を深掘りしたいとき、普通は 2 つの嫌な選択肢しかありません：",
  badChoice1Label: "新しいチャットを始める",
  badChoice1Desc: "コンテキストが全部消え、一から説明し直し",
  badChoice2Label: "このチャットで聞く",
  badChoice2Desc: "メインスレッドが中断され、話題が逸れていく",
  solutionLabel: "Deeppin",
  solutionDesc: "その細部にピンを刺して、好きなだけ深く掘る。メインスレッド？一言も邪魔されません。",
  // 使い方
  howToUseTitle: "使い方",
  step1Title: "何でも聞く",
  step1Desc: "AI に質問を投げて詳しい回答を得る",
  step2Title: "ピンして探る",
  step2Desc: "返信のテキストを選択して「質問」をクリック — サブスレッドが開き、メインは無傷",
  step3Title: "好きなだけ深く",
  step3Desc: "サブ質問の中でさらにピン可能 — 何層ネストしてもOK",
  step4Title: "すべてをマージ",
  step4Desc: "探索が終わったら？すべてのスレッドを 1 つのレポートに統合してエクスポート",
  // 記事
  articles: "記事",
  // アカウント
  logout: "ログアウト",
  deleteAccount: "アカウント削除",
  // エラーメッセージ
  deleteError: "削除に失敗: ",
  unknownError: "不明なエラー",
  confirmDelete: "このセッションを削除しますか？元に戻せません。",
  // MergeDemo
  pinsReady: "本のピン準備完了",
  mergeOutput: "マージ出力",
  // フラット化
  flattenButton: "フラット化",
  flattenConfirmTitle: "このセッションをフラット化？",
  flattenConfirmBody: "すべてのサブスレッドのメッセージが preorder 順でメインスレッドにマージされ、すべてのピンが削除されます。\n\nこの操作は取り消せません。",
  flattenConfirmCta: "フラット化を確定",
  flattenCancel: "キャンセル",
  flattening: "フラット化中…",
  flattenSuccess: "フラット化完了: {count} 個のピンをマージ",
  flattenAlready: "既にフラット化済み",
  flattenError: "フラット化失敗: ",
  // 無料トライアル
  anonQuotaTitle: "無料トライアルの上限に達しました",
  anonQuotaDesc: "サインインして会話を続けられます — 既存の会話は保持されます。",
  anonSessionLimitTitle: "無料トライアル: 1 会話まで",
  anonSessionLimitDesc: "サインインで会話数は無制限 — 何も失われません。",
  signInGoogle: "Google でサインイン",
  signIn: "サインイン",
  later: "後で",
  // 言語セレクター
  languageLabel: "言語",
  // アンカーホバーのポップオーバー
  newReply: "新着",
  enterThread: "開く",
  generatingSuggestions: "フォローアップを生成中…",
  // 無料枠のカウンター
  quotaFree: "残り",
  quotaFull: "トライアルの上限に達しました",
  you: "あなた",
  ai: "Deeppin",
  flattenPreviewBefore: "フラット化前",
  flattenPreviewAfter: "フラット化後",
  flattenPreviewEmpty: "メインスレッドのみ — フラット化するものがありません。",
  mergeHintSelect: "マージするサブ質問を選択 · ノードをクリックで切り替え",
  mergeHintDrag: "スクロールでパン · ドラッグで移動",
  mergeSelectAll: "すべて選択",
  mergeSelectNone: "選択解除",
  mergeCta: "{n} 件のサブ質問をマージ",
  mergeSelectedOf: "{selected} / {total} 件選択中",
  mergeGeneratingReport: "マージレポートを生成中…",
  mergeSavedToChat: "保存しました",
  mergeSaving: "保存中…",
  mergeSaveToChat: "チャットに保存",
  mergeReselect: "再選択",
};
