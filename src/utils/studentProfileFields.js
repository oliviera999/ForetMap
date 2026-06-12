/**
 * Logique pure de l'éditeur « Mon profil » (StudentProfileEditor) :
 * libellé du type de profil, endpoint de mise à jour selon le compte,
 * options de sélection (espace, mascotte), validation des champs et
 * estimation du poids d'un data URL d'avatar.
 */
import { buildAffiliationSelectOptions } from './affiliationSelectOptions';
import { getVisitMascotCatalog } from './visitMascotCatalog.js';

/** Poids approximatif (octets) du contenu d'un data URL base64. */
export function estimateDataUrlBytes(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  if (!payload) return 0;
  const padding = payload.endsWith('==') ? 2 : (payload.endsWith('=') ? 1 : 0);
  return Math.floor((payload.length * 3) / 4) - padding;
}

/** Libellé du type de profil affiché (admin / prof / élève selon la terminologie). */
export function deriveProfileTypeLabel(student, roleTerms) {
  const roleSlug = String(student?.auth?.roleSlug || '').toLowerCase();
  if (roleSlug === 'admin') return 'admin';
  if (roleSlug.startsWith('prof')) return roleTerms.teacherShort;
  if (roleSlug.startsWith('eleve')) return roleTerms.studentSingular;
  const userType = String(student?.auth?.userType || student?.user_type || '').toLowerCase();
  if (userType === 'teacher' || userType === 'user') return roleTerms.teacherShort;
  if (userType === 'student') return roleTerms.studentSingular;
  return roleTerms.studentSingular;
}

/** Vrai pour un compte enseignant-like (admin, prof* ou user/teacher legacy). */
export function isTeacherLikeAccount(student) {
  const roleSlug = String(student?.auth?.roleSlug || '').toLowerCase();
  const userType = String(student?.auth?.userType || student?.user_type || '').toLowerCase();
  return roleSlug === 'admin' || roleSlug.startsWith('prof') || userType === 'teacher' || userType === 'user';
}

/** Endpoint PATCH de mise à jour du profil selon le type de compte. */
export function profileUpdateEndpoint(student) {
  return isTeacherLikeAccount(student)
    ? '/api/auth/me/profile'
    : `/api/students/${student.id}/profile`;
}

/**
 * Options du sélecteur « Mon espace » : options standards des cartes, plus
 * l'affiliation courante si elle n'y figure pas (valeur en base conservée).
 */
export function buildProfileAffiliationOptions(maps, affiliation, studentAffiliation) {
  const base = buildAffiliationSelectOptions(maps);
  const a = String(affiliation || studentAffiliation || 'both').toLowerCase();
  if (base.some((o) => o.value === a)) return base;
  return [...base, { value: a, label: `${a} (valeur en base)` }];
}

/**
 * Catalogue des mascottes proposables : filtré par la liste d'ids autorisés
 * du réglage public (catalogue complet si la liste est vide/absente).
 */
export function buildVisitMascotOptions(allowedRaw) {
  const allowedIds = Array.isArray(allowedRaw)
    ? allowedRaw.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const base = getVisitMascotCatalog();
  if (!allowedIds.length) return base;
  return base.filter((m) => allowedIds.includes(String(m?.id || '').trim()));
}

/**
 * Validation des champs avant enregistrement du profil.
 * Retourne le message d'erreur à afficher, ou '' si tout est valide.
 */
export function validateProfileEditorFields({ pseudo, email, description, currentPassword }) {
  if (!currentPassword) return 'Mot de passe actuel requis';
  if (String(pseudo || '').trim() && !/^[A-Za-z0-9_.-]{3,30}$/.test(String(pseudo).trim())) {
    return 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)';
  }
  if (String(email || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return 'Email invalide';
  }
  if (String(description || '').trim().length > 300) {
    return 'Description trop longue (max 300 caractères)';
  }
  return '';
}
