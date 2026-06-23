'use strict';

// API prof — gestion des liens « ressource <-> question » et de la politique de
// conditionnement du marquage (ForetMap). Backbone structurel : ces reglages sont
// inertes tant que learning.gating.enabled = false (aucun branchement runtime ici).
// Permission : plants.manage (gestion de contenu pedagogique, comme le quiz).

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError, respondInternalError } = require('../lib/routeLog');
const { getSettingValue } = require('../lib/settings');
const core = require('../lib/shared/resourceQuestionGatingCore');

const router = express.Router();
const managePermission = requirePermission('plants.manage');

const ALLOWED = core.FORETMAP_RESOURCE_TYPES;

function actor(req) {
  const a = req.auth || {};
  return { userType: a.userType || 'teacher', userId: a.userId || a.canonicalUserId || null };
}

async function getSiteGating() {
  return {
    enabled: await getSettingValue('learning.gating.enabled', false),
    autoMarkOnCorrect: await getSettingValue('learning.gating.auto_mark_on_correct', true),
    defaultMode: await getSettingValue('learning.gating.default_mode', 'any'),
    defaultRequiredCorrect: await getSettingValue('learning.gating.default_required_correct', 1),
  };
}

async function questionExists(code) {
  const row = await queryOne(
    'SELECT question_code FROM quiz_questions WHERE question_code = ? LIMIT 1',
    [code],
  );
  return !!row;
}

/** GET /api/learning-links — liste filtree (resourceType, resourceRef, questionCode, status). */
router.get('/', managePermission, async (req, res) => {
  try {
    const where = [];
    const params = [];
    const rt = core.normalizeResourceType(req.query.resourceType, ALLOWED);
    if (req.query.resourceType && !rt)
      return res.status(400).json({ error: 'Type de ressource invalide' });
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
    const sql = `SELECT * FROM resource_question_links
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY resource_type, resource_ref, question_code
                 LIMIT 1000`;
    const rows = await queryAll(sql, params);
    return res.json({ links: rows });
  } catch (err) {
    logRouteError(err, req, 'learning-links:list');
    return respondInternalError(res, req, err);
  }
});

/** POST /api/learning-links — creer/mettre a jour un lien (idempotent sur la cle unique). */
router.post('/', managePermission, async (req, res) => {
  try {
    const parsed = core.sanitizeLinkInput(req.body || {}, { allowedResourceTypes: ALLOWED });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const v = parsed.value;
    if (!(await questionExists(v.question_code))) {
      return res.status(404).json({ error: 'Question introuvable' });
    }
    const who = actor(req);
    await execute(
      `INSERT INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, confidence, status, note,
         created_by_user_type, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_gating = VALUES(is_gating), weight = VALUES(weight), origin = VALUES(origin),
         confidence = VALUES(confidence), status = VALUES(status), note = VALUES(note),
         updated_at = NOW()`,
      [
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
      `SELECT * FROM resource_question_links
        WHERE resource_type = ? AND resource_ref = ? AND question_code = ? LIMIT 1`,
      [v.resource_type, v.resource_ref, v.question_code],
    );
    return res.status(201).json({ link: row });
  } catch (err) {
    logRouteError(err, req, 'learning-links:create');
    return respondInternalError(res, req, err);
  }
});

/** PATCH /api/learning-links/:id — modifier is_gating / weight / status / note. */
router.patch('/:id', managePermission, async (req, res) => {
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
      `UPDATE resource_question_links SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params,
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Lien introuvable' });
    const row = await queryOne('SELECT * FROM resource_question_links WHERE id = ? LIMIT 1', [id]);
    return res.json({ link: row });
  } catch (err) {
    logRouteError(err, req, 'learning-links:update');
    return respondInternalError(res, req, err);
  }
});

/** DELETE /api/learning-links/:id */
router.delete('/:id', managePermission, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0)
      return res.status(400).json({ error: 'Identifiant invalide' });
    const result = await execute('DELETE FROM resource_question_links WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Lien introuvable' });
    return res.json({ success: true });
  } catch (err) {
    logRouteError(err, req, 'learning-links:delete');
    return respondInternalError(res, req, err);
  }
});

/** GET /api/learning-links/policy?resourceType=&resourceRef= — politique brute + effective. */
router.get('/policy', managePermission, async (req, res) => {
  try {
    const rt = core.normalizeResourceType(req.query.resourceType, ALLOWED);
    const ref = core.normalizeResourceRef(req.query.resourceRef);
    if (!rt || !ref) return res.status(400).json({ error: 'Ressource invalide' });
    const perResource = await queryOne(
      'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, ref],
    );
    const site = await getSiteGating();
    const effective = core.resolveEffectivePolicy({ perResource, site });
    return res.json({ policy: perResource || null, effective, site });
  } catch (err) {
    logRouteError(err, req, 'learning-links:policy:get');
    return respondInternalError(res, req, err);
  }
});

/** PUT /api/learning-links/policy — definir la politique d'une ressource. */
router.put('/policy', managePermission, async (req, res) => {
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
      `INSERT INTO resource_gating_policy
        (resource_type, resource_ref, mode, required_correct, enabled, updated_by_user_type, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         mode = VALUES(mode), required_correct = VALUES(required_correct), enabled = VALUES(enabled),
         updated_by_user_type = VALUES(updated_by_user_type), updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = NOW()`,
      [rt, ref, mode, requiredCorrect, enabled, who.userType, who.userId],
    );
    const perResource = await queryOne(
      'SELECT * FROM resource_gating_policy WHERE resource_type = ? AND resource_ref = ? LIMIT 1',
      [rt, ref],
    );
    const site = await getSiteGating();
    return res.json({
      policy: perResource,
      effective: core.resolveEffectivePolicy({ perResource, site }),
    });
  } catch (err) {
    logRouteError(err, req, 'learning-links:policy:put');
    return respondInternalError(res, req, err);
  }
});

/** GET /api/learning-links/config — reglages site effectifs (lecture seule ; ecriture via /api/settings). */
router.get('/config', managePermission, async (req, res) => {
  try {
    return res.json({ gating: await getSiteGating(), resource_types: ALLOWED });
  } catch (err) {
    logRouteError(err, req, 'learning-links:config');
    return respondInternalError(res, req, err);
  }
});

module.exports = router;
