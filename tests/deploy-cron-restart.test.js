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
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { startFakeServer, makeSandbox, runCron } = require('./helpers/deployCronSandbox');

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
