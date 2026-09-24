const express = require('express');
const { requireAuth } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { getActor } = require('../lib/shared/participationGuards');
const {
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
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

module.exports = router;
