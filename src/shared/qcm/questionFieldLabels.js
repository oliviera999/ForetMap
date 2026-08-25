/**
 * Libellés français des champs de la fiche question (éditeurs QCM/Quiz).
 *
 * Le panneau générique `QuestionEditorPanel` affichait jusqu'ici le NOM DE COLONNE brut,
 * simplement débarrassé de ses underscores : « numero dans categorie », « reponse texte »,
 * « photo legende », « notes pedagogiques »… sans accent ni majuscule. Côté professeur,
 * plusieurs champs étaient de ce fait illisibles ou ambigus — en particulier les six
 * `feedback_*`, dont rien ne disait à quel choix ils se rattachaient.
 *
 * La table couvre les trois éditeurs (Quiz ForetMap, QCM biomes GL, QCM lore GL) ; toute
 * clé absente retombe sur `humanizeQuestionField` (underscores → espaces + capitale).
 */

export const QUESTION_FIELD_LABELS = {
  question_code: 'Code de la question',
  biome_slug: 'Biome (slug)',
  chapitre_slug: 'Chapitre (slug)',
  categorie_slug: 'Catégorie',
  numero_dans_categorie: 'Numéro dans la catégorie',
  tier_lore: 'Palier de lore',
  niveau: 'Niveau',
  difficulte: 'Difficulté (1 à 5)',
  difficulte_label: 'Libellé de difficulté',
  statut: 'Statut',
  question: 'Énoncé de la question',
  choix_a: 'Choix A',
  choix_b: 'Choix B',
  choix_c: 'Choix C',
  choix_d: 'Choix D',
  choix_e: 'Choix E',
  reponse_correcte: 'Bonne réponse',
  reponse_texte: 'Réponse rédigée',
  feedback_correct: 'Explication après une bonne réponse',
  feedback_a: 'Explication si l’élève choisit A',
  feedback_b: 'Explication si l’élève choisit B',
  feedback_c: 'Explication si l’élève choisit C',
  feedback_d: 'Explication si l’élève choisit D',
  feedback_e: 'Explication si l’élève choisit E',
  notes_pedagogiques: 'Notes pédagogiques (usage interne)',
  source_lore: 'Source dans le lore',
  tags: 'Étiquettes',
  mots_cles: 'Mots-clés',
  photo_url: 'Photo — adresse (URL)',
  photo_credit: 'Photo — crédit (auteur / source)',
  photo_licence: 'Photo — licence',
  photo_legende: 'Photo — légende (affichée sous l’image)',
};

/** Repli lisible pour une clé inconnue : `mots_cles` → « Mots cles ». */
export function humanizeQuestionField(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  const spaced = raw.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Libellé d'affichage d'un champ de la fiche question. */
export function questionFieldLabel(key) {
  return QUESTION_FIELD_LABELS[key] || humanizeQuestionField(key);
}
