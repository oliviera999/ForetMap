/**
 * Textes d'aide pour les politiques de conditionnement (prof / admin).
 * Miroir ESM de `describeGatingPolicy` dans lib/shared/resourceQuestionGatingCore.js.
 */

function clampN(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

/** @see lib/shared/resourceQuestionGatingCore.js — describeGatingPolicy */
export function describeGatingPolicy({ mode = 'any', requiredCorrect = 1, gatingCount = 0 } = {}) {
  const resolved = String(mode || 'any')
    .trim()
    .toLowerCase();
  const count = Math.max(0, Number(gatingCount) || 0);

  if (resolved === 'off') {
    return 'Aucune question ne conditionne la validation de cette fiche (dispense locale).';
  }
  if (count === 0) {
    return 'Aucune question bloquante approuvée : la validation reste une simple confirmation.';
  }
  if (resolved === 'any') {
    return `L'élève devra répondre correctement à au moins une question (sur ${count} bloquante${count > 1 ? 's' : ''}).`;
  }
  if (resolved === 'all') {
    return `L'élève devra répondre correctement à toutes les questions bloquantes (${count}).`;
  }
  if (resolved === 'threshold') {
    const n = Math.min(clampN(requiredCorrect, 1), count);
    return `L'élève devra répondre correctement à ${n} question${n > 1 ? 's' : ''} sur ${count} bloquante${count > 1 ? 's' : ''}.`;
  }
  return 'Réglage du site.';
}

export const MODE_LABELS = {
  inherit: 'Réglage du site',
  off: 'Aucune question exigée',
  any: 'Une bonne réponse suffit',
  all: 'Toutes les questions',
  threshold: 'Un nombre minimum',
};

export function describeSiteGatingMode(site) {
  if (!site) return '';
  const mode = String(site.defaultMode || 'any').toLowerCase();
  const label = MODE_LABELS[mode] || mode;
  if (mode === 'threshold') {
    return `${label} (${site.defaultRequiredCorrect ?? 1} bonne(s) réponse(s))`;
  }
  return label;
}
