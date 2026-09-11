'use strict';

/**
 * Orchestration d'une exécution (section 12.1) :
 *
 *  1. verrou exclusif (mutex de processus + ligne `sync_runs` en `running`) → `409` ;
 *  2. ouverture de la ligne `sync_runs` ;
 *  3. lecture Moodle, contrôles amont (membres écartés individuellement), rapprochement ;
 *  4. calcul du plan (aucune écriture) ;
 *  5. seuils ; dépassement sans `force` ⇒ `aborted` ;
 *  6–8. application (M2), une transaction par cohorte, puis sortants, empreintes, clôture ;
 *  9. rejeu de la réconciliation G&L et contrôle croisé des effectifs.
 *
 * La simulation (`dry_run`) exécute 1 à 5 et produit exactement le même rapport, sans écrire.
 * Une exécution réelle exige une simulation du même périmètre depuis moins de 24 h, sauf `force`.
 */

const { queryOne, queryAll, execute } = require('../../database');
const logger = require('../logger');
const { PROVIDER, readMoodleEnv, notConfiguredError } = require('./config');
const { createMoodleClient, MoodleApiError } = require('./client');
const { loadMoodleSettings } = require('./settings');
const { fetchMoodleSnapshot } = require('./snapshot');
const { loadLocalState } = require('./localState');
const { runUpstreamChecks, matchMembers } = require('./matching');
const { buildPlan } = require('./plan');
const { evaluateThresholds } = require('./thresholds');
const { buildReport, scopeKey } = require('./report');

const STALE_RUNNING_MINUTES = 60;
const DRY_RUN_VALIDITY_HOURS = 24;

let processLock = false;

