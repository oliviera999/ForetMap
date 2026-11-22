import { PEDAGO_LEVEL_LABELS, normalizePedagoLevel } from './biodivPedagoLevel.js';
import { normalizeLearnerNiveau } from './pedagoScales.js';
import { getRoleTerms } from './n3-terminology.js';

/**
 * Niveaux proposés par le menu « Aperçu » (chantier collège, novembre 2026) : une classe de
 * 6e (cycle 3), une classe de 3e (cycle 4) et le lycée. L'affichage collège est le même de la
 * 6e à la 3e ; les deux entrées du collège ne diffèrent que par les règles de palier
 * (vocabulaire, questions, symbiose et compétition).
 */
export const PREVIEW_LEVEL_OPTIONS = Object.freeze([
  Object.freeze({ value: 'cycle3', label: 'Collège · 6e (cycle 3)' }),
  Object.freeze({ value: 'cycle4', label: 'Collège · 3e (cycle 4)' }),
  Object.freeze({ value: 'lycee', label: PEDAGO_LEVEL_LABELS.lycee }),
]);

const PREVIEW_LEVEL_LABELS = Object.freeze(
  Object.fromEntries(PREVIEW_LEVEL_OPTIONS.map((option) => [option.value, option.label])),
);

/**
 * Niveau d'aperçu canonique : un niveau de l'apprenant (`cycle3`, `cycle4`, `seconde`…,
 * `universite`) ou, par compatibilité (aperçu mémorisé avant le chantier), une étape
 * (`college`, `lycee`). `null` si la valeur n'est pas reconnue.
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizePreviewLevel(value) {
  return normalizeLearnerNiveau(value) || normalizePedagoLevel(value);
}

/** Libellé d'un niveau d'aperçu (`''` si inconnu). */
export function previewLevelLabel(value) {
  const level = normalizePreviewLevel(value);
  if (!level) return '';
  return PREVIEW_LEVEL_LABELS[level] || PEDAGO_LEVEL_LABELS[level] || level;
}

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
  const levelLabelText = previewLevelLabel(teacherPreview);
  const levelActive = Boolean(levelLabelText);
  let roleLabel = '';
  if (roleViewMode === 'student') roleLabel = `Vue ${roleTerms.studentSingular}`;
  else if (roleViewMode === 'teacher') roleLabel = `Vue ${roleTerms.teacherShort}`;
  const levelLabel = levelActive ? `Affichage ${levelLabelText}` : '';
  return {
    active: roleActive || levelActive,
    roleActive,
    levelActive,
    roleLabel,
    levelLabel,
    summary: [roleLabel, levelLabel].filter(Boolean).join(' · '),
  };
}
