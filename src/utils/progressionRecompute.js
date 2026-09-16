/**
 * Recalcul des profils n3beur d'après les tâches validées — corps de requête et mise en forme
 * des résultats renvoyés par `POST /api/rbac/progression/recompute`.
 *
 * Isolé du composant pour être testable sans montage React (cf. `tests-ui/progressionRecompute.test.js`).
 */

/** Motifs renvoyés par le backend quand un compte n'a pas changé de profil. */
export const RECOMPUTE_SKIP_REASON_LABELS = {
  already_aligned: 'déjà au bon palier',
  demotion_not_allowed: 'palier supérieur conservé (alignement strict non demandé)',
  role_out_of_ladder: 'profil hors échelle n3beur (non modifié)',
  visitor_like_skipped: 'profil lecture seule (non modifié)',
  auto_progression_disabled: 'montée automatique désactivée',
  target_role_missing: 'profil cible introuvable',
  not_n3beur_member: 'compte non rattaché à un groupe n3beur',
};

/** Corps de `POST /api/rbac/progression/recompute` pour un périmètre donné. */
export function buildRecomputeBody({
  scope = 'all',
  groupId = null,
  userId = null,
  allowDemotion = false,
  dryRun = false,
} = {}) {
  const body = { scope, allow_demotion: !!allowDemotion, dry_run: !!dryRun };
  if (scope === 'group') body.group_id = groupId == null ? '' : String(groupId);
  if (scope === 'user') body.user_id = userId == null ? '' : String(userId);
  return body;
}

export function describeSkipReason(reason) {
  return RECOMPUTE_SKIP_REASON_LABELS[String(reason || '')] || 'inchangé';
}

/** Phrase de synthèse affichée après un aperçu ou une application. */
export function summarizeRecompute(payload) {
  const scanned = Number(payload?.scanned || 0);
  const changed = Number(payload?.changed || 0);
  const dryRun = !!payload?.dryRun;
  if (scanned === 0) {
    return 'Aucun compte dans ce périmètre (seuls les comptes rattachés à un groupe n3beur sont concernés).';
  }
  if (changed === 0) {
    return `${scanned} compte(s) analysé(s) : tous les profils sont déjà alignés sur le nombre de tâches validées.`;
  }
  return dryRun
    ? `Aperçu : ${changed} profil(s) sur ${scanned} seraient modifiés. Rien n’a encore été enregistré.`
    : `${changed} profil(s) sur ${scanned} mis à jour d’après les tâches validées.`;
}

/** Lignes réellement modifiées (aperçu ou application), triées par nom. */
export function changedRows(payload) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return rows
    .filter((r) => r?.changed)
    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
}

/** Libellé d'une ligne de résultat : « Nom — 60 tâches → n3beur chevronné (était n3beur novice) ». */
export function formatRecomputeRow(row) {
  const name = String(row?.displayName || row?.userId || '').trim();
  const done = Number(row?.done || 0);
  const target = row?.roleDisplayName || row?.roleSlug || '—';
  const previous = row?.previousRoleDisplayName || row?.previousRoleSlug || null;
  const tasks = `${done} tâche${done > 1 ? 's' : ''} validée${done > 1 ? 's' : ''}`;
  if (!row?.changed) return `${name} — ${tasks} — ${describeSkipReason(row?.reason)}`;
  return previous
    ? `${name} — ${tasks} → ${target} (était ${previous})`
    : `${name} — ${tasks} → ${target}`;
}
