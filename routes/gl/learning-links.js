'use strict';

// API GL (MJ/admin) — liens « ressource <-> question QCM », politique de conditionnement
// et reglages de gating (site + surcharges chapitre/scope lore). Miroir isole du backbone
// ForetMap. Inerte tant que gl_settings 'gating.enabled' = false (pas de branchement runtime).
// Permissions : gl.content.manage (liens/politique), gl.settings.manage (reglages site/granularite).

const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { logRouteError, respondInternalError } = require('../../lib/routeLog');
const { getGlGatingSettings, setGlGatingSetting, GATING_KEYS } = require('../../lib/glSettings');
const core = require('../../lib/shared/resourceQuestionGatingCore');

const router = express.Router();
const ALLOWED = core.GL_RESOURCE_TYPES;

function actor(req) {
  const a = req.glAuth || {};
  return { userType: a.userType || 'gl_admin', userId: a.userId == null ? null : String(a.userId) };
}

async function glQuestionExists(dataset, code) {
  const table = dataset === 'qcm_lore' ? 'gl_qcm_lore_questions' : 'gl_qcm_questions';
  const row = await queryOne(`SELECT question_code FROM ${table} WHERE question_code = ? LIMIT 1`, [
    code,
  ]);
  return !!row;
}

/** GET /api/gl/learning-links — liste filtree (questionDataset, resourceType, resourceRef, questionCode, status). */
router.get('/', requireGlAuth, requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const where = [];
    const params = [];
    const ds = req.query.questionDataset
      ? core.normalizeQuestionDataset(req.query.questionDataset)
      : null;
    if (req.query.questionDataset && !ds) {
      return res.status(400).json({ error: 'Jeu de questions invalide' });
    }
    if (ds) {
      where.push('question_dataset = ?');
      params.push(ds);
    }
    const rt = core.normalizeResourceType(req.query.resourceType, ALLOWED);
    if (req.query.resourceType && !rt) {
      return res.status(400).json({ error: 'Type de ressource invalide' });
    }
    if (rt) {
      where.push('resource_type = ?');
      params.push(rt);
      const ref = core.normalizeResourceRef(req.query.resourceRef);
      if (ref) {
        where.push('resource_ref = ?');
        params.push(ref);
      }
    }
    const qc = core.normalizeQuestionCode(req.query.questionCode);
    if (qc) {
      where.push('question_code = ?');
      params.push(qc);
    }
    const status = req.query.status ? core.normalizeStatus(req.query.status, null) : null;
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const rows = await queryAll(
      `SELECT * FROM gl_resource_question_links
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY question_dataset, resource_type, resource_ref, question_code
       LIMIT 1000`,
      params,
    );
    return res.json({ links: rows });
  } catch (err) {
    logRouteError(err, req, 'gl-learning-links:list');
    return respondInternalError(res, req, err);
  }
});

/** POST /api/gl/learning-links — creer/mettre a jour un lien (idempotent). */
router.post('/', requireGlAuth, requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const parsed = core.sanitizeLinkInput(req.body || {}, {
      allowedResourceTypes: ALLOWED,
      requireDataset: true,
    });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const v = parsed.value;
    if (!(await glQuestionExists(v.question_dataset, v.question_code))) {
      return res.status(404).json({ error: 'Question introuvable' });
    }
    const who = actor(req);
    await execute(
      `INSERT INTO gl_resource_question_links
        (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin,
         confidence, status, note, created_by_user_type, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_gating = VALUES(is_gating), weight = VALUES(weight), origin = VALUES(origin),
         confidence = VALUES(confidence), status = VALUES(status), note = VALUES(note),
         updated_at = NOW()`,
      [
        v.question_dataset,
        v.resource_type,
        v.resource_ref,
        v.question_code,
        v.is_gating,
        v.weight,
        v.origin,
        v.confidence == null ? null : v.confidence,
        v.status,
        v.note,
        who.userType,
        who.userId,
      ],
    );
    const row = await queryOne(
      `SELECT * FROM gl_resource_question_links
        WHERE question_dataset = ? AND resource_type = ? AND resource_ref = ? AND question_code = ? LIMIT 1`,
      [v.question_dataset, v.resource_type, v.resource_ref, v.question_code],
    );
    return res.status(201).json({ link: row });
  } catch (err) {
    logRouteError(err, req, 'gl-learning-links:create');
    return respondInternalError(res, req, err);
  }
});

