const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { ensureCanonicalUserByAuth, resolveActorFromReq } = require('../lib/identity');

const router = express.Router();

// Consulter l'historique (prof uniquement)
router.get('/', requirePermission('audit.read', { needsElevation: true }), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const rows = await queryAll(
      'SELECT * FROM audit_log ORDER BY id DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Enregistre une action dans l'audit log.
 * Importé et appelé depuis les autres routes.
 */
async function resolveCanonicalActorId(actorUserType, actorUserId) {
  if (!actorUserType || !actorUserId) return null;
  const existing = await queryOne(
    'SELECT id FROM users WHERE user_type = ? AND legacy_user_id = ? LIMIT 1',
    [actorUserType, actorUserId]
  );
  if (existing?.id) return existing.id;
  const fromAuth = await ensureCanonicalUserByAuth({ userType: actorUserType, userId: actorUserId });
  return fromAuth || null;
}

async function logSecurityEvent(action, options = {}) {
  try {
    const req = options.req || null;
    const actorFromReq = resolveActorFromReq(req);
    const actorUserType = options.actorUserType || actorFromReq.actorUserType || null;
    const actorLegacyUserId = options.actorUserId || actorFromReq.actorLegacyUserId || null;
    const actorUserId = options.actorUserCanonicalId
      || await resolveCanonicalActorId(actorUserType, actorLegacyUserId);
    const payload = options.payload ? JSON.stringify(options.payload) : null;
    await execute(
      `INSERT INTO security_events
        (occurred_at, actor_user_id, actor_user_type, action, target_type, target_id, result, reason, ip_address, user_agent, payload_json)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actorUserId,
        actorUserType,
        action,
        options.targetType || null,
        options.targetId || null,
        options.result || 'success',
        options.reason || null,
        req?.ip || null,
        req?.headers?.['user-agent'] || null,
        payload,
      ]
    );
  } catch (_) {
    // Ne pas bloquer la route appelante.
  }
}

async function logAudit(action, targetType, targetId, details, options = {}) {
  try {
    const req = options.req || null;
    const actorFromReq = resolveActorFromReq(req);
    const actorUserType = options.actorUserType || actorFromReq.actorUserType || null;
    const actorLegacyUserId = options.actorUserId || actorFromReq.actorLegacyUserId || null;
    const actorUserId = options.actorUserCanonicalId
      || await resolveCanonicalActorId(actorUserType, actorLegacyUserId);
    const payload = options.payload ? JSON.stringify(options.payload) : null;
    await execute(
      `INSERT INTO audit_log
        (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        action,
        targetType,
        targetId || null,
        details || null,
        actorUserType,
        actorUserId,
        options.result || 'success',
        new Date().toISOString(),
        payload,
      ]
    );
    await logSecurityEvent(action, {
      req,
      actorUserType,
      actorUserCanonicalId: actorUserId,
      targetType,
      targetId,
      result: options.result || 'success',
      reason: options.reason || null,
      payload: options.payload || null,
    });
  } catch (_) {
    // Ne pas bloquer l'action principale si l'audit échoue
  }
}

module.exports = router;
module.exports.logAudit = logAudit;
module.exports.logSecurityEvent = logSecurityEvent;
