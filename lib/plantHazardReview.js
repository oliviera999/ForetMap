'use strict';

/**
 * Invalidation de la relecture des dangers d'une fiche espèce (migration 271).
 *
 * `hazard_reviewed` dit qu'un enseignant a relu ce qui était écrit. Si le texte change
 * ensuite, la coche ne dit plus rien : elle certifie une version qui n'existe plus. Le cas
 * qui rend la règle nécessaire n'est pas malveillant, il est ordinaire — une fiche validée,
 * puis un collègue qui corrige la conduite à tenir six mois plus tard, et l'avertissement
 * repasse en « validé » sans que personne n'ait relu la correction.
 *
 * La comparaison passe par une forme canonique : MySQL rend `null` là où le formulaire
 * envoie `''`, et un texte re-soumis à l'identique avec un espace en fin ne doit pas
 * dévalider la fiche.
 */

/**
 * Colonnes dont une modification annule la relecture. Les deux colonnes sanitaires en font
 * partie : un risque de rage ajouté après validation n'a, lui non plus, pas été relu.
 */
const HAZARD_REVIEW_TRACKED_FIELDS = Object.freeze([
  'toxicity_level',
  'hazard_exposure',
  'hazard_notes',
  'health_risk',
  'health_notes',
]);

function canonicalValue(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Vrai si le passage de `before` à `after` doit remettre la fiche « à valider ».
 * @param {object} before Ligne `plants` avant écriture.
 * @param {object} after Payload prêt à écrire (déjà normalisé).
 */
function hazardReviewInvalidated(before, after) {
  return HAZARD_REVIEW_TRACKED_FIELDS.some(
    (field) => canonicalValue(before?.[field]) !== canonicalValue(after?.[field]),
  );
}

module.exports = {
  HAZARD_REVIEW_TRACKED_FIELDS,
  hazardReviewInvalidated,
};
