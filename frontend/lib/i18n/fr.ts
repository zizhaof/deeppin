// lib/i18n/fr.ts — Traduction française / French translations

import type { T } from "./en";

export const fr: T = {
  // Navigation
  back: "Retour",
  forward: "Avant",
  mainThread: "Principal",
  // En-têtes de la barre latérale
  subQuestions: "Questions",
  overview: "Aperçu",
  viewList: "Liste",
  viewGraph: "Graphe",
  // États vides
  noThreads: "Aucun fil",
  // Welcome
  welcomeTitle: "La réflexion profonde commence ici",
  welcomeSub: "Demande n'importe quoi à Deeppin. Sélectionne du texte dans une réponse pour ouvrir une sous-question.",
  chooseQuestion: "Choisis une question à explorer",
  // InputBar
  inputPlaceholder: "Écris un message… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)",
  webSearchPlaceholder: "Recherche web…",
  webSearchOn: "Désactiver la recherche web",
  webSearchOff: "Activer la recherche web",
  longTextLabel: "Texte long",
  fileParseError: "Impossible d'extraire le texte du fichier",
  fileUploadError: "Échec du téléversement",
  // Liste des sessions
  newChat: "Nouveau chat",
  recentSessions: "Conversations récentes",
  noSessions: "Aucune conversation. Clique sur le bouton pour commencer.",
  untitled: "Sans titre",
  yesterday: "Hier",
  daysAgo: "jours",
  // Statut
  loading: "Chargement…",
  errorPrefix: "Erreur : ",
  processing: "Traitement…",
  streamError: "[Erreur]",
  // Fils
  subThread: "Sous-fil",
  // Menu pin
  pinAction: "Question",
  copy: "Copier",
  // Questions suggérées
  suggestedQuestions: "Questions suggérées",
  customQuestion: "Ou écris ta propre question…",
  // Bulle de message
  collapse: "Réduire",
  expandFull: "Développer",
  chars: "car.",
  rawMode: "Raw",
  mdMode: "MD",
  showRaw: "Afficher le texte brut",
  showMd: "Rendu Markdown",
  // Pièces jointes
  extracting: "Extraction du texte…",
  // Sortie fusionnée
  mergeButton: "Fusionner",
  mergeTitle: "Sortie fusionnée",
  mergeAngles: "sous-questions",
  mergeHint: "Choisis un format et clique sur Générer pour fusionner tout le contenu des pins en un rapport",
  mergeCopyMd: "Copier Markdown",
  mergeDownload: "Télécharger .md",
  mergeGenerating: "Génération…",
  mergeFormatFree: "Résumé libre",
  mergeFormatFreeDesc: "Récit fluide combinant toutes les perspectives",
  mergeFormatBullets: "Points clés",
  mergeFormatBulletsDesc: "Points regroupés par thème",
  mergeFormatStructured: "Analyse structurée",
  mergeFormatStructuredDesc: "Problème → Solution → Trade-offs → Conclusion",
  mergeFormatCustom: "Personnalisé",
  mergeFormatCustomDesc: "Résume à ta façon",
  mergeFormatTranscript: "Transcription brute",
  mergeFormatTranscriptDesc: "Sortie littérale de la conversation",
  mergeCustomPromptPlaceholder: "Décris comment tu veux le résumé, ex. : en mémo pour l'équipe, centré sur les actions…",
  // Problème landing
  // Mode d'emploi
  // Articles
  articles: "Articles",
  // Compte
  logout: "Déconnexion",
  deleteAccount: "Supprimer le compte",
  // Erreurs
  deleteError: "Échec de la suppression : ",
  unknownError: "Erreur inconnue",
  confirmDelete: "Supprimer cette session ? C'est irréversible.",
  // Boîte de dialogue de suppression de fil
  deleteThread: "Supprimer le fil",
  deleteThreadTitle: "Supprimer ce fil et tous ses sous-fils ?",
  deleteSessionTitle: "Supprimer toute cette conversation ?",
  deleteThreadBody: "Les fils en surbrillance seront définitivement supprimés avec tous leurs messages. C'est irréversible.",
  deleteCount: "{n} fil(s) à supprimer",
  deleteCta: "Supprimer",
  deleting: "Suppression…",
  deleteResetView: "Ajuster",
  // Aplatir
  flattenButton: "Aplatir",
  flattenConfirmTitle: "Aplatir cette session ?",
  flattenConfirmBody: "Tous les messages des sous-fils seront fusionnés dans le fil principal en préordre, et tous les pins seront supprimés.\n\nC'est irréversible.",
  flattenConfirmCta: "Confirmer l'aplatissement",
  flattenCancel: "Annuler",
  flattening: "Aplatissement…",
  flattenSuccess: "Aplati : {count} pin(s) fusionné(s)",
  flattenAlready: "Déjà aplati",
  flattenError: "Échec de l'aplatissement : ",
  // Essai anonyme
  anonQuotaTitle: "Limite d'essai gratuit atteinte",
  anonQuotaDesc: "Connecte-toi pour continuer — ta conversation sera conservée.",
  anonSessionLimitTitle: "Essai gratuit : 1 conversation",
  anonSessionLimitDesc: "Connecte-toi pour avoir autant de conversations que tu veux — rien n'est perdu.",
  signInGoogle: "Se connecter avec Google",
  signIn: "Se connecter",
  later: "Plus tard",
  // Sélecteur de langue
  languageLabel: "Langue",
  // Popover au survol de l'ancre
  newReply: "Nouveau",
  enterThread: "Ouvrir",
  generatingSuggestions: "Génération des questions de suivi…",
  // Compteur de quota gratuit
  quotaFree: "restant",
  quotaFull: "Limite d'essai atteinte",
  you: "TOI",
  ai: "Deeppin",
  flattenPreviewBefore: "Avant",
  flattenPreviewAfter: "Après",
  flattenPreviewEmpty: "Juste le fil principal — rien à aplatir.",
  mergeHintSelect: "Sélectionne les sous-questions · clic pour basculer",
  mergeSelectAll: "Tout sélectionner",
  mergeSelectNone: "Tout désélectionner",
  mergeCta: "Fusionner {n} sous-question(s)",
  mergeSelectedOf: "{selected} / {total} sélectionnées",
  mergeGeneratingReport: "Génération du rapport…",
  mergeSavedToChat: "Enregistré",
  mergeSaving: "Enregistrement…",
  mergeSaveToChat: "Enregistrer dans le chat",
  mergeReselect: "Re-sélectionner",
  signInTerms: "En te connectant, tu acceptes les Conditions et la Politique de confidentialité de Deeppin.",
  selectMode: "Sélectionner",
  cancel: "Annuler",
};
