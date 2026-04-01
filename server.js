/** E2E Playwright : sous Windows, l’env peut ne pas atteindre `node` ; le flag CLI est propagé par `npm run`. */
if (process.argv.includes('--foretmap-e2e-no-rate-limit')) {
  process.env.E2E_DISABLE_RATE_LIMIT = '1';
}

const express = require('express');
const http    = require('http');
const fs      = require('fs');
const cors    = require('cors');
const path    = require('path');
const Layer   = require('express/lib/router/layer');
const { initDatabase, ping: dbPing } = require('./database');
const { validateEnv } = require('./lib/env');
const logger = require('./lib/logger');
const { runRecurringTaskSpawnJob } = require('./lib/recurringTasks');
const { initRealtime } = require('./lib/realtime');
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('./lib/logBuffer');
const { checkCriticalAdminAccount } = require('./lib/rbac');

const rateLimit     = require('express-rate-limit');
const authRouter    = require('./routes/auth');
const zonesRouter   = require('./routes/zones');
const mapsRouter    = require('./routes/maps');
const mapRouter     = require('./routes/map');
const plantsRouter  = require('./routes/plants');
const tasksRouter   = require('./routes/tasks');
const taskProjectsRouter = require('./routes/task-projects');
const tutorialsRouter = require('./routes/tutorials');
const visitRouter   = require('./routes/visit');
const statsRouter   = require('./routes/stats');
const studentsRouter      = require('./routes/students');
const observationsRouter  = require('./routes/observations');
const auditRouter         = require('./routes/audit');
const rbacRouter          = require('./routes/rbac');
const settingsRouter      = require('./routes/settings');
const forumRouter         = require('./routes/forum');
const contextCommentsRouter = require('./routes/context-comments');

const app = express();

function installAsyncErrorForwarding() {
  if (Layer.prototype.__foretmapAsyncPatched) return;
  const originalHandleRequest = Layer.prototype.handle_request;

  Layer.prototype.handle_request = function patchedHandleRequest(req, res, next) {
    const handler = this.handle;
    if (handler.length > 3) {
      return originalHandleRequest.call(this, req, res, next);
    }

    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function' && typeof result.catch === 'function') {
        result.catch(next);
      }
      return result;
    } catch (err) {
      return next(err);
    }
  };

  Layer.prototype.__foretmapAsyncPatched = true;
}

installAsyncErrorForwarding();

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

const corsOpts = process.env.NODE_ENV === 'production' && process.env.FRONTEND_ORIGIN
  ? { origin: process.env.FRONTEND_ORIGIN }
  : {};
app.use(cors(corsOpts));

function isTestEnv() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test';
}

function isLoadTestBypass(req) {
  const expected = String(process.env.LOAD_TEST_SECRET || '').trim();
  if (!expected) return false;
  const provided = String(req.get('x-foretmap-load-test') || '').trim();
  return provided.length > 0 && provided === expected;
}

function shouldSkipRateLimit(req) {
  return isTestEnv() || isLoadTestBypass(req) || String(process.env.E2E_DISABLE_RATE_LIMIT || '').trim() === '1';
}

/** Plafond /api/* par IP et fenêtre 1 min (SPA + plusieurs onglets derrière la même IP publique). */
function parseGeneralApiRateLimitMax() {
  const raw = String(process.env.FORETMAP_API_RATE_LIMIT_PER_MIN || '').trim();
  const fallback = 900;
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 60 || n > 20000) {
    logger.warn({ raw }, 'FORETMAP_API_RATE_LIMIT_PER_MIN invalide — repli 900');
    return fallback;
  }
  return n;
}

const generalApiRateLimitMax = parseGeneralApiRateLimitMax();
logger.debug({ apiRateLimitPerMin: generalApiRateLimitMax }, 'Limiteur général /api/* (fenêtre 1 min / IP)');

// Limiteur général : défaut 900 req/min/IP (FORETMAP_API_RATE_LIMIT_PER_MIN) — option express-rate-limit v8 : `limit`
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: generalApiRateLimitMax,
  skip: (req) => shouldSkipRateLimit(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans une minute.' },
});

// Limiteur strict pour les endpoints d'authentification : 20 tentatives / 15 min par IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: (req) => shouldSkipRateLimit(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes.' },
});

app.use('/api/', generalLimiter);

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  // Limite les sources d'images (photos externes + base64 locales).
  res.setHeader('Content-Security-Policy', "img-src 'self' https: data: blob:;");
  next();
});

const distDir = path.join(__dirname, 'dist');
const distSpaIndex = fs.existsSync(path.join(distDir, 'index.vite.html'))
  ? path.join(distDir, 'index.vite.html')
  : path.join(distDir, 'index.html');
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
app.use(express.static(staticRoot, serveDist ? { index: false } : undefined));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
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

