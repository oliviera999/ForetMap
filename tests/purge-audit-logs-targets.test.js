'use strict';

// C3 (audit stabilité/perf 2026-09) — le périmètre de purge couvre les tables de contenu
// à croissance continue (`gl_game_events`, `zone_history`), avec une rétention DISTINCTE
// de celle des journaux de sécurité. Vérifié sans base : le script exporte ses cibles et
// son parseur d'arguments (main() ne s'exécute que via require.main).
const test = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_HISTORY_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  parseArgs,
  TARGETS,
  assertRetention,
  TRANSIENT_RETENTION_DAYS,
  retentionDaysFor,
} = require('../scripts/purge-audit-logs');

test('les sept tables sont couvertes, réparties sur trois rétentions', () => {
  const byRetention = new Map();
  for (const target of TARGETS) {
    if (!byRetention.has(target.retention)) byRetention.set(target.retention, []);
    byRetention.get(target.retention).push(target.table);
  }
  assert.deepStrictEqual(byRetention.get('security'), ['audit_log', 'security_events']);
  // Lot 6 de l'audit validation quiz (C6) : verrous échus / lignes de comptage des deux produits.
  assert.deepStrictEqual(byRetention.get('history'), [
    'gl_game_events',
    'zone_history',
    'resource_gating_cooldowns',
    'gl_resource_gating_cooldowns',
  ]);
  // Jetons de présentation consommés : rétention fixe d'un jour (un jeton vit 15 min).
  assert.deepStrictEqual(byRetention.get('transient'), ['gl_qcm_presentation_uses']);
  assert.strictEqual(TRANSIENT_RETENTION_DAYS, 1);
  assert.strictEqual(
    retentionDaysFor({ retention: 'transient' }, { days: 365, historyDays: 90 }),
    1,
  );
  assert.strictEqual(
    retentionDaysFor({ retention: 'history' }, { days: 365, historyDays: 90 }),
    90,
  );
  assert.strictEqual(
    retentionDaysFor({ retention: 'security' }, { days: 365, historyDays: 90 }),
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
  // gl_game_events.created_at : DATETIME heure locale serveur.
  assert.match(whereByTable.get('gl_game_events'), /created_at < \(NOW\(\) - INTERVAL \? DAY\)/);
  // zone_history.harvested_at : DATE `YYYY-MM-DD` en VARCHAR — comparaison lexicographique.
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

test('parseArgs : deux rétentions indépendantes, 365 jours par défaut', () => {
  assert.deepStrictEqual(parseArgs([]), { apply: false, days: 365, historyDays: 365 });
  assert.strictEqual(DEFAULT_RETENTION_DAYS, 365);
  assert.strictEqual(DEFAULT_HISTORY_RETENTION_DAYS, 365);

  const parsed = parseArgs(['--days=180', '--history-days=730', '--apply']);
  assert.deepStrictEqual(parsed, { apply: true, days: 180, historyDays: 730 });

  // `--days` ne pilote QUE la rétention sécurité : les historiques gardent leur défaut.
  assert.deepStrictEqual(parseArgs(['--days=90']), { apply: false, days: 90, historyDays: 365 });
});

test('assertRetention refuse toute rétention sous 30 jours, pour les deux familles', () => {
  assert.strictEqual(MIN_RETENTION_DAYS, 30);
  assert.throws(() => assertRetention('sécurité (--days)', 7), /Minimum 30 jours/);
  assert.throws(() => assertRetention('historiques (--history-days)', NaN), /Minimum 30 jours/);
  assert.doesNotThrow(() => assertRetention('historiques (--history-days)', 30));
});
