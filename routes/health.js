'use strict';

/**
 * Routes de santé / readiness (extraites de server.js — déplacement pur).
 * Chemins absolus dans le routeur : montage via `app.use(healthRouter)` en conservant
 * l'ordre d'origine. Ces chemins sont exemptés du middleware de disponibilité /api
 * (voir `isApiAvailabilityExemptPath` dans server.js) : toujours joignables pendant
 * le boot ou un redémarrage.
 */

const crypto = require('node:crypto');
const express = require('express');
const { ping: dbPing, isApplicationDatabaseReady } = require('../database');
const logger = require('../lib/logger');

const router = express.Router();

// Route de santé sans BDD — pour le contrôle de disponibilité (o2switch / Passenger).
// `frontend` (`dist` | `missing` | `dev`, lib/spaFallback.js `resolveFrontendMode`) : le cron de
// déploiement y repère un serveur démarré sans `dist/`, resté sur la page d'aide.
router.get('/api/health', (req, res) => {
  const frontend = req.app?.locals?.frontendMode || 'dev';
  res.type('application/json').status(200).json({ ok: true, frontend });
});
router.get('/health', (req, res) => {
  res.type('application/json').status(200).json({ ok: true });
});

router.get('/api/health/db', async (req, res) => {
  try {
    await dbPing();
    res.type('application/json').status(200).json({ ok: true, database: true });
  } catch (err) {
    logger.warn({ err }, 'Health check BDD en échec');
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

/**
 * Prêt à recevoir le trafic métier : init BDD terminée + ping courant OK.
 * 503 pendant le boot ou si MySQL est indisponible (sonde type load balancer / orchestrateur).
 */
router.get('/api/ready', async (req, res) => {
  if (!isApplicationDatabaseReady()) {
    return res.status(503).type('application/json').json({
      ok: false,
      ready: false,
      error: 'Service non prêt — initialisation base de données incomplète',
    });
  }
  try {
    await dbPing();
    return res.type('application/json').status(200).json({ ok: true, ready: true, database: true });
  } catch (err) {
    logger.warn({ err }, 'Readiness : ping BDD en échec');
    return res.status(503).type('application/json').json({
      ok: false,
      ready: false,
      database: false,
      error: 'Database unavailable',
    });
  }
});

/**
 * Comparaison en temps constant d'un jeton d'en-tête : les deux valeurs sont d'abord hachées
 * (sha256), si bien que ni le contenu ni la **longueur** du jeton attendu ne fuient par le
 * temps de réponse (`timingSafeEqual` exige deux tampons de même taille).
 */
function healthTokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Rapport de santé complet (connecteur MCP, `lib/mcp/health/`) pour une sonde externe : le
 * workflow GitHub `health-check.yml` et le script cron `scripts/health-report.js`.
 *
 * - **404** tant que `MCP_HEALTH_TOKEN` n'est pas configuré (la route n'existe pas) ;
 * - **401** sans en-tête `X-Health-Token` ou avec un jeton faux (comparaison en temps constant) ;
 * - **200** `{ status, summary, findings, … }`, y compris quand le statut est rouge : c'est
 *   l'appelant qui décide (le workflow échoue sur `status: "red"`).
 *
 * Exempté du verrou « base pas prête » (comme les diagnostics) : une base injoignable est
 * justement ce que le rapport doit dire. Paramètres : `tls=0`, `audit=0` pour alléger.
 * Aucune donnée de personne : compteurs, états, versions, tailles.
 */
router.get('/api/health/report', async (req, res) => {
  const expected = String(process.env.MCP_HEALTH_TOKEN || '').trim();
  if (!expected) return res.status(404).json({ error: 'Not found' });
  if (!healthTokenMatches(req.get('x-health-token'), expected)) {
    return res.status(401).json({ error: 'Jeton de rapport de santé invalide' });
  }
  try {
    const { buildHealthReport } = require('../lib/mcp/health/collect');
    const report = await buildHealthReport({
      skipTls: req.query.tls === '0',
      skipAudit: req.query.audit === '0',
    });
    res.set('Cache-Control', 'no-store');
    return res.type('application/json').status(200).json(report);
  } catch (err) {
    logger.error({ err, msg: 'health_report_failed' }, 'Rapport de santé en échec');
    return res.status(500).json({ error: 'Rapport de santé indisponible' });
  }
});

module.exports = router;
module.exports.healthTokenMatches = healthTokenMatches;