/** PATCH /api/gl/learning-links/:id */
router.patch('/:id', requireGlAuth, requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0)
      return res.status(400).json({ error: 'Identifiant invalide' });
    const sets = [];
    const params = [];
    const body = req.body || {};
    if (body.is_gating !== undefined) {
      sets.push('is_gating = ?');
      params.push(body.is_gating ? 1 : 0);
    }
    if (body.weight !== undefined) {
      const w = Number(body.weight);
      if (!Number.isFinite(w) || w < 0) return res.status(400).json({ error: 'Poids invalide' });
      sets.push('weight = ?');
      params.push(Math.floor(w));
    }
    if (body.status !== undefined) {
      const s = core.normalizeStatus(body.status, null);
      if (!s) return res.status(400).json({ error: 'Statut invalide' });
      sets.push('status = ?');
      params.push(s);
    }
    if (body.note !== undefined) {
      sets.push('note = ?');
      params.push(body.note == null ? null : String(body.note).trim().slice(0, 255) || null);
    }
    if (!sets.length) return res.status(400).json({ error: 'Aucune modification' });
    params.push(id);
    const result = await execute(
      `UPDATE gl_resource_question_links SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params,
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Lien introuvable' });
    const row = await queryOne('SELECT * FROM gl_resource_question_links WHERE id = ? LIMIT 1', [
      id,
    ]);
    return res.json({ link: row });
  } catch (err) {
    logRouteError(err, req, 'gl-learning-links:update');
    return respondInternalError(res, req, err);
  }
});

/** DELETE /api/gl/learning-links/:id */
router.delete('/:id', requireGlAuth, requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0)
      return res.status(400).json({ error: 'Identifiant invalide' });
    const result = await execute('DELETE FROM gl_resource_question_links WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Lien introuvable' });
    return res.json({ success: true });
  } catch (err) {
    logRouteError(err, req, 'gl-learning-links:delete');
    return respondInternalError(res, req, err);
  }
});

/** GET /api/gl/learning-links/policy?resourceType=&resourceRef=&chapterGranularity= */
router.get('/policy', requireGlAuth, requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const rt = core.normalizeResourceType(req.query.resourceType, ALLOWED);
    const ref = core.normalizeResourceRef(req.query.resourceRef);
    if (!rt || !ref) return res.status(400).json({ error: 'Ressource invalide' });
    const perResource = await queryOne(
      'SELECT * FROM gl_resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, ref],
    );
    const g = await getGlGatingSettings();
    const site = {
      enabled: g.enabled,
      granularity: g.granularity,
      defaultMode: g.defaultMode,
      defaultRequiredCorrect: g.defaultRequiredCorrect,
    };
    const chapterGranularity = core.normalizeGranularity(req.query.chapterGranularity);
    const effective = core.resolveEffectivePolicy({ perResource, chapterGranularity, site });
    return res.json({ policy: perResource || null, effective, site });
  } catch (err) {
    logRouteError(err, req, 'gl-learning-links:policy:get');
    return respondInternalError(res, req, err);
  }
});

/** PUT /api/gl/learning-links/policy */
router.put('/policy', requireGlAuth, requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const body = req.body || {};
    const rt = core.normalizeResourceType(body.resource_type ?? body.resourceType, ALLOWED);
    const ref = core.normalizeResourceRef(body.resource_ref ?? body.resourceRef);
    if (!rt || !ref) return res.status(400).json({ error: 'Ressource invalide' });
    const mode = core.normalizeMode(body.mode) || 'inherit';
    const requiredCorrect = core.clampRequiredCorrect(
      body.required_correct ?? body.requiredCorrect,
      1,
    );
    const enabled = body.enabled ? 1 : 0;
    const who = actor(req);
    await execute(
      `INSERT INTO gl_resource_gating_policy
        (resource_type, resource_ref, mode, required_correct, enabled, updated_by_user_type, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         mode = VALUES(mode), required_correct = VALUES(required_correct), enabled = VALUES(enabled),
         updated_by_user_type = VALUES(updated_by_user_type), updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = NOW()`,
      [rt, ref, mode, requiredCorrect, enabled, who.userType, who.userId],
    );
    const perResource = await queryOne(
      'SELECT * FROM gl_resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, ref],
    );
    return res.json({ policy: perResource });
  } catch (err) {
    logRouteError(err, req, 'gl-learning-links:policy:put');
    return respondInternalError(res, req, err);
  }
});

/** GET /api/gl/learning-links/settings — reglages de gating GL effectifs. */
router.get(
  '/settings',
  requireGlAuth,
  requireGlPermission('gl.content.manage'),
  async (req, res) => {
    try {
      return res.json({
        gating: await getGlGatingSettings(),
        resource_types: ALLOWED,
        keys: GATING_KEYS,
      });
    } catch (err) {
      logRouteError(err, req, 'gl-learning-links:settings:get');
      return respondInternalError(res, req, err);
    }
  },
);

/** PUT /api/gl/learning-links/settings — modifier un reglage de gating (gl.settings.manage). */
router.put(
  '/settings',
  requireGlAuth,
  requireGlPermission('gl.settings.manage'),
  async (req, res) => {
    try {
      const body = req.body || {};
      const key = String(body.key || '').trim();
      const result = await setGlGatingSetting(key, body.value, actor(req).userId);
      if (!result.ok) return res.status(400).json({ error: result.error });
      return res.json({
        success: true,
        key: result.key,
        value: result.value,
        gating: await getGlGatingSettings(),
      });
    } catch (err) {
      logRouteError(err, req, 'gl-learning-links:settings:put');
      return respondInternalError(res, req, err);
    }
  },
);

/** PUT /api/gl/learning-links/chapter-granularity — surcharge par chapitre de jeu (gl.settings.manage). */
router.put(
  '/chapter-granularity',
  requireGlAuth,
  requireGlPermission('gl.settings.manage'),
  async (req, res) => {
    try {
      const id = Number((req.body || {}).chapterId);
      if (!Number.isFinite(id) || id <= 0)
        return res.status(400).json({ error: 'Chapitre invalide' });
      const raw = (req.body || {}).granularity;
      const granularity = raw == null || raw === '' ? null : core.normalizeGranularity(raw);
      if (raw != null && raw !== '' && !granularity) {
        return res.status(400).json({ error: 'Granularite invalide' });
      }
      const result = await execute('UPDATE gl_chapters SET gating_granularity = ? WHERE id = ?', [
        granularity,
        id,
      ]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Chapitre introuvable' });
      return res.json({ success: true, chapterId: id, granularity });
    } catch (err) {
      logRouteError(err, req, 'gl-learning-links:chapter-granularity');
      return respondInternalError(res, req, err);
    }
  },
);

/** PUT /api/gl/learning-links/scope-granularity — surcharge par scope lore (gl.settings.manage). */
router.put(
  '/scope-granularity',
  requireGlAuth,
  requireGlPermission('gl.settings.manage'),
  async (req, res) => {
    try {
      const slug = String((req.body || {}).scopeSlug || '').trim();
      if (!slug) return res.status(400).json({ error: 'Scope invalide' });
      const raw = (req.body || {}).granularity;
      const granularity = raw == null || raw === '' ? null : core.normalizeGranularity(raw);
      if (raw != null && raw !== '' && !granularity) {
        return res.status(400).json({ error: 'Granularite invalide' });
      }
      const result = await execute(
        'UPDATE gl_qcm_lore_scopes SET gating_granularity = ? WHERE slug = ?',
        [granularity, slug],
      );
      if (!result.affectedRows) return res.status(404).json({ error: 'Scope introuvable' });
      return res.json({ success: true, scopeSlug: slug, granularity });
    } catch (err) {
      logRouteError(err, req, 'gl-learning-links:scope-granularity');
      return respondInternalError(res, req, err);
    }
  },
);

/** POST /api/gl/learning-links/review — valider/rejeter en masse (phase 2 : liens auto-suggeres). */
router.post(
  '/review',
  requireGlAuth,
  requireGlPermission('gl.content.manage'),
  async (req, res) => {
    try {
      const body = req.body || {};
      const action = String(body.action || '').trim();
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: "Action attendue: 'approve' ou 'reject'" });
      }
      const ids = (Array.isArray(body.ids) ? body.ids : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length) return res.status(400).json({ error: 'Aucun identifiant fourni' });
      const status = action === 'approve' ? 'approved' : 'rejected';
      const placeholders = ids.map(() => '?').join(', ');
      const result = await execute(
        `UPDATE gl_resource_question_links SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`,
        [status, ...ids],
      );
      return res.json({ success: true, status, updated: result.affectedRows });
    } catch (err) {
      logRouteError(err, req, 'gl-learning-links:review');
      return respondInternalError(res, req, err);
    }
  },
);

module.exports = router;
