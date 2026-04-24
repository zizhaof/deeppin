// Canonical source of truth for UI strings.
// Other locales must satisfy this shape (enforced via the T type).

export const en = {
  // Navigation
  back: "Back",
  forward: "Forward",
  mainThread: "Main",
  // Sidebar headings
  subQuestions: "Questions",
  overview: "Overview",
  viewList: "List",
  viewGraph: "Graph",
  // Empty states
  noThreads: "No threads",
  // Welcome
  welcomeTitle: "Deep thinking starts here",
  welcomeSub: "Ask Deeppin anything. Select text in any reply to open a sub-question.",
  chooseQuestion: "Choose a question to explore",
  // InputBar
  inputPlaceholder: "Type a message… (Enter to send, Shift+Enter for newline)",
  webSearchPlaceholder: "Web search…",
  webSearchOn: "Disable web search",
  webSearchOff: "Enable web search",
  longTextLabel: "Long text",
  fileParseError: "Failed to extract text from file",
  fileUploadError: "File upload failed",
  // Session list
  newChat: "New Chat",
  recentSessions: "Recent Conversations",
  noSessions: "No conversations yet. Click the button to start.",
  untitled: "Untitled",
  yesterday: "Yesterday",
  daysAgo: "days ago",
  // Status
  loading: "Loading…",
  errorPrefix: "Error: ",
  processing: "Processing…",
  streamError: "[Error]",
  // Threads
  subThread: "Sub-thread",
  // Pin menu
  pinAction: "Question",
  copy: "Copy",
  // Suggested questions
  suggestedQuestions: "Suggested questions",
  customQuestion: "Or write your own question…",
  // Message bubble
  collapse: "Collapse",
  expandFull: "Expand",
  chars: "chars",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "Show raw text",
  showMd: "Render Markdown",
  // Attachments
  extracting: "Extracting text…",
  // Merge output
  mergeButton: "Merge",
  mergeTitle: "Merge Output",
  mergeAngles: "sub-questions",
  mergeHint: "Choose a format and click Generate to merge all pinned content into a report",
  mergeCopyMd: "Copy Markdown",
  mergeDownload: "Download .md",
  mergeGenerating: "Generating…",
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
  // Landing problem statement
  // How it works
  // Articles
  articles: "Articles",
  // Account
  logout: "Log out",
  deleteAccount: "Delete account",
  // Errors
  deleteError: "Delete failed: ",
  unknownError: "Unknown error",
  confirmDelete: "Delete this session? This cannot be undone.",
  // Delete-thread dialog
  deleteThread: "Delete thread",
  deleteThreadTitle: "Delete this thread and all its sub-threads?",
  deleteSessionTitle: "Delete this entire conversation?",
  deleteThreadBody: "Highlighted threads will be permanently deleted along with all their messages. This cannot be undone.",
  deleteCount: "{n} thread(s) to delete",
  deleteCta: "Delete",
  deleting: "Deleting…",
  deleteResetView: "Fit",
  // Flatten
  flattenButton: "Flatten",
  flattenConfirmTitle: "Flatten this session?",
  flattenConfirmBody: "All sub-thread messages will be merged back into the main thread in preorder, and every pin will be removed.\n\nThis cannot be undone.",
  flattenConfirmCta: "Confirm flatten",
  flattenCancel: "Cancel",
  flattening: "Flattening…",
  flattenSuccess: "Flattened: merged {count} pin(s)",
  flattenAlready: "Already flattened",
  flattenError: "Flatten failed: ",
  // Anonymous trial
  anonQuotaTitle: "Free trial limit reached",
  anonQuotaDesc: "Sign in to keep chatting — your conversation will be kept.",
  anonSessionLimitTitle: "Free trial: 1 conversation",
  anonSessionLimitDesc: "Sign in to start as many conversations as you want — nothing is lost.",
  signInGoogle: "Sign in with Google",
  signIn: "Sign in",
  later: "Later",
  // Language selector
  languageLabel: "Language",
  // Anchor hover popover
  newReply: "New",
  enterThread: "Enter",
  generatingSuggestions: "Generating follow-ups…",
  // Composer quota counter
  quotaFree: "free",
  quotaFull: "Trial limit reached",
  // Message bubble WHO labels
  you: "YOU",
  ai: "Deeppin",
  // Flatten before-after preview
  flattenPreviewBefore: "Before",
  flattenPreviewAfter: "After",
  flattenPreviewEmpty: "Only the main thread — nothing to flatten.",
  // Merge modal
  mergeHintSelect: "Select sub-questions to merge · click a node to toggle",
  mergeSelectAll: "Select all",
  mergeSelectNone: "Clear all",
  mergeCta: "Merge {n} sub-question{s}",
  mergeSelectedOf: "{selected} / {total} selected",
  mergeGeneratingReport: "Generating merged report…",
  mergeSavedToChat: "Saved",
  mergeSaving: "Saving…",
  mergeSaveToChat: "Save to chat",
  mergeReselect: "Reselect",
  // Sign-in page footer disclaimer
  signInTerms: "Signing in means you agree to Deeppin's Terms and Privacy Policy.",
  selectMode: "Select",
  cancel: "Cancel",
} as const;

// T is the key set of en mapped to plain string values. Using `typeof en` directly
// would narrow each value to its English literal, which would then reject every
// other locale's translation (different literal) on the same key.
export type T = { [K in keyof typeof en]: string };
