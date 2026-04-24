// lib/i18n/pt.ts — Tradução em português (Brasil) / Brazilian Portuguese translations

import type { T } from "./en";

export const pt: T = {
  // Navegação
  back: "Voltar",
  forward: "Avançar",
  mainThread: "Principal",
  // Cabeçalhos da barra lateral
  subQuestions: "Perguntas",
  overview: "Visão geral",
  viewList: "Lista",
  viewGraph: "Grafo",
  // Estados vazios
  noThreads: "Sem threads",
  // Welcome
  welcomeTitle: "Pensamento profundo começa aqui",
  welcomeSub: "Pergunte qualquer coisa ao Deeppin. Selecione um texto em uma resposta para abrir uma subpergunta.",
  chooseQuestion: "Escolha uma pergunta para explorar",
  // InputBar
  inputPlaceholder: "Escreva uma mensagem… (Enter para enviar, Shift+Enter para nova linha)",
  webSearchPlaceholder: "Busca na web…",
  webSearchOn: "Desativar busca na web",
  webSearchOff: "Ativar busca na web",
  longTextLabel: "Texto longo",
  fileParseError: "Não foi possível extrair o texto do arquivo",
  fileUploadError: "Falha no upload do arquivo",
  // Lista de sessões
  newChat: "Novo chat",
  recentSessions: "Conversas recentes",
  noSessions: "Ainda não há conversas. Clique no botão para começar.",
  untitled: "Sem título",
  yesterday: "Ontem",
  daysAgo: "dias atrás",
  // Status
  loading: "Carregando…",
  errorPrefix: "Erro: ",
  processing: "Processando…",
  streamError: "[Erro]",
  // Threads
  subThread: "Subthread",
  // Menu do pin
  pinAction: "Pergunta",
  copy: "Copiar",
  // Sugestões
  suggestedQuestions: "Perguntas sugeridas",
  customQuestion: "Ou escreva sua própria pergunta…",
  // Balão de mensagem
  collapse: "Recolher",
  expandFull: "Expandir",
  chars: "car.",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "Mostrar texto bruto",
  showMd: "Renderizar Markdown",
  // Anexos
  extracting: "Extraindo texto…",
  // Saída mesclada
  mergeButton: "Mesclar",
  mergeTitle: "Saída mesclada",
  mergeAngles: "subperguntas",
  mergeHint: "Escolha um formato e clique em Gerar para mesclar todo o conteúdo dos pins em um relatório",
  mergeCopyMd: "Copiar Markdown",
  mergeDownload: "Baixar .md",
  mergeGenerating: "Gerando…",
  mergeFormatFree: "Resumo livre",
  mergeFormatFreeDesc: "Narrativa fluida que combina todas as perspectivas",
  mergeFormatBullets: "Lista de tópicos",
  mergeFormatBulletsDesc: "Pontos-chave agrupados por tema",
  mergeFormatStructured: "Análise estruturada",
  mergeFormatStructuredDesc: "Problema → Solução → Trade-offs → Conclusão",
  mergeFormatCustom: "Personalizado",
  mergeFormatCustomDesc: "Resuma do seu jeito",
  mergeFormatTranscript: "Transcrição literal",
  mergeFormatTranscriptDesc: "Saída textual da conversa original",
  mergeCustomPromptPlaceholder: "Descreva como você quer o resumo, ex.: como memo para o time, foco em ações…",
  // Problema na landing
  // Como funciona
  // Artigos
  articles: "Artigos",
  // Conta
  logout: "Sair",
  deleteAccount: "Excluir conta",
  // Erros
  deleteError: "Falha ao excluir: ",
  unknownError: "Erro desconhecido",
  confirmDelete: "Excluir esta sessão? Não pode ser desfeito.",
  // Diálogo de exclusão de thread
  deleteThread: "Excluir thread",
  deleteThreadTitle: "Excluir este thread e todos os sub-threads?",
  deleteSessionTitle: "Excluir toda esta conversa?",
  deleteThreadBody: "Os threads destacados serão excluídos permanentemente junto com todas as mensagens. Não pode ser desfeito.",
  deleteCount: "{n} thread(s) a excluir",
  deleteCta: "Excluir",
  deleting: "Excluindo…",
  deleteResetView: "Ajustar",
  // Achatar
  flattenButton: "Achatar",
  flattenConfirmTitle: "Achatar esta sessão?",
  flattenConfirmBody: "Todas as mensagens de subthreads serão mescladas no thread principal em preorder e todos os pins serão removidos.\n\nIsso não pode ser desfeito.",
  flattenConfirmCta: "Confirmar achatamento",
  flattenCancel: "Cancelar",
  flattening: "Achatando…",
  flattenSuccess: "Achatado: {count} pin(s) mesclado(s)",
  flattenAlready: "Já está achatado",
  flattenError: "Falha ao achatar: ",
  // Teste gratuito
  anonQuotaTitle: "Limite do teste gratuito atingido",
  anonQuotaDesc: "Faça login para continuar — sua conversa é preservada.",
  anonSessionLimitTitle: "Teste gratuito: 1 conversa",
  anonSessionLimitDesc: "Faça login para ter conversas ilimitadas — nada é perdido.",
  signInGoogle: "Entrar com Google",
  signIn: "Entrar",
  later: "Depois",
  // Seletor de idioma
  languageLabel: "Idioma",
  // Popover ao passar o mouse sobre a âncora
  newReply: "Novo",
  enterThread: "Abrir",
  generatingSuggestions: "Gerando perguntas de acompanhamento…",
  // Contador de cota gratuita
  quotaFree: "livres",
  quotaFull: "Limite do teste atingido",
  you: "VOCÊ",
  ai: "Deeppin",
  flattenPreviewBefore: "Antes",
  flattenPreviewAfter: "Depois",
  flattenPreviewEmpty: "Apenas o tópico principal — nada para achatar.",
  mergeHintSelect: "Selecione subperguntas para mesclar · clique para alternar",
  mergeSelectAll: "Selecionar tudo",
  mergeSelectNone: "Limpar tudo",
  mergeCta: "Mesclar {n} subpergunta(s)",
  mergeSelectedOf: "{selected} / {total} selecionadas",
  mergeGeneratingReport: "Gerando relatório…",
  mergeSavedToChat: "Salvo",
  mergeSaving: "Salvando…",
  mergeSaveToChat: "Salvar no chat",
  mergeReselect: "Selecionar novamente",
  signInTerms: "Ao entrar, você concorda com os Termos e a Política de Privacidade do Deeppin.",
  selectMode: "Selecionar",
  cancel: "Cancelar",
};
