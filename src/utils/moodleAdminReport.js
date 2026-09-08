/**
 * Logique pure de l'écran administrateur Moodle (lot M3) : libellés, résumé du rapport
 * d'exécution, règles d'activation du bouton « Appliquer ». Aucun accès réseau ni DOM.
 */

export const RUN_MODE_LABELS = Object.freeze({
  dry_run: 'Simulation',
  apply: 'Application',
});

export const RUN_STATUS_LABELS = Object.freeze({
  running: 'En cours',
  succeeded: 'Terminée',
  failed: 'Échouée',
  aborted: 'Interrompue (seuil)',
  undone: 'Annulée',
});

export const CONFLICT_KIND_LABELS = Object.freeze({
  member_removed_on_mirror: 'Retiré côté ForetMap, toujours dans Moodle',
  member_added_on_mirror: 'Ajouté côté ForetMap, absent de Moodle',
  name_changed: 'Nom du groupe modifié des deux côtés',
});

export const CONFLICT_RESOLUTION_LABELS = Object.freeze({
  keep_master: 'Garder Moodle',
  apply_other: 'Appliquer le côté ForetMap',
  ignore: 'Ignorer (accepter la divergence)',
});

export const PENDING_DECISION_LABELS = Object.freeze({
  link: 'Rapprocher au compte choisi',
  create: 'Créer un nouveau compte',
  ignore: 'Ignorer ce membre',
});

/** Ordre et libellés des totaux affichés en tête de rapport (section 14, point 4). */
export const REPORT_TOTAL_ROWS = Object.freeze([
  ['membersProcessed', 'Membres traités'],
  ['creations', 'Comptes à créer'],
  ['emailMatches', 'Rapprochés par e-mail'],
  ['nameMatches', 'Rapprochés par le nom'],
  ['pendingMatches', 'En attente (homonymes)'],
  ['emailConflicts', 'Conflits d’e-mail'],
  ['deactivations', 'Désactivations'],
  ['groupAdds', 'Ajouts dans un groupe'],
  ['groupRemoves', 'Retraits d’un groupe'],
  ['outbound', 'Écritures vers Moodle'],
  ['conflicts', 'Conflits à trancher'],
  ['alerts', 'Alertes'],
]);

export function runModeLabel(mode) {
  return RUN_MODE_LABELS[mode] || String(mode || '');
}

export function runStatusLabel(status) {
  return RUN_STATUS_LABELS[status] || String(status || '');
}

export function conflictKindLabel(kind) {
  return CONFLICT_KIND_LABELS[kind] || String(kind || '');
}

/** `26#603` → `26#603` ; sert surtout à afficher un périmètre stocké en JSON. */
export function scopeSummary(scope) {
  if (!scope) return '';
  const ids = Array.isArray(scope.cohortIdnumbers) ? scope.cohortIdnumbers : [];
  const parts = [ids.length ? ids.join(', ') : 'aucune cohorte'];
  if (scope.teams) parts.push('équipes');
  if (scope.force) parts.push('forcé');
  return parts.join(' · ');
}

/** Nom affichable d'un membre Moodle tel qu'il figure dans les listes du rapport. */
export function memberDisplay(member) {
  if (!member) return '—';
  const name = [member.firstName ?? member.firstname, member.lastName ?? member.lastname]
    .filter(Boolean)
    .join(' ')
    .trim();
  const email = member.email ? ` <${member.email}>` : '';
  return `${name || member.username || member.id || '?'}${email}`;
}

export function userDisplay(user) {
  if (!user) return '—';
  return user.displayName || user.pseudo || user.email || user.userId || '—';
}

/**
 * Totaux affichables : ne garde que les lignes connues, dans l'ordre du tableau, et signale
 * celles qui méritent l'attention (désactivations, conflits, attente).
 */
export function summarizeTotals(totals) {
  const t = totals || {};
  return REPORT_TOTAL_ROWS.map(([key, label]) => ({
    key,
    label,
    value: Number(t[key] || 0),
    attention:
      ['deactivations', 'conflicts', 'pendingMatches', 'emailConflicts'].includes(key) &&
      Number(t[key] || 0) > 0,
  }));
}

/**
 * Le bouton « Appliquer » n'est cliquable que si une simulation vient d'être faite sur le
 * **même** périmètre (cohortes cochées + option équipes), qu'elle a réussi et qu'aucun seuil
 * ne bloque (section 12 ; la garde des 24 h est rejouée côté serveur).
 */
