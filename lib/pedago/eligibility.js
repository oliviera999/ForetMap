'use strict';

/**
 * Éligibilité des questions selon le niveau de l'apprenant (audit du 25/09/2026, § 3.2.2 ;
 * chantier collège de novembre 2026).
 *
 * Règle : **le palier d'entrée de la question fait barrière** — une question de palier
 * d'entrée supérieur au plafond de l'élève n'est pas posée pour verrouiller une fiche. Le
 * palier d'entrée est **effectif** : une question de collège entre au cycle 3 si une de ses
 * notions effectives est de cycle 3, sinon au cycle 4 (`quizQuestionEntryPalier`, colonne
 * `question_entry_palier` des liens). Le plafond est le plus bas du `maxPalier` de l'élève
 * et de la règle de palier `quiz_entry_palier_max` (table de visibilité).
 *
 * Replis, quand le filtre ne laisse **aucune** question à une fiche qui en a :
 *
 * - **collégien** (niveau de contenu `college`) : jamais au-delà du cycle 4. On garde ses
 *   questions de collège (`levelFallback: 'college_levels'`) ; s'il ne reste que des
 *   questions de lycée, la fiche **n'est pas verrouillée** pour lui
 *   (`levelFallback: 'unlocked'`, aucune question) et le repli est journalisé ;
 * - autres élèves (décision du mainteneur du 25/09, Q1 : « garde les questions ») : toutes
 *   ses questions (`levelFallback: 'all_levels'`).
 *
 * Le repli est toujours **signalé**, jamais implicite.
 */

const {
  COLLEGE_MAX_PALIER,
  quizNiveauEntryPalier,
  quizEntryPalierCap,
} = require('../pedagoScales');
const { palierRuleFor } = require('../shared/pedagoVisibilityCore');
const logger = require('../logger');

/** Valeurs de `levelFallback`, dans l'ordre de gravité. */
const LEVEL_FALLBACKS = Object.freeze(['none', 'college_levels', 'unlocked', 'all_levels']);

/** Palier d'entrée d'un lien : effectif s'il est connu, sinon celui du niveau de la question. */
function linkEntryPalier(link) {
  const effective = link?.question_entry_palier;
  if (effective != null && effective !== '') {
    const n = Number(effective);
    if (Number.isFinite(n)) return n;
  }
  return quizNiveauEntryPalier(link?.question_niveau);
}

/** Plafond de palier d'un apprenant (`maxPalier` ∧ règle `quiz_entry_palier_max`), ou `null`. */
function learnerEntryPalierCap(learnerLevel) {
  if (!learnerLevel || typeof learnerLevel !== 'object') return null;
  // Sans palier (professeur, université) : aucun plafond. Sans ce garde, un apprenant sans
  // `niveau` tombait dans le profil cycle 3 de la table et recevait le plafond 1.
  if (learnerLevel.maxPalier == null) return null;
  // La règle de palier ne vaut que pour un apprenant résolu (étape ou niveau connus) : un
  // simple `{ maxPalier }` garde son seul plafond.
  const resolved = learnerLevel.etape != null || learnerLevel.niveau != null;
  return quizEntryPalierCap({
    maxPalier: learnerLevel.maxPalier,
    ruleCap: resolved ? palierRuleFor('quiz_entry_palier_max', learnerLevel) : null,
  });
}

/**
 * Collégien : niveau de contenu `college` (classe de cycle 3 ou 4, séance collège, ou repli
 * d'affichage collège). L'affichage seul (préférence) ne compte pas : c'est le niveau qui
 * fixe les questions.
 */
function isCollegeLearner(learnerLevel) {
  if (!learnerLevel || typeof learnerLevel !== 'object') return false;
  const etape = learnerLevel.contentEtape ?? learnerLevel.etape;
  return String(etape || '') === 'college';
}

function underCap(cap) {
  return (link) => {
    const entry = linkEntryPalier(link);
    return entry == null || entry <= cap;
  };
}

/**
 * @param {Array<{ question_code?: string, question_niveau?: string|null,
 *   question_entry_palier?: number|null }>} links liens bloquants (question active)
 * @param {{ maxPalier?: number|null, etape?: string|null, contentEtape?: string|null,
 *   niveau?: string|null }|null} learnerLevel sortie de `loadLearnerLevel`
 * @returns {{ links: object[], levelFallback: 'none'|'college_levels'|'unlocked'|'all_levels',
 *   outOfLevel: number }}
 */
function filterGatingLinksByLevel(links, learnerLevel) {
  const list = Array.isArray(links) ? links : [];
  const max = learnerEntryPalierCap(learnerLevel);
  if (max == null || list.length === 0) {
    return { links: list, levelFallback: 'none', outOfLevel: 0 };
  }
  const eligible = list.filter(underCap(max));
  if (eligible.length === list.length) {
    return { links: list, levelFallback: 'none', outOfLevel: 0 };
  }
  if (eligible.length > 0) {
    return { links: eligible, levelFallback: 'none', outOfLevel: list.length - eligible.length };
  }
  if (!isCollegeLearner(learnerLevel)) {
    return { links: list, levelFallback: 'all_levels', outOfLevel: list.length };
  }
  const college = list.filter(underCap(COLLEGE_MAX_PALIER));
  if (college.length > 0) {
    return {
      links: college,
      levelFallback: 'college_levels',
      outOfLevel: list.length - college.length,
    };
  }
  logger.info(
    {
      niveau: learnerLevel.niveau ?? null,
      maxPalier: max,
      questionCodes: list.map((link) => link?.question_code).filter(Boolean),
    },
    'Verrouillage : fiche gardée seulement par des questions de lycée, non verrouillée pour un collégien',
  );
  return { links: [], levelFallback: 'unlocked', outOfLevel: list.length };
}

module.exports = {
  LEVEL_FALLBACKS,
  linkEntryPalier,
  learnerEntryPalierCap,
  isCollegeLearner,
  filterGatingLinksByLevel,
};
