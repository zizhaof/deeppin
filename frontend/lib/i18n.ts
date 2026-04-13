// lib/i18n.ts — UI 字符串翻译

export type Lang = "zh" | "en";

const zh = {
  // 导航
  back: "后退",
  forward: "前进",
  mainThread: "主线",
  noTitle: "新对话",
  switchThread: "切换线程",
  // 侧边栏标题
  subQuestions: "子问题",
  overview: "概览",
  // 空状态
  selectToPin: "选中文字开启子问题",
  noThreads: "暂无线程",
  // Welcome
  welcomeTitle: "深度思考，从这里开始",
  welcomeSub: "向 AI 提问，选中回复中的任意文字可开启子问题深入探讨",
  chooseQuestion: "选择一个问题开始追问",
  // InputBar
  inputPlaceholder: "输入消息… (Enter 发送，Shift+Enter 换行)",
  // 会话列表页
  newChat: "新对话",
  recentSessions: "最近的对话",
  noSessions: "还没有对话，点击右上角开始",
  untitled: "未命名对话",
  // 状态
  loading: "加载中…",
  creating: "正在创建会话…",
  errorPrefix: "出错了：",
  // 线程
  mainConversation: "主线对话",
  subThread: "子线程",
  // 插针菜单
  pinAction: "子问题",
  goToThread: "跳到子问题",
  // 推荐问题
  suggestedQuestions: "推荐问题",
  customQuestion: "或者自己写一个问题…",
  // 附件
  extracting: "正在提取文本…",
  // 语言切换标签（显示"切换到的语言"）
  toggleLang: "EN",
} as const;

const en = {
  back: "Back",
  forward: "Forward",
  mainThread: "Main",
  noTitle: "New chat",
  switchThread: "Switch",
  subQuestions: "Questions",
  overview: "Overview",
  selectToPin: "Select text to open a question",
  noThreads: "No threads",
  welcomeTitle: "Deep thinking starts here",
  welcomeSub: "Ask AI anything. Select text in any reply to open a sub-question.",
  chooseQuestion: "Choose a question to explore",
  inputPlaceholder: "Type a message… (Enter to send, Shift+Enter for newline)",
  newChat: "New Chat",
  recentSessions: "Recent Conversations",
  noSessions: "No conversations yet. Click the button to start.",
  untitled: "Untitled",
  loading: "Loading…",
  creating: "Creating session…",
  errorPrefix: "Error: ",
  mainConversation: "Main conversation",
  subThread: "Sub-thread",
  pinAction: "Question",
  goToThread: "Go to question",
  suggestedQuestions: "Suggested questions",
  customQuestion: "Or write your own question…",
  extracting: "Extracting text…",
  toggleLang: "中",
} as const;

export const translations = { zh, en } as const;
// T 用宽松 string 类型，两个语言对象都可以赋值给它
export type T = { [K in keyof typeof zh]: string };
