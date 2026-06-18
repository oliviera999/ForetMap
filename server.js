/** E2E Playwright : sous Windows, l’env peut ne pas atteindre `node` ; le flag CLI est propagé par `npm run`. */
if (process.argv.includes('--foretmap-e2e-no-rate-limit')) {
  process.env.E2E_DISABLE_RATE_LIMIT = '1';
}

const express = require('express');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const jwt = require('jsonwebtoken');
const {
  initDatabase,
  ping: dbPing,
  isApplicationDatabaseReady,
  endPool,
  queryAll,
} = require('./database');
const { validateEnv } = require('./lib/env');
const logger = require('./lib/logger');
const { runRecurringTaskSpawnJob } = require('./lib/recurringTasks');
const { initRealtime, shutdownRealtime } = require('./lib/realtime');
const { getRuntimeProcessSnapshot } = require('./lib/runtimeDiagnostics');
const { getMascotPackLibProbe } = require('./lib/mascotPackValidatorResolve');
const { getVisitMascotHintSnapshot } = require('./lib/visitMascotDiagnostics');
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('./lib/logBuffer');
const { checkCriticalAdminAccount } = require('./lib/rbac');
const { assignRequestId } = require('./lib/requestId');
const { createHttpRequestLogMiddleware } = require('./lib/httpRequestLog');
const logMetrics = require('./lib/logMetrics');
const { parseBearerToken, JWT_SECRET } = require('./middleware/requireTeacher');
const { resolveProductFromRequest } = require('./lib/productResolver');
const { resolveOAuthPublicOrigin, resolveOAuthRedirectUri } = require('./lib/oauthPublicUrl');

const rateLimit = require('express-rate-limit');
const authRouter = require('./routes/auth');
const zonesRouter = require('./routes/zones');
const mapsRouter = require('./routes/maps');
const mapRouter = require('./routes/map');
const plantsRouter = require('./routes/plants');
const tasksRouter = require('./routes/tasks');
const taskProjectsRouter = require('./routes/task-projects');
const tutorialsRouter = require('./routes/tutorials');
const visitRouter = require('./routes/visit');
const statsRouter = require('./routes/stats');
const studentsRouter = require('./routes/students');
const observationsRouter = require('./routes/observations');
const auditRouter = require('./routes/audit');
const rbacRouter = require('./routes/rbac');
const settingsRouter = require('./routes/settings');
const mediaLibraryRouter = require('./routes/media-library');
const forumRouter = require('./routes/forum');
const contextCommentsRouter = require('./routes/context-comments');
const groupsRouter = require('./routes/groups');
const glAuthRouter = require('./routes/gl/auth');
const glContentRouter = require('./routes/gl/content');
const glGamesRouter = require('./routes/gl/games');
const glChaptersRouter = require('./routes/gl/chapters');
const glMascotsRouter = require('./routes/gl/mascots');
const glAdminRouter = require('./routes/gl/admin');
const glContextCommentsRouter = require('./routes/gl/context-comments');
const glForumRouter = require('./routes/gl/forum');
const glMarketRouter = require('./routes/gl/market');
const glTutorialsRouter = require('./routes/gl/tutorials');
const glJournalRouter = require('./routes/gl/journal');
const glPlayerJournalRouter = require('./routes/gl/player-journal');
const glKingdomMapRouter = require('./routes/gl/kingdom-map');
const glSpeciesRouter = require('./routes/gl/species');
const glSpellsRouter = require('./routes/gl/spells');
const glGlossaryRouter = require('./routes/gl/glossary').router;
const glQcmRouter = require('./routes/gl/qcm').router;
const glLearningRouter = require('./routes/gl/learning');
const glLoreRouter = require('./routes/gl/lore').router;
const glStatsRouter = require('./routes/gl/stats');
const glossaryRouter = require('./routes/glossary');
const quizRouter = require('./routes/quiz');
const foodWebRouter = require('./routes/food-web');

const app = express();

/** Arrêt gracieux en cours (redémarrage deploy, SIGTERM, etc.). */
let shutdownInProgress = false;

