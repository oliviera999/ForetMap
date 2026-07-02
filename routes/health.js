'use strict';

/**
 * Routes de santé / readiness (extraites de server.js — déplacement pur).
 * Chemins absolus dans le routeur : montage via `app.use(healthRouter)` en conservant
 * l'ordre d'origine. Ces chemins sont exemptés du middleware de disponibilité /api
 * (voir `isApiAvailabilityExemptPath` dans server.js) : toujours joignables pendant
 * le boot ou un redémarrage.
 */

const express = require('express');
const { ping: dbPing, isApplicationDatabaseReady } = require('../database');
const logger = require('../lib/logger');

const router = express.Router();

// Route de santé sans BDD — pour le contrôle de disponibilité (o2switch / Passenger)
router.get('/api/health', (req, res) => {
  res.type('application/json').status(200).json({ ok: true });
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

module.exports = router;
