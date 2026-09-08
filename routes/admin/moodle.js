'use strict';

/**
 * API administrateur du lien Moodle — `/api/admin/integrations/moodle` (section 13 du chantier).
 *
 * Toutes les routes exigent la permission `integrations.moodle.manage`. Le jeton Web Services
 * n'est **jamais** renvoyé (`GET /status` dit seulement « configuré » ou non). Sans configuration
 * `.env`, les routes qui parlent à Moodle répondent `503 { error: 'Intégration Moodle non
 * configurée' }` ; celles qui ne lisent que la base restent utilisables.
 */

const express = require('express');
const { queryAll, queryOne } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const asyncHandler = require('../../lib/asyncHandler');
const { z, validate } = require('../../lib/validate');
const { logAudit } = require('../../lib/auditLog');
const { PROVIDER, readMoodleEnv, notConfiguredError } = require('../../lib/moodle/config');
const { createMoodleClientFromEnv } = require('../../lib/moodle/client');
const { loadMoodleSettings } = require('../../lib/moodle/settings');
const { runMoodleCheck } = require('../../lib/moodle/check');
const { resolvePolicyForIdnumber, isCohortOfYear } = require('../../lib/moodle/policies');
const { runSync, getRun, listRuns } = require('../../lib/moodle/syncRun');
const { undoRun } = require('../../lib/moodle/undo');
const pendingMatches = require('../../lib/moodle/pendingMatches');
const conflicts = require('../../lib/moodle/conflicts');
const exempt = require('../../lib/moodle/exempt');
const accountMerge = require('../../lib/accountMerge');

const router = express.Router();
const requireMoodleAdmin = requirePermission('integrations.moodle.manage');

/** Dernier résultat de `check` en mémoire (par processus) : suffit pour `GET /status`. */
let lastCheck = null;

function actorOf(req) {
  return {
    userType: req.auth?.userType || 'teacher',
    userId: req.auth?.userId || null,
    canonicalUserId: req.auth?.canonicalUserId || req.auth?.userId || null,
  };
}

function requireClient() {
  const client = createMoodleClientFromEnv();
  if (!client) throw notConfiguredError();
  return client;
}

async function loadGlChapters() {
  try {
    return await queryAll('SELECT id, title FROM gl_chapters ORDER BY order_index ASC, id ASC');
  } catch {
    return [];
  }
}

// --- État --------------------------------------------------------------------------------------

router.get(
  '/status',
  requireMoodleAdmin,
  asyncHandler(async (_req, res) => {
    const env = readMoodleEnv();
    const settings = await loadMoodleSettings();
    const lastRun = await queryOne(
      `SELECT id, mode, status, started_at, finished_at, totals_json
         FROM sync_runs WHERE provider = ? ORDER BY id DESC LIMIT 1`,
      [PROVIDER],
    );
    const openConflicts = await queryOne(
      'SELECT COUNT(*) AS c FROM sync_conflicts WHERE resolved_at IS NULL',
    );
    const openPending = await queryOne(
      'SELECT COUNT(*) AS c FROM sync_pending_matches WHERE resolved_at IS NULL',
    );
    res.json({
      configured: env.configured,
      killSwitchOff: env.killSwitchOff,
      baseUrl: env.baseUrl || null,
      enabled: settings.enabled,
      yearPrefix: settings.yearPrefix,
      lastCheck,
      lastRun: lastRun
        ? {
            id: Number(lastRun.id),
            mode: lastRun.mode,
            status: lastRun.status,
            startedAt: lastRun.started_at,
            finishedAt: lastRun.finished_at,
            totals: lastRun.totals_json ? JSON.parse(lastRun.totals_json) : {},
          }
        : null,
      openConflicts: Number(openConflicts?.c || 0),
      openPendingMatches: Number(openPending?.c || 0),
    });
  }),
);

