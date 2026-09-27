'use strict';

/**
 * Bac à sable pour exécuter réellement `scripts/auto-deploy-cron.sh` : dépôt applicatif jetable
 * avec son « origin », faux serveur HTTP, faux `fetch-dist-artifact.js` et `ops-alert.js`.
 * Utilisé par `tests/deploy-cron-restart.test.js` et `tests/deploy-cron-server-env.test.js`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');

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
async function startFakeServer({ frontend, restartStatus = 200 }) {
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-cron-'));
  const app = path.join(root, 'app');
  const scripts = path.join(app, 'scripts');
  fs.mkdirSync(path.join(scripts, 'lib'), { recursive: true });
  for (const rel of ['auto-deploy-cron.sh', 'lib/app-node.sh']) {
    fs.copyFileSync(path.join(ROOT, 'scripts', rel), path.join(scripts, rel));
  }
  // `check` / `repair` : artefact prêt, dist/ complet, rien à faire (code 0).
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
  return { root, app, branch, git };
}

/** Pousse sur l'« origin » du bac à sable un commit qui ajoute `files` ({ chemin: contenu }). */
function pushRemoteCommit(sandbox, files) {
  const work = path.join(sandbox.root, `work-${Date.now()}`);
  execFileSync('git', ['clone', '--quiet', path.join(sandbox.root, 'origin.git'), work], {
    env: gitEnv(),
  });
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(work, rel), content);
  }
  const git = (...args) =>
    execFileSync('git', args, { cwd: work, encoding: 'utf8', env: gitEnv() });
  git('add', '-A');
  git('commit', '--quiet', '-m', 'distant');
  git('push', '--quiet', 'origin', `HEAD:${sandbox.branch}`);
  return git('rev-parse', 'HEAD').trim();
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
  for (const key of ['DEPLOY_SECRET', 'DEPLOY_NODE_BIN_DIR']) {
    if (!(key in extraEnv)) delete env[key];
  }
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

module.exports = { ROOT, gitEnv, startFakeServer, makeSandbox, pushRemoteCommit, runCron };
