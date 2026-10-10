'use strict';

/**
 * Tâche planifiée de la purge (`scripts/retention-purge-cron.sh`) : alerte par e-mail
 * (`scripts/ops-alert.js`) et code de sortie non nul en cas d'échec ou de seuil dépassé ;
 * silencieuse en cas de succès. Transport SMTP JSON (aucun envoi réel).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { initSchema, execute } = require('../database');
const { createDatedAccount } = require('./helpers/retentionFixtures');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'retention-purge-cron.sh');

test.before(async () => {
  await initSchema();
});

test('cron : syntaxe bash valide', () => {
  const run = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

function runCron(args, extraEnv = {}) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_DIR: ROOT,
      RETENTION_PURGE_APPLY: '',
      SMTP_JSON_TRANSPORT: 'true',
      OPS_ALERT_TO: 'exploitation@exemple.test',
      RETENTION_CRON_NO_ALERT: '',
      ...extraEnv,
    },
  });
}

test('cron : échec → code 1 et alerte envoyée', () => {
  const run = runCron(['--apply', '--only=inconnue']);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /Catégorie inconnue/);
  assert.match(run.stdout, /Purge planifiée : ÉCHEC \(code 1\)/);
  assert.match(run.stdout, /\[ops-alert\] envoyé/, 'alerte e-mail partie');
});

test('cron : seuil dépassé → code 3 et alerte envoyée, rien supprimé', async () => {
  // Deux comptes élèves au terme de leur conservation (départ constaté depuis plus d'un an).
  const accounts = [];
  for (const label of ['CronUn', 'CronDeux']) {
    accounts.push(
      await createDatedAccount({
        label,
        isActive: 0,
        deactivatedDaysAgo: 400,
        lastSeenDaysAgo: 420,
      }),
    );
  }
  const run = runCron(['--only=eleves', '--max-accounts=1']);
  assert.equal(run.status, 3, run.stdout + run.stderr);
  assert.match(run.stdout, /SEUIL DÉPASSÉ/);
  assert.match(run.stdout, /\[ops-alert\] envoyé/);
  for (const account of accounts) {
    assert.ok(!run.stdout.includes(account.id) && !run.stdout.includes(account.lastName));
  }
  // Remise en ordre pour les fichiers suivants : comptes réactivés et récents.
  for (const account of accounts) {
    await execute(
      'UPDATE users SET is_active = 1, deactivated_at = NULL, last_seen = NOW() WHERE id = ?',
      [account.id],
    );
  }
});

test('cron : succès → code 0, aucune alerte', () => {
  const run = runCron(['--apply', '--only=desactivations']);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /SIMULATION/, 'sans RETENTION_PURGE_APPLY=1 : simulation');
  assert.match(run.stdout, /Purge planifiée : succès\./);
  assert.doesNotMatch(run.stdout, /ops-alert/, 'silencieuse en cas de succès');
});

test('cron : RETENTION_CRON_NO_ALERT=1 coupe l’e-mail mais garde le code d’échec', () => {
  const run = runCron(['--aply'], { RETENTION_CRON_NO_ALERT: '1' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /Alerte \(e-mail coupé\)/);
  assert.doesNotMatch(run.stdout, /\[ops-alert\]/);
});
