const express = require('express');
const { queryAll } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
// Journal d'audit : `logAudit` / `logSecurityEvent` vivent dans `lib/auditLog.js` (lot 1) ;
// ré-exportés ci-dessous pour les anciens `require('./audit')`.
const { logAudit, logSecurityEvent } = require('../lib/auditLog');

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

module.exports = router;
module.exports.logAudit = logAudit;
module.exports.logSecurityEvent = logSecurityEvent;
module.exports.auditQuerySchema = auditQuerySchema; // exporté pour test no-DB du contrat O7
