/**
 * Logique pure de l'éditeur « Mon profil » (StudentProfileEditor) :
 * libellé du type de profil, endpoint de mise à jour selon le compte,
 * options de sélection (mascotte), validation des champs et
 * estimation du poids d'un data URL d'avatar.
 */
import { buildVisitMascotSelectionOptions } from './visitMascotCatalog.js';
import { PSEUDO_RE, PSEUDO_INVALID_MSG } from './pseudoValidation';

/** Poids approximatif (octets) du contenu d'un data URL base64. */
export function estimateDataUrlBytes(dataUrl) {
  const payload = String(dataUrl || '').split(',')[1] || '';
  if (!payload) return 0;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
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
  return (
    roleSlug === 'admin' ||
    roleSlug.startsWith('prof') ||
    userType === 'teacher' ||
    userType === 'user'
  );
}

/** Endpoint PATCH de mise à jour du profil selon le type de compte. */
export function profileUpdateEndpoint(student) {
  return isTeacherLikeAccount(student)
    ? '/api/auth/me/profile'
    : `/api/students/${student.id}/profile`;
}

/**
 * Mascottes proposables dans « Mon profil » : **même liste que sur le plan** —
 * mascottes livrées et packs publiés (`extraEntries`), filtrées par la liste d'ids
 * autorisés du réglage public (liste vide = aucune restriction).
 */
export function buildVisitMascotOptions(allowedRaw, extraEntries = []) {
  return buildVisitMascotSelectionOptions(extraEntries, allowedRaw);
}

/**
 * Validation des champs avant enregistrement du profil.
 * Retourne le message d'erreur à afficher, ou '' si tout est valide.
 */
export function validateProfileEditorFields({ pseudo, email, description }) {
  // Le mot de passe actuel n'est plus exigé côté client : un compte Google n'en a pas, et
  // c'est le serveur qui sait s'il faut le redemander (`verifyCurrentPassword`, CDG-42).
  if (String(pseudo || '').trim() && !PSEUDO_RE.test(String(pseudo).trim())) {
    return PSEUDO_INVALID_MSG;
  }
  if (String(email || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return 'Email invalide';
  }
  if (String(description || '').trim().length > 300) {
    return 'Description trop longue (max 300 caractères)';
  }
  return '';
}

/**
 * Validation du formulaire « Changer mon mot de passe » (le plancher de longueur est
 * vérifié par le serveur selon le type de compte).
 */
export function validatePasswordChangeFields({ newPassword, confirmPassword }) {
  if (!String(newPassword || '')) return 'Nouveau mot de passe requis';
  if (String(newPassword) !== String(confirmPassword || '')) {
    return 'Les deux mots de passe ne correspondent pas';
  }
  return '';
}