/** Derrière nginx / Passenger / load balancer : IP client pour rate-limit et logs. */
function configureTrustProxy() {
  const raw = String(process.env.FORETMAP_TRUST_PROXY || '').trim();
  if (raw === '0' || raw.toLowerCase() === 'false') return;
  if (raw) {
    if (/^\d+$/.test(raw)) {
      app.set('trust proxy', parseInt(raw, 10));
      return;
    }
    app.set('trust proxy', raw);
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
}
configureTrustProxy();

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function parseCorsOriginsFromEnv() {
  const raw = String(process.env.FRONTEND_ORIGINS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
}

function buildCorsOptions() {
  if (process.env.NODE_ENV !== 'production') return {};
  const multi = parseCorsOriginsFromEnv();
  if (multi.length > 0) return { origin: multi };
  if (process.env.FRONTEND_ORIGIN) return { origin: process.env.FRONTEND_ORIGIN };
  // En prod sans origine configuree, on desactive CORS cross-origin (origin: false)
  // au lieu de tout refleter (Access-Control-Allow-Origin: *). Seules les requetes
  // same-origin passent ; les deploiements multi-origines configurent FRONTEND_ORIGINS.
  return { origin: false };
}

const corsOpts = buildCorsOptions();
app.use(cors(corsOpts));
// En-tetes de securite (nosniff, frameguard, HSTS, referrer-policy, etc.).
// CSP laisse au middleware dedie ci-dessous (img-src) : le CSP par defaut de helmet
// casserait la SPA (polices Google, styles inline). COEP/CORP desactives : /uploads et
// photos externes plantes doivent rester chargeables.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);

/** Comparaison de secret a temps constant (evite l'oracle temporel sur DEPLOY_SECRET). */
function timingSafeSecretEqual(provided, expected) {
  const a = Buffer.from(String(provided == null ? '' : provided));
  const b = Buffer.from(String(expected == null ? '' : expected));
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}
app.use(
  compression({
    filter: (req, res) => {
      const p = String(req.path || '').split('?')[0];
      if (p === '/socket.io' || p.startsWith('/socket.io/')) return false;
      if (p.includes('/import/template') || /\/export$/.test(p)) return false;
      return compression.filter(req, res);
    },
  }),
);
app.use(assignRequestId);

function isTestEnv() {
  return (
    String(process.env.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'test'
  );
}

function isLoadTestBypass(req) {
  const expected = String(process.env.LOAD_TEST_SECRET || '').trim();
  if (!expected) return false;
  const provided = String(req.get('x-foretmap-load-test') || '').trim();
  return provided.length > 0 && provided === expected;
}

function shouldSkipRateLimit(req) {
  return (
    isTestEnv() ||
    isLoadTestBypass(req) ||
    String(process.env.E2E_DISABLE_RATE_LIMIT || '').trim() === '1'
  );
}

function parseRateLimitLogSample() {
  const raw = String(process.env.FORETMAP_RATE_LIMIT_LOG_SAMPLE || '0.01').trim();
  const n = parseFloat(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return 0.01;
}

/** Préfixe d’IP pour logs (pas d’adresse complète). */
function truncateClientIp(ip) {
  const s = String(ip || '').trim();
  if (!s) return null;
  if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}.*`;
    return 'ipv4';
  }
  if (s.includes(':')) {
    const parts = s.split(':').filter(Boolean);
    if (parts.length >= 3) return `${parts.slice(0, 3).join(':')}::`;
    return 'ipv6';
  }
  return '?';
}

const rateLimitLogSample = parseRateLimitLogSample();

function createRateLimitHandler(messageBody) {
  return (req, res, _next, options) => {
    if (rateLimitLogSample > 0 && Math.random() < rateLimitLogSample) {
      logMetrics.recordRateLimit429Sample();
      logger.warn(
        {
          requestId: req.requestId,
          path: req.path,
          method: req.method,
          clientIpTruncated: truncateClientIp(req.ip),
          msg: 'rate_limit_429_sample',
        },
        '429 rate limit (echantillon)',
      );
    }
    const status = options && typeof options.statusCode === 'number' ? options.statusCode : 429;
    res.status(status);
    res.json(messageBody);
  };
}

/** Plafond /api/* par IP et fenêtre 1 min (SPA + plusieurs onglets derrière la même IP publique). */
function parseGeneralApiRateLimitMax() {
  const raw = String(process.env.FORETMAP_API_RATE_LIMIT_PER_MIN || '').trim();
  const fallback = 1200;
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 60 || n > 20000) {
    logger.warn({ raw }, 'FORETMAP_API_RATE_LIMIT_PER_MIN invalide — repli 1200');
    return fallback;
  }
  return n;
}

const generalApiRateLimitMax = parseGeneralApiRateLimitMax();
logger.debug(
  { apiRateLimitPerMin: generalApiRateLimitMax },
  'Limiteur général /api/* (fenêtre 1 min / IP)',
);

// Limiteur général : défaut 1200 req/min/IP (FORETMAP_API_RATE_LIMIT_PER_MIN) — express-rate-limit v8 : `limit`
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: generalApiRateLimitMax,
  skip: (req) => shouldSkipRateLimit(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute.' },
  handler: createRateLimitHandler({ error: 'Trop de requêtes, réessayez dans une minute.' }),
});

// Limiteur strict pour les endpoints d'authentification : 20 tentatives / 15 min par IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: (req) => shouldSkipRateLimit(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes.' },
  handler: createRateLimitHandler({
    error: 'Trop de tentatives de connexion, réessayez dans 15 minutes.',
  }),
});

app.use('/api/', generalLimiter);

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/gl/auth/login', authLimiter);
app.use('/api/gl/auth/guest', authLimiter);
app.use('/api/gl/auth/forgot-password', authLimiter);
app.use('/api/gl/auth/reset-password', authLimiter);

/** Santé / readiness : toujours joignables pendant boot ou redémarrage. */
function isApiAvailabilityExemptPath(originalUrl) {
  const p = String(originalUrl || '').split('?')[0];
  return p === '/api/health' || p === '/api/health/db' || p === '/api/ready';
}

app.use('/api', (req, res, next) => {
  const pathname = String(req.originalUrl || req.url || '').split('?')[0];
  if (isApiAvailabilityExemptPath(pathname)) return next();
  if (shutdownInProgress) {
    return res.status(503).type('application/json').json({
      error: 'Service en redémarrage — réessayez dans quelques secondes.',
      code: 'SERVICE_RESTARTING',
    });
  }
  if (!isApplicationDatabaseReady()) {
    return res.status(503).type('application/json').json({
      error: 'Service non prêt — initialisation en cours.',
      code: 'SERVICE_NOT_READY',
    });
  }
  return next();
});

// JSON volumineux (ex. photos base64 forum). Défaut 25mb ; surcharge : FORETMAP_JSON_BODY_LIMIT (ex. 100mb).
const jsonBodyLimit = String(process.env.FORETMAP_JSON_BODY_LIMIT || '25mb').trim() || '25mb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    return res.status(413).json({
      error: 'Fichier ou lot trop volumineux pour le serveur.',
      code: 'PAYLOAD_TOO_LARGE',
      hint: 'Réduisez la taille ou utilisez l’import multipart depuis Contenus → Bibliothèque.',
    });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Corps JSON invalide pour la requête' });
  }
  return next(err);
});
app.use((req, res, next) => {
  // Limite les sources d'images (photos externes + base64 locales).
  res.setHeader('Content-Security-Policy', "img-src 'self' https: data: blob:;");
  next();
});

app.use(createHttpRequestLogMiddleware());

const distDir = path.join(__dirname, 'dist');
const distSpaIndex = fs.existsSync(path.join(distDir, 'index.vite.html'))
  ? path.join(distDir, 'index.vite.html')
  : path.join(distDir, 'index.html');
const distGlIndex = path.join(distDir, 'gl.html');
const serveDist = process.env.NODE_ENV === 'production' && fs.existsSync(distSpaIndex);
const staticRoot = serveDist ? distDir : path.join(__dirname, 'public');
const serviceWorkerPath = path.join(staticRoot, 'sw.js');
if (fs.existsSync(serviceWorkerPath)) {
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(serviceWorkerPath);
  });
}
const staticServeOptions = serveDist
  ? {
      index: false,
      setHeaders(res, filePath) {
        const base = path.basename(filePath);
        if (base === 'index.vite.html' || base === 'index.html' || base === 'deploy-help.html') {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }
  : undefined;
// Sur gl.*, index.vite.html est l'entrée ForetMap : ne pas la servir telle quelle.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const pathname = String(req.path || '').split('?')[0];
  if (pathname !== '/index.vite.html') return next();
  if (resolveProductFromRequest(req) !== 'gl') return next();
  return res.redirect(302, '/');
});
app.use(express.static(staticRoot, staticServeOptions));
const { PUBLIC_IMAGE_CACHE_CONTROL } = require('./lib/httpImageCache');
const uploadsStaticRoot = path.join(__dirname, 'uploads');
app.use(
  '/uploads',
  express.static(uploadsStaticRoot, {
    index: false,
    setHeaders(res, filePath) {
      const lower = String(filePath || '').toLowerCase();
      if (/\.(jpe?g|png|gif|webp|avif|svg|ico|bmp)$/i.test(lower)) {
        res.setHeader('Cache-Control', PUBLIC_IMAGE_CACHE_CONTROL);
      }
      // Neutralisation XSS SVG stocke : un SVG uploade peut contenir un <script>
      // qui s'execute lors d'une navigation directe vers son URL (CSP helmet desactivee).
      // On force une CSP stricte + telechargement uniquement pour les .svg ; les images
      // raster restent servies inline, et les SVG via <img src> s'affichent toujours.
      if (lower.endsWith('.svg')) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        );
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  }),
);
app.use('/tutos', express.static(path.join(__dirname, 'tutos')));

// Route de santé sans BDD — pour le contrôle de disponibilité (o2switch / Passenger)
app.get('/api/health', (req, res) => {
  res.type('application/json').status(200).json({ ok: true });
});
app.get('/health', (req, res) => {
  res.type('application/json').status(200).json({ ok: true });
});

app.get('/api/health/db', async (req, res) => {
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
app.get('/api/ready', async (req, res) => {
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

// Version de l'app (pied de page frontend)
const startupVersion = require(path.join(__dirname, 'package.json')).version;
app.get('/api/version', (req, res) => {
  // `startupVersion` est lu une fois au boot ; le process redemarre a chaque deploy,
  // donc pas de relecture disque (fs.readFileSync) sur ce endpoint appele a chaque page.
  res.json({ version: startupVersion });
});

// Redémarrage déclenché après déploiement (secret requis ; le gestionnaire de process relance l'app)
app.post('/api/admin/restart', (req, res) => {
  const secret = req.headers['x-deploy-secret'] || req.body?.secret;
  if (!process.env.DEPLOY_SECRET || !timingSafeSecretEqual(secret, process.env.DEPLOY_SECRET)) {
    return res.status(403).json({ error: 'Secret invalide' });
  }
  res.json({ ok: true, message: 'Redémarrage gracieux' });
  setTimeout(() => gracefulShutdown('restart'), 300);
});

// Dernières lignes de log Pino (tampon mémoire) — même secret que /api/admin/restart ; uniquement en HTTPS en prod
app.get('/api/admin/logs', (req, res) => {
  const secret = req.headers['x-deploy-secret'];
  if (!process.env.DEPLOY_SECRET || !timingSafeSecretEqual(secret, process.env.DEPLOY_SECRET)) {
    return res.status(403).json({ error: 'Secret invalide ou DEPLOY_SECRET non configuré' });
  }
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
app.get('/api/admin/diagnostics', async (req, res) => {
  const secret = req.headers['x-deploy-secret'];
  if (!process.env.DEPLOY_SECRET || !timingSafeSecretEqual(secret, process.env.DEPLOY_SECRET)) {
    return res.status(403).json({ error: 'Secret invalide ou DEPLOY_SECRET non configuré' });
  }
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
app.get('/api/admin/oauth-debug', (req, res) => {
  const secret = req.headers['x-deploy-secret'];
  if (!process.env.DEPLOY_SECRET || !timingSafeSecretEqual(secret, process.env.DEPLOY_SECRET)) {
    return res.status(403).json({ error: 'Secret invalide ou DEPLOY_SECRET non configuré' });
  }

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

app.use('/api/gl/auth', glAuthRouter);
app.use('/api/gl/admin', glAdminRouter);
app.use('/api/gl/content', glContentRouter);
app.use('/api/gl/chapters', glChaptersRouter);
app.use('/api/gl/mascots', glMascotsRouter);
app.use('/api/gl', glSpeciesRouter);
app.use('/api/gl', glSpellsRouter);
app.use('/api/gl', glGlossaryRouter);
app.use('/api/gl', glQcmRouter);
app.use('/api/gl', glGamesRouter);
app.use('/api/gl/context-comments', glContextCommentsRouter);
app.use('/api/gl/forum', glForumRouter);
app.use('/api/gl/market', glMarketRouter);
app.use('/api/gl/learning', glLearningRouter);
app.use('/api/gl/stats', glStatsRouter);
app.use('/api/gl/tutorials', glTutorialsRouter);
app.use('/api/gl/journal', glJournalRouter);
app.use('/api/gl/player-journal', glPlayerJournalRouter);
app.use('/api/gl/kingdom-map', glKingdomMapRouter);
app.use('/api/gl/lore', glLoreRouter);

app.use('/api', (req, res, next) => {
  if (String(req.path || '').startsWith('/gl')) return next();
  const token = parseBearerToken(req);
  if (!token || !JWT_SECRET) return next();
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const product = String(claims.product || 'foret').toLowerCase();
    if (product === 'gl') {
      return res
        .status(403)
        .json({ error: 'Session Gnomes & Licornes non autorisée sur cette API' });
    }
  } catch (_) {
    // Les routes protégées gèrent ensuite le cas token invalide.
  }
  return next();
});

app.use('/api/auth', authRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/map', mapRouter);
app.use('/api/plants', plantsRouter);
app.use('/api/glossary', glossaryRouter);
app.use('/api/quiz', quizRouter);
app.use('/api/food-web', foodWebRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/task-projects', taskProjectsRouter);
app.use('/api/tutorials', tutorialsRouter);
app.use('/api/visit', visitRouter);
app.use('/api/stats', statsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/observations', observationsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/rbac', rbacRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/media-library', mediaLibraryRouter);
app.use('/api/forum', forumRouter);
app.use('/api/context-comments', contextCommentsRouter);
app.use('/api/groups', groupsRouter);

// Docs locales (Markdown) accessibles depuis l'onglet "À propos"
const rootDocs = new Map([
  ['/README.md', path.resolve(__dirname, 'README.md')],
  ['/CHANGELOG.md', path.resolve(__dirname, 'CHANGELOG.md')],
]);
const allowedDocFiles = new Set([
  'API.md',
  'LOCAL_DEV.md',
  'EVOLUTION.md',
  'VERSIONING.md',
  'MASCOT_PACK.md',
]);

for (const [routePath, filePath] of rootDocs.entries()) {
  app.get(routePath, (req, res) => {
    res.type('text/markdown; charset=utf-8');
    res.sendFile(filePath);
  });
}

app.get('/docs/:file', (req, res) => {
  const file = req.params.file;
  if (!allowedDocFiles.has(file)) return res.status(404).json({ error: 'Document introuvable' });
  res.type('text/markdown; charset=utf-8');
  res.sendFile(path.resolve(__dirname, 'docs', file));
});

// Liste centralisée des problèmes potentiels du site (audit interne)
app.get('/api/site-issues', (req, res) => {
  res.type('text/markdown; charset=utf-8');
  res.sendFile(path.resolve(__dirname, 'docs', 'SITE_ISSUES.md'));
});
app.get('/api/site-issues.json', (req, res) => {
  res.type('application/json; charset=utf-8');
  res.sendFile(path.resolve(__dirname, 'docs', 'SITE_ISSUES.json'));
});

// Favicon : évite le fallback SPA et un éventuel 500
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Fallback SPA (build Vite en prod, sinon page d'aide locale)
const { createSpaFallbackHandler, registerSpaFallbackRoutes } = require('./lib/spaFallback');
registerSpaFallbackRoutes(
  app,
  createSpaFallbackHandler({
    serveDist,
    distSpaIndex,
    distGlIndex,
    deployHelpPath: path.resolve(__dirname, 'public', 'deploy-help.html'),
    resolveProductFromRequest,
    logger,
  }),
);

// Gestion d'erreurs centralisée (pour les routes qui font next(err))
app.use((err, req, res, next) => {
  logger.error(
    { err, path: req.path, method: req.method, requestId: req.requestId },
    'Erreur serveur',
  );
  const status = Number(err?.status) || 500;
  const message = status >= 500 ? 'Erreur serveur' : err?.message || 'Requête invalide';
  const originalUrl = String(req.originalUrl || req.url || '');
  if (originalUrl.startsWith('/api')) {
    res.type('application/json');
  }
  res.status(status).json({ error: message });
});

// Ne pas utiliser process.env.IP — sur o2switch il contient l'IP publique du serveur,
// ce qui ferait écouter l'app sur une interface que Passenger ne peut pas joindre.
// On écoute sur 0.0.0.0 (toutes interfaces) pour que Passenger puisse se connecter.
const port = process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT || 3000;

/** Référence serveur HTTP (null tant que `startServer()` n’a pas été appelé — ex. tests supertest). */
let httpServer = null;
let recurringJobFirstTimeoutId = null;
let recurringJobIntervalId = null;
let shutdownHandlersRegistered = false;

function parseShutdownTimeoutMs() {
  const raw = String(process.env.FORETMAP_SHUTDOWN_TIMEOUT_MS || '').trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 3000 && n <= 120000) return n;
  return 12000;
}

const SHUTDOWN_TIMEOUT_MS = parseShutdownTimeoutMs();

function cancelRecurringTaskSpawn() {
  if (recurringJobFirstTimeoutId != null) {
    clearTimeout(recurringJobFirstTimeoutId);
    recurringJobFirstTimeoutId = null;
  }
  if (recurringJobIntervalId != null) {
    clearInterval(recurringJobIntervalId);
    recurringJobIntervalId = null;
  }
}

function registerGracefulShutdownHandlersOnce() {
  if (shutdownHandlersRegistered) return;
  shutdownHandlersRegistered = true;
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
}

function gracefulShutdown(reason) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  const signal = typeof reason === 'string' ? reason : 'shutdown';
  logger.info({ signal, msg: 'graceful_shutdown_start' }, 'Arrêt gracieux');

  const forceTimer = setTimeout(() => {
    logger.error({ msg: 'graceful_shutdown_timeout' }, 'Timeout arrêt gracieux');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  if (typeof forceTimer.unref === 'function') forceTimer.unref();

  cancelRecurringTaskSpawn();

  shutdownRealtime()
    .catch((err) => logger.warn({ err }, 'Fermeture Socket.IO'))
    .then(
      () =>
        new Promise((resolve) => {
          if (!httpServer) {
            resolve();
            return;
          }
          httpServer.close((err) => {
            if (err) logger.warn({ err }, 'server.close');
            resolve();
          });
        }),
    )
    .then(() => {
      if (httpServer != null) return endPool();
      return Promise.resolve();
    })
    .catch((err) => logger.warn({ err }, 'Fermeture pool MySQL'))
    .finally(() => {
      clearTimeout(forceTimer);
      logger.info({ signal, msg: 'graceful_shutdown_end' }, 'Process terminé après arrêt gracieux');
      process.exit(0);
    });
}

function startServer() {
  httpServer = http.createServer(app);
  initRealtime(httpServer);
  httpServer.listen(port, '0.0.0.0', () => {
    logger.info(`ForêtMap lancé sur port ${port}`);
    registerGracefulShutdownHandlersOnce();
  });
  httpServer.on('error', (err) => {
    logger.error({ err }, 'Impossible de démarrer le serveur HTTP');
    process.exit(1);
  });
  return httpServer;
}

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Exception non capturée — arrêt du process');
  setTimeout(() => process.exit(1), 50);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Promesse rejetée non gérée — arrêt du process');
  setTimeout(() => process.exit(1), 50);
});

// ── Fonction de démarrage — appelable depuis app.js (Passenger) ou directement ──
let booted = false;
const RECURRING_TASK_JOB_MS = 24 * 60 * 60 * 1000;

function scheduleRecurringTaskSpawn() {
  if (
    String(process.env.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'test'
  )
    return;
  if (String(process.env.FORETMAP_DISABLE_RECURRING_TASK_JOB || '').trim() === '1') {
    logger.info('Job tâches récurrentes désactivé (FORETMAP_DISABLE_RECURRING_TASK_JOB=1)');
    return;
  }
  const jitter = 45000 + Math.floor(Math.random() * 120000);
  recurringJobFirstTimeoutId = setTimeout(() => {
    recurringJobFirstTimeoutId = null;
    runRecurringTaskSpawnJob().catch((err) => logger.warn({ err }, 'Job tâches récurrentes'));
  }, jitter);
  recurringJobIntervalId = setInterval(() => {
    runRecurringTaskSpawnJob().catch((err) => logger.warn({ err }, 'Job tâches récurrentes'));
  }, RECURRING_TASK_JOB_MS);
  logger.info({ jitterMs: jitter }, 'Planification job tâches récurrentes (quotidien)');
}

function boot() {
  if (booted) return;
  booted = true;

  const diagPath = path.join(__dirname, 'startup.log');
  const diagLines = [
    `=== DÉMARRAGE ${new Date().toISOString()} ===`,
    `node: ${process.version}`,
    `cwd: ${process.cwd()}`,
    `__dirname: ${__dirname}`,
    `PORT: ${process.env.PORT}  ← port utilisé pour listen()`,
    `IP env: ${process.env.IP}  ← ignoré désormais, listen sur 0.0.0.0`,
    `NODE_ENV: ${process.env.NODE_ENV}`,
    `DB_HOST: ${process.env.DB_HOST}`,
    `DB_USER: ${process.env.DB_USER}`,
    `DB_NAME: ${process.env.DB_NAME}`,
    `DB_PASS set: ${!!process.env.DB_PASS}`,
    `public/deploy-help.html exists: ${fs.existsSync(path.join(__dirname, 'public', 'deploy-help.html'))}`,
    `dist/index.vite.html exists: ${fs.existsSync(path.join(__dirname, 'dist', 'index.vite.html'))}`,
    `dist/index.html exists (legacy): ${fs.existsSync(path.join(__dirname, 'dist', 'index.html'))}`,
    `appelé via: ${require.main === module ? 'node server.js' : 'require (Passenger / app.js)'}`,
  ];
  fs.writeFileSync(diagPath, diagLines.join('\n') + '\n', 'utf8');

  try {
    validateEnv();
    fs.appendFileSync(diagPath, 'validateEnv: OK\n');
  } catch (e) {
    fs.appendFileSync(diagPath, `validateEnv ERREUR: ${e.message}\n`);
    logger.error({ err: e }, "Variables d'environnement invalides");
    process.exit(1);
  }

  startServer();
  fs.appendFileSync(diagPath, `startServer appelé sur PORT=${process.env.PORT || 3000}\n`);

  initDatabase()
    .then(() => {
      fs.appendFileSync(diagPath, 'initDatabase: OK\n');
      logger.info('BDD initialisée');
      scheduleRecurringTaskSpawn();
      checkCriticalAdminAccount()
        .then((state) => {
          if (state?.ok) {
            logger.info({ admin: state.email }, 'Contrôle admin critique OK');
            return;
          }
          logger.warn({ state }, 'Contrôle admin critique en anomalie');
        })
        .catch((err) => {
          logger.warn({ err }, 'Contrôle admin critique en échec');
        });
    })
    .catch((err) => {
      fs.appendFileSync(diagPath, `initDatabase ERREUR: ${err.message}\n`);
      logger.error({ err }, 'Erreur init BDD — routes DB indisponibles');
    });
}

if (require.main === module) {
  boot();
}

/** Tests uniquement : simuler un redémarrage applicatif. */
function setShutdownInProgressForTests(value) {
  if (
    String(process.env.NODE_ENV || '')
      .trim()
      .toLowerCase() !== 'test'
  )
    return;
  shutdownInProgress = !!value;
}

module.exports = { app, boot, setShutdownInProgressForTests };
