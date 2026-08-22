/**
 * Résolution d'un texte selon le rôle du lecteur — noyau partagé ForetMap / G&L.
 *
 * Un même écran est lu par deux publics : côté ForetMap l'élève et le prof, côté GL
 * le joueur et le MJ. Le texte « de service » (celui du second public) est **optionnel**
 * partout : son absence fait retomber sur le texte principal, jamais sur du vide.
 *
 * @param {object|null} entry      objet portant les deux variantes
 * @param {boolean} isStaff        vrai pour le prof (FM) ou le MJ/admin (GL)
 * @param {object} [fields]        noms des champs, par défaut ceux de ForetMap
 * @param {string} [fields.base]   champ du texte principal (défaut `text`)
 * @param {string} [fields.staff]  champ du texte de service (défaut `textTeacher`)
 * @returns {string}
 */
export function resolveRoleTextFrom(entry, isStaff, { base = 'text', staff = 'textTeacher' } = {}) {
  if (!entry) return '';
  if (isStaff && entry[staff]) return entry[staff];
  return entry[base] || '';
}
