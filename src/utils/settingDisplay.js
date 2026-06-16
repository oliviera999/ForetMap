/**
 * Helpers purs d'affichage des réglages admin — extraits de `settings-admin-views.jsx` (O6).
 *
 * Humanisation d'une clé pointée, inférence de section, libellés de portée/type, et construction
 * du texte d'aide récapitulant les contraintes d'un réglage. Aucune dépendance ; logique testable.
 */

/** Dernier segment d'une clé pointée, en « Title Case » lisible (`ui.modules.forum_enabled` → `Forum Enabled`). */
export function humanizeKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  const last = raw.split('.').pop() || raw;
  return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Section logique d'un réglage d'après le préfixe de sa clé. */
export function inferSectionFromKey(key) {
  const normalized = String(key || '').toLowerCase();
  if (normalized.startsWith('ui.auth.')) return 'auth';
  if (normalized.startsWith('content.')) return 'content';
  if (normalized.startsWith('ui.modules.') || normalized.startsWith('ui.map.')) return 'modules';
  if (normalized.startsWith('tasks.')) return 'tasks';
  if (normalized.startsWith('progression.') || normalized.startsWith('rbac.')) return 'progression';
  if (normalized.startsWith('security.') || normalized.startsWith('integration.'))
    return 'security';
  if (normalized.startsWith('system.') || normalized.startsWith('ops.')) return 'operations';
  return 'other';
}

/** Libellé de la portée d'un réglage (admin / n3boss / public). */
export function scopeLabel(scope) {
  const s = String(scope || '').toLowerCase();
  if (s === 'admin') return 'Admin';
  if (s === 'teacher') return 'n3boss';
  return 'Public';
}

/** Libellé francisé du type d'un réglage. */
export function typeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'boolean') return 'booléen';
  if (t === 'number') return 'numérique';
  if (t === 'enum') return 'liste';
  if (t === 'string') return 'texte';
  return t || 'inconnu';
}

/** Texte d'aide récapitulant type + contraintes (min/max/longueur/valeurs) + défaut d'un réglage. */
export function buildConstraintHelp(row) {
  const parts = [`Type: ${typeLabel(row?.type)}`];
  const constraints = row?.constraints || {};
  // Ne pas utiliser Number(null) === 0 : les contraintes absentes arrivent en null depuis l’API.
  if (constraints.min != null && Number.isFinite(Number(constraints.min))) {
    parts.push(`min ${Number(constraints.min)}`);
  }
  if (constraints.max != null && Number.isFinite(Number(constraints.max))) {
    parts.push(`max ${Number(constraints.max)}`);
  }
  if (constraints.maxLength != null && Number.isFinite(Number(constraints.maxLength))) {
    parts.push(`max ${Number(constraints.maxLength)} caractères`);
  }
  if (Array.isArray(constraints.values) && constraints.values.length > 0) {
    parts.push(`valeurs: ${constraints.values.map((v) => String(v)).join(', ')}`);
  }
  if (row?.default_value != null && row?.default_value !== '') {
    parts.push(`défaut: ${String(row.default_value)}`);
  }
  return parts.join(' • ');
}
