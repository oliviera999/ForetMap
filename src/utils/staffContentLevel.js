/**
 * Libellés d'interface du niveau de contenu d'un compte non élève (demande du 22/11/2026) :
 * choix de « Mon profil » et libellé du niveau résolu (`resolveLearnerLevel`, staff). Séparé
 * de `learnerLevel.js` pour rester hors du bundle de l'écran de connexion : seuls le menu
 * Aperçu et « Mon profil », chargés à la demande, s'en servent.
 */

import { STAFF_CONTENT_LEVEL_FULL, STAFF_CONTENT_LEVEL_ENUM } from '../shared/enums/pedagoEnums.js';

/**
 * Choix proposés par « Mon profil » à un compte non élève (référentiel
 * `STAFF_CONTENT_LEVEL_ENUM`) : les niveaux du programme, l'université, puis « Complet ».
 */
export const STAFF_CONTENT_LEVEL_OPTIONS = Object.freeze(
  STAFF_CONTENT_LEVEL_ENUM.values.map((value) =>
    Object.freeze({ value, label: STAFF_CONTENT_LEVEL_ENUM.labels[value] }),
  ),
);

/** Mention de l'origine d'un niveau de compte non élève, pour les libellés d'interface. */
const STAFF_SOURCE_HINTS = Object.freeze({
  seance: 'séance en cours',
  profil: 'mon choix',
  classe: 'mes groupes',
  defaut: 'par défaut',
});

/**
 * Libellé d'un niveau résolu de compte non élève : « Cycle 4 (5e–3e) — mes groupes »,
 * « Complet (vue gestion) »… (`''` sans niveau).
 * @param {{ niveau?: string|null, sources?: { niveau?: string } }|null} learner
 */
export function staffContentLevelLabel(learner) {
  if (!learner) return '';
  const source = learner.sources?.niveau;
  if (source === 'vue_complete') return STAFF_CONTENT_LEVEL_ENUM.labels[STAFF_CONTENT_LEVEL_FULL];
  const label = STAFF_CONTENT_LEVEL_ENUM.labels[learner.niveau] || '';
  const hint = STAFF_SOURCE_HINTS[source];
  return label && hint ? `${label} — ${hint}` : label;
}
