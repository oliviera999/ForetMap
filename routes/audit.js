const express = require('express');
const { queryAll } = require('../database');
const { requirePermission, hasPermission } = require('../middleware/requireTeacher');
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
const { CATEGORY_IDS, catalogPayload } = require('../lib/auditJournal/catalog');
const {
  listJournalEvents,
  listJournalActors,
  getJournalActorSummary,
} = require('../lib/auditJournal/query');

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

/** Chaîne optionnelle rognée et tronquée (vide → absent ; jamais de 400). */
function optionalText(max) {
  return z.preprocess((v) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : undefined;
  }, z.string().optional());
}

/** Liste fermée tolérante : valeur hors liste → absent. */
function optionalEnum(values) {
  return z.preprocess((v) => {
    const s = String(v ?? '')
      .trim()
      .toLowerCase();
    return values.includes(s) ? s : undefined;
  }, z.string().optional());
}

/**
 * Filtres communs des journaux (historique, sécurité, utilisateurs). `mode` : `main`
 * (événements principaux : hors routine, échecs toujours inclus) ou `all` (vue étendue,
 * défaut — compatibilité des appels existants).
 */
const journalFilterFields = {
  from: optionalDay,
  to: optionalDay,
  actorUserId: optionalText(64),
  actorQuery: optionalText(80),
  actorType: optionalEnum(['student', 'teacher', 'admin', 'staff', 'gl_player', 'visitor']),
  action: optionalText(96),
  category: optionalEnum(CATEGORY_IDS),
  mode: z.preprocess(
    (v) =>
      String(v ?? '')
        .trim()
        .toLowerCase() === 'main'
        ? 'main'
        : 'all',
    z.enum(['main', 'all']),
  ),
  result: z.preprocess((v) => {
    const s = String(v || '')
      .trim()
      .toLowerCase();
    return s ? s.slice(0, 16) : undefined;
  }, z.string().optional()),
  q: optionalText(120),
  targetId: optionalText(64),
  limit: z.preprocess(
    (v) => parseInt(v, 10) || 100,
    z.number().transform((n) => Math.max(1, Math.min(n, 200))),
  ),
  offset: z.preprocess(
    (v) => Math.max(0, parseInt(v, 10) || 0),
    z.number().transform((n) => Math.min(n, 100000)),
  ),
};

const historyQuerySchema = z.object(journalFilterFields);

const securityQuerySchema = z.object({
  ...journalFilterFields,
  ip: optionalText(64),
});

const usersQuerySchema = z.object({
  ...journalFilterFields,
  source: optionalEnum(['audit', 'security']),
  sort: optionalEnum(['recent', 'count', 'failures']),
  limit: z.preprocess(
    (v) => parseInt(v, 10) || 50,
    z.number().transform((n) => Math.max(1, Math.min(n, 200))),
  ),
});

const userIdParamsSchema = z.object({
  userId: z.string().trim().min(1).max(64),
});

/** Filtres normalisés passés au module `lib/auditJournal`. */
function journalFilters(q) {
  const { from, to } = resolveSecurityDayRange(q);
  return {
    from,
    to,
    actorUserId: q.actorUserId || null,
    actorQuery: q.actorQuery || null,
    actorType: q.actorType || null,
    action: q.action || null,
    category: q.category || null,
    mode: q.mode || 'all',
    result: q.result || null,
    q: q.q || null,
    targetId: q.targetId || null,
    ip: q.ip || null,
    sort: q.sort || null,
    limit: q.limit,
    offset: q.offset,
  };
}

/**
 * Source de l'onglet « Utilisateurs » : le journal de sécurité (connexions comprises) pour
 * qui peut le lire, sinon le journal d'audit. Demander `security` sans le droit → 403.
 */
function resolveUsersSource(req, res) {
  const canSecurity = hasPermission(req.auth, 'audit.security.read');
  const asked = req.validatedQuery.source;
  if (asked === 'security' && !canSecurity) {
    res.status(403).json({ error: 'Journal de sécurité réservé aux administrateurs' });
    return null;
  }
  return asked || (canSecurity ? 'security' : 'audit');
}

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

/** Catalogue des catégories et libellés d'actions (filtres du front). */
router.get(
  '/catalog',
  requirePermission('audit.read'),
  asyncHandler(async (_req, res) => {
    res.json(catalogPayload());
  }),
);

/**
 * Historique filtré et enrichi (journal d'audit) : nom de l'acteur, libellé de l'action,
 * catégorie, cible lisible, pagination. Sans IP ni navigateur (réservés à `/security`).
 */
router.get(
  '/history',
  requirePermission('audit.read'),
  validate({ query: historyQuerySchema }),
  asyncHandler(async (req, res) => {
    const filters = journalFilters(req.validatedQuery);
    filters.ip = null;
    res.json(await listJournalEvents('audit', filters));
  }),
);

/** Activité agrégée par utilisateur (onglet « Utilisateurs »). */
router.get(
  '/users',
  requirePermission('audit.read'),
  validate({ query: usersQuerySchema }),
  asyncHandler(async (req, res) => {
    const source = resolveUsersSource(req, res);
    if (!source) return;
    const filters = journalFilters(req.validatedQuery);
    if (source !== 'security') filters.ip = null;
    const payload = await listJournalActors(source, filters);
    res.json({ ...payload, source });
  }),
);

/** Fiche d'activité d'un utilisateur sur la période. */
router.get(
  '/users/:userId',
  requirePermission('audit.read'),
  validate({ params: userIdParamsSchema, query: usersQuerySchema }),
  asyncHandler(async (req, res) => {
    const source = resolveUsersSource(req, res);
    if (!source) return;
    const filters = journalFilters(req.validatedQuery);
    res.json(await getJournalActorSummary(source, req.validatedParams.userId, filters));
  }),
);

/** Journal de sécurité (IP / UA) — administrateurs uniquement. */
router.get(
  '/security',
  requirePermission('audit.security.read'),
  validate({ query: securityQuerySchema }),
  asyncHandler(async (req, res) => {
    const payload = await listSecurityEvents(journalFilters(req.validatedQuery));
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
    const payload = await listSecurityEvents({ ...journalFilters(q), offset: 0 });
    const { from, to } = payload;
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
module.exports.historyQuerySchema = historyQuerySchema;
module.exports.usersQuerySchema = usersQuerySchema;
