const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDatabase } = require('./database');
const { validateEnv } = require('./lib/env');
const logger = require('./lib/logger');

const authRouter    = require('./routes/auth');
const zonesRouter   = require('./routes/zones');
const mapRouter     = require('./routes/map');
const plantsRouter  = require('./routes/plants');
const tasksRouter   = require('./routes/tasks');
const statsRouter   = require('./routes/stats');
const studentsRouter = require('./routes/students');

const app = express();

const corsOpts = process.env.NODE_ENV === 'production' && process.env.FRONTEND_ORIGIN
  ? { origin: process.env.FRONTEND_ORIGIN }
  : {};
app.use(cors(corsOpts));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Route de santé sans BDD — pour le contrôle de disponibilité (o2switch / Passenger)
app.get('/api/health', (req, res) => {
  res.type('application/json').status(200).json({ ok: true });
});
app.get('/health', (req, res) => {
  res.type('application/json').status(200).json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/map', mapRouter);
app.use('/api/plants', plantsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/stats', statsRouter);
app.use('/api/students', studentsRouter);

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion d'erreurs centralisée (pour les routes qui font next(err))
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, 'Erreur serveur');
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
});

const host = process.env.IP || process.env.ALWAYSDATA_HTTPD_IP || '0.0.0.0';
const port = process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT || 3000;

function startServer() {
  app.listen(port, host, () => {
    logger.info(`ForêtMap lancé sur http://${host}:${port}`);
  });
}

if (require.main === module) {
  try {
    validateEnv();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  initDatabase()
    .then(() => {
      startServer();
    })
    .catch((err) => {
      logger.error({ err }, 'Erreur init BDD (le serveur démarre quand même)');
      startServer();
    });
}

module.exports = { app };