router.post(
  '/check',
  requireMoodleAdmin,
  asyncHandler(async (req, res) => {
    const client = requireClient();
    const settings = await loadMoodleSettings();
    const chapters = await loadGlChapters();
    const report = await runMoodleCheck({ client, settings, chapters });
    lastCheck = {
      ok: report.ok,
      checkedAt: report.checkedAt,
      missingFunctions: report.missingFunctions,
      errors: report.errors,
    };
    await logAudit('moodle_check', 'integration', 'moodle', report.ok ? 'ok' : 'ko', { req });
    res.json(report);
  }),
);

router.get(
  '/cohorts',
  requireMoodleAdmin,
  asyncHandler(async (_req, res) => {
    const client = requireClient();
    const settings = await loadMoodleSettings();
    const found = await client.searchCohorts('');
    const all = Array.isArray(found?.cohorts) ? found.cohorts : [];
    const ofYear = all
      .map((c) => ({
        id: Number(c.id),
        name: String(c.name || ''),
        idnumber: String(c.idnumber || ''),
      }))
      .filter((c) => isCohortOfYear(c.idnumber, settings.yearPrefix));
    const counts = new Map();
    if (ofYear.length) {
      const rows = await client.getCohortMembers(ofYear.map((c) => c.id));
      for (const row of rows || []) counts.set(Number(row.cohortid), (row.userids || []).length);
    }
    const linked = await queryAll(
      `SELECT external_id, group_id, gl_class_id, last_synced_at, members_json
         FROM external_groups WHERE provider = ? AND kind = 'cohort'`,
      [PROVIDER],
    );
    const linkedById = new Map(linked.map((r) => [String(r.external_id), r]));
    res.json({
      yearPrefix: settings.yearPrefix,
      cohorts: ofYear.map((c) => {
        const policy = resolvePolicyForIdnumber(c.idnumber, settings.compiledPolicies);
        const link = linkedById.get(String(c.id)) || null;
        return {
          ...c,
          memberCount: counts.get(c.id) ?? 0,
          policyKey: policy ? policy.key : null,
          groupId: link?.group_id || null,
          glClassId: link?.gl_class_id || null,
          lastSyncedAt: link?.last_synced_at || null,
        };
      }),
    });
  }),
);

router.get(
  '/courses',
  requireMoodleAdmin,
  asyncHandler(async (_req, res) => {
    const client = requireClient();
    const settings = await loadMoodleSettings();
    const chapters = await loadGlChapters();
    const courseIds = Object.values(settings.chapterCourses);
    const courses = courseIds.length ? await client.getCoursesByIds(courseIds) : [];
    const byId = new Map(courses.map((c) => [Number(c.id), c]));
    const titles = new Map(chapters.map((c) => [Number(c.id), c.title]));
    res.json({
      chapters: chapters.map((c) => ({ id: Number(c.id), title: c.title })),
      rows: Object.entries(settings.chapterCourses).map(([chapterId, courseId]) => {
        const course = byId.get(Number(courseId)) || null;
        return {
          chapterId: Number(chapterId),
          chapterTitle: titles.get(Number(chapterId)) || null,
          courseId: Number(courseId),
          courseName: course ? String(course.fullname || course.shortname || '') : null,
          courseShortname: course ? String(course.shortname || '') : null,
          courseFound: Boolean(course),
        };
      }),
    });
  }),
);

// --- Exécutions --------------------------------------------------------------------------------

const runBodySchema = z.object({
  mode: z.enum(['dry_run', 'apply']),
  cohortIds: z.array(z.coerce.number().int().positive()).max(200).optional(),
  teams: z.boolean().optional(),
  force: z.boolean().optional(),
  forceReason: z.string().trim().max(300).optional(),
});

