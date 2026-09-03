'use strict';

/**
 * Compteur d'usage anonyme (lot 1 du plan de convergence) — voir `lib/usage.js`.
 *
 * - `POST /api/usage` : public, sans session ni cookie ; corps `{ product, event, key? }` ou
 *   `{ events: [...] }` (20 au plus). Réponse 204. Un événement hors liste blanche → 400.
 *   Pensé pour `navigator.sendBeacon` (corps JSON en `Blob`).
 * - `GET /api/admin/usage?from&to&product` : compteurs par jour, permission
 *   `admin.settings.read`. Bornes par défaut : les 30 derniers jours.
 *
 * Écrit sur la convention cible du dépôt : `asyncHandler` + `validate` (schémas de query
 * permissifs, jamais de 400 nouveau sur un paramètre optionnel) + handler d'erreurs central.
 */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { requirePermission } = require('../middleware/requireTeacher');
const {
  BATCH_MAX_EVENTS,
  normalizeUsageEvent,
  recordUsageEvents,
  listUsageCounters,
  usageDay,
} = require('../lib/usage');
const { isProductId } = require('../lib/products');

const publicRouter = express.Router();
const adminRouter = express.Router();

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function extractRawEvents(body) {
  if (body && Array.isArray(body.events)) return body.events;
  if (body && (body.event || body.product)) return [body];
  return [];
}

publicRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const raw = extractRawEvents(req.body);
    if (!raw.length) return res.status(400).json({ error: 'Aucun événement' });
    if (raw.length > BATCH_MAX_EVENTS) {
      return res.status(400).json({ error: `Au plus ${BATCH_MAX_EVENTS} événements par envoi` });
    }
    const events = [];
    for (const item of raw) {
      const checked = normalizeUsageEvent(item);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      events.push(checked.value);
    }
    await recordUsageEvents(events);
    return res.status(204).end();
  }),
);

// Bornes tolérantes : un jour illisible retombe sur la plage par défaut, jamais de 400.
const adminUsageQuerySchema = z.object({
  from: z.preprocess(
    (v) => (DAY_RE.test(String(v || '')) ? String(v) : undefined),
    z.string().optional(),
  ),
  to: z.preprocess(
    (v) => (DAY_RE.test(String(v || '')) ? String(v) : undefined),
    z.string().optional(),
  ),
  product: z.preprocess(
    (v) => (isProductId(String(v || '').toLowerCase()) ? String(v).toLowerCase() : undefined),
    z.string().optional(),
  ),
});

adminRouter.get(
  '/',
  requirePermission('admin.settings.read'),
  validate({ query: adminUsageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { from, to, product } = req.validatedQuery;
    const today = usageDay();
    const defaultFrom = usageDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
    const rows = await listUsageCounters({
      from: from || defaultFrom,
      to: to || today,
      product: product || null,
    });
    return res.json({ from: from || defaultFrom, to: to || today, product: product || null, rows });
  }),
);

module.exports = { publicRouter, adminRouter };
