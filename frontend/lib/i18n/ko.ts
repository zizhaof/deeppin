// lib/i18n/ko.ts — 한국어 번역 / Korean translations

import type { T } from "./en";

export const ko: T = {
  // 네비게이션
  back: "뒤로",
  forward: "앞으로",
  mainThread: "메인",
  // 사이드바 제목
  subQuestions: "질문",
  overview: "개요",
  viewList: "목록",
  viewGraph: "그래프",
  // 빈 상태
  noThreads: "스레드 없음",
  // Welcome
  welcomeTitle: "깊이 있는 사고의 시작",
  welcomeSub: "Deeppin에게 무엇이든 물어보세요. 답변에서 텍스트를 선택해 하위 질문을 열 수 있습니다.",
  chooseQuestion: "탐색할 질문 선택",
  // InputBar
  inputPlaceholder: "메시지 입력… (Enter로 전송, Shift+Enter로 줄바꿈)",
  webSearchPlaceholder: "웹 검색…",
  webSearchOn: "웹 검색 끄기",
  webSearchOff: "웹 검색 켜기",
  longTextLabel: "긴 글",
  fileParseError: "파일에서 텍스트를 추출하지 못했습니다",
  fileUploadError: "파일 업로드 실패",
  // 세션 목록
  newChat: "새 대화",
  recentSessions: "최근 대화",
  noSessions: "아직 대화가 없습니다. 버튼을 눌러 시작하세요.",
  untitled: "제목 없음",
  yesterday: "어제",
  daysAgo: "일 전",
  // 상태
  loading: "로딩 중…",
  errorPrefix: "오류: ",
  processing: "처리 중…",
  streamError: "[오류]",
  // 스레드
  subThread: "하위 스레드",
  // 핀 메뉴
  pinAction: "질문",
  copy: "복사",
  // 추천 질문
  suggestedQuestions: "추천 질문",
  customQuestion: "또는 직접 질문을 작성…",
  // 메시지 버블
  collapse: "접기",
  expandFull: "펼치기",
  chars: "자",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "원문 표시",
  showMd: "Markdown 렌더링",
  // 첨부
  extracting: "텍스트 추출 중…",
  // 병합 출력
  mergeButton: "병합",
  mergeTitle: "병합 출력",
  mergeAngles: "개의 하위 질문",
  mergeHint: "포맷을 선택하고 생성을 눌러 모든 핀 내용을 하나의 보고서로 병합",
  mergeCopyMd: "Markdown 복사",
  mergeDownload: ".md 다운로드",
  mergeGenerating: "생성 중…",
  mergeFormatFree: "자유 요약",
  mergeFormatFreeDesc: "관점을 엮은 자연스러운 서술",
  mergeFormatBullets: "불릿 리스트",
  mergeFormatBulletsDesc: "주제별 핵심 포인트",
  mergeFormatStructured: "구조화 분석",
  mergeFormatStructuredDesc: "문제 → 해결 → 트레이드오프 → 결론",
  mergeFormatCustom: "커스텀",
  mergeFormatCustomDesc: "원하는 방식대로 요약",
  mergeFormatTranscript: "원본 대화",
  mergeFormatTranscriptDesc: "원본 대화를 그대로 출력",
  mergeCustomPromptPlaceholder: "요약 방식을 설명하세요. 예: 팀을 위한 메모 형식으로, 액션 아이템 위주로…",
  // 랜딩 문제 제기
  // 사용법
  // 아티클
  articles: "아티클",
  // 계정
  logout: "로그아웃",
  deleteAccount: "계정 삭제",
  // 오류 메시지
  deleteError: "삭제 실패: ",
  unknownError: "알 수 없는 오류",
  confirmDelete: "이 세션을 삭제할까요? 되돌릴 수 없습니다.",
  // 스레드 삭제 대화상자
  deleteThread: "스레드 삭제",
  deleteThreadTitle: "이 스레드와 모든 하위 스레드를 삭제할까요?",
  deleteSessionTitle: "이 대화 전체를 삭제할까요?",
  deleteThreadBody: "강조 표시된 스레드와 모든 메시지가 영구적으로 삭제됩니다. 되돌릴 수 없습니다.",
  deleteCount: "스레드 {n}개 삭제 예정",
  deleteCta: "삭제",
  deleting: "삭제 중…",
  deleteResetView: "맞춤",
  // 평탄화
  flattenButton: "평탄화",
  flattenConfirmTitle: "이 세션을 평탄화할까요?",
  flattenConfirmBody: "모든 하위 스레드 메시지가 preorder 순으로 메인 스레드에 병합되고 모든 핀이 제거됩니다.\n\n되돌릴 수 없습니다.",
  flattenConfirmCta: "평탄화 확인",
  flattenCancel: "취소",
  flattening: "평탄화 중…",
  flattenSuccess: "평탄화 완료: {count}개의 핀 병합",
  flattenAlready: "이미 평탄화됨",
  flattenError: "평탄화 실패: ",
  // 무료 체험
  anonQuotaTitle: "무료 체험 한도 도달",
  anonQuotaDesc: "로그인하고 대화를 이어가세요 — 기존 대화는 유지됩니다.",
  anonSessionLimitTitle: "무료 체험: 1개 대화",
  anonSessionLimitDesc: "로그인하면 대화 수 무제한 — 아무것도 잃지 않습니다.",
  signInGoogle: "Google로 로그인",
  signIn: "로그인",
  later: "나중에",
  // 언어 선택기
  languageLabel: "언어",
  // 앵커 호버 팝오버
  newReply: "새글",
  enterThread: "열기",
  generatingSuggestions: "후속 질문 생성 중…",
  // 무료 쿼터 카운터
  quotaFree: "남음",
  quotaFull: "체험 한도 도달",
  you: "나",
  ai: "Deeppin",
  flattenPreviewBefore: "평탄화 전",
  flattenPreviewAfter: "평탄화 후",
  flattenPreviewEmpty: "메인 스레드만 있음 — 평탄화할 것이 없습니다.",
  mergeHintSelect: "병합할 하위 질문을 선택 · 노드를 클릭하여 토글",
  mergeSelectAll: "모두 선택",
  mergeSelectNone: "선택 해제",
  mergeCta: "{n}개의 하위 질문 병합",
  mergeSelectedOf: "{selected} / {total} 선택됨",
  mergeGeneratingReport: "병합 보고서 생성 중…",
  mergeSavedToChat: "저장됨",
  mergeSaving: "저장 중…",
  mergeSaveToChat: "대화에 저장",
  mergeReselect: "다시 선택",
  signInTerms: "로그인하면 Deeppin의 이용약관과 개인정보처리방침에 동의하는 것입니다.",
  selectMode: "선택",
  cancel: "취소",
};
