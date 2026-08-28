/**
 * Textes d'aide pour les politiques de conditionnement (prof / admin).
 * Miroir ESM de lib/shared/gatingPolicyLayersCore.js et resourceQuestionGatingCore.js.
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

export const GRANULARITY_LABELS = {
  player: 'Par joueur',
  team: 'Par équipe',
  per_resource: 'Par ressource (ancien)',
};

export const COOLDOWN_SCOPE_LABELS = {
  resource: 'Fiche entière',
  question: 'Question seule ratée',
};

export const SOURCE_LABELS = {
  site: 'site',
  resource: 'fiche',
  chapter: 'chapitre / scope',
  fm_default: 'ForetMap (par élève)',
};

export function formatEffectiveSource(sourceKey, resourceType = '') {
  const s = String(sourceKey || 'site');
  if (s.startsWith('type:')) {
    const t = s.slice(5) || resourceType || 'type';
    return `préréglage ${t}`;
  }
  return SOURCE_LABELS[s] || s;
}

export function describeSiteGatingMode(site) {
  if (!site) return '';
  const mode = String(site.defaultMode || 'any').toLowerCase();
  const label = MODE_LABELS[mode] || mode;
  if (mode === 'threshold') {
    return `${label} (${site.defaultRequiredCorrect ?? 1} bonne(s) réponse(s))`;
  }
  return label;
}

/** Phrase complète exigence + session + verrou (miroir backend). */
export function describeEffectiveGatingPolicy({
  mode = 'any',
  requiredCorrect = 1,
  gatingCount = 0,
  allowedWrongAttempts = 0,
  maxQuestionsPerSession = 3,
  retryCooldownDays = 3,
  cooldownScope = 'resource',
} = {}) {
  const base = describeGatingPolicy({ mode, requiredCorrect, gatingCount });
  if (mode === 'off' || gatingCount === 0) return base;

  const parts = [base.replace(/\.$/, '')];
  const tol = Math.max(0, Number(allowedWrongAttempts) || 0);
  parts.push(
    tol === 0
      ? 'aucune erreur tolérée'
      : `${tol} erreur${tol > 1 ? 's' : ''} tolérée${tol > 1 ? 's' : ''}`,
  );
  const maxS = Math.max(1, Math.min(10, Number(maxQuestionsPerSession) || 3));
  parts.push(`jusqu'à ${maxS} question(s) par session`);
  const days = Math.max(0, Number(retryCooldownDays) || 0);
  const scopeLabel =
    cooldownScope === 'question' ? 'verrou sur la question ratée' : 'verrou sur toute la fiche';
  if (days <= 0) {
    parts.push('nouvelle tentative immédiate après verrou');
  } else {
    parts.push(`verrou ${days} jour${days > 1 ? 's' : ''} (${scopeLabel})`);
  }
  return `${parts.join(' · ')}.`;
}

export function inheritHint(field, parentValue, parentLabel = 'site') {
  if (parentValue == null || parentValue === '') {
    return `Hérite du ${parentLabel}`;
  }
  return `Hérite du ${parentLabel} : ${parentValue}`;
}

export const INHERIT_VALUE = '__inherit__';
