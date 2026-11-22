'use strict';

/**
 * Signalement de l'écart prod/dépôt (flux F7) dans `npm run db:status`, le rapport de santé,
 * `foretmap_db_status` et la réponse d'un DDL de `foretmap_sql_execute`. Toujours informatif :
 * aucun code de sortie, aucun statut bloquant, aucune règle d'écriture du connecteur changée.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { getMigrationStatus, summarizeDrift } = require('../lib/migrationStatus');
const { evaluateHealth } = require('../lib/mcp/health/rules');
const { createInternalDiagnosticsSource } = require('../lib/mcp/tools/diagnosticsInternal');
const {
  buildSqlExecuteTools,
  withSchemaDriftNote,
  SCHEMA_DRIFT_NOTE,
} = require('../lib/mcp/tools/sqlExecute');
const { sqlExecute } = require('../lib/mcp/sqlWrite/execute');

const PROBE = 'f7_drift_probe';

before(async () => {
  await initSchema();
  await execute(`DROP TABLE IF EXISTS ${PROBE}`);
});

after(async () => {
  await execute(`DROP TABLE IF EXISTS ${PROBE}`);
});

const driftFacts = (drift) => ({ schema: { pending: [], drift } });
const someDrift = {
  available: true,
  ok: false,
  total: 2,
  stale: false,
  messages: ['Colonnes en plus : plants.x — à reprendre en migration.'],
};

test('santé : écart signalé en info par défaut, statut inchangé', () => {
  const prev = process.env.MCP_HEALTH_SCHEMA_DRIFT_LEVEL;
  delete process.env.MCP_HEALTH_SCHEMA_DRIFT_LEVEL;
  try {
    const res = evaluateHealth(driftFacts(someDrift));
    assert.equal(res.status, 'green');
    const f = res.findings.find((x) => x.rule === 'schema_drift');
    assert.ok(f, 'constat schema_drift attendu');
    assert.equal(f.level, 'info');
    assert.match(f.message, /2 écart\(s\).*à reprendre en migration/);
    assert.match(f.message, /plants\.x/);
  } finally {
    if (prev === undefined) delete process.env.MCP_HEALTH_SCHEMA_DRIFT_LEVEL;
    else process.env.MCP_HEALTH_SCHEMA_DRIFT_LEVEL = prev;
  }
});

test('santé : MCP_HEALTH_SCHEMA_DRIFT_LEVEL=orange rend l’écart alertant (jamais rouge)', () => {
  const prev = process.env.MCP_HEALTH_SCHEMA_DRIFT_LEVEL;
  process.env.MCP_HEALTH_SCHEMA_DRIFT_LEVEL = 'orange';
  try {
    const res = evaluateHealth(driftFacts(someDrift));
    assert.equal(res.status, 'orange');
  } finally {
    if (prev === undefined) delete process.env.MCP_HEALTH_SCHEMA_DRIFT_LEVEL;
    else process.env.MCP_HEALTH_SCHEMA_DRIFT_LEVEL = prev;
  }
});

test('santé : rien si conforme, indisponible ou base en retard (migrations déjà signalées)', () => {
  for (const drift of [
    { available: true, ok: true, total: 0 },
    { available: false, ok: null, reason: 'x' },
    { ...someDrift, stale: true },
    null,
  ]) {
    const res = evaluateHealth(driftFacts(drift));
    assert.equal(
      res.findings.some((x) => x.rule === 'schema_drift'),
      false,
      JSON.stringify(drift),
    );
  }
});

test('migrationStatus : includeDrift sur la base fraîche → conforme ; upToDate inchangé', async () => {
  const plain = await getMigrationStatus({ queryOne, queryAll });
  assert.equal('drift' in plain, false, 'sans option, aucun contrôle (cron, diagnostics)');
  const status = await getMigrationStatus({ queryOne, queryAll }, { includeDrift: true });
  assert.equal(status.upToDate, plain.upToDate);
  assert.equal(status.drift.available, true);
  assert.equal(status.drift.ok, true, status.drift.messages.join('\n'));
  const noQueryAll = await getMigrationStatus({ queryOne }, { includeDrift: true });
  assert.equal(noQueryAll.drift.available, false);
  assert.equal(summarizeDrift(undefined), null);
});

test('écart réel : table en plus vue par migrationStatus, foretmap_db_status et db:status', async () => {
  await execute(`CREATE TABLE ${PROBE} (id INT PRIMARY KEY)`);
  try {
    const status = await getMigrationStatus({ queryOne, queryAll }, { includeDrift: true });
    assert.equal(status.drift.ok, false);
    assert.deepEqual(status.drift.diff.tables.extra, [PROBE]);
    const summary = summarizeDrift(status.drift);
    assert.equal(summary.counts.tables, 1);
    assert.ok(
      summary.messages.some((m) => m.includes(PROBE) && /à reprendre en migration/.test(m)),
    );

    const source = createInternalDiagnosticsSource();
    const db = await source.dbStatus();
    assert.equal(db.schema_drift.ok, false);
    assert.deepEqual(db.schema_drift.details.tables.extra, [PROBE]);

    const run = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'scripts', 'db-migration-status.js')],
      { env: { ...process.env }, encoding: 'utf8', timeout: 60000 },
    );
    assert.match(run.stdout, new RegExp(`${PROBE}.*à reprendre en migration`));
    assert.notEqual(run.status, 1, run.stderr);
    // Informatif : le code de sortie ne dépend que des migrations (0 ici, base à jour).
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    await execute(`DROP TABLE IF EXISTS ${PROBE}`);
  }
});

test('connecteur : mention d’information sur un DDL exécuté, et seulement là', () => {
  const ddl = { kind: 'ddl', subtype: 'create', dry_run: false, executed: true };
  assert.equal(withSchemaDriftNote(ddl).schema_drift_note, SCHEMA_DRIFT_NOTE);
  assert.match(SCHEMA_DRIFT_NOTE, /foretmap_db_status/);
  for (const other of [
    { ...ddl, dry_run: true, executed: false },
    { kind: 'dml', dry_run: false, executed: true },
    { confirmation_required: true },
    null,
  ]) {
    const out = withSchemaDriftNote(other);
    assert.equal(out?.schema_drift_note, undefined);
    assert.equal(out, other, 'réponse transmise telle quelle');
  }
  const [tool] = buildSqlExecuteTools();
  assert.equal(tool.name, 'foretmap_sql_execute');
  assert.notEqual(tool.handler, sqlExecute, 'handler enrobé (mention d’information)');
  // Aucune règle changée : mêmes exigences d'accès.
  assert.equal(tool.requires.role, 'admin');
  assert.equal(tool.requires.flag, 'sql_write');
});
