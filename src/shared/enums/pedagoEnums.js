/**
 * Référentiel des valeurs énumérées — domaine **pédagogie** (niveaux, quiz, glossaire,
 * notions du programme, liens question ↔ ressource). Voir `enumCore.js` pour la forme des
 * définitions et `lib/pedagoScales.js` pour les **correspondances** entre échelles de niveau
 * (ce module ne dit que les valeurs et leurs libellés).
 *
 * Miroir CJS : `lib/shared/pedagoEnums.js` (généré, ne pas éditer).
 */

import { defineEnum, defineSubset, isEnumValue } from './enumCore.js';

/**
 * Étape d'affichage (Collège / Lycée / Université) : affichage biodiversité du compte, de
 * la carte et du groupe, public visé d'une séance. Depuis la décision du 25/09/2026
 * (question 4), ce n'est plus qu'un **regroupement d'affichage** de l'échelle de l'apprenant.
 */
export const PEDAGO_ETAPE_ENUM = defineEnum('PEDAGO_ETAPE_ENUM', {
  values: ['college', 'lycee', 'universite'],
  labels: { college: 'Collège', lycee: 'Lycée', universite: 'Université' },
  columns: [
    'users.biodiv_pedago_level',
    'groups.pedago_level',
    'maps.pedago_level',
    'pedago_sessions.level',
  ],
});

/** Niveau propre d'un contenu (question de quiz, clé d'identification) : pas d'université. */
export const QUESTION_NIVEAU_ENUM = defineSubset(
  'QUESTION_NIVEAU_ENUM',
  PEDAGO_ETAPE_ENUM,
  'PEDAGO_ETAPE_ENUM',
  { values: ['college', 'lycee'], columns: ['quiz_questions.niveau', 'id_keys.niveau'] },
);

/**
 * **Échelle unique de l'apprenant** (décision du 25/09/2026, question 4) : niveaux du
 * programme, plus `universite` au-delà du secondaire. Domaine de `groups.curriculum_niveau`
 * depuis la migration 301.
 */
export const LEARNER_NIVEAU_ENUM = defineEnum('LEARNER_NIVEAU_ENUM', {
  values: [
    'cycle3',
    'cycle4',
    'seconde',
    'premiere_spe',
    'terminale_spe',
    'es_premiere',
    'es_terminale',
    'universite',
  ],
  labels: {
    cycle3: 'Cycle 3 (CM1–6e)',
    cycle4: 'Cycle 4 (5e–3e)',
    seconde: 'Seconde',
    premiere_spe: 'Première — spécialité SVT',
    terminale_spe: 'Terminale — spécialité SVT',
    es_premiere: 'Première — enseignement scientifique',
    es_terminale: 'Terminale — enseignement scientifique',
    universite: 'Université (au-delà du lycée)',
  },
  columns: ['groups.curriculum_niveau'],
});

/** Niveaux scolaires des notions du programme : aucune notion n'est propre à l'université. */
export const CURRICULUM_NIVEAU_ENUM = defineSubset(
  'CURRICULUM_NIVEAU_ENUM',
  LEARNER_NIVEAU_ENUM,
  'LEARNER_NIVEAU_ENUM',
  {
    values: [
      'cycle3',
      'cycle4',
      'seconde',
      'premiere_spe',
      'terminale_spe',
      'es_premiere',
      'es_terminale',
    ],
    columns: ['curriculum_notions.niveau'],
  },
);

/** Profondeur d'un terme de glossaire (et non la classe où il est travaillé). */
export const GLOSSARY_NIVEAU_ENUM = defineEnum('GLOSSARY_NIVEAU_ENUM', {
  values: ['base', 'approfondissement', 'avance'],
  labels: { base: 'Base', approfondissement: 'Approfondissement', avance: 'Avancé' },
  columns: ['glossary_terms.niveau'],
});

/** Exception au rattachement d'un contenu aux notions de sa catégorie. */
export const NOTION_LINK_MODE_ENUM = defineEnum('NOTION_LINK_MODE_ENUM', {
  values: ['ajout', 'exclusion'],
  labels: { ajout: 'Notion ajoutée', exclusion: 'Notion exclue' },
  columns: ['glossary_term_notions.mode', 'quiz_question_notions.mode'],
});

