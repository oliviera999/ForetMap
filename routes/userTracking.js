'use strict';

/**
 * Routes admin de suivi utilisateurs : présence, activité légère, passage identifié.
 * Permission : `admin.settings.read` (comme GET /api/admin/usage).
 */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { requirePermission } = require('../middleware/requireTeacher');
const { isProductId } = require('../lib/products');
const { usageDay } = require('../lib/usage');
const { buildAdminPresenceSnapshot } = require('../lib/adminPresence');
const { listActivityEvents, listUserPassageSummary } = require('../lib/userTracking');

const router = express.Router();

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultDayRange(query = {}) {
  const today = usageDay();
  const defaultFrom = usageDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const from = DAY_RE.test(String(query.from || '')) ? String(query.from) : defaultFrom;
  const to = DAY_RE.test(String(query.to || '')) ? String(query.to) : today;
  return { from, to };
}

const productQuery = z.preprocess(
  (v) => (isProductId(String(v || '').toLowerCase()) ? String(v).toLowerCase() : undefined),
  z.string().optional(),
);

const presenceQuerySchema = z.object({
  product: productQuery,
});

const rangeQuerySchema = z.object({
  from: z.preprocess(
    (v) => (DAY_RE.test(String(v || '')) ? String(v) : undefined),
    z.string().optional(),
  ),
  to: z.preprocess(
    (v) => (DAY_RE.test(String(v || '')) ? String(v) : undefined),
    z.string().optional(),
  ),
  product: productQuery,
  userId: z.preprocess((v) => {
    const s = String(v || '').trim();
    return s ? s.slice(0, 64) : undefined;
  }, z.string().optional()),
  limit: z.preprocess(
    (v) => parseInt(v, 10) || 100,
    z.number().transform((n) => Math.max(1, Math.min(n, 200))),
  ),
});

router.get(
  '/presence',
  requirePermission('admin.settings.read'),
  validate({ query: presenceQuerySchema }),
  asyncHandler(async (req, res) => {
    const { listOnlinePresenceEntries } = require('../lib/realtime');
    const snapshot = await buildAdminPresenceSnapshot({
      listOnlineEntries: listOnlinePresenceEntries,
      product: req.validatedQuery.product || null,
    });
    return res.json(snapshot);
  }),
);

router.get(
  '/activity',
  requirePermission('admin.settings.read'),
  validate({ query: rangeQuerySchema }),
  asyncHandler(async (req, res) => {
    const { from, to } = defaultDayRange(req.validatedQuery);
    const rows = await listActivityEvents({
      from,
      to,
      product: req.validatedQuery.product || null,
      userId: req.validatedQuery.userId || null,
      limit: req.validatedQuery.limit,
    });
    return res.json({
      from,
      to,
      product: req.validatedQuery.product || null,
      userId: req.validatedQuery.userId || null,
      rows,
    });
  }),
);

router.get(
  '/user-passage',
  requirePermission('admin.settings.read'),
  validate({ query: rangeQuerySchema }),
  asyncHandler(async (req, res) => {
    const { from, to } = defaultDayRange(req.validatedQuery);
    const summary = await listUserPassageSummary({
      from,
      to,
      product: req.validatedQuery.product || null,
    });
    return res.json({
      from,
      to,
      product: req.validatedQuery.product || null,
      ...summary,
    });
  }),
);

module.exports = router;
