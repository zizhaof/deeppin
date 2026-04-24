// lib/i18n/es.ts — Traducción al español / Spanish translations

import type { T } from "./en";

export const es: T = {
  // Navegación
  back: "Atrás",
  forward: "Adelante",
  mainThread: "Principal",
  // Encabezados de la barra lateral
  subQuestions: "Preguntas",
  overview: "Resumen",
  viewList: "Lista",
  viewGraph: "Gráfico",
  // Estados vacíos
  noThreads: "Sin hilos",
  // Welcome
  welcomeTitle: "El pensamiento profundo empieza aquí",
  welcomeSub: "Pregunta cualquier cosa a Deeppin. Selecciona texto en una respuesta para abrir una subpregunta.",
  chooseQuestion: "Elige una pregunta para explorar",
  // InputBar
  inputPlaceholder: "Escribe un mensaje… (Enter para enviar, Shift+Enter para salto de línea)",
  webSearchPlaceholder: "Búsqueda web…",
  webSearchOn: "Desactivar búsqueda web",
  webSearchOff: "Activar búsqueda web",
  longTextLabel: "Texto largo",
  fileParseError: "No se pudo extraer el texto del archivo",
  fileUploadError: "Error al subir el archivo",
  // Lista de sesiones
  newChat: "Chat nuevo",
  recentSessions: "Conversaciones recientes",
  noSessions: "Aún no hay conversaciones. Haz clic en el botón para empezar.",
  untitled: "Sin título",
  yesterday: "Ayer",
  daysAgo: "días atrás",
  // Estado
  loading: "Cargando…",
  errorPrefix: "Error: ",
  processing: "Procesando…",
  streamError: "[Error]",
  // Hilos
  subThread: "Subhilo",
  // Menú de pin
  pinAction: "Pregunta",
  copy: "Copiar",
  // Preguntas sugeridas
  suggestedQuestions: "Preguntas sugeridas",
  customQuestion: "O escribe tu propia pregunta…",
  // Burbuja de mensaje
  collapse: "Contraer",
  expandFull: "Expandir",
  chars: "car.",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "Mostrar texto sin formato",
  showMd: "Renderizar Markdown",
  // Adjuntos
  extracting: "Extrayendo texto…",
  // Salida de fusión
  mergeButton: "Fusionar",
  mergeTitle: "Salida fusionada",
  mergeAngles: "subpreguntas",
  mergeHint: "Elige un formato y pulsa Generar para fusionar todo el contenido de los pins en un informe",
  mergeCopyMd: "Copiar Markdown",
  mergeDownload: "Descargar .md",
  mergeGenerating: "Generando…",
  mergeFormatFree: "Resumen libre",
  mergeFormatFreeDesc: "Narrativa fluida que integra todas las perspectivas",
  mergeFormatBullets: "Lista de puntos",
  mergeFormatBulletsDesc: "Puntos clave agrupados por tema",
  mergeFormatStructured: "Análisis estructurado",
  mergeFormatStructuredDesc: "Problema → Solución → Trade-offs → Conclusión",
  mergeFormatCustom: "Personalizado",
  mergeFormatCustomDesc: "Resume a tu manera",
  mergeFormatTranscript: "Transcripción literal",
  mergeFormatTranscriptDesc: "Salida textual de la conversación original",
  mergeCustomPromptPlaceholder: "Describe cómo quieres el resumen, p. ej.: como memo para el equipo, centrado en acciones…",
  // Problema en landing
  // Cómo funciona
  // Artículos
  articles: "Artículos",
  // Cuenta
  logout: "Cerrar sesión",
  deleteAccount: "Eliminar cuenta",
  // Errores
  deleteError: "Error al eliminar: ",
  unknownError: "Error desconocido",
  confirmDelete: "¿Eliminar esta sesión? No se puede deshacer.",
  // Diálogo de eliminar hilo
  deleteThread: "Eliminar hilo",
  deleteThreadTitle: "¿Eliminar este hilo y todos sus sub-hilos?",
  deleteSessionTitle: "¿Eliminar toda esta conversación?",
  deleteThreadBody: "Los hilos resaltados y todos sus mensajes se eliminarán permanentemente. No se puede deshacer.",
  deleteCount: "{n} hilo(s) a eliminar",
  deleteCta: "Eliminar",
  deleting: "Eliminando…",
  deleteResetView: "Ajustar",
  // Aplanar
  flattenButton: "Aplanar",
  flattenConfirmTitle: "¿Aplanar esta sesión?",
  flattenConfirmBody: "Todos los mensajes de subhilos se fusionarán en el hilo principal en preorden y se eliminarán todos los pins.\n\nEsto no se puede deshacer.",
  flattenConfirmCta: "Confirmar aplanado",
  flattenCancel: "Cancelar",
  flattening: "Aplanando…",
  flattenSuccess: "Aplanado: {count} pin(s) fusionados",
  flattenAlready: "Ya está aplanado",
  flattenError: "Error al aplanar: ",
  // Prueba anónima
  anonQuotaTitle: "Límite de prueba gratuita alcanzado",
  anonQuotaDesc: "Inicia sesión para seguir chateando — se conserva tu conversación.",
  anonSessionLimitTitle: "Prueba gratuita: 1 conversación",
  anonSessionLimitDesc: "Inicia sesión para tener conversaciones ilimitadas — no se pierde nada.",
  signInGoogle: "Iniciar sesión con Google",
  signIn: "Iniciar sesión",
  later: "Más tarde",
  // Selector de idioma
  languageLabel: "Idioma",
  // Popover de hover del ancla
  newReply: "Nuevo",
  enterThread: "Abrir",
  generatingSuggestions: "Generando preguntas de seguimiento…",
  // Contador de cuota gratuita
  quotaFree: "libres",
  quotaFull: "Límite de prueba alcanzado",
  you: "TÚ",
  ai: "Deeppin",
  flattenPreviewBefore: "Antes",
  flattenPreviewAfter: "Después",
  flattenPreviewEmpty: "Solo el hilo principal — nada que aplanar.",
  mergeHintSelect: "Selecciona sub-preguntas para combinar · clic para alternar",
  mergeSelectAll: "Seleccionar todo",
  mergeSelectNone: "Limpiar",
  mergeCta: "Combinar {n} sub-pregunta(s)",
  mergeSelectedOf: "{selected} / {total} seleccionadas",
  mergeGeneratingReport: "Generando informe…",
  mergeSavedToChat: "Guardado",
  mergeSaving: "Guardando…",
  mergeSaveToChat: "Guardar en el chat",
  mergeReselect: "Reseleccionar",
  signInTerms: "Al iniciar sesión, aceptas los Términos y la Política de Privacidad de Deeppin.",
  selectMode: "Seleccionar",
  cancel: "Cancelar",
};