export function canApplyAfterDryRun({ lastDryRun, selectedCohortIds, teams = false }) {
  if (!lastDryRun || lastDryRun.mode !== 'dry_run') return { ok: false, reason: 'Simuler d’abord' };
  if (lastDryRun.status !== 'succeeded') {
    return { ok: false, reason: 'La simulation n’a pas abouti' };
  }
  if (lastDryRun.report?.thresholds?.blocked) {
    return { ok: false, reason: 'Un seuil de sécurité bloque : relire le rapport' };
  }
  if (Array.isArray(lastDryRun.report?.upstreamErrors) && lastDryRun.report.upstreamErrors.length) {
    return { ok: false, reason: 'Des contrôles amont bloquent : corriger dans Moodle' };
  }
  const simulated = [...new Set((lastDryRun.report?.scope?.cohortIds || []).map(Number))].sort(
    (a, b) => a - b,
  );
  const wanted = [...new Set((selectedCohortIds || []).map(Number))].sort((a, b) => a - b);
  if (simulated.length !== wanted.length || simulated.some((id, i) => id !== wanted[i])) {
    return { ok: false, reason: 'Le périmètre a changé depuis la simulation' };
  }
  if (Boolean(lastDryRun.report?.scope?.teams) !== Boolean(teams)) {
    return { ok: false, reason: 'L’option équipes a changé depuis la simulation' };
  }
  return { ok: true, reason: '' };
}

/** Champs d'une politique et leur libellé, pour l'éditeur et sa validation légère côté client. */
export const POLICY_FIELDS = Object.freeze([
  { name: 'key', label: 'Clé', type: 'text' },
  { name: 'pattern', label: 'Motif ({year} = préfixe d’année)', type: 'text' },
  {
    name: 'group_kind',
    label: 'Genre de groupe',
    type: 'select',
    options: ['class', 'unit', 'club', 'team'],
  },
  { name: 'role', label: 'Rôle attribué', type: 'text' },
  { name: 'n3beur', label: 'Accès n3beur', type: 'boolean' },
  { name: 'gl_class', label: 'Classe G&L', type: 'boolean' },
  { name: 'create_accounts', label: 'Créer les comptes', type: 'boolean' },
  { name: 'push_membership', label: 'Pousser vers Moodle', type: 'boolean' },
]);

export function emptyPolicy() {
  return {
    key: '',
    pattern: '^{year}#',
    group_kind: 'class',
    role: 'visiteur',
    n3beur: false,
    gl_class: false,
    create_accounts: true,
    push_membership: false,
  };
}

/** Validation côté client, volontairement minimale : le serveur reste juge (section 6.2). */
export function validatePoliciesDraft(policies) {
  if (!Array.isArray(policies)) return 'liste attendue';
  const seen = new Set();
  for (let i = 0; i < policies.length; i += 1) {
    const p = policies[i] || {};
    const key = String(p.key || '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return `politique n°${i + 1} : clé invalide`;
    if (seen.has(key)) return `clé en double : ${key}`;
    seen.add(key);
    if (!String(p.pattern || '').trim()) return `politique ${key} : motif vide`;
    try {
      new RegExp(String(p.pattern).replace(/\{year\}/g, '26'));
    } catch {
      return `politique ${key} : expression régulière invalide`;
    }
  }
  return null;
}

/** Table chapitre → cours vue par l'éditeur : lignes `{ chapterId, courseId }` triées par chapitre. */
export function chapterCoursesToRows(setting) {
  if (!setting || typeof setting !== 'object') return [];
  return Object.entries(setting)
    .map(([chapterId, courseId]) => ({ chapterId: Number(chapterId), courseId: Number(courseId) }))
    .filter((r) => Number.isInteger(r.chapterId) && r.chapterId > 0)
    .sort((a, b) => a.chapterId - b.chapterId);
}

export function rowsToChapterCourses(rows) {
  const out = {};
  for (const row of rows || []) {
    const chapterId = Number(row.chapterId);
    const courseId = Number(row.courseId);
    if (!Number.isInteger(chapterId) || chapterId <= 0) continue;
    if (!Number.isInteger(courseId) || courseId <= 0) continue;
    out[String(chapterId)] = courseId;
  }
  return out;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