/** Thème d'une catégorie du quiz. */
export const QUIZ_THEME_ENUM = defineEnum('QUIZ_THEME_ENUM', {
  values: ['sciences', 'jardinage'],
  labels: { sciences: 'Sciences du vivant', jardinage: 'Jardinage' },
  columns: ['quiz_categories.theme'],
});

/** Lettre de la bonne réponse d'une question (choix A à E). */
export const QUIZ_ANSWER_LETTER_ENUM = defineEnum('QUIZ_ANSWER_LETTER_ENUM', {
  values: ['A', 'B', 'C', 'D', 'E'],
  labels: { A: 'Choix A', B: 'Choix B', C: 'Choix C', D: 'Choix D', E: 'Choix E' },
  columns: ['quiz_questions.reponse_correcte'],
});

/**
 * Difficulté d'une question (`quiz_questions.difficulte`, tinyint, NULL = non renseignée).
 * Elle classe les questions **à l'intérieur** de leur niveau. Le corpus va de 1 à 3 : c'est
 * l'échelle (audit du 25/09/2026, § 1.2.6 — un menu proposait 1 à 5, les filtres 4 et 5 ne
 * trouvaient rien).
 *
 * Les libellés sont ceux de `quiz_questions.difficulte_label` (étoile U+2B50), colonne
 * désormais **dérivée** de la difficulté (§ 3.5) : voir `quizDifficulteLabel`.
 */
export const QUIZ_DIFFICULTE_ENUM = defineEnum('QUIZ_DIFFICULTE_ENUM', {
  values: [1, 2, 3],
  labels: { 1: '⭐ Facile', 2: '⭐⭐ Moyen', 3: '⭐⭐⭐ Difficile' },
  columns: ['quiz_questions.difficulte'],
});

/**
 * Libellé de difficulté dérivé de la difficulté (1, 2, 3, ou leur écriture en chaîne), ou
 * `null` pour une difficulté absente ou hors échelle. Remplace la lecture et l'écriture
 * libres de `quiz_questions.difficulte_label` (retrait en trois temps, audit § 3.5).
 */
export function quizDifficulteLabel(difficulte) {
  if (difficulte == null || difficulte === '') return null;
  const value = Number(difficulte);
  return isEnumValue(QUIZ_DIFFICULTE_ENUM, value) ? QUIZ_DIFFICULTE_ENUM.labels[value] : null;
}

/**
 * Statut éditorial d'un contenu (question de quiz, terme de glossaire), `varchar` sans
 * contrainte en base : seul `actif` est montré aux élèves.
 */
export const CONTENT_STATUT_ENUM = defineEnum('CONTENT_STATUT_ENUM', {
  values: ['actif', 'inactif'],
  labels: { actif: 'Actif', inactif: 'Inactif' },
  columns: ['quiz_questions.statut', 'glossary_terms.statut'],
});

/**
 * Statut d'un lien question ↔ ressource (`varchar`). Seul `approved` compte pour la fiche et
 * pour le verrouillage.
 */
export const RESOURCE_LINK_STATUS_ENUM = defineEnum('RESOURCE_LINK_STATUS_ENUM', {
  values: ['approved', 'suggested', 'rejected'],
  labels: { approved: 'Approuvé', suggested: 'Proposé', rejected: 'Rejeté' },
  columns: ['resource_question_links.status'],
});

/** Origine d'un lien question ↔ ressource (`varchar`). */
export const RESOURCE_LINK_ORIGIN_ENUM = defineEnum('RESOURCE_LINK_ORIGIN_ENUM', {
  values: ['manual', 'auto', 'import', 'generated', 'keyword', 'editorial'],
  labels: {
    manual: 'Saisi par un professeur',
    auto: 'Proposition automatique',
    import: 'Livré puis relu',
    generated: 'Script d’enrichissement',
    keyword: 'Rapprochement par mots-clés',
    editorial: 'Reprise éditoriale',
  },
  columns: ['resource_question_links.origin'],
});
