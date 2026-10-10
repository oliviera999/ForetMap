'use strict';

/**
 * Cron de déploiement (scripts/auto-deploy-cron.sh) : `git fetch` refusé — dossier sûreté 2026-10.
 *
 * Passer le dépôt GitHub en privé coupe le `git fetch` du serveur tant que son `origin` est en
 * HTTPS anonyme. Sous `set -e`, le script s'arrêtait alors sans alerte : plus aucun
 * déploiement, et personne pour le savoir. Le script est **réellement exécuté** dans le bac à
 * sable de `tests/helpers/deployCronSandbox.js`, avec un `origin` injoignable.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startFakeServer, makeSandbox, runCron } = require('./helpers/deployCronSandbox');

// Aucun mandataire : la connexion à 127.0.0.1:1 est refusée tout de suite.
const NO_PROXY_ENV = Object.fromEntries(
  ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'].map((k) => [
    k,
    '',
  ]),
);

test('fetch refusé : alerte (une fois par fenêtre), identifiants masqués, site gardé servi', async () => {
  const sandbox = makeSandbox();
  // Identifiant factice dans l'URL : il ne doit apparaître ni dans le journal ni dans l'alerte.
  sandbox.git('remote', 'set-url', 'origin', 'https://jeton-factice@127.0.0.1:1/depot.git');
  const server = await startFakeServer({ frontend: 'dist' });
  try {
    const first = await runCron(sandbox, server.baseUrl, NO_PROXY_ENV);
    assert.notEqual(first.code, 0, first.out);
    assert.match(first.out, /ÉCHEC du git fetch origin\//);
    assert.match(first.alerts, /Déploiement bloqué \(git fetch refusé\)/);
    assert.match(first.alerts, /clé de déploiement en lecture seule/);
    assert.ok(!first.out.includes('jeton-factice'), first.out);
    assert.ok(!first.alerts.includes('jeton-factice'), first.alerts);
    // Le site reste vérifié : `/api/health` est interrogé même sans déploiement possible.
    assert.ok(server.hits.includes('GET /api/health'), server.hits.join(', '));

    // Le cron repasse toutes les deux minutes : une seule alerte par fenêtre de 6 h.
    const second = await runCron(sandbox, server.baseUrl, NO_PROXY_ENV);
    assert.notEqual(second.code, 0, second.out);
    const fetchAlerts = second.alerts.split('\n').filter((l) => l.includes('git fetch refusé'));
    assert.equal(fetchAlerts.length, 1, second.alerts);
  } finally {
    await server.close();
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
});
