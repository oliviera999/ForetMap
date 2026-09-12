/**
 * Profils proposés à la création unitaire (alignés sur l’import CSV / `IMPORT_ROLE_DEFINITIONS`).
 * Ordre d’affichage stable.
 */
export const UNITARY_CREATE_ROLE_SLUGS = [
  'visiteur',
  'personnel',
  'eleve_novice',
  'eleve_avance',
  'eleve_chevronne',
  'prof_classe',
  'prof',
  'admin',
];

export function isStudentUnitaryCreateRole(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  return s === 'visiteur' || s === 'personnel' || s.startsWith('eleve_');
}

/**
 * Options de profil pour le select de création unitaire.
 * @param {{ roles?: Array<{ slug?: string, display_name?: string }>, isAdmin?: boolean, canCreateTeacherRoles?: boolean }} opts
 */
export function buildUnitaryCreateRoleOptions({
  roles = [],
  isAdmin = false,
  canCreateTeacherRoles = false,
} = {}) {
  const labelBySlug = new Map();
  for (const r of roles) {
    const slug = String(r?.slug || '')
      .trim()
      .toLowerCase();
    if (!slug) continue;
    const label = String(r?.display_name || '').trim();
    if (label) labelBySlug.set(slug, label);
  }
  const fallback = {
    visiteur: 'Visiteur',
    personnel: 'Personnel',
    eleve_novice: 'n3beur novice',
    eleve_avance: 'n3beur avancé',
    eleve_chevronne: 'n3beur chevronné',
    prof_classe: 'Prof de classe',
    prof: 'n3boss',
    admin: 'Administrateur',
  };
  return UNITARY_CREATE_ROLE_SLUGS.filter((slug) => {
    if (slug === 'admin') return !!isAdmin;
    if (slug === 'prof' || slug === 'prof_classe') return !!canCreateTeacherRoles || !!isAdmin;
    return true;
  }).map((slug) => ({
    value: slug,
    label: labelBySlug.get(slug) || fallback[slug] || slug,
  }));
}
