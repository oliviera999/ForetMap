'use strict';

// =====================================================================
// Rattachements question <-> ressource : approbation EN LOT et garde-fou de type.
// Commun aux deux produits (tables `resource_question_links` et `gl_resource_question_links`).
//
// Deux problemes constates a l'usage :
//
//  1. Le rattachement automatique insere en `status = 'suggested'`, alors que le
//     conditionnement n'accepte que `'approved'`. Sur quarante propositions, il fallait
//     donc quarante changements de liste deroulante, un par ligne. Personne n'allait au
//     bout : l'ecran produisait des liens que rien n'activait jamais.
//
//  2. Un lien peut viser un type que le produit ne sait pas VALIDER. Cote ForetMap, seuls
//     `tutorial` et `plant` portent un bouton « marquer » ; un lien bloquant sur un terme
//     de glossaire etait accepte sans un mot, et restait inerte pour toujours. Le
//     professeur croyait avoir conditionne une fiche.
// =====================================================================

const { FM_MARKABLE, GL_MARKABLE } = require('./learningGatingRuntime');

/** Plafond d'une approbation en lot : garde-fou, et invite a filtrer plutot qu'a tout prendre. */
const BULK_MAX = 200;

function tableFor(product) {
  return String(product).toLowerCase() === 'gl'
    ? 'gl_resource_question_links'
    : 'resource_question_links';
}

function markableFor(product) {
  return String(product).toLowerCase() === 'gl' ? GL_MARKABLE : FM_MARKABLE;
}

/**
 * Le produit sait-il VALIDER ce type de ressource ? Un lien bloquant sur un type non
 * validable ne conditionnera jamais rien.
 */
function isMarkableResourceType(product, resourceType) {
  return markableFor(product).has(String(resourceType || ''));
}

/**
 * Message expliquant pourquoi un lien bloquant est refuse sur ce type — il doit dire ce
 * qui manque, pas seulement que c'est interdit.
 */
function nonMarkableGatingError(product, resourceType) {
  const known = [...markableFor(product)].join(', ');
  return (
    `Le type « ${resourceType} » n'a pas de validation de lecture dans cette application : ` +
    `un lien bloquant y resterait sans effet. Types validables : ${known}. ` +
    `Le lien reste possible en non bloquant (valeur documentaire).`
  );
}

/**
 * Approbation / rejet en lot des rattachements, pour les deux produits.
 *
 * Deux formes, et une seule route par produit (`POST .../review`) :
 *   - par `ids` : agit sur les lignes designees, quel que soit leur statut — c'est la
 *     forme historique, inchangee ;
 *   - par ressource : agit sur les seules propositions (`status = 'suggested'`) de cette
 *     ressource. C'est celle qui manquait, et sans laquelle le rattachement automatique
 *     ne debouchait sur rien.
 *
 * Ne touche QUE `status` : le caractere bloquant (`is_gating`) reste la decision explicite
 * du professeur, ligne par ligne. Approuver n'est pas conditionner.
 *
 * @param {object} db objet portant `execute`
 * @param {object} params
 * @param {'fm'|'gl'} params.product
 * @param {'approved'|'rejected'} params.status
 * @param {Array<number|string>} [params.ids]
 * @param {string} [params.resourceType]
 * @param {string} [params.resourceRef]
 * @returns {Promise<{ updated: number }>}
 */
async function reviewSuggestedLinks(db, { product, status, ids, resourceType, resourceRef } = {}) {
  const table = tableFor(product);
  if (status !== 'approved' && status !== 'rejected') return { updated: 0 };

  const wanted = (Array.isArray(ids) ? ids : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
    .slice(0, BULK_MAX);

  if (wanted.length > 0) {
    const placeholders = wanted.map(() => '?').join(', ');
    const res = await db.execute(
      `UPDATE ${table} SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
      [status, ...wanted],
    );
    return { updated: res?.affectedRows || 0 };
  }

  if (!resourceType || !resourceRef) return { updated: 0 };
  const res = await db.execute(
    `UPDATE ${table} SET status = ?, updated_at = NOW()
      WHERE status = 'suggested' AND resource_type = ? AND resource_ref = ?`,
    [status, resourceType, resourceRef],
  );
  return { updated: res?.affectedRows || 0 };
}

module.exports = {
  BULK_MAX,
  isMarkableResourceType,
  nonMarkableGatingError,
  reviewSuggestedLinks,
};
