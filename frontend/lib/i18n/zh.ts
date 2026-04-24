// Chinese translations. Must satisfy T (shape defined by en.ts).

import type { T } from "./en";

export const zh: T = {
  // Navigation
  back: "后退",
  forward: "前进",
  mainThread: "主线",
  // Sidebar headings
  subQuestions: "子问题",
  overview: "概览",
  viewList: "列表",
  viewGraph: "节点图",
  // Empty states
  noThreads: "暂无线程",
  // Welcome
  welcomeTitle: "深度思考，从这里开始",
  welcomeSub: "向 Deeppin 提问，选中回复中的任意文字可开启子问题深入探讨",
  chooseQuestion: "选择一个问题开始追问",
  // InputBar
  inputPlaceholder: "输入消息… (Enter 发送，Shift+Enter 换行)",
  webSearchPlaceholder: "联网搜索…",
  webSearchOn: "关闭联网搜索",
  webSearchOff: "开启联网搜索",
  longTextLabel: "长文本",
  fileParseError: "文件解析失败，无法提取文字内容",
  fileUploadError: "文件上传失败",
  // Session list page
  newChat: "新对话",
  recentSessions: "最近的对话",
  noSessions: "还没有对话，点击右上角开始",
  untitled: "未命名对话",
  yesterday: "昨天",
  daysAgo: "天前",
  // Status
  loading: "加载中…",
  errorPrefix: "出错了：",
  processing: "正在处理…",
  streamError: "[错误]",
  // Threads
  subThread: "子线程",
  // Pin menu
  pinAction: "子问题",
  copy: "复制",
  // Suggested questions
  suggestedQuestions: "推荐问题",
  customQuestion: "或者自己写一个问题…",
  // Message bubble
  collapse: "收起",
  expandFull: "展开全文",
  chars: "字",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "显示原始文本",
  showMd: "渲染 Markdown",
  // Attachments
  extracting: "正在提取文本…",
  // Merge output
  mergeButton: "合并",
  mergeTitle: "合并输出",
  mergeAngles: "个子问题",
  mergeHint: "选择格式后点击生成，将所有插针内容合并为一份报告",
  mergeCopyMd: "复制 Markdown",
  mergeDownload: "下载 .md",
  mergeGenerating: "生成中…",
  mergeFormatFree: "自由总结",
  mergeFormatFreeDesc: "流畅叙述，融合各角度洞察",
  mergeFormatBullets: "要点列表",
  mergeFormatBulletsDesc: "按主题分组，提炼关键要点",
  mergeFormatStructured: "结构化分析",
  mergeFormatStructuredDesc: "问题 → 方案 → 权衡 → 结论",
  mergeFormatCustom: "自定义",
  mergeFormatCustomDesc: "按你的想法总结",
  mergeFormatTranscript: "对话原文",
  mergeFormatTranscriptDesc: "直接输出原始对话内容",
  mergeCustomPromptPlaceholder: "描述你想要的总结方式，例如：用一封信的口吻写给团队，重点突出行动项…",
  // Landing problem statement
  // How to use
  // Articles
  articles: "文章",
  // Account
  logout: "退出",
  deleteAccount: "删除账号",
  // Error messages
  deleteError: "删除失败：",
  unknownError: "未知错误",
  confirmDelete: "确定删除这个会话吗？删除后无法恢复。",
  // Delete thread dialog
  deleteThread: "删除线程",
  deleteThreadTitle: "删除此线程及其所有子线程？",
  deleteSessionTitle: "删除整个对话？",
  deleteThreadBody: "高亮的线程及其所有消息将被永久删除，无法恢复。",
  deleteCount: "将删除 {n} 个线程",
  deleteCta: "删除",
  deleting: "删除中…",
  deleteResetView: "自适应",
  // Flatten
  flattenButton: "扁平化",
  flattenConfirmTitle: "扁平化此会话？",
  flattenConfirmBody: "所有子线程的对话将按 preorder 合并回主线，所有插针会被移除。\n\n此操作无法撤销。",
  flattenConfirmCta: "确认扁平化",
  flattenCancel: "取消",
  flattening: "正在扁平化…",
  flattenSuccess: "扁平化完成：合并 {count} 条针",
  flattenAlready: "已扁平化，无需重复操作",
  flattenError: "扁平化失败：",
  // Anonymous trial
  anonQuotaTitle: "免费试用已达上限",
  anonQuotaDesc: "登录后即可继续对话，已有消息会保留。",
  anonSessionLimitTitle: "试用仅支持 1 个对话",
  anonSessionLimitDesc: "登录后可开启任意多个对话，历史消息不会丢失。",
  signInGoogle: "用 Google 登录",
  signIn: "登录",
  later: "稍后",
  // Language selector
  languageLabel: "语言",
  // Anchor hover popover
  newReply: "新",
  enterThread: "进入",
  generatingSuggestions: "正在生成追问…",
  // Input bar quota counter
  quotaFree: "剩余",
  quotaFull: "试用已达上限",
  you: "我",
  ai: "Deeppin",
  flattenPreviewBefore: "扁平前",
  flattenPreviewAfter: "扁平后",
  flattenPreviewEmpty: "只有主线 — 没有可扁平化的子线程。",
  mergeHintSelect: "选择要合并的子问题 · 点击节点反选",
  mergeSelectAll: "全选",
  mergeSelectNone: "全不选",
  mergeCta: "合并 {n} 个子问题",
  mergeSelectedOf: "已选 {selected} / {total}",
  mergeGeneratingReport: "正在生成合并报告…",
  mergeSavedToChat: "已保存",
  mergeSaving: "保存中…",
  mergeSaveToChat: "保存到对话",
  mergeReselect: "重新选择",
  signInTerms: "登录即代表你同意 Deeppin 的服务条款和隐私政策。",
  selectMode: "选取",
  cancel: "取消",
};
