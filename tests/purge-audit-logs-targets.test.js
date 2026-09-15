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

test('les tables sont couvertes, réparties sur quatre rétentions', () => {
  const byRetention = new Map();
  for (const target of TARGETS) {
    if (!byRetention.has(target.retention)) byRetention.set(target.retention, []);
    byRetention.get(target.retention).push(target.table);
  }
  assert.deepStrictEqual(byRetention.get('security'), ['audit_log', 'security_events']);
  assert.deepStrictEqual(byRetention.get('activity'), ['user_activity_events']);
  assert.deepStrictEqual(byRetention.get('history'), [
    'gl_game_events',
    'zone_history',
    'resource_gating_cooldowns',
    'gl_resource_gating_cooldowns',
  ]);
  assert.deepStrictEqual(byRetention.get('transient'), ['gl_qcm_presentation_uses']);
  assert.strictEqual(TRANSIENT_RETENTION_DAYS, 1);
  assert.strictEqual(DEFAULT_ACTIVITY_RETENTION_DAYS, 90);
  assert.strictEqual(
    retentionDaysFor({ retention: 'activity' }, { days: 365, historyDays: 90, activityDays: 90 }),
    90,
  );
  assert.strictEqual(
    retentionDaysFor({ retention: 'transient' }, { days: 365, historyDays: 90, activityDays: 90 }),
    1,
  );
  assert.strictEqual(
    retentionDaysFor({ retention: 'history' }, { days: 365, historyDays: 90, activityDays: 90 }),
    90,
  );
  assert.strictEqual(
    retentionDaysFor({ retention: 'security' }, { days: 365, historyDays: 90, activityDays: 90 }),
    365,
  );
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

test('parseArgs : trois rétentions indépendantes, défauts 365 / 365 / 90', () => {
  assert.deepStrictEqual(parseArgs([]), {
    apply: false,
    days: 365,
    historyDays: 365,
    activityDays: 90,
  });
  assert.strictEqual(DEFAULT_RETENTION_DAYS, 365);
  assert.strictEqual(DEFAULT_HISTORY_RETENTION_DAYS, 365);

  const parsed = parseArgs(['--days=180', '--history-days=730', '--activity-days=60', '--apply']);
  assert.deepStrictEqual(parsed, {
    apply: true,
    days: 180,
    historyDays: 730,
    activityDays: 60,
  });

  assert.deepStrictEqual(parseArgs(['--days=90']), {
    apply: false,
    days: 90,
    historyDays: 365,
    activityDays: 90,
  });
});

test('assertRetention refuse toute rétention sous 30 jours', () => {
  assert.strictEqual(MIN_RETENTION_DAYS, 30);
  assert.throws(() => assertRetention('sécurité (--days)', 7), /Minimum 30 jours/);
  assert.throws(() => assertRetention('activité (--activity-days)', NaN), /Minimum 30 jours/);
  assert.doesNotThrow(() => assertRetention('activité (--activity-days)', 30));
});
