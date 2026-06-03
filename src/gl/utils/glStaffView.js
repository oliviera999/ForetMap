/** Staff GL (MJ / admin) — aperçu UI et prise de contrôle joueur. */

export function isGlStaffAuth(auth) {
  return auth?.userType === 'gl_admin' && !auth?.impersonating;
}

export function canGlStaffImpersonate(auth) {
  if (!isGlStaffAuth(auth)) return false;
  const slug = String(auth?.roleSlug || '').toLowerCase();
  return slug === 'gl_admin' || slug === 'gl_mj';
}

export function glImpersonationBannerCopy(impersonatedBy) {
  const roleSlug = String(impersonatedBy?.roleSlug || 'gl_admin').toLowerCase();
  const isMj = roleSlug === 'gl_mj';
  return {
    title: isMj ? 'Prise de contrôle (MJ GL)' : 'Prise de contrôle (admin GL)',
    stopLabel: isMj ? 'Revenir à mon compte MJ' : 'Revenir à mon compte admin',
  };
}
