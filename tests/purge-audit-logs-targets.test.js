'use strict';

// Cible de purge : rétention activité (90 j) pour user_activity_events, sans BDD.
const test = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_HISTORY_RETENTION_DAYS,
  DEFAULT_ACTIVITY_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  parseArgs,
  TARGETS,
  assertRetention,
  TRANSIENT_RETENTION_DAYS,
  retentionDaysFor,
} = require('../scripts/purge-audit-logs');

test('les tables sont couvertes, réparties sur leurs rétentions', () => {
  const byRetention = new Map();
  for (const target of TARGETS) {
    if (!byRetention.has(target.retention)) byRetention.set(target.retention, []);
    byRetention.get(target.retention).push(target.table);
  }
  assert.deepStrictEqual(byRetention.get('security'), [
    'audit_log',
    'security_events',
    'elevation_audit',
  ]);
  assert.deepStrictEqual(byRetention.get('activity'), ['user_activity_events']);
  assert.deepStrictEqual(byRetention.get('history'), [
    'gl_game_events',
    'zone_history',
    'resource_gating_cooldowns',
    'gl_resource_gating_cooldowns',
  ]);
  assert.deepStrictEqual(byRetention.get('transient'), [
    'gl_qcm_presentation_uses',
    'password_reset_tokens',
  ]);
  // RG2 (audit RGPD du 30/09/2026) : synchronisation Moodle, visites, invités G&L.
  assert.deepStrictEqual(byRetention.get('sync'), [
    'sync_actions',
    'sync_runs',
    'sync_pending_matches',
    'sync_conflicts',
  ]);
  assert.deepStrictEqual(byRetention.get('visits'), ['user_product_visits', 'usage_counters']);
  assert.deepStrictEqual(byRetention.get('guest'), ['gl_qcm_attempts']);
  assert.strictEqual(TRANSIENT_RETENTION_DAYS, 1);
  assert.strictEqual(DEFAULT_ACTIVITY_RETENTION_DAYS, 90);
  const r = {
    days: 365,
    historyDays: 90,
    activityDays: 90,
    syncDays: 200,
    visitsDays: 395,
    guestDays: 31,
  };
  assert.strictEqual(retentionDaysFor({ retention: 'activity' }, r), 90);
  assert.strictEqual(retentionDaysFor({ retention: 'transient' }, r), 1);
  assert.strictEqual(retentionDaysFor({ retention: 'history' }, r), 90);
  assert.strictEqual(retentionDaysFor({ retention: 'security' }, r), 365);
  assert.strictEqual(retentionDaysFor({ retention: 'sync' }, r), 200);
  assert.strictEqual(retentionDaysFor({ retention: 'visits' }, r), 395);
  assert.strictEqual(retentionDaysFor({ retention: 'guest' }, r), 31);
});

test('un verrou qui court n’est jamais purgé : la borne porte sur locked_until ET updated_at', () => {
  for (const table of ['resource_gating_cooldowns', 'gl_resource_gating_cooldowns']) {
    const where = TARGETS.find((t) => t.table === table).where;
    assert.match(where, /locked_until < NOW\(\)/);
    assert.match(where, /updated_at < \(NOW\(\) - INTERVAL \? DAY\)/);
  }
});

test('chaque cible filtre dans son référentiel de temps et reste paramétrée', () => {
  const whereByTable = new Map(TARGETS.map((t) => [t.table, t.where]));
  assert.match(whereByTable.get('gl_game_events'), /created_at < \(NOW\(\) - INTERVAL \? DAY\)/);
  assert.match(
    whereByTable.get('user_activity_events'),
    /occurred_at < \(NOW\(\) - INTERVAL \? DAY\)/,
  );
  assert.match(
    whereByTable.get('zone_history'),
    /harvested_at < DATE_FORMAT\(CURDATE\(\) - INTERVAL \? DAY, '%Y-%m-%d'\)/,
  );
  for (const target of TARGETS) {
    assert.ok(
      target.where.includes('?'),
      `${target.table} : la borne doit rester un paramètre SQL (?)`,
    );
  }
});

test('parseArgs : rétentions indépendantes, défauts, variables d’environnement', () => {
  const defaults = {
    apply: false,
    days: 365,
    historyDays: 365,
    activityDays: 90,
    syncDays: 365,
    visitsDays: 365,
    guestDays: 30,
    ipDays: 183,
  };
  assert.deepStrictEqual(parseArgs([]), defaults);
  assert.strictEqual(DEFAULT_RETENTION_DAYS, 365);
  assert.strictEqual(DEFAULT_HISTORY_RETENTION_DAYS, 365);

  const parsed = parseArgs([
    '--days=180',
    '--history-days=730',
    '--activity-days=60',
    '--sync-days=400',
    '--visits-days=200',
    '--guest-days=45',
    '--ip-days=90',
    '--apply',
  ]);
  assert.deepStrictEqual(parsed, {
    apply: true,
    days: 180,
    historyDays: 730,
    activityDays: 60,
    syncDays: 400,
    visitsDays: 200,
    guestDays: 45,
    ipDays: 90,
  });

  assert.deepStrictEqual(parseArgs(['--days=90']), { ...defaults, days: 90 });
  // Variable d'environnement, écrasée par l'option explicite.
  assert.deepStrictEqual(
    parseArgs(['--guest-days=60'], {
      FORETMAP_RETENTION_SYNC_DAYS: '500',
      FORETMAP_RETENTION_GUEST_DAYS: '40',
    }),
    { ...defaults, syncDays: 500, guestDays: 60 },
  );
});

test('assertRetention refuse toute rétention sous 30 jours', () => {
  assert.strictEqual(MIN_RETENTION_DAYS, 30);
  assert.throws(() => assertRetention('sécurité (--days)', 7), /Minimum 30 jours/);
  assert.throws(() => assertRetention('activité (--activity-days)', NaN), /Minimum 30 jours/);
  assert.doesNotThrow(() => assertRetention('activité (--activity-days)', 30));
});
