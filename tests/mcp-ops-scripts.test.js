'use strict';

/**
 * Scripts d'exploitation du connecteur (`lib/mcp/domains/opsScripts.js`) : liste blanche,
 * validation stricte des options, simulation / application selon le mode de chaque script,
 * sortie nettoyée et tronquée, un seul script à la fois. Le lancement réel est remplacé par un
 * `runner` injecté (signature d'`execFile`) : aucun processus, aucune base.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('../lib/mcp/domains/opsScripts');

function fakeRunner(result = {}, seen = []) {
  return (cmd, argv, opts, cb) => {
    seen.push({ cmd, argv, opts });
    setImmediate(() => cb(result.err || null, result.stdout || '', result.stderr || ''));
  };
}

test('catalogue : chaque script existe dans scripts/ et a un mode connu', () => {
  for (const id of s.SCRIPT_IDS) {
    const spec = s.SCRIPT_CATALOG[id];
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'scripts', spec.file)), spec.file);
    assert.ok(['flag', 'inverse', 'none', 'dry_only'].includes(spec.writeMode), id);
  }
  const listed = s.listScripts();
  assert.equal(listed.length, s.SCRIPT_IDS.length);
  const rb = listed.find((x) => x.id === 'rewards_backfill');
  assert.equal(rb.apply_available, true);
  assert.deepEqual(
    rb.options.map((o) => o.name),
    ['all'],
  );
});

test('buildArgs : modes flag, inverse, none, dry_only', () => {
  assert.deepEqual(s.buildArgs('rewards_backfill', { all: true }, { apply: false }), ['--all']);
  assert.deepEqual(s.buildArgs('rewards_backfill', { all: true }, { apply: true }), [
    '--all',
    '--apply',
  ]);
  assert.deepEqual(s.buildArgs('backfill_gbif_keys', { limit: 20 }, { apply: false }), [
    '--limit=20',
    '--dry-run',
  ]);
  assert.deepEqual(s.buildArgs('backfill_gbif_keys', {}, { apply: true }), []);
  assert.deepEqual(s.buildArgs('db_migration_status', {}, { apply: false }), []);
  assert.deepEqual(s.buildArgs('task_taxonomy_backfill', { overwrite: true }, { apply: false }), [
    '--overwrite',
    '--dry-run',
  ]);
  assert.throws(() => s.buildArgs('db_migration_status', {}, { apply: true }), /lecture seule/);
  assert.throws(() => s.buildArgs('task_taxonomy_backfill', {}, { apply: true }), /simulation/);
});

test('buildArgs : options inconnues, valeurs hors motif et injections refusées', () => {
  assert.throws(() => s.buildArgs('inconnu', {}, { apply: false }), /Script inconnu/);
  assert.throws(
    () => s.buildArgs('rewards_backfill', { file: '/etc/passwd' }, { apply: false }),
    /Option inconnue/,
  );
  assert.throws(
    () => s.buildArgs('report_marker_density', { map: 'n3;rm -rf /' }, { apply: false }),
    /valeur refusée/,
  );
  assert.throws(
    () => s.buildArgs('reconcile_orphan_uploads', { scope: 'tout' }, { apply: false }),
    /managed, all/,
  );
  assert.throws(
    () => s.buildArgs('rewards_backfill', { all: 'oui' }, { apply: false }),
    /booléen attendu/,
  );
  assert.throws(() => s.buildArgs('suggest_learning_links', {}, { apply: false }), /obligatoire/);
  assert.deepEqual(
    s.buildArgs('suggest_learning_links', { product: 'gl', dataset: 'qcm' }, { apply: false }),
    ['--product=gl', '--dataset=qcm'],
  );
});

test('runScript : Node de l’application, sans shell, racine du dépôt, sortie nettoyée', async () => {
  const seen = [];
  const out = await s.runScript('rewards_backfill', {
    options: { all: true },
    runner: fakeRunner({ stdout: 'Dry-run : 3 élève(s) évalué(s)\n' }, seen),
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].cmd, process.execPath);
  assert.match(seen[0].argv[0], /scripts[\\/]rewards-backfill\.js$/);
  assert.deepEqual(seen[0].argv.slice(1), ['--all']);
  assert.equal(seen[0].opts.cwd, path.resolve(__dirname, '..'));
  assert.ok(seen[0].opts.timeout > 0);
  assert.equal(out.mode, 'simulation');
  assert.equal(out.ok, true);
  assert.equal(out.exit_code, 0);
  assert.match(out.stdout, /3 élève/);

  const mail = 'eleve.secret@example.test';
  const masked = await s.runScript('audit_pedago', { runner: fakeRunner({ stdout: mail }) });
  assert.ok(!masked.stdout.includes(mail), 'e-mail masqué');
  assert.equal(masked.mode, 'lecture');
});

test('runScript : code de sortie non nul rendu, délai dépassé signalé, sortie tronquée', async () => {
  const exit3 = Object.assign(new Error('exit 3'), { code: 3 });
  const pending = await s.runScript('db_migration_status', { runner: fakeRunner({ err: exit3 }) });
  assert.equal(pending.exit_code, 3);
  assert.equal(pending.ok, false);

  const killed = Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM' });
  const slow = await s.runScript('audit_pedago', { runner: fakeRunner({ err: killed }) });
  assert.equal(slow.timed_out, true);

  const long = await s.runScript('audit_pedago', {
    runner: fakeRunner({ stdout: `${'x'.repeat(30_000)}BILAN` }),
  });
  assert.equal(long.truncated, true);
  assert.ok(long.stdout.endsWith('BILAN'), 'la fin (bilan) est conservée');

  const enoent = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
  await assert.rejects(
    s.runScript('audit_pedago', { runner: fakeRunner({ err: enoent }) }),
    /impossible/,
  );
});

test('runScript : un seul script à la fois', async () => {
  let release;
  const slowRunner = (cmd, argv, opts, cb) => {
    release = () => cb(null, 'fini', '');
  };
  const first = s.runScript('audit_pedago', { runner: slowRunner });
  await assert.rejects(
    s.runScript('db_migration_status', { runner: fakeRunner() }),
    /déjà en cours/,
  );
  release();
  await first;
  const again = await s.runScript('db_migration_status', { runner: fakeRunner() });
  assert.equal(again.ok, true);
});
