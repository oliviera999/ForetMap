/**
 * Textes d'aide pour les politiques de conditionnement (prof / admin).
 * Miroir ESM de lib/shared/gatingPolicyLayersCore.js et resourceQuestionGatingCore.js.
 */
import {
  clampCooldownHours,
  formatHoursLabel,
  DEFAULT_RETRY_COOLDOWN_HOURS,
} from './cooldownDuration.js';

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

/** Sévérité du verrou : libellé court + phrase d'aide, pour les trois écrans qui la règlent. */
export const LOCK_MODE_LABELS = {
  advisory: 'Souple',
  flow: 'Normale (recommandée)',
  strict: 'Stricte',
};

export const LOCK_MODE_HELP = {
  advisory:
    'Le verrou ne vaut que dans la fenêtre de validation. L’élève peut réviser la même question dans le Quiz libre.',
  flow: 'Une question posée pour une fiche se répond dans cette fiche. Le Quiz libre reste libre et ses bonnes réponses comptent.',
  strict:
    'Les questions bloquantes de ce type ne se jouent que dans la fiche : elles sont retirées du Quiz libre et chaque erreur compte.',
};

export const LOCK_MODE_OPTIONS = ['advisory', 'flow', 'strict'].map((value) => ({
  value,
  label: LOCK_MODE_LABELS[value],
  help: LOCK_MODE_HELP[value],
}));

/** Délais proposés dans les listes déroulantes (heures), du plus court au plus long. */
export const RETRY_HOUR_OPTIONS = [0, 1, 2, 6, 12, 24, 48, 72, 168];

/** « aucun délai », « 6 h », « 2 jours »… — le même texte partout. */
export function retryHoursLabel(hours) {
  const h = clampCooldownHours(hours, 0);
  return h <= 0 ? 'aucun délai (réessai immédiat)' : formatHoursLabel(h);
}

/** Délai en heures d'un objet réglages/politique, ancien champ en jours accepté (× 24). */
export function readRetryHours(source, fallback = DEFAULT_RETRY_COOLDOWN_HOURS) {
  if (!source) return fallback;
  if (source.retryCooldownHours != null && source.retryCooldownHours !== '') {
    return clampCooldownHours(source.retryCooldownHours, fallback);
  }
  if (source.retry_cooldown_hours != null && source.retry_cooldown_hours !== '') {
    return clampCooldownHours(source.retry_cooldown_hours, fallback);
  }
  if (source.retryCooldownDays != null && source.retryCooldownDays !== '') {
    return clampCooldownHours(Number(source.retryCooldownDays) * 24, fallback);
  }
  if (source.retry_cooldown_days != null && source.retry_cooldown_days !== '') {
    return clampCooldownHours(Number(source.retry_cooldown_days) * 24, fallback);
  }
  return fallback;
}

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
  retryCooldownHours = null,
  retryCooldownDays = null,
  cooldownScope = 'resource',
  lockMode = 'flow',
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
  const hours = readRetryHours(
    { retryCooldownHours, retryCooldownDays },
    DEFAULT_RETRY_COOLDOWN_HOURS,
  );
  const scopeLabel =
    cooldownScope === 'question' ? 'verrou sur la question ratée' : 'verrou sur toute la fiche';
  if (hours <= 0) {
    parts.push('nouvelle tentative immédiate après une erreur');
  } else {
    parts.push(`verrou ${formatHoursLabel(hours)} (${scopeLabel})`);
  }
  const lm = String(lockMode || 'flow').toLowerCase();
  if (lm === 'strict') parts.push('questions réservées à la validation');
  else if (lm === 'advisory') parts.push('verrou souple');
  return `${parts.join(' · ')}.`;
}

export function inheritHint(field, parentValue, parentLabel = 'site') {
  if (parentValue == null || parentValue === '') {
    return `Hérite du ${parentLabel}`;
  }
  return `Hérite du ${parentLabel} : ${parentValue}`;
}

export const INHERIT_VALUE = '__inherit__';
