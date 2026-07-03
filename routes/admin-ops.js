'use strict';

/**
 * Endpoints d'exploitation admin protégés par DEPLOY_SECRET (extraits de server.js —
 * déplacement pur) : restart, logs, diagnostics, oauth-debug.
 * Chemins absolus dans le routeur : montage via `app.use(createAdminOpsRouter(...))`
 * en conservant l'ordre d'origine. `gracefulShutdown` est injecté par server.js
 * (le cycle de vie du serveur HTTP reste sa responsabilité).
 */

const express = require('express');
const crypto = require('crypto');
const { ping: dbPing, queryAll } = require('../database');
const logger = require('../lib/logger');
const logMetrics = require('../lib/logMetrics');
const { getRuntimeProcessSnapshot } = require('../lib/runtimeDiagnostics');
const { getMascotPackLibProbe } = require('../lib/mascotPackValidatorResolve');
const { getVisitMascotHintSnapshot } = require('../lib/visitMascotDiagnostics');
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('../lib/logBuffer');
const { resolveOAuthPublicOrigin, resolveOAuthRedirectUri } = require('../lib/oauthPublicUrl');
const { normalizeOptionalString } = require('../lib/shared/httpHelpers');

const startupVersion = require('../package.json').version;

/** Comparaison de secret a temps constant (evite l'oracle temporel sur DEPLOY_SECRET). */
function timingSafeSecretEqual(provided, expected) {
  const a = Buffer.from(String(provided == null ? '' : provided));
  const b = Buffer.from(String(expected == null ? '' : expected));
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Garde DEPLOY_SECRET (en-tête `x-deploy-secret`, comparaison à temps constant).
 * `DEPLOY_SECRET` est lu à chaque requête (les tests le modifient au runtime).
 * @param {object} [options]
 * @param {boolean} [options.allowBodySecret=false] Accepte aussi `req.body.secret` (variante /restart).
 * @param {string}  [options.message] Message d'erreur 403 (conservé à l'identique par endpoint).
 */
function requireDeploySecret({
  allowBodySecret = false,
  message = 'Secret invalide ou DEPLOY_SECRET non configuré',
} = {}) {
  return (req, res, next) => {
    const secret = allowBodySecret
      ? req.headers['x-deploy-secret'] || req.body?.secret
      : req.headers['x-deploy-secret'];
    if (!process.env.DEPLOY_SECRET || !timingSafeSecretEqual(secret, process.env.DEPLOY_SECRET)) {
      return res.status(403).json({ error: message });
    }
    return next();
  };
}

/**
 * @param {{ gracefulShutdown: (reason: string) => void }} deps
 * @returns {import('express').Router}
 */
