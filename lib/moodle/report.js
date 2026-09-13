'use strict';

/**
 * Rapport d'exécution (section 14, point 4) : totaux d'abord, puis les listes qui comptent.
 * Même forme en simulation et en réel ; les noms et e-mails n'apparaissent qu'ici (section 15),
 * jamais dans les journaux applicatifs.
 */

function buildReport({
  mode,
  scope,
  settings,
  snapshot,
  plan,
  thresholds,
  upstreamErrors = [],
  applied = null,
}) {
  return {
    mode,
    scope: {
      cohortIds: scope?.cohortIds || null,
      cohortIdnumbers: (snapshot?.cohorts || []).map((c) => c.idnumber),
      teams: Boolean(scope?.teams),
      force: Boolean(scope?.force),
    },
    yearPrefix: settings?.yearPrefix || null,
    fetchedAt: snapshot?.fetchedAt || null,
    cohorts: plan?.cohorts || [],
    totals: {
      ...(plan?.counts || {}),
      upstreamSkipped: Array.isArray(upstreamErrors) ? upstreamErrors.length : 0,
    },
    thresholds: thresholds || { blocked: false, breaches: [] },
    upstreamErrors,
    lists: plan?.lists || {},
    conflicts: plan?.conflicts || [],
    outbound: plan?.outbound || [],
    actions: (plan?.actions || []).map((a) => ({
      kind: a.kind,
      cohort: a.cohort,
      externalId: a.externalId || null,
      userId: a.userId || null,
      payload: a.payload || {},
    })),
    applied,
  };
}

/** Clé de périmètre : même valeur ⇒ même périmètre (garde des 24 h, section 12.1). */
function scopeKey({ cohortIdnumbers = [], teams = false }) {
  const ids = [...new Set((cohortIdnumbers || []).map(String))].sort();
  return JSON.stringify({ cohorts: ids, teams: Boolean(teams) });
}

module.exports = { buildReport, scopeKey };