// Version de l'app (pied de page frontend)
const startupVersion = require(path.join(__dirname, 'package.json')).version;
app.get('/api/version', (req, res) => {
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const version = typeof pkg?.version === 'string' ? pkg.version : startupVersion;
    res.json({ version });
  } catch (err) {
    logger.warn({ err }, 'Lecture package.json échouée pour /api/version');
    res.json({ version: startupVersion });
  }
});

// Redémarrage déclenché après déploiement (secret requis ; le gestionnaire de process relance l'app)
app.post('/api/admin/restart', (req, res) => {
  const secret = req.headers['x-deploy-secret'] || req.body?.secret;
  if (!process.env.DEPLOY_SECRET || secret !== process.env.DEPLOY_SECRET) {
    return res.status(403).json({ error: 'Secret invalide' });
  }
  res.json({ ok: true, message: 'Redémarrage dans 1s' });
  setTimeout(() => process.exit(0), 1000);
});

// Dernières lignes de log Pino (tampon mémoire) — même secret que /api/admin/restart ; uniquement en HTTPS en prod
app.get('/api/admin/logs', (req, res) => {
  const secret = req.headers['x-deploy-secret'];
  if (!process.env.DEPLOY_SECRET || secret !== process.env.DEPLOY_SECRET) {
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

// Diagnostic OAuth (sans secrets) : vérifie les URLs réellement résolues au runtime.
app.get('/api/admin/oauth-debug', (req, res) => {
  const secret = req.headers['x-deploy-secret'];
  if (!process.env.DEPLOY_SECRET || secret !== process.env.DEPLOY_SECRET) {
    return res.status(403).json({ error: 'Secret invalide ou DEPLOY_SECRET non configuré' });
  }

  const frontendOrigin = normalizeOptionalString(process.env.FRONTEND_ORIGIN)
    || normalizeOptionalString(process.env.PASSWORD_RESET_BASE_URL)
    || `${req.protocol}://${req.get('host')}`;
  const redirectUri = normalizeOptionalString(process.env.GOOGLE_OAUTH_REDIRECT_URI)
    || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

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
    },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/map', mapRouter);
app.use('/api/plants', plantsRouter);
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
app.use('/api/forum', forumRouter);
app.use('/api/context-comments', contextCommentsRouter);

// Docs locales (Markdown) accessibles depuis l'onglet "À propos"
const rootDocs = new Map([
  ['/README.md', path.resolve(__dirname, 'README.md')],
  ['/CHANGELOG.md', path.resolve(__dirname, 'CHANGELOG.md')],
]);
const allowedDocFiles = new Set(['API.md', 'LOCAL_DEV.md', 'EVOLUTION.md', 'VERSIONING.md']);

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
app.get('*', (req, res) => {
  const indexPath = serveDist ? distSpaIndex : path.resolve(__dirname, 'public', 'deploy-help.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      logger.error(
        { err, path: req.path, resolvedPath: indexPath, code: err.code },
        'Envoi index.html en échec'
      );
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    }
  });
});

// Gestion d'erreurs centralisée (pour les routes qui font next(err))
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, 'Erreur serveur');
  const status = Number(err?.status) || 500;
  const message = status >= 500 ? 'Erreur serveur' : (err?.message || 'Requête invalide');
  res.status(status).json({ error: message });
});

// Ne pas utiliser process.env.IP — sur o2switch il contient l'IP publique du serveur,
// ce qui ferait écouter l'app sur une interface que Passenger ne peut pas joindre.
// On écoute sur 0.0.0.0 (toutes interfaces) pour que Passenger puisse se connecter.
const port = process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT || 3000;

function startServer() {
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(port, '0.0.0.0', () => {
    logger.info(`ForêtMap lancé sur port ${port}`);
  });
  server.on('error', (err) => {
    logger.error({ err }, 'Impossible de démarrer le serveur HTTP');
    process.exit(1);
  });
  return server;
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
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test') return;
  if (String(process.env.FORETMAP_DISABLE_RECURRING_TASK_JOB || '').trim() === '1') {
    logger.info('Job tâches récurrentes désactivé (FORETMAP_DISABLE_RECURRING_TASK_JOB=1)');
    return;
  }
  const jitter = 45000 + Math.floor(Math.random() * 120000);
  setTimeout(() => {
    runRecurringTaskSpawnJob().catch((err) => logger.warn({ err }, 'Job tâches récurrentes'));
  }, jitter);
  setInterval(() => {
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
    logger.error({ err: e }, 'Variables d\'environnement invalides');
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

module.exports = { app, boot };