router.post(
  '/runs',
  requireMoodleAdmin,
  validate({ body: runBodySchema }),
  asyncHandler(async (req, res) => {
    const { mode, cohortIds, teams, force, forceReason } = req.body;
    if (!Array.isArray(cohortIds) || !cohortIds.length) {
      return res.status(400).json({ error: 'Cocher au moins une cohorte' });
    }
    const actor = actorOf(req);
    const result = await runSync({
      mode,
      cohortIds,
      teams: Boolean(teams),
      force: Boolean(force),
      forceReason: forceReason || null,
      actorUserId: actor.canonicalUserId,
    });
    await logAudit(
      'moodle_sync_run',
      'sync_run',
      String(result.runId),
      `${mode}:${result.status}`,
      {
        req,
        payload: {
          cohortIds,
          teams: Boolean(teams),
          force: Boolean(force),
          forceReason: forceReason || null,
        },
      },
    );
    return res.status(mode === 'apply' ? 200 : 200).json(result);
  }),
);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get(
  '/runs',
  requireMoodleAdmin,
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await listRuns(req.validatedQuery || {}));
  }),
);

const idParams = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/runs/:id',
  requireMoodleAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const run = await getRun(req.validatedParams.id);
    if (!run) return res.status(404).json({ error: 'Exécution introuvable' });
    return res.json(run);
  }),
);

router.post(
  '/runs/:id/undo',
  requireMoodleAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const result = await undoRun(req.validatedParams.id, {
      actorUserId: actor.canonicalUserId,
      client: createMoodleClientFromEnv(),
    });
    await logAudit(
      'moodle_sync_undo',
      'sync_run',
      String(req.validatedParams.id),
      `undone:${result.undone}`,
      {
        req,
        payload: { undone: result.undone, deactivatedCreated: result.deactivatedCreated },
      },
    );
    res.json(result);
  }),
);

// --- Rapprochements en attente -----------------------------------------------------------------

router.get(
  '/pending-matches',
  requireMoodleAdmin,
  asyncHandler(async (req, res) => {
    const includeResolved = String(req.query?.includeResolved || '') === '1';
    res.json({ items: await pendingMatches.listPendingMatches({ includeResolved }) });
  }),
);

const pendingDecisionSchema = z.object({
  decision: z.enum(['link', 'create', 'ignore']),
  userId: z.string().trim().min(1).max(64).optional(),
});

router.post(
  '/pending-matches/:id',
  requireMoodleAdmin,
  validate({ params: idParams, body: pendingDecisionSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const result = await pendingMatches.resolvePendingMatch(req.validatedParams.id, {
      resolution: req.body.decision,
      userId: req.body.userId || null,
      actorUserId: actor.canonicalUserId,
    });
    await logAudit(
      'moodle_pending_match_decide',
      'sync_pending_match',
      String(req.validatedParams.id),
      req.body.decision,
      {
        req,
        payload: { resolvedUserId: result.resolvedUserId },
      },
    );
    res.json(result);
  }),
);

// --- Conflits ----------------------------------------------------------------------------------

router.get(
  '/conflicts',
  requireMoodleAdmin,
  asyncHandler(async (req, res) => {
    const includeResolved = String(req.query?.includeResolved || '') === '1';
    res.json({ items: await conflicts.listConflicts({ includeResolved }) });
  }),
);

const conflictDecisionSchema = z.object({
  resolution: z.enum(['keep_master', 'apply_other', 'ignore']),
});

router.post(
  '/conflicts/:id',
  requireMoodleAdmin,
  validate({ params: idParams, body: conflictDecisionSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const client = req.body.resolution === 'apply_other' ? createMoodleClientFromEnv() : null;
    const result = await conflicts.resolveConflict(req.validatedParams.id, {
      resolution: req.body.resolution,
      actorUserId: actor.canonicalUserId,
      client,
    });
    await logAudit(
      'moodle_conflict_resolve',
      'sync_conflict',
      String(req.validatedParams.id),
      req.body.resolution,
      { req },
    );
    res.json(result);
  }),
);

// --- Hors synchronisation ----------------------------------------------------------------------

const exemptSchema = z.object({
  targetType: z.enum(['user', 'group']),
  targetId: z.string().trim().min(1).max(64),
  exempt: z.boolean().optional(),
});

router.get(
  '/exempt',
  requireMoodleAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await exempt.listExempt());
  }),
);

