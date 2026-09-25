'use strict';

/**
 * Éligibilité des questions selon le niveau de l'apprenant (audit du 25/09/2026, § 3.2.2).
 *
 * Règle : **le niveau propre du contenu fait barrière** — une question de palier d'entrée
 * supérieur au palier maximal de l'élève n'est pas posée pour verrouiller une fiche. Les
 * notions, elles, ne servent qu'au ciblage thématique (quiz, séances).
 *
 * Repli (décision du mainteneur du 25/09, Q1 : « garde les questions ») : si le filtre ne
 * laisse **aucune** question à une fiche qui en a, on garde toutes ses questions — la fiche
 * n'est jamais ouverte par le seul effet du filtre de niveau. Le repli est **signalé**
 * (`levelFallback: 'all_levels'`), jamais implicite.
 */

const { quizNiveauEntryPalier } = require('../pedagoScales');

/**
 * @param {Array<{ question_niveau?: string|null }>} links liens bloquants (question active)
 * @param {{ maxPalier?: number|null }|null} learnerLevel sortie de `loadLearnerLevel`
 * @returns {{ links: object[], levelFallback: 'none'|'all_levels', outOfLevel: number }}
 */
function filterGatingLinksByLevel(links, learnerLevel) {
  const list = Array.isArray(links) ? links : [];
  const max =
    learnerLevel && learnerLevel.maxPalier != null ? Number(learnerLevel.maxPalier) : null;
  if (max == null || !Number.isFinite(max) || list.length === 0) {
    return { links: list, levelFallback: 'none', outOfLevel: 0 };
  }
  const eligible = list.filter((link) => {
    const entry = quizNiveauEntryPalier(link?.question_niveau);
    return entry == null || entry <= max;
  });
  if (eligible.length === list.length) {
    return { links: list, levelFallback: 'none', outOfLevel: 0 };
  }
  if (eligible.length === 0) {
    return { links: list, levelFallback: 'all_levels', outOfLevel: list.length };
  }
  return { links: eligible, levelFallback: 'none', outOfLevel: list.length - eligible.length };
}

module.exports = { filterGatingLinksByLevel };
