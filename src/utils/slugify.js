/**
 * Slugification accent-consciente, côté navigateur.
 *
 * Pourquoi ce module existe (audit docs/AUDIT_BDD_2026-08.md §5.5) : la base de production
 * porte les slugs de rôle `el_ve_expert` (« élève expert ») et `n3beur_b_b` (« n3beur
 * bébé »). Le motif `[^a-z0-9]` **supprime** un caractère accentué au lieu de le
 * translittérer : `é` disparaît, et l'identifiant technique devient illisible — alors que
 * c'est lui qui apparaît en URL et dans les réponses d'API.
 *
 * La décomposition NFD sépare la lettre de son diacritique ; on retire alors les seuls
 * signes combinants (U+0300–U+036F), ce qui laisse la lettre de base. Même règle que
 * `slugify()` de `lib/tutorialRouteHelpers.js` côté serveur — garder les deux alignés.
 *
 * @param {unknown} input texte libre (nom de groupe, libellé de profil…)
 * @param {{ separator?: string, maxLength?: number }} [options] séparateur `-` (défaut) ou `_`
 * @returns {string} slug (chaîne vide si l'entrée ne contient aucun caractère utilisable)
 */
export function slugify(input, options = {}) {
  const separator = options.separator === '_' ? '_' : '-';
  const maxLength =
    Number.isFinite(options.maxLength) && options.maxLength > 0 ? options.maxLength : 180;
  const trimEdges = new RegExp(`^\\${separator}+|\\${separator}+$`, 'g');
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, separator)
    .slice(0, maxLength)
    .replace(trimEdges, '');
}

export default slugify;
