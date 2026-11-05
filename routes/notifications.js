const express = require('express');
const { queryAll, queryOne } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { logAudit } = require('../lib/auditLog');
const { getActor } = require('../lib/shared/participationGuards');
const { canBypassGroupScope, isGroupInManageScope } = require('../lib/groupScope');
const {
  TARGET_TYPES,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  notifyUsers,
} = require('../lib/notifications');

const router = express.Router();

router.use(requireAuth);

/** Toutes les routes ne lisent et n'écrivent que les notifications du compte connecté. */
function ownUserId(req, res) {
  const actor = getActor(req.auth);
  if (!actor) {
    res.status(401).json({ error: 'Session invalide' });
    return null;
  }
  return actor.userId;
}

function parseNotificationId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? String(id) : null;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = ownUserId(req, res);
    if (!userId) return;
    const payload = await listNotificationsForUser(userId, {
      limit: req.query.limit,
      before: req.query.before,
    });
    return res.json(payload);
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const userId = ownUserId(req, res);
    if (!userId) return;
    const updated = await markAllNotificationsRead(userId);
    return res.json({ ok: true, updated });
  }),
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const userId = ownUserId(req, res);
    if (!userId) return;
    const id = parseNotificationId(req.params.id);
    if (!id || !(await markNotificationRead(userId, id))) {
      return res.status(404).json({ error: 'Notification introuvable' });
    }
    return res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = ownUserId(req, res);
    if (!userId) return;
    const id = parseNotificationId(req.params.id);
    if (!id || !(await deleteNotification(userId, id))) {
      return res.status(404).json({ error: 'Notification introuvable' });
    }
    return res.json({ ok: true });
  }),
);

// ── Envoi d'une notification libre (`notifications.send`) ─────────────────────────────────

/** Plafonds : un message court, un nombre de destinataires raisonnable. */
const SEND_TITLE_MAX = 200;
const SEND_BODY_MAX = 500;
const SEND_USER_IDS_MAX = 500;
const SEND_RECIPIENTS_MAX = 2000;

const idString = z.string().trim().min(1).max(64);

/**
 * `link` : élément que le client sait ouvrir (même catalogue que les notifications métier :
 * tâche, lieu, sujet de forum, section des réglages). Pas d'URL libre : le centre de
 * notifications ne sait ouvrir que ces cibles.
 */
const sendLinkSchema = z
  .object({
    type: z.enum(TARGET_TYPES),
    id: idString.optional(),
    map_id: idString.optional(),
    kind: z.enum(['zone', 'marker']).optional(),
    post_id: idString.optional(),
    section: z.string().trim().min(1).max(64).optional(),
    filter: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

const sendTargetSchema = z
  .object({
    user_ids: z.array(idString).min(1).max(SEND_USER_IDS_MAX).optional(),
    group_id: idString.optional(),
    all: z.literal(true).optional(),
    user_type: z.enum(['student', 'teacher']).optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    const chosen = ['user_ids', 'group_id', 'all'].filter((k) => t[k] !== undefined);
    if (chosen.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Une seule cible : user_ids, group_id ou all',
        path: [],
      });
    }
  });

const sendBodySchema = z
  .object({
    title: z.string().trim().min(1).max(SEND_TITLE_MAX),
    body: z.string().trim().max(SEND_BODY_MAX).optional(),
    link: sendLinkSchema.optional(),
    target: sendTargetSchema,
  })
  .strict();

/** Destinataires actifs d'une cible (identifiants uniques). */
async function resolveSendRecipients(target) {
  const typeClause = target.user_type ? ' AND u.user_type = ?' : '';
  const typeParams = target.user_type ? [target.user_type] : [];
  let rows;
  if (target.user_ids) {
    const ids = [...new Set(target.user_ids)];
    rows = await queryAll(
      `SELECT u.id FROM users u
        WHERE u.id IN (${ids.map(() => '?').join(', ')}) AND u.is_active = 1${typeClause}`,
      [...ids, ...typeParams],
    );
  } else if (target.group_id) {
    rows = await queryAll(
      `SELECT DISTINCT u.id FROM group_members gm
         INNER JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ? AND u.is_active = 1${typeClause}`,
      [target.group_id, ...typeParams],
    );
  } else {
    rows = await queryAll(
      `SELECT u.id FROM users u WHERE u.is_active = 1${typeClause}`,
      typeParams,
    );
  }
  return [...new Set(rows.map((r) => String(r.id)))];
}

/**
 * `POST /api/notifications/send` : notification libre (titre, texte, lien optionnel) à des
 * comptes choisis, aux membres d'un groupe ou à tous les comptes actifs. L'auteur n'est
 * jamais notifié de son propre envoi (règle commune de `lib/notifications.js`).
 *
 * Périmètre : sans vue globale (`canBypassGroupScope`), seul un groupe de son périmètre est
 * admis — ni liste de comptes, ni « tous ».
 */
router.post(
  '/send',
  requirePermission('notifications.send'),
  validate({ body: sendBodySchema }),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const { title, body, link, target } = req.body;
    const globalScope = canBypassGroupScope(req.auth);
    if (target.group_id) {
      const group = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [
        target.group_id,
      ]);
      if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
      if (!(await isGroupInManageScope(req.auth, target.group_id))) {
        return res.status(403).json({ error: 'Groupe hors périmètre' });
      }
    } else if (!globalScope) {
      return res
        .status(403)
        .json({ error: 'Sans vue globale, seule une notification à un groupe est admise' });
    }
    const recipients = (await resolveSendRecipients(target)).filter(
      (id) => id !== String(actor.userId),
    );
    if (!recipients.length) return res.status(400).json({ error: 'Aucun destinataire actif' });
    if (recipients.length > SEND_RECIPIENTS_MAX) {
      return res.status(400).json({
        error: `Trop de destinataires (${recipients.length}, ${SEND_RECIPIENTS_MAX} au plus)`,
      });
    }
    const result = await notifyUsers({
      userIds: recipients,
      kind: 'announcement',
      title,
      body: body || null,
      target: link
        ? {
            type: link.type,
            id: link.id,
            mapId: link.map_id,
            kind: link.kind,
            postId: link.post_id,
            section: link.section,
            filter: link.filter,
          }
        : null,
      actorUserId: actor.userId,
    });
    const targetKind = target.user_ids ? 'user_ids' : target.group_id ? 'group' : 'all';
    await logAudit('notification_send', 'notification', target.group_id || null, title, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: {
        target: targetKind,
        group_id: target.group_id || null,
        user_type: target.user_type || null,
        recipients: recipients.length,
        inserted: result.inserted,
        link_type: link ? link.type : null,
      },
    });
    return res.status(201).json({
      ok: true,
      target: targetKind,
      recipients: recipients.length,
      inserted: result.inserted,
    });
  }),
);

module.exports = router;
module.exports.sendBodySchema = sendBodySchema;
