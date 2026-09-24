import { PEDAGO_LEVEL_LABELS, normalizePedagoLevel } from './biodivPedagoLevel.js';
import { getRoleTerms } from './n3-terminology.js';

/**
 * Décrit l'aperçu actif du menu « Aperçu » de l'en-tête : vue de rôle simulée
 * (`roleViewMode`) et niveau d'affichage biodiversité forcé (`teacherPreview`).
 * Source unique des libellés du bouton, du panneau et de la bannière.
 *
 * @param {object} params
 * @param {'native'|'student'|'teacher'} [params.roleViewMode]
 * @param {string|null} [params.teacherPreview]
 * @param {object} [params.roleTerms]
 * @returns {{
 *   active: boolean,
 *   roleActive: boolean,
 *   levelActive: boolean,
 *   roleLabel: string,
 *   levelLabel: string,
 *   summary: string,
 * }}
 */
export function describeAppPreview({
  roleViewMode = 'native',
  teacherPreview = null,
  roleTerms = getRoleTerms(),
} = {}) {
  const roleActive = roleViewMode === 'student' || roleViewMode === 'teacher';
  const level = normalizePedagoLevel(teacherPreview);
  const levelActive = Boolean(level);
  let roleLabel = '';
  if (roleViewMode === 'student') roleLabel = `Vue ${roleTerms.studentSingular}`;
  else if (roleViewMode === 'teacher') roleLabel = `Vue ${roleTerms.teacherShort}`;
  const levelLabel = levelActive ? `Affichage ${PEDAGO_LEVEL_LABELS[level]}` : '';
  return {
    active: roleActive || levelActive,
    roleActive,
    levelActive,
    roleLabel,
    levelLabel,
    summary: [roleLabel, levelLabel].filter(Boolean).join(' · '),
  };
}
