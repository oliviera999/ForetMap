'use strict';

/**
 * Lecture Moodle d'une exécution : cohortes de l'année **ou** retenues par une politique
 * hors préfixe (ex. n3), membres, détails des comptes. Aucune écriture. Les cohortes sans
 * politique sont listées, pas traitées.
 */

const { resolvePolicyForIdnumber, isCohortListedForSync } = require('./policies');

/**
 * @param {object} args
 * @param {object} args.client client Moodle
 * @param {object} args.settings réglages chargés (`loadMoodleSettings`)
 * @param {{ cohortIds?: number[]|null }} [args.scope] cohortes cochées ; `null` = toutes celles de l'année appariées
 */
async function fetchMoodleSnapshot({ client, settings, scope = {} }) {
  const found = await client.searchCohorts('');
  const all = Array.isArray(found?.cohorts) ? found.cohorts : [];
  const requested =
    Array.isArray(scope.cohortIds) && scope.cohortIds.length
      ? new Set(scope.cohortIds.map((id) => Number(id)))
      : null;

  const cohortsOfYear = [];
  const unmatchedCohorts = [];
  const selected = [];
  const unknownRequested = new Set(requested ? [...requested] : []);
  for (const raw of all) {
    const idnumber = String(raw?.idnumber || '');
    const cohort = {
      id: Number(raw.id),
      name: String(raw.name || ''),
      idnumber,
      visible: raw.visible == null ? null : Boolean(Number(raw.visible)),
    };
    if (!isCohortListedForSync(idnumber, settings.yearPrefix, settings.compiledPolicies)) {
      continue;
    }
    const policy = resolvePolicyForIdnumber(idnumber, settings.compiledPolicies);
    cohortsOfYear.push({ ...cohort, policyKey: policy ? policy.key : null });
    if (!policy) {
      unmatchedCohorts.push(cohort);
      continue;
    }
    if (requested) {
      if (!requested.has(cohort.id)) continue;
      unknownRequested.delete(cohort.id);
    }
    selected.push({ ...cohort, policy, policyKey: policy.key, memberIds: [] });
  }

  if (selected.length) {
    const memberRows = await client.getCohortMembers(selected.map((c) => c.id));
    const byCohort = new Map();
    for (const row of memberRows || []) {
      byCohort.set(
        Number(row.cohortid),
        (row.userids || []).map((id) => String(id)),
      );
    }
    for (const cohort of selected) cohort.memberIds = byCohort.get(cohort.id) || [];
  }

  const allUserIds = [...new Set(selected.flatMap((c) => c.memberIds))];
  const users = new Map();
  if (allUserIds.length) {
    const rows = await client.getUsersByIds(allUserIds);
    for (const raw of rows || []) {
      users.set(String(raw.id), {
        id: String(raw.id),
        username: raw.username ? String(raw.username) : null,
        firstname: raw.firstname ? String(raw.firstname) : '',
        lastname: raw.lastname ? String(raw.lastname) : '',
        email: raw.email ? String(raw.email) : '',
        idnumber: raw.idnumber ? String(raw.idnumber) : null,
        auth: raw.auth ? String(raw.auth) : null,
        suspended: Number(raw.suspended || 0) === 1,
      });
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    cohortsOfYear,
    unmatchedCohorts,
    cohorts: selected,
    unknownRequestedCohortIds: [...unknownRequested],
    users,
  };
}

module.exports = { fetchMoodleSnapshot };
