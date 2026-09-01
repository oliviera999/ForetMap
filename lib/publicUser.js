'use strict';

/**
 * Projection publique d'une ligne `users`.
 *
 * Les routes renvoyaient la ligne entière en masquant le secret **par liste noire**
 * (`{ ...row, password_hash: undefined }`, répété à huit endroits). Ça marche tant que la
 * table ne gagne pas de colonne sensible : le jour où une migration ajoute un jeton de
 * réinitialisation, un secret TOTP ou un identifiant de fournisseur, il part au client
 * dans chacun de ces huit endroits, silencieusement.
 *
 * La liste blanche inverse la charge de la preuve : une colonne nouvelle n'est exposée que
 * si quelqu'un l'ajoute ici, en connaissance de cause.
 */

/** Colonnes de `users` exposables au client (aucun secret, aucune colonne d'authentification). */
const PUBLIC_USER_FIELDS = [
  'id',
  'user_type',
  'legacy_user_id',
  'email',
  'pseudo',
  'first_name',
  'last_name',
  'display_name',
  'description',
  'avatar_path',
  'affiliation',
  'visit_mascot_catalog_id',
  'auth_provider',
  'is_active',
  'last_seen',
  'created_at',
  'updated_at',
];

/**
 * @param {object|null|undefined} row Ligne `users` (ou objet enrichi de champs calculés).
 * @param {object} [extra] Champs ajoutés à la projection (rôle, jeton de session…).
 * @returns {object|null}
 */
function toPublicUserRow(row, extra = {}) {
  if (row == null || typeof row !== 'object') return null;
  const out = {};
  for (const field of PUBLIC_USER_FIELDS) {
    if (field in row) out[field] = row[field];
  }
  return { ...out, ...extra };
}

module.exports = {
  PUBLIC_USER_FIELDS,
  toPublicUserRow,
};