router.post(
  '/exempt',
  requireMoodleAdmin,
  validate({ body: exemptSchema }),
  asyncHandler(async (req, res) => {
    const result = await exempt.setExempt({
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      exempt: req.body.exempt !== false,
    });
    if (!result.ok) return res.status(404).json({ error: result.error });
    await logAudit(
      'moodle_sync_exempt',
      req.body.targetType,
      req.body.targetId,
      result.exempt ? 'on' : 'off',
      { req },
    );
    return res.json(result);
  }),
);

// --- Fusion de comptes (lot M2) ----------------------------------------------------------------

const mergeSchema = z.object({
  fromUserId: z.string().trim().min(1).max(64),
  intoUserId: z.string().trim().min(1).max(64),
  dryRun: z.boolean().optional(),
});

router.post(
  '/merge',
  requireMoodleAdmin,
  validate({ body: mergeSchema }),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const dryRun = req.body.dryRun !== false;
    const result = dryRun
      ? await accountMerge.planMerge({
          fromUserId: req.body.fromUserId,
          intoUserId: req.body.intoUserId,
        })
      : await accountMerge.applyMerge({
          fromUserId: req.body.fromUserId,
          intoUserId: req.body.intoUserId,
          actorUserId: actor.canonicalUserId,
        });
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    if (!dryRun) {
      await logAudit(
        'moodle_account_merge',
        'user',
        req.body.intoUserId,
        `from:${req.body.fromUserId}`,
        {
          req,
          payload: { runId: result.runId || null },
        },
      );
    }
    return res.json(result);
  }),
);

const suggestSchema = z.object({
  courseId: z.coerce.number().int().positive(),
});

const subgroupMirrorSchema = z.object({
  groupId: z.string().trim().min(1).max(64),
  courseId: z.coerce.number().int().positive(),
  dryRun: z.boolean().optional(),
});

router.post(
  '/mirrors',
  requireMoodleAdmin,
  validate({ body: subgroupMirrorSchema }),
  asyncHandler(async (req, res) => {
    requireClient();
    const { mirrorForetmapGroup } = require('../../lib/moodle/teamsMirror');
    const dryRun = req.body.dryRun !== false;
    const report = await mirrorForetmapGroup({
      groupId: req.body.groupId,
      courseId: req.body.courseId,
      dryRun,
    });
    if (report.error) return res.status(409).json({ error: report.error, report });
    if (!dryRun) {
      await logAudit('moodle_group_mirror', 'group', req.body.groupId, String(req.body.courseId), {
        req,
      });
    }
    return res.json(report);
  }),
);

router.post(
  '/lti/suggest',
  requireMoodleAdmin,
  validate({ body: suggestSchema }),
  asyncHandler(async (req, res) => {
    const client = requireClient();
    const settings = await loadMoodleSettings();
    const courseId = req.body.courseId;
    const groups = await client.getCourseGroups(courseId);
    const names = (Array.isArray(groups) ? groups : []).map((g) =>
      String(g.name || g.idnumber || ''),
    );
    const year = settings.yearPrefix;
    const hasN3 = names.some((n) => n.includes(`${year}#n3`));
    const hasPlayer = names.some((n) => new RegExp(`${year}#6\\d{2}`).test(n));
    let product = null;
    if (hasN3 && hasPlayer) product = 'both';
    else if (hasN3) product = 'fm';
    else if (hasPlayer) product = 'gl';
    res.json({
      courseId,
      groups: names,
      product,
      reason: product ? 'cohortes du cours' : 'aucune cohorte connue',
    });
  }),
);

// L'absence de configuration est un état attendu (section 6.1), pas une panne : message explicite
// en 503 et journal en `warn`, alors que le gestionnaire global masque tout 5xx en « Erreur serveur ».
router.use((err, req, res, next) => {
  if (err?.code === 'MOODLE_NOT_CONFIGURED') {
    req.log?.warn?.({ path: req.path }, 'Route Moodle appelée sans configuration');
    return res.status(503).json({ error: err.message, code: err.code });
  }
  return next(err);
});

module.exports = router;
