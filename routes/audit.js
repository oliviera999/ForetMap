const express = require('express');
const { queryAll } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
// Journal d'audit : `logAudit` / `logSecurityEvent` vivent dans `lib/auditLog.js` (lot 1) ;
// ré-exportés ci-dessous pour les anciens `require('./audit')`.
const { logAudit, logSecurityEvent } = require('../lib/auditLog');
const {
  DAY_RE,
  resolveSecurityDayRange,
  listSecurityEvents,
  securityEventsToCsv,
} = require('../lib/securityEventsQuery');

const router = express.Router();

// `limit` : coercition tolérante reproduisant `parseInt(limit, 10) || 50` borné à [1, 200]
// (un `limit` absent / non numérique / 0 retombe sur 50 ; jamais de 400).
const auditQuerySchema = z.object({
  limit: z.preprocess(
    (v) => parseInt(v, 10) || 50,
    z.number().transform((n) => Math.max(1, Math.min(n, 200))),
  ),
});

const optionalDay = z.preprocess(
  (v) => (DAY_RE.test(String(v || '')) ? String(v) : undefined),
  z.string().optional(),
);

const securityQuerySchema = z.object({
  from: optionalDay,
  to: optionalDay,
  actorUserId: z.preprocess((v) => {
    const s = String(v || '').trim();
    return s ? s.slice(0, 64) : undefined;
  }, z.string().optional()),
  action: z.preprocess((v) => {
    const s = String(v || '').trim();
    return s ? s.slice(0, 96) : undefined;
  }, z.string().optional()),
  ip: z.preprocess((v) => {
    const s = String(v || '').trim();
    return s ? s.slice(0, 64) : undefined;
  }, z.string().optional()),
  result: z.preprocess((v) => {
    const s = String(v || '')
      .trim()
      .toLowerCase();
    return s ? s.slice(0, 16) : undefined;
  }, z.string().optional()),
  limit: z.preprocess(
    (v) => parseInt(v, 10) || 100,
    z.number().transform((n) => Math.max(1, Math.min(n, 200))),
  ),
  offset: z.preprocess(
    (v) => Math.max(0, parseInt(v, 10) || 0),
    z.number().transform((n) => Math.min(n, 100000)),
  ),
});

const securityExportQuerySchema = securityQuerySchema.extend({
  format: z.preprocess(
    (v) => {
      const s = String(v || 'csv')
        .trim()
        .toLowerCase();
      return s === 'json' ? 'json' : 'csv';
    },
    z.enum(['csv', 'json']),
  ),
  // Export : plafond plus haut que la liste UI (toujours borné).
  limit: z.preprocess(
    (v) => parseInt(v, 10) || 5000,
    z.number().transform((n) => Math.max(1, Math.min(n, 5000))),
  ),
});

// Consulter l'historique (prof uniquement)
router.get(
  '/',
  requirePermission('audit.read'),
  validate({ query: auditQuerySchema }),
  asyncHandler(async (req, res) => {
    const { limit } = req.validatedQuery;
    // `limit` est borne par le schema de query ; parametre par convention (audit 2026-09, G5).
    const rows = await queryAll('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [
      String(limit),
    ]);
    res.json(rows);
  }),
);

/** Journal de sécurité (IP / UA) — administrateurs uniquement. */
router.get(
  '/security',
  requirePermission('audit.security.read'),
  validate({ query: securityQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery;
    const { from, to } = resolveSecurityDayRange(q);
    const payload = await listSecurityEvents({
      from,
      to,
      actorUserId: q.actorUserId || null,
      action: q.action || null,
      ip: q.ip || null,
      result: q.result || null,
      limit: q.limit,
      offset: q.offset,
    });
    res.json(payload);
  }),
);

/** Export CSV / JSON du journal de sécurité. */
router.get(
  '/security/export',
  requirePermission('audit.security.read'),
  validate({ query: securityExportQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery;
    const { from, to } = resolveSecurityDayRange(q);
    const payload = await listSecurityEvents({
      from,
      to,
      actorUserId: q.actorUserId || null,
      action: q.action || null,
      ip: q.ip || null,
      result: q.result || null,
      limit: q.limit,
      offset: 0,
    });
    const stamp = `${from}_${to}`.replace(/[^0-9_-]/g, '');
    if (q.format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="foretmap-security-events-${stamp}.json"`,
      );
      return res.json(payload);
    }
    const csv = securityEventsToCsv(payload.rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="foretmap-security-events-${stamp}.csv"`,
    );
    return res.send(csv);
  }),
);

module.exports = router;
module.exports.logAudit = logAudit;
module.exports.logSecurityEvent = logSecurityEvent;
module.exports.auditQuerySchema = auditQuerySchema; // exporté pour test no-DB du contrat O7
module.exports.securityQuerySchema = securityQuerySchema;
module.exports.securityExportQuerySchema = securityExportQuerySchema;
