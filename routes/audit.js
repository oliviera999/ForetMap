const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const { nowIsoUtc } = require('../lib/shared/isoTimestamp');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { ensureCanonicalUserByAuth, resolveActorFromReq } = require('../lib/identity');
const logger = require('../lib/logger');

const router = express.Router();

// `limit` : coercition tolérante reproduisant `parseInt(limit, 10) || 50` borné à [1, 200]
// (un `limit` absent / non numérique / 0 retombe sur 50 ; jamais de 400).
const auditQuerySchema = z.object({
  limit: z.preprocess(
    (v) => parseInt(v, 10) || 50,
    z.number().transform((n) => Math.max(1, Math.min(n, 200))),
  ),
});

// Consulter l'historique (prof uniquement)
router.get(
  '/',
  requirePermission('audit.read'),
  validate({ query: auditQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit } = req.validatedQuery;
    const rows = await queryAll(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ${limit}`, []);
    res.json(rows);
  }),
);

/**
 * Enregistre une action dans l'audit log.
 * Importé et appelé depuis les autres routes.
 */
async function resolveCanonicalActorId(actorUserType, actorUserId) {
  if (!actorUserType || !actorUserId) return null;
  const existing = await queryOne('SELECT id FROM users WHERE user_type = ? AND id = ? LIMIT 1', [
    actorUserType,
    actorUserId,
  ]);
  if (existing?.id) return existing.id;
  const fromAuth = await ensureCanonicalUserByAuth({
    userType: actorUserType,
    userId: actorUserId,
  });
  return fromAuth || null;
}

async function logSecurityEvent(action, options = {}) {
  try {
    const req = options.req || null;
    const actorFromReq = resolveActorFromReq(req);
    const actorUserType = options.actorUserType || actorFromReq.actorUserType || null;
    const actorLegacyUserId = options.actorUserId || actorFromReq.actorUserId || null;
    const actorUserId =
      options.actorUserCanonicalId ||
      (await resolveCanonicalActorId(actorUserType, actorLegacyUserId));
    const payload = options.payload ? JSON.stringify(options.payload) : null;
    await execute(
      // `occurred_at` est en heure LOCALE serveur depuis l'origine de la table, et rien ne
      // permet de recaler l'historique a posteriori (pas de second horodatage de référence,
      // contrairement à `audit_log.created_at`). On garde donc NOW() : une colonne
      // homogène en local vaut mieux qu'une discontinuité de fuseau au milieu du journal.
      // Voir docs/AUDIT_BDD_2026-08.md §4.4.
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
      ],
    );
  } catch (err) {
    // Ne pas bloquer la route appelante — mais ne pas se taire non plus : c'est par ce
    // silence que les deux journaux pouvaient diverger sans que personne ne le sache.
    logger.warn({ err, action }, 'Écriture security_events en échec');
  }
}

async function logAudit(action, targetType, targetId, details, options = {}) {
  try {
    const req = options.req || null;
    const actorFromReq = resolveActorFromReq(req);
    const actorUserType = options.actorUserType || actorFromReq.actorUserType || null;
    const actorLegacyUserId = options.actorUserId || actorFromReq.actorUserId || null;
    const actorUserId =
      options.actorUserCanonicalId ||
      (await resolveCanonicalActorId(actorUserType, actorLegacyUserId));
    const payload = options.payload ? JSON.stringify(options.payload) : null;
    await execute(
      // `occurred_at` en UTC_TIMESTAMP() et non NOW() : la colonne décrit le MÊME instant
      // que `created_at`, qui est de l'ISO-8601 UTC. Avec NOW() les deux divergeaient de
      // l'offset Europe/Paris (+1 h ou +2 h selon la saison) sur toutes les lignes.
      // La migration 188 a recalé l'historique depuis `created_at`, qui fait foi.
      `INSERT INTO audit_log
        (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
      [
        action,
        targetType,
        targetId || null,
        details || null,
        actorUserType,
        actorUserId,
        options.result || 'success',
        nowIsoUtc(),
        payload,
      ],
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
  } catch (err) {
    // Ne pas bloquer l'action principale si l'audit échoue — mais laisser une trace.
    logger.warn({ err, action }, 'Écriture audit_log en échec');
  }
}

module.exports = router;
module.exports.logAudit = logAudit;
module.exports.logSecurityEvent = logSecurityEvent;
module.exports.auditQuerySchema = auditQuerySchema; // exporté pour test no-DB du contrat O7
