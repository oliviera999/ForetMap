const express = require('express');
const http    = require('http');
const fs      = require('fs');
const cors    = require('cors');
const path    = require('path');
const { initDatabase, ping: dbPing } = require('./database');
const { validateEnv } = require('./lib/env');
const logger = require('./lib/logger');
const { initRealtime } = require('./lib/realtime');
const { tailLogLines, getBufferedLineCount, getMaxLines } = require('./lib/logBuffer');

const authRouter    = require('./routes/auth');
const zonesRouter   = require('./routes/zones');
const mapRouter     = require('./routes/map');
const plantsRouter  = require('./routes/plants');
const tasksRouter   = require('./routes/tasks');
const statsRouter   = require('./routes/stats');
const studentsRouter      = require('./routes/students');
const observationsRouter  = require('./routes/observations');
const auditRouter         = require('./routes/audit');

const app = express();

const corsOpts = process.env.NODE_ENV === 'production' && process.env.FRONTEND_ORIGIN
  ? { origin: process.env.FRONTEND_ORIGIN }
  : {};
app.use(cors(corsOpts));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const distDir = path.join(__dirname, 'dist');
const distSpaIndex = fs.existsSync(path.join(distDir, 'index.vite.html'))
  ? path.join(distDir, 'index.vite.html')
  : path.join(distDir, 'index.html');
const serveDist = process.env.NODE_ENV === 'production' && fs.existsSync(distSpaIndex);
const staticRoot = serveDist ? distDir : path.join(__dirname, 'public');
app.use(express.static(staticRoot, serveDist ? { index: false } : undefined));

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
const appVersion = require(path.join(__dirname, 'package.json')).version;
app.get('/api/version', (req, res) => {
  res.json({ version: appVersion });
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
  const secret = req.headers['x-deploy-secret'] || req.query?.secret;
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

app.use('/api/auth', authRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/map', mapRouter);
app.use('/api/plants', plantsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/stats', statsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/observations', observationsRouter);
app.use('/api/audit', auditRouter);

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
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
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
  logger.error({ err }, 'Exception non capturée — app continue');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Promesse rejetée non gérée');
});

// ── Fonction de démarrage — appelable depuis app.js (Passenger) ou directement ──
let booted = false;
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