function createAdminOpsRouter({ gracefulShutdown }) {
  const router = express.Router();

  // Redémarrage déclenché après déploiement (secret requis ; le gestionnaire de process relance l'app)
  router.post(
    '/api/admin/restart',
    requireDeploySecret({ allowBodySecret: true, message: 'Secret invalide' }),
    (req, res) => {
      res.json({ ok: true, message: 'Redémarrage gracieux' });
      setTimeout(() => gracefulShutdown('restart'), 300);
    },
  );

  // Dernières lignes de log Pino (tampon mémoire) — même secret que /api/admin/restart ; uniquement en HTTPS en prod
  router.get('/api/admin/logs', requireDeploySecret(), (req, res) => {
    const raw = parseInt(req.query.lines, 10);
    const n = Number.isFinite(raw) ? raw : 200;
    const entries = tailLogLines(n);
    res.type('application/json').json({
      ok: true,
      returned: entries.length,
      bufferLines: getBufferedLineCount(),
      bufferMax: getMaxLines(),
      entries,
    });
  });

  // Instantané d’exploitation (secret requis) : version, uptime, mémoire, latence BDD, tampon logs — pour diag à distance / MCP
  router.get('/api/admin/diagnostics', requireDeploySecret(), async (req, res) => {
    const mem = process.memoryUsage();
    const toMb = (n) => Math.round((n / 1024 / 1024) * 100) / 100;
    let database = { ok: false };
    const t0 = performance.now();
    try {
      await dbPing();
      database = { ok: true, latencyMs: Math.round((performance.now() - t0) * 100) / 100 };
    } catch (err) {
      logger.warn({ err }, 'Diagnostics admin : ping BDD en échec');
      database = { ok: false, error: 'Database unavailable' };
    }
    const pkgVersion = startupVersion;
    let visitMascotHint = { maps: [], error: null };
    try {
      visitMascotHint = await getVisitMascotHintSnapshot(queryAll);
    } catch (err) {
      logger.warn({ err }, 'Diagnostics admin : agrégats visite (mascotte)');
      visitMascotHint = { maps: [], error: 'visit_mascot_hint_unavailable' };
    }
    let glDiagnostics = { ok: false, error: null };
    try {
      const games = await queryAll(`SELECT status, COUNT(*) AS c FROM gl_games GROUP BY status`);
      const playersRow = await queryAll('SELECT COUNT(*) AS c FROM gl_players WHERE is_active = 1');
      const eventsRecent = await queryAll(
        `SELECT event_type, COUNT(*) AS c
           FROM gl_game_events
          WHERE created_at > (NOW() - INTERVAL 24 HOUR)
          GROUP BY event_type
          ORDER BY c DESC
          LIMIT 10`,
      );
      const packsRow = await queryAll('SELECT COUNT(*) AS c FROM gl_mascot_packs');
      glDiagnostics = {
        ok: true,
        gamesByStatus: Object.fromEntries(games.map((row) => [row.status, Number(row.c)])),
        activePlayers: Number(playersRow?.[0]?.c || 0),
        recentEventTypes: eventsRecent.map((row) => ({
          eventType: row.event_type,
          count: Number(row.c),
        })),
        mascotPackCount: Number(packsRow?.[0]?.c || 0),
      };
    } catch (err) {
      logger.warn({ err }, 'Diagnostics admin : agrégats GL');
      glDiagnostics = { ok: false, error: 'gl_diagnostics_unavailable' };
    }
    res.type('application/json').json({
      ok: true,
      ts: new Date().toISOString(),
      version: pkgVersion,
      nodeEnv: process.env.NODE_ENV || null,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: toMb(mem.rss),
        heapUsedMb: toMb(mem.heapUsed),
        heapTotalMb: toMb(mem.heapTotal),
      },
      database,
      logBuffer: {
        linesCount: getBufferedLineCount(),
        maxLines: getMaxLines(),
      },
      metrics: logMetrics.getMetrics(),
      // Processus courant uniquement ; le nombre d’instances Passenger/PM2 se lit au panneau hébergeur.
      runtimeProcess: getRuntimeProcessSnapshot(),
      /** Par carte : volumes alignés sur GET /api/visit/content (mascotte si au moins un compteur public > 0). */
      visitMascotHint,
      /** Présence des fichiers `lib/visit-pack/*` (validation POST/PUT packs) — voir docs/EXPLOITATION.md si `libMirrorOk` est false. */
      mascotPackLibProbe: getMascotPackLibProbe(),
      /** Agrégats GL (Gnomes & Licornes) : statuts parties, joueurs actifs, types d'évènements récents, nb packs mascotte. */
      gl: glDiagnostics,
    });
  });

  // Diagnostic OAuth (sans secrets) : vérifie les URLs réellement résolues au runtime.
  router.get('/api/admin/oauth-debug', requireDeploySecret(), (req, res) => {
    const frontendOrigin =
      resolveOAuthPublicOrigin(req, process.env.FRONTEND_ORIGIN) ||
      resolveOAuthPublicOrigin(req, process.env.PASSWORD_RESET_BASE_URL);
    const redirectUri = resolveOAuthRedirectUri(req, {
      envRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
      callbackPath: '/api/auth/google/callback',
    });
    const glFrontendOrigin = resolveOAuthPublicOrigin(req, process.env.GL_FRONTEND_ORIGIN);
    const glRedirectUri = resolveOAuthRedirectUri(req, {
      envRedirectUri: process.env.GL_GOOGLE_OAUTH_REDIRECT_URI,
      callbackPath: '/api/gl/auth/google/callback',
    });

    res.type('application/json').json({
      ok: true,
      runtime: {
        pid: process.pid,
        nodeEnv: process.env.NODE_ENV || null,
        host: req.get('host') || null,
        protocol: req.protocol || null,
        forwardedProto: req.get('x-forwarded-proto') || null,
        forwardedHost: req.get('x-forwarded-host') || null,
      },
      oauth: {
        googleClientIdSet: !!normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID),
        googleClientSecretSet: !!normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
        googleRedirectUriEnv: normalizeOptionalString(process.env.GOOGLE_OAUTH_REDIRECT_URI),
        frontendOriginEnv: normalizeOptionalString(process.env.FRONTEND_ORIGIN),
        passwordResetBaseUrlEnv: normalizeOptionalString(process.env.PASSWORD_RESET_BASE_URL),
        resolvedFrontendOrigin: frontendOrigin,
        resolvedGoogleRedirectUri: redirectUri,
        glClientIdSet: !!(
          normalizeOptionalString(process.env.GL_GOOGLE_OAUTH_CLIENT_ID) ||
          normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID)
        ),
        glRedirectUriEnv: normalizeOptionalString(process.env.GL_GOOGLE_OAUTH_REDIRECT_URI),
        glFrontendOriginEnv: normalizeOptionalString(process.env.GL_FRONTEND_ORIGIN),
        resolvedGlFrontendOrigin: glFrontendOrigin,
        resolvedGlRedirectUri: glRedirectUri,
        googleConsoleHint:
          'Enregistrer chaque resolved*RedirectUri exactement dans Google Cloud Console → Identifiants → URI de redirection autorisés.',
      },
    });
  });

  return router;
}

module.exports = { createAdminOpsRouter, requireDeploySecret, timingSafeSecretEqual };
