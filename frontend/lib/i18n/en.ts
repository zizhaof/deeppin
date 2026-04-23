// lib/i18n/en.ts — canonical UI 字符串来源
// Canonical source of truth for UI strings.
// 其他 locale 必须满足此对象定义的结构（由 T 类型强制）
// Other locales must satisfy this shape (enforced via the T type).

export const en = {
  // 导航 / Navigation
  back: "Back",
  forward: "Forward",
  mainThread: "Main",
  noTitle: "New chat",
  switchThread: "Switch",
  // 侧边栏标题 / Sidebar headings
  subQuestions: "Questions",
  overview: "Overview",
  viewList: "List",
  viewGraph: "Graph",
  // 空状态 / Empty states
  selectToPin: "Select text to open a question",
  noThreads: "No threads",
  // Welcome
  welcomeTitle: "Deep thinking starts here",
  welcomeSub: "Ask Deeppin anything. Select text in any reply to open a sub-question.",
  chooseQuestion: "Choose a question to explore",
  tagline: "Select any text to deep-dive",
  // InputBar
  inputPlaceholder: "Type a message… (Enter to send, Shift+Enter for newline)",
  webSearchPlaceholder: "Web search…",
  webSearchOn: "Disable web search",
  webSearchOff: "Enable web search",
  longTextLabel: "Long text",
  fileParseError: "Failed to extract text from file",
  fileUploadError: "File upload failed",
  // 会话列表页 / Session list
  newChat: "New Chat",
  recentSessions: "Recent Conversations",
  noSessions: "No conversations yet. Click the button to start.",
  untitled: "Untitled",
  yesterday: "Yesterday",
  daysAgo: "days ago",
  // 状态 / Status
  loading: "Loading…",
  creating: "Creating session…",
  errorPrefix: "Error: ",
  processing: "Processing…",
  streamError: "[Error]",
  // 线程 / Threads
  mainConversation: "Main conversation",
  subThread: "Sub-thread",
  // 插针菜单 / Pin menu
  pinAction: "Question",
  copy: "Copy",
  goToThread: "Go to question",
  // 推荐问题 / Suggested questions
  suggestedQuestions: "Suggested questions",
  customQuestion: "Or write your own question…",
  // 消息气泡 / Message bubble
  collapse: "Collapse",
  expandFull: "Expand",
  chars: "chars",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "Show raw text",
  showMd: "Render Markdown",
  // 附件 / Attachments
  extracting: "Extracting text…",
  // 合并输出 / Merge output
  mergeButton: "Merge",
  mergeTitle: "Merge Output",
  mergeAngles: "sub-questions",
  mergeHint: "Choose a format and click Generate to merge all pinned content into a report",
  mergePreparing: "Preparing…",
  mergeCopyMd: "Copy Markdown",
  mergeDownload: "Download .md",
  mergeGenerating: "Generating…",
  mergeRegenerate: "Regenerate",
  mergeGenerate: "Generate",
  mergeFormatFree: "Free Summary",
  mergeFormatFreeDesc: "Flowing narrative combining all perspectives",
  mergeFormatBullets: "Bullet Points",
  mergeFormatBulletsDesc: "Key points grouped by topic",
  mergeFormatStructured: "Structured Analysis",
  mergeFormatStructuredDesc: "Problem → Solution → Trade-offs → Conclusion",
  mergeFormatCustom: "Custom",
  mergeFormatCustomDesc: "Summarize your way",
  mergeFormatTranscript: "Raw Transcript",
  mergeFormatTranscriptDesc: "Output the original conversation verbatim",
  mergeCustomPromptPlaceholder: "Describe how you want it summarized, e.g. write as a memo for the team, focus on action items…",
  // 首页问题陈述 / Landing problem statement
  problemSetup: "When reading an AI reply and you want to dig deeper into one part, you have two bad options:",
  badChoice1Label: "Start a new chat",
  badChoice1Desc: "lose all context, have to re-explain everything",
  badChoice2Label: "Ask in this chat",
  badChoice2Desc: "interrupt the main thread, the topic drifts",
  solutionLabel: "Deeppin",
  solutionDesc: "Pin that detail and keep digging — as deep as you want. The main thread? Not a word interrupted.",
  // 使用说明 / How it works
  howToUseTitle: "How it works",
  step1Title: "Ask anything",
  step1Desc: "Start a conversation with AI and get a detailed answer",
  step2Title: "Pin to explore",
  step2Desc: "Highlight any text in a reply, click 'Question' — a focused sub-thread opens, main chat stays untouched",
  step3Title: "Go as deep as you want",
  step3Desc: "Pin again inside sub-questions — no limit on how many layers you can go",
  step4Title: "Merge everything",
  step4Desc: "Done exploring? Combine all threads into one complete report and export it",
  // 文章 / Articles
  articles: "Articles",
  // 账号 / Account
  logout: "Log out",
  deleteAccount: "Delete account",
  // 错误消息 / Errors
  deleteError: "Delete failed: ",
  unknownError: "Unknown error",
  confirmDelete: "Delete this session? This cannot be undone.",
  // 删除线程弹窗 / Delete-thread dialog
  deleteThread: "Delete thread",
  deleteThreadTitle: "Delete this thread and all its sub-threads?",
  deleteSessionTitle: "Delete this entire conversation?",
  deleteThreadBody: "Highlighted threads will be permanently deleted along with all their messages. This cannot be undone.",
  deleteCount: "{n} thread(s) to delete",
  deleteCta: "Delete",
  deleting: "Deleting…",
  deleteResetView: "Fit",
  // MergeDemo
  pinsReady: "pins ready",
  mergeOutput: "Merge Output",
  // 扁平化 / Flatten
  flattenButton: "Flatten",
  flattenConfirmTitle: "Flatten this session?",
  flattenConfirmBody: "All sub-thread messages will be merged back into the main thread in preorder, and every pin will be removed.\n\nThis cannot be undone.",
  flattenConfirmCta: "Confirm flatten",
  flattenCancel: "Cancel",
  flattening: "Flattening…",
  flattenSuccess: "Flattened: merged {count} pin(s)",
  flattenAlready: "Already flattened",
  flattenError: "Flatten failed: ",
  // 匿名试用 / Anonymous trial
  anonQuotaTitle: "Free trial limit reached",
  anonQuotaDesc: "Sign in to keep chatting — your conversation will be kept.",
  anonSessionLimitTitle: "Free trial: 1 conversation",
  anonSessionLimitDesc: "Sign in to start as many conversations as you want — nothing is lost.",
  signInGoogle: "Sign in with Google",
  signIn: "Sign in",
  later: "Later",
  // 语言选择器 / Language selector
  languageLabel: "Language",
  // 锚点 hover popover / Anchor hover popover
  newReply: "New",
  enterThread: "Enter",
  generatingSuggestions: "Generating follow-ups…",
  // Composer 配额计数器 / Composer quota counter
  quotaFree: "free",
  quotaFull: "Trial limit reached",
  // 消息气泡 WHO 标签 / Message bubble WHO labels
  you: "YOU",
  ai: "Deeppin",
  // 扁平化 before/after 预览 / Flatten before-after preview
  flattenPreviewBefore: "Before",
  flattenPreviewAfter: "After",
  flattenPreviewEmpty: "Only the main thread — nothing to flatten.",
  // Merge 模态框 / Merge modal
  mergeHintSelect: "Select sub-questions to merge · click a node to toggle",
  mergeHintDrag: "Scroll to pan · drag to move",
  mergeSelectAll: "Select all",
  mergeSelectNone: "Clear all",
  mergeCta: "Merge {n} sub-question{s}",
  mergeSelectedOf: "{selected} / {total} selected",
  mergeGeneratingReport: "Generating merged report…",
  mergeSavedToChat: "Saved",
  mergeSaving: "Saving…",
  mergeSaveToChat: "Save to chat",
  mergeReselect: "Reselect",
  // 登录页底部免责声明 / Sign-in page footer disclaimer
  signInTerms: "Signing in means you agree to Deeppin's Terms and Privacy Policy.",
  selectMode: "Select",
  cancel: "Cancel",
} as const;

// T 是 en 的 key 集合 + 全部 string 值类型。
// 不能直接写 `typeof en`，因为 `as const` 会把每个值收窄成字面量类型，
// 导致其他 locale 的翻译（值不同）无法赋给相同的 key。
// T is the key set of en mapped to plain string values. Using `typeof en` directly
// would narrow each value to its English literal, which would then reject every
// other locale's translation (different literal) on the same key.
export type T = { [K in keyof typeof en]: string };
