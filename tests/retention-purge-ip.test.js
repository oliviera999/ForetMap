'use strict';

/**
 * Purge planifiée — catégorie `ip` : adresses IP des journaux tronquées au-delà de 3 mois
 * (IPv4 → /24, IPv6 → /48), colonne `security_events.ip_address` ET IP recopiée dans les
 * données complémentaires (`payload_json.ip`) de `security_events` et d'`audit_log`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { initSchema, queryAll, execute } = require('../database');
const { captureLog } = require('./helpers/retentionFixtures');

const TAG = `ip-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`;
const APPLY_ENV = { RETENTION_PURGE_APPLY: '1' };

test.before(async () => {
  await initSchema();
});

test('IP : délai par défaut de 3 mois (90 jours)', () => {
  const purge = require('../scripts/purge-audit-logs');
  assert.equal(purge.DEFAULT_IP_RETENTION_DAYS, 90);
  assert.equal(purge.parseArgs([]).ipDays, 90);
  assert.equal(purge.truncateIp('203.0.113.77'), '203.0.113.0');
  assert.equal(purge.truncateIp('2001:db8:85a3:12::7334'), '2001:db8:85a3::');
});

/** Lignes de journal : IP complète en colonne et en données complémentaires, à `days` jours. */
async function seed(days, ip) {
  await execute(
    `INSERT INTO security_events (occurred_at, action, ip_address, user_agent, payload_json)
     VALUES (NOW() - INTERVAL ? DAY, ?, ?, 'Navigateur/1.0', JSON_OBJECT('ip', ?, 'requestId', 'r1'))`,
    [days, TAG, ip, ip],
  );
  await execute(
    `INSERT INTO audit_log (action, target_type, details, created_at, occurred_at, payload_json)
     VALUES (?, 'staff_plan', 'Entrée par code', UTC_TIMESTAMP(3) - INTERVAL ? DAY,
             UTC_TIMESTAMP() - INTERVAL ? DAY, JSON_OBJECT('ip', ?, 'roleSlug', 'prof'))`,
    [TAG, days, days, ip],
  );
}

async function snapshot() {
  const events = await queryAll(
    `SELECT ip_address, user_agent, JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.ip')) AS pip,
            JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.requestId')) AS rid
       FROM security_events WHERE action = ? ORDER BY id`,
    [TAG],
  );
  const audits = await queryAll(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.ip')) AS pip,
            JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.roleSlug')) AS role
       FROM audit_log WHERE action = ? ORDER BY id`,
    [TAG],
  );
  return { events, audits };
}

test('IP : simulation sans effet, puis troncature au-delà de 3 mois, colonne et données complémentaires', async () => {
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  await seed(120, '198.51.100.23');
  await seed(120, '2001:db8:85a3:12::7334');
  await seed(20, '192.0.2.55');
  const before = await snapshot();

  const out = captureLog();
  const sim = await runRetentionPurge({ argv: ['--only=ip'], env: {}, log: out.log });
  assert.equal(sim.exitCode, 0);
  assert.equal(sim.mode, 'simulation');
  assert.deepEqual(await snapshot(), before, 'simulation : aucune IP modifiée');
  assert.ok(sim.counts.ip.donnees_complementaires.audit_log >= 2);
  assert.ok(sim.counts.ip.donnees_complementaires.security_events >= 2);
  assert.doesNotMatch(out.text(), /198\.51\.100\.23|2001:db8/, 'aucune IP dans la sortie');

  const real = await runRetentionPurge({
    argv: ['--apply', '--only=ip'],
    env: APPLY_ENV,
    log: () => {},
  });
  assert.equal(real.exitCode, 0);
  const after = await snapshot();
  assert.deepEqual(after.events, [
    { ip_address: '198.51.100.0', user_agent: null, pip: '198.51.100.0', rid: 'r1' },
    { ip_address: '2001:db8:85a3::', user_agent: null, pip: '2001:db8:85a3::', rid: 'r1' },
    { ip_address: '192.0.2.55', user_agent: 'Navigateur/1.0', pip: '192.0.2.55', rid: 'r1' },
  ]);
  assert.deepEqual(after.audits, [
    { pip: '198.51.100.0', role: 'prof' },
    { pip: '2001:db8:85a3::', role: 'prof' },
    { pip: '192.0.2.55', role: 'prof' },
  ]);

  // Idempotent : une seconde exécution réelle ne change plus rien.
  const again = await runRetentionPurge({
    argv: ['--apply', '--only=ip'],
    env: APPLY_ENV,
    log: () => {},
  });
  assert.equal(again.exitCode, 0);
  assert.deepEqual(await snapshot(), after);
});

test('IP : l’outil manuel tronque aussi les données complémentaires', async () => {
  const purge = require('../scripts/purge-audit-logs');
  const tag2 = `${TAG}-m`;
  await execute(
    `INSERT INTO audit_log (action, target_type, created_at, occurred_at, payload_json)
     VALUES (?, 'staff_plan', UTC_TIMESTAMP(3) - INTERVAL 100 DAY, UTC_TIMESTAMP() - INTERVAL 100 DAY,
             JSON_OBJECT('ip', '::ffff:203.0.113.9'))`,
    [tag2],
  );
  const report = await purge.runPurge(
    { ...purge.parseArgs([]), apply: true },
    { queryAll, queryOne: (sql, p) => require('../database').queryOne(sql, p), execute },
    () => {},
  );
  assert.ok(report.payloadIpRows.audit_log >= 1);
  const row = await queryAll(
    "SELECT JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.ip')) AS pip FROM audit_log WHERE action = ?",
    [tag2],
  );
  assert.deepEqual(row, [{ pip: '203.0.113.0' }]);
});