function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function toJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function parseJson(text, fallback = null) {
  if (text == null || text === '') return fallback;
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/** Ligne `sync_runs` sérialisée pour l'API. */
function serializeRun(row, { withReport = false } = {}) {
  if (!row) return null;
  const out = {
    id: Number(row.id),
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    scope: parseJson(row.scope_json, {}),
    actorUserId: row.actor_user_id || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totals: parseJson(row.totals_json, {}),
    error: row.error_text || null,
  };
  if (withReport) out.report = parseJson(row.report_json, null);
  return out;
}

async function acquireLock() {
  if (processLock) throw httpError(409, 'Une synchronisation est déjà en cours');
  const running = await queryOne(
    `SELECT id FROM sync_runs
      WHERE status = 'running' AND started_at > (NOW() - INTERVAL ? MINUTE)
      LIMIT 1`,
    [STALE_RUNNING_MINUTES],
  );
  if (running) throw httpError(409, 'Une synchronisation est déjà en cours');
  processLock = true;
}

function releaseLock() {
  processLock = false;
}

async function openRun({ mode, scope, actorUserId }) {
  const result = await execute(
    `INSERT INTO sync_runs (provider, mode, scope_json, status, actor_user_id, started_at)
     VALUES (?, ?, ?, 'running', ?, NOW())`,
    [PROVIDER, mode, toJson(scope), actorUserId || null],
  );
  return Number(result.insertId);
}

async function closeRun(runId, { status, totals, report, error }) {
  await execute(
    `UPDATE sync_runs
        SET status = ?, finished_at = NOW(), totals_json = ?, report_json = ?, error_text = ?
      WHERE id = ?`,
    [status, toJson(totals), toJson(report), error ? String(error).slice(0, 4000) : null, runId],
  );
}

/** Une simulation réussie sur le même périmètre depuis moins de 24 h ? */
async function findRecentDryRun(key) {
  const rows = await queryAll(
    `SELECT id, scope_json, started_at FROM sync_runs
      WHERE provider = ? AND mode = 'dry_run' AND status = 'succeeded'
        AND started_at > (NOW() - INTERVAL ? HOUR)
      ORDER BY id DESC LIMIT 50`,
    [PROVIDER, DRY_RUN_VALIDITY_HOURS],
  );
  for (const row of rows) {
    const scope = parseJson(row.scope_json, {});
    if (scope?.key === key) return Number(row.id);
  }
  return null;
}

function buildClient(overrides) {
  if (overrides?.client) return overrides.client;
  const cfg = readMoodleEnv(overrides?.env || process.env);
  if (!cfg.configured) throw notConfiguredError();
  return createMoodleClient({
    baseUrl: cfg.baseUrl,
    token: cfg.token,
    timeoutMs: cfg.timeoutMs,
    ...(overrides?.clientOptions || {}),
  });
}

/**
 * Étape 9 : rapport d'identités G&L (`buildGlIdentityReport`) et contrôle croisé des effectifs —
 * pour chaque cohorte, membres Moodle actifs rapprochés vs membres suivis du groupe ForetMap.
 * Informations seulement : un écart est rapporté, jamais « corrigé » ici.
 */
async function runPostChecks({ snapshot, log }) {
  const out = { glIdentity: null, headcounts: [] };
  try {
    const { buildGlIdentityReport } = require('../glIdentityReconcile');
    const gl = await buildGlIdentityReport();
    out.glIdentity = gl.totals;
  } catch (error) {
    log.warn({ err: error }, 'Rapport d’identités G&L indisponible après synchronisation');
  }
  for (const cohort of snapshot.cohorts) {
    const eg = await queryOne(
      `SELECT eg.id, eg.group_id,
              (SELECT COUNT(*) FROM external_group_members m WHERE m.external_group_id = eg.id) AS tracked,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = eg.group_id) AS in_group
         FROM external_groups eg
        WHERE eg.provider = ? AND eg.kind = 'cohort' AND eg.external_id = ? LIMIT 1`,
      [PROVIDER, String(cohort.id)],
    );
    out.headcounts.push({
      cohort: cohort.idnumber,
      moodle: cohort.memberIds.length,
      tracked: eg ? Number(eg.tracked || 0) : 0,
      inGroup: eg ? Number(eg.in_group || 0) : 0,
      groupId: eg?.group_id || null,
    });
  }
  return out;
}

/**
 * Lance une exécution.
 *
 * @param {object} args
 * @param {'dry_run'|'apply'} args.mode
 * @param {number[]|null} [args.cohortIds] cohortes cochées (`null` : toutes celles de l'année appariées)
 * @param {boolean} [args.teams] inclure les miroirs d'équipes (M4)
 * @param {boolean} [args.force] passer outre seuils et garde des 24 h (journalisé)
 * @param {string} [args.forceReason]
 * @param {string|null} [args.actorUserId]
 * @param {object} [args.deps] injections de test : `client`, `env`, `settings`, `clientOptions`
 */
async function runSync({
  mode,
  cohortIds = null,
  teams = false,
  force = false,
  forceReason = null,
  actorUserId = null,
  deps = {},
}) {
  if (mode !== 'dry_run' && mode !== 'apply')
    throw httpError(400, 'Mode invalide (dry_run ou apply)');
  const client = buildClient(deps);
  const settings = deps.settings || (await loadMoodleSettings());
  if (mode === 'apply' && !settings.enabled) {
    throw httpError(
      409,
      'Intégration Moodle désactivée dans les réglages (integration.moodle.enabled)',
    );
  }
  if (mode === 'apply' && force && !String(forceReason || '').trim()) {
    throw httpError(400, 'Un motif est requis pour forcer une exécution');
  }

  await acquireLock();
  const scope = {
    cohortIds: Array.isArray(cohortIds) && cohortIds.length ? cohortIds.map(Number) : null,
    teams: Boolean(teams),
    force: Boolean(force),
    forceReason: force ? String(forceReason || '').trim() || null : null,
    key: null,
  };
  let runId = null;
  try {
    runId = await openRun({ mode, scope, actorUserId });
    const log = logger.child({ moodleRunId: runId, mode });
    log.info(
      { cohortIds: scope.cohortIds, teams: scope.teams, force: scope.force },
      'Exécution Moodle ouverte',
    );

    // 3. Lecture Moodle, état local, contrôles amont, rapprochement.
    const issuer = client.baseUrl;
    const snapshot = await fetchMoodleSnapshot({ client, settings, scope });
    scope.key = scopeKey({
      cohortIdnumbers: snapshot.cohorts.map((c) => c.idnumber),
      teams: scope.teams,
    });
    await execute('UPDATE sync_runs SET scope_json = ? WHERE id = ?', [toJson(scope), runId]);

    if (scope.cohortIds && !snapshot.cohorts.length) {
      const report = buildReport({ mode, scope, settings, snapshot, plan: null, thresholds: null });
      await closeRun(runId, {
        status: 'failed',
        totals: {},
        report,
        error: 'Aucune cohorte du périmètre demandé',
      });
      throw httpError(
        400,
        'Aucune cohorte du périmètre demandé n’est visible ou appariée à une politique',
        {
          runId,
        },
      );
    }

    const local = await loadLocalState({ provider: PROVIDER, issuer });
    const members = [...snapshot.users.values()];
    const linkedExternalIds = new Set(local.identitiesByExternalId.keys());
    const upstream = runUpstreamChecks({
      members,
      emailDomains: settings.emailDomains,
      linkedExternalIds,
    });
    const skippedIds = new Set(upstream.skips.map((s) => String(s.externalId)));
    const membersOk = members.filter((m) => !skippedIds.has(String(m.id)));
    const snapshotForPlan = {
      ...snapshot,
      cohorts: snapshot.cohorts.map((cohort) => ({
        ...cohort,
        memberIds: cohort.memberIds.filter((id) => !skippedIds.has(String(id))),
      })),
    };

    const cohortsByMember = new Map();
    for (const cohort of snapshotForPlan.cohorts) {
      for (const id of cohort.memberIds) {
        const list = cohortsByMember.get(id) || [];
        list.push(cohort);
        cohortsByMember.set(id, list);
      }
    }
    const decisions = matchMembers({
      members: membersOk,
      identitiesByExternalId: local.identitiesByExternalId,
      identitiesByUserId: local.identitiesByUserId,
      usersByEmail: local.usersByEmail,
      studentsByName: local.studentsByName,
      canCreate: (member) =>
        (cohortsByMember.get(String(member.id)) || []).some((c) => c.policy.create_accounts),
    });

    // 4–5. Plan et seuils.
    const plan = buildPlan({ snapshot: snapshotForPlan, decisions, local, settings });
    const thresholds = evaluateThresholds({ plan, settings, local });
    let report = buildReport({
      mode,
      scope,
      settings,
      snapshot: snapshotForPlan,
      plan,
      thresholds,
      upstreamErrors: upstream.skips,
    });
    if (upstream.skips.length) {
      log.info(
        { upstreamSkipped: upstream.skips.length },
        'Membres Moodle laissés de côté (contrôles amont)',
      );
    }

    async function attachTeamMirrors(dryRun) {
      if (!scope.teams) return;
      const { mirrorTeamsForCohorts } = require('./teamsMirror');
      report.teamMirrors = await mirrorTeamsForCohorts({
        cohortIdnumbers: snapshot.cohorts.map((c) => c.idnumber),
        dryRun,
        client,
        settings,
      });
    }

    if (mode === 'dry_run') {
      await attachTeamMirrors(true);
      await closeRun(runId, { status: 'succeeded', totals: report.totals, report });
      log.info(
        { totals: report.totals, blocked: thresholds.blocked },
        'Simulation Moodle terminée',
      );
      return { runId, status: 'succeeded', report };
    }

    // Garde des 24 h (I-6).
    if (!force) {
      const recentDryRunId = await findRecentDryRun(scope.key);
      if (!recentDryRunId) {
        await closeRun(runId, {
          status: 'aborted',
          totals: plan.counts,
          report,
          error: 'Aucune simulation récente pour ce périmètre',
        });
        throw httpError(
          409,
          'Aucune simulation de moins de 24 h pour ce périmètre : simuler d’abord, ou forcer avec un motif',
          { runId },
        );
      }
      report.basedOnDryRunId = recentDryRunId;
    }
    if (thresholds.blocked && !force) {
      await closeRun(runId, {
        status: 'aborted',
        totals: plan.counts,
        report,
        error: `Seuil dépassé : ${thresholds.breaches.map((b) => b.key).join(', ')}`,
      });
      log.warn(
        { breaches: thresholds.breaches.map((b) => b.key) },
        'Exécution Moodle interrompue : seuil dépassé',
      );
      return { runId, status: 'aborted', report };
    }
    if (force) {
      log.warn(
        { forceReason: scope.forceReason, breaches: thresholds.breaches.map((b) => b.key) },
        'Exécution Moodle forcée',
      );
    }

    // 6–8. Application (lot M2).
    const { applyPlan } = require('./apply');
    const applied = await applyPlan({ runId, plan, snapshot, local, settings, client, log });
    // 9. Réconciliation G&L rejouée et contrôle croisé des effectifs.
    applied.postChecks = await runPostChecks({ snapshot, log });
    const basedOnDryRunId = report.basedOnDryRunId ?? null;
    report = buildReport({ mode, scope, settings, snapshot, plan, thresholds, applied });
    report.basedOnDryRunId = basedOnDryRunId;
    await attachTeamMirrors(false);
    const status = applied.failedCohorts.length ? 'failed' : 'succeeded';
    await closeRun(runId, {
      status,
      totals: {
        ...plan.counts,
        applied: applied.actionsApplied,
        failedCohorts: applied.failedCohorts.length,
      },
      report,
      error: applied.failedCohorts.length
        ? `Cohorte(s) en échec : ${applied.failedCohorts.map((f) => f.cohort).join(', ')}`
        : null,
    });
    log.info(
      { applied: applied.actionsApplied, failedCohorts: applied.failedCohorts.length },
      'Exécution Moodle terminée',
    );
    return { runId, status, report };
  } catch (error) {
    if (runId && !error.runId) {
      const isApi = error instanceof MoodleApiError;
      try {
        await closeRun(runId, {
          status: 'failed',
          totals: {},
          report: null,
          error: isApi ? `Moodle ${error.wsfunction}: ${error.errorcode}` : error.message,
        });
      } catch (closeError) {
        logger.error(
          { err: closeError, moodleRunId: runId },
          'Clôture de l’exécution Moodle impossible',
        );
      }
      error.runId = runId;
    }
    throw error;
  } finally {
    releaseLock();
  }
}

async function getRun(runId) {
  const row = await queryOne('SELECT * FROM sync_runs WHERE id = ? LIMIT 1', [Number(runId)]);
  return serializeRun(row, { withReport: true });
}

async function listRuns({ limit = 20, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const rows = await queryAll(
    `SELECT id, provider, mode, scope_json, status, actor_user_id, started_at, finished_at, totals_json, error_text
       FROM sync_runs WHERE provider = ?
      ORDER BY id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    [PROVIDER],
  );
  const total = await queryOne('SELECT COUNT(*) AS c FROM sync_runs WHERE provider = ?', [
    PROVIDER,
  ]);
  return {
    items: rows.map((r) => serializeRun(r)),
    total: Number(total?.c || 0),
    limit: safeLimit,
    offset: safeOffset,
  };
}

/** Pour les tests : relâche un verrou de processus laissé par une exécution interrompue. */
function resetProcessLockForTests() {
  processLock = false;
}

module.exports = {
  runSync,
  getRun,
  listRuns,
  serializeRun,
  findRecentDryRun,
  resetProcessLockForTests,
  DRY_RUN_VALIDITY_HOURS,
};
