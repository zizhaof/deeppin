// Japanese translations.
// Third-language demo proving the pipeline scales to more locales.

import type { T } from "./en";

export const ja: T = {
  // Navigation
  back: "戻る",
  forward: "進む",
  mainThread: "メイン",
  // Sidebar headings
  subQuestions: "質問",
  overview: "概要",
  viewList: "リスト",
  viewGraph: "グラフ",
  // Empty states
  noThreads: "スレッドなし",
  // Welcome
  welcomeTitle: "深い思考はここから",
  welcomeSub: "Deeppin に何でも聞いてください。返信のテキストを選択してサブ質問を開けます。",
  chooseQuestion: "掘り下げる質問を選択",
  // InputBar
  inputPlaceholder: "メッセージを入力… (Enter で送信、Shift+Enter で改行)",
  webSearchPlaceholder: "ウェブ検索…",
  webSearchOn: "ウェブ検索を無効化",
  webSearchOff: "ウェブ検索を有効化",
  longTextLabel: "長文",
  fileParseError: "ファイルからのテキスト抽出に失敗しました",
  fileUploadError: "ファイルのアップロードに失敗しました",
  // Session list
  newChat: "新規チャット",
  recentSessions: "最近の会話",
  noSessions: "まだ会話がありません。ボタンを押して開始してください。",
  untitled: "無題",
  yesterday: "昨日",
  daysAgo: "日前",
  // Status
  loading: "読み込み中…",
  errorPrefix: "エラー: ",
  processing: "処理中…",
  streamError: "[エラー]",
  // Threads
  subThread: "サブスレッド",
  // Pin menu
  pinAction: "質問",
  copy: "コピー",
  // Suggested questions
  suggestedQuestions: "推奨質問",
  customQuestion: "または自分で質問を書く…",
  // Message bubble
  collapse: "折りたたむ",
  expandFull: "全文表示",
  chars: "文字",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "生テキスト表示",
  showMd: "Markdown レンダリング",
  // Attachments
  extracting: "テキストを抽出中…",
  // Merge output
  mergeButton: "マージ",
  mergeTitle: "マージ出力",
  mergeAngles: "個のサブ質問",
  mergeHint: "フォーマットを選択して生成を押すと、すべてのピン内容が 1 つのレポートにまとまります",
  mergeCopyMd: "Markdown をコピー",
  mergeDownload: ".md をダウンロード",
  mergeGenerating: "生成中…",
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
  // Landing problem statement
  // How to use
  // Articles
  articles: "記事",
  // Account
  logout: "ログアウト",
  deleteAccount: "アカウント削除",
  // Error messages
  deleteError: "削除に失敗: ",
  unknownError: "不明なエラー",
  confirmDelete: "このセッションを削除しますか？元に戻せません。",
  // Delete-thread dialog
  deleteThread: "スレッドを削除",
  deleteThreadTitle: "このスレッドとすべてのサブスレッドを削除しますか？",
  deleteSessionTitle: "この会話全体を削除しますか？",
  deleteThreadBody: "ハイライトされたスレッドとすべてのメッセージが完全に削除されます。元に戻せません。",
  deleteCount: "{n} 件のスレッドを削除",
  deleteCta: "削除",
  deleting: "削除中…",
  deleteResetView: "全体表示",
  // Flatten
  flattenButton: "フラット化",
  flattenConfirmTitle: "このセッションをフラット化？",
  flattenConfirmBody: "すべてのサブスレッドのメッセージが preorder 順でメインスレッドにマージされ、すべてのピンが削除されます。\n\nこの操作は取り消せません。",
  flattenConfirmCta: "フラット化を確定",
  flattenCancel: "キャンセル",
  flattening: "フラット化中…",
  flattenSuccess: "フラット化完了: {count} 個のピンをマージ",
  flattenAlready: "既にフラット化済み",
  flattenError: "フラット化失敗: ",
  // Anonymous trial
  anonQuotaTitle: "無料トライアルの上限に達しました",
  anonQuotaDesc: "サインインして会話を続けられます — 既存の会話は保持されます。",
  anonSessionLimitTitle: "無料トライアル: 1 会話まで",
  anonSessionLimitDesc: "サインインで会話数は無制限 — 何も失われません。",
  signInGoogle: "Google でサインイン",
  signIn: "サインイン",
  later: "後で",
  // Language selector
  languageLabel: "言語",
  // Anchor hover popover
  newReply: "新着",
  enterThread: "開く",
  generatingSuggestions: "フォローアップを生成中…",
  // Quota counter
  quotaFree: "残り",
  quotaFull: "トライアルの上限に達しました",
  you: "あなた",
  ai: "Deeppin",
  flattenPreviewBefore: "フラット化前",
  flattenPreviewAfter: "フラット化後",
  flattenPreviewEmpty: "メインスレッドのみ — フラット化するものがありません。",
  mergeHintSelect: "マージするサブ質問を選択 · ノードをクリックで切り替え",
  mergeSelectAll: "すべて選択",
  mergeSelectNone: "選択解除",
  mergeCta: "{n} 件のサブ質問をマージ",
  mergeSelectedOf: "{selected} / {total} 件選択中",
  mergeGeneratingReport: "マージレポートを生成中…",
  mergeSavedToChat: "保存しました",
  mergeSaving: "保存中…",
  mergeSaveToChat: "チャットに保存",
  mergeReselect: "再選択",
  signInTerms: "サインインすることで、Deeppin の利用規約とプライバシーポリシーに同意します。",
  selectMode: "選択",
  cancel: "キャンセル",
};
