'use strict';

/**
 * Redémarrage par le cron de déploiement (scripts/auto-deploy-cron.sh, `restart_app`) :
 * le script est **réellement exécuté** dans un bac à sable (dépôt git jetable, faux serveur
 * HTTP, faux `fetch-dist-artifact.js` et `ops-alert.js`).
 *
 * Scénario : aucun nouveau commit, `dist/` en place, mais le serveur annonce
 * `frontend: "missing"` (démarré sans `dist/`, resté sur la page d'aide) — le cron doit le
 * redémarrer :
 *  - sans `DEPLOY_SECRET` : roue de secours `tmp/restart.txt`, puis une requête pour que
 *    Passenger l'applique ;
 *  - secret refusé (401) : même roue de secours, plus une alerte ;
 *  - secret accepté : `POST /api/admin/restart`, rien d'autre.
 * Au passage suivant, la fenêtre anti-boucle (30 min) empêche un second redémarrage.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function gitEnv() {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };
}

/** Faux serveur : `/api/health` annonce `frontend`, `/api/admin/restart` répond `restartStatus`. */
async function startFakeServer({ frontend, restartStatus }) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.url === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, frontend }));
      return;
    }
    if (req.url === '/api/admin/restart' && req.method === 'POST') {
      res.statusCode = restartStatus;
      res.end('{}');
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    hits,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Dépôt applicatif jetable, à jour avec son « origin », `dist/` présent et ignoré. */
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-cron-restart-'));
  const app = path.join(root, 'app');
  const scripts = path.join(app, 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'scripts', 'auto-deploy-cron.sh'),
    path.join(scripts, 'auto-deploy-cron.sh'),
  );
  // `repair` : dist/ complet, rien à faire (code 0).
  fs.writeFileSync(path.join(scripts, 'fetch-dist-artifact.js'), 'process.exit(0);\n');
  fs.writeFileSync(
    path.join(scripts, 'ops-alert.js'),
    "require('fs').appendFileSync(process.env.TEST_ALERT_LOG, process.argv.slice(2).join(' | ') + '\\n');\n",
  );
  fs.writeFileSync(path.join(app, '.gitignore'), 'dist/\ntmp/\n');
  const git = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8', env: gitEnv() });
  git('init', '--quiet');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'app');
  git('clone', '--quiet', '--bare', app, path.join(root, 'origin.git'));
  git('remote', 'add', 'origin', path.join(root, 'origin.git'));
  git('fetch', '--quiet', 'origin');
  fs.mkdirSync(path.join(app, 'dist'));
  fs.writeFileSync(path.join(app, 'dist', 'index.vite.html'), '<!doctype html>');
  const branch = git('branch', '--show-current').trim();
  return { root, app, branch };
}

function runCron(sandbox, baseUrl, extraEnv = {}) {
  const alertLog = path.join(sandbox.root, 'alerts.log');
  const env = {
    ...process.env,
    APP_DIR: sandbox.app,
    DEPLOY_BRANCH: sandbox.branch,
    DEPLOY_BASE_URL: baseUrl,
    DEPLOY_ENV_FILE: path.join(sandbox.root, 'absent.env'),
    DEPLOY_LOCK_DIR: path.join(sandbox.root, 'lock'),
    DEPLOY_STAMP_DIR: sandbox.root,
    DEPLOY_AUTO_MIGRATE: '0',
    TEST_ALERT_LOG: alertLog,
    ...extraEnv,
  };
  if (!('DEPLOY_SECRET' in extraEnv)) delete env.DEPLOY_SECRET;
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [path.join(sandbox.app, 'scripts', 'auto-deploy-cron.sh')], {
      env,
      cwd: sandbox.app,
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => {
      const alerts = fs.existsSync(alertLog) ? fs.readFileSync(alertLog, 'utf8') : '';
      resolve({ code, out, alerts });
    });
  });
}

const restartFile = (sandbox) => path.join(sandbox.app, 'tmp', 'restart.txt');

test('sans DEPLOY_SECRET : roue de secours tmp/restart.txt, appliquée tout de suite, une fois', async () => {
  const sandbox = makeSandbox();
  const server = await startFakeServer({ frontend: 'missing', restartStatus: 200 });
  try {
    const first = await runCron(sandbox, server.baseUrl);
    assert.equal(first.code, 0, first.out);
    assert.ok(fs.existsSync(restartFile(sandbox)), `tmp/restart.txt absent\n${first.out}`);
    assert.match(first.out, /DEPLOY_SECRET absent : redémarrage par tmp\/restart\.txt/);
    assert.ok(!server.hits.includes('POST /api/admin/restart'), 'pas d’appel sans secret');
    // Une requête après le touch, pour que Passenger applique le redémarrage sans attendre.
    assert.deepEqual(server.hits, ['GET /api/health', 'GET /api/health']);
    // tmp/ est ignoré : l'arbre reste propre, le déploiement suivant n'est pas bloqué.
    assert.equal(
      execFileSync('git', ['status', '--porcelain'], { cwd: sandbox.app, encoding: 'utf8' }),
      '',
    );

    const touchedAt = fs.statSync(restartFile(sandbox)).mtimeMs;
    const second = await runCron(sandbox, server.baseUrl);
    assert.equal(second.code, 0, second.out);
    assert.match(second.out, /déjà demandé il y a moins de 30 min/);
    assert.equal(fs.statSync(restartFile(sandbox)).mtimeMs, touchedAt, 'pas de second touch');
  } finally {
    await server.close();
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test('secret refusé (401) : roue de secours tmp/restart.txt et alerte', async () => {
  const sandbox = makeSandbox();
  const server = await startFakeServer({ frontend: 'missing', restartStatus: 401 });
  try {
    const run = await runCron(sandbox, server.baseUrl, { DEPLOY_SECRET: 'mauvais' });
    assert.equal(run.code, 0, run.out);
    assert.ok(server.hits.includes('POST /api/admin/restart'));
    assert.ok(fs.existsSync(restartFile(sandbox)), run.out);
    assert.match(run.out, /DEPLOY_SECRET refusé par l'application \(HTTP 401\)/);
    assert.match(run.alerts, /DEPLOY_SECRET refusé/);
  } finally {
    await server.close();
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test('secret accepté : redémarrage piloté par l’API, pas de tmp/restart.txt', async () => {
  const sandbox = makeSandbox();
  const server = await startFakeServer({ frontend: 'missing', restartStatus: 200 });
  try {
    const run = await runCron(sandbox, server.baseUrl, { DEPLOY_SECRET: 'bon' });
    assert.equal(run.code, 0, run.out);
    assert.ok(server.hits.includes('POST /api/admin/restart'));
    assert.equal(fs.existsSync(restartFile(sandbox)), false);
    assert.match(run.out, /Redémarrage demandé via \/api\/admin\/restart/);
  } finally {
    await server.close();
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test('front servi : aucun redémarrage', async () => {
  const sandbox = makeSandbox();
  const server = await startFakeServer({ frontend: 'dist', restartStatus: 200 });
  try {
    const run = await runCron(sandbox, server.baseUrl);
    assert.equal(run.code, 0, run.out);
    assert.deepEqual(server.hits, ['GET /api/health']);
    assert.equal(fs.existsSync(restartFile(sandbox)), false);
    assert.match(run.out, /Aucune mise à jour/);
  } finally {
    await server.close();
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});
