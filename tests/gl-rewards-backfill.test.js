'use strict';

/**
 * Gnomes & Licornes — rattrapage des badges hérités (`lib/glRewardsBackfill.js`,
 * `scripts/gl-rewards-backfill.js`) : dry-run sans écriture, puis conversion de
 * `gl_player_badges` en paliers équivalents de `gl_player_rewards`, idempotente ; la table
 * héritée n'est ni vidée ni modifiée. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database');
const { initSchema, execute, queryAll, queryOne } = db;
const { createTenirGame, readPlayerBourses } = require('./helpers/glTenirFixtures');
const {
  LEGACY_MAP,
  LEGACY_NOTE,
  keysForLegacy,
  runGlRewardsBackfill,
} = require('../lib/glRewardsBackfill');
const { glRewards } = require('../lib/glRewards');

let ctx;

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), playerCount: 4 });
  const [a, b] = ctx.players;
  await execute(
    `INSERT INTO gl_tenir_badges (code, nom, critere, regle_type, seuil, source, icone, actif) VALUES
      ('premiere_page', 'Première page', 'Une page', 'compteur', 1, 'carnet_personnel_pages', 'page', 1),
      ('lecteur', 'Lecteur', '10 pages lues', 'compteur', 10, 'feuillets_lus', 'livre', 1),
      ('passeur_de_seuil', 'Passeur de seuil', '4 chapitres', 'compteur', 4, 'chapitres_clos', 'porte', 1),
      ('chuchoteur', 'Chuchoteur', 'mission réussie', 'saisie_prof', 1, 'missions_reussies', 'bouche', 1),
      ('tisserand', 'Tisserand', 'réservé', 'reserve', NULL, 'defis_trame', 'fil', 1)
     ON DUPLICATE KEY UPDATE actif = 1`,
  );
  await execute(
    `INSERT IGNORE INTO gl_player_badges (player_id, badge_code, game_id, source, valeur, awarded_by, awarded_at) VALUES
      (?, 'premiere_page', ?, 'carnet_personnel_pages', 1, 'app', '2026-10-02 10:00:00'),
      (?, 'lecteur', ?, 'feuillets_lus', 10, 'app', '2026-10-09 10:00:00'),
      (?, 'passeur_de_seuil', ?, 'chapitres_clos', 4, 'app', '2026-10-16 10:00:00'),
      (?, 'chuchoteur', ?, 'missions_reussies', 1, ?, '2026-10-23 10:00:00'),
      (?, 'inconnu_depuis', ?, 'x', 1, 'app', '2026-10-30 10:00:00')`,
    [
      a.id,
      ctx.game.id,
      a.id,
      ctx.game.id,
      a.id,
      ctx.game.id,
      b.id,
      ctx.game.id,
      String(ctx.admin.id),
      b.id,
      ctx.game.id,
    ],
  );
});

test('table de correspondance : chaque badge hérité convertible vise une entrée du catalogue', () => {
  for (const [code, [base]] of Object.entries(LEGACY_MAP)) {
    assert.ok(glRewards.CATALOGUE_BY_KEY.has(base), `${code} → ${base}`);
  }
  assert.deepEqual(keysForLegacy('lecteur'), { keys: ['lecture.pages.1', 'lecture.pages.2'] });
  assert.deepEqual(keysForLegacy('passeur_de_seuil'), {
    keys: ['voyage.chapitres.1', 'voyage.chapitres.2', 'voyage.chapitres.3'],
  });
  assert.deepEqual(keysForLegacy('chuchoteur'), { manual: 'manuel.chuchoteur' });
  assert.equal(keysForLegacy('tisserand'), null, 'réservé : jamais converti');
  assert.equal(keysForLegacy('trouveur'), null, 'Trouveur (Opérateur) disparaît');
});

test('dry-run : rien n’est écrit ; apply : paliers équivalents datés, note héritée, idempotent, table héritée intacte', async () => {
  const [a, b] = ctx.players;
  const ids = ctx.players.map((p) => String(p.id));
  const boursesAvant = await Promise.all(ctx.players.map((p) => readPlayerBourses(p.id)));
  const legacyBefore = await queryAll(
    'SELECT player_id, badge_code, awarded_at FROM gl_player_badges WHERE player_id IN (?, ?) ORDER BY badge_code',
    [a.id, b.id],
  );

  const dry = await runGlRewardsBackfill({ dryRun: true, db, playerIds: ids });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.legacyRows, 5);
  assert.equal(dry.converted, 1 + 2 + 3 + 1, 'Première page 1, Lecteur 2, Passeur 3, Chuchoteur 1');
  assert.equal(dry.skipped, 1, 'badge inconnu écarté');
  const none = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_player_rewards WHERE player_id IN (?, ?)',
    [a.id, b.id],
  );
  assert.equal(Number(none.c), 0, 'dry-run : aucune écriture');

  const applied = await runGlRewardsBackfill({ dryRun: false, db, playerIds: ids });
  assert.equal(applied.converted, 7);
  const rowsA = await queryAll(
    'SELECT reward_key, source_type, source_ref, awarded_at FROM gl_player_rewards WHERE player_id = ? ORDER BY reward_key',
    [a.id],
  );
  assert.deepEqual(
    rowsA.map((r) => r.reward_key),
    [
      'chasse.pages.1',
      'lecture.pages.1',
      'lecture.pages.2',
      'voyage.chapitres.1',
      'voyage.chapitres.2',
      'voyage.chapitres.3',
    ],
  );
  assert.ok(rowsA.every((r) => r.source_type === 'legacy'));
  assert.equal(rowsA.find((r) => r.reward_key === 'chasse.pages.1').source_ref, 'premiere_page');
  assert.equal(
    new Date(rowsA.find((r) => r.reward_key === 'chasse.pages.1').awarded_at).getUTCDate(),
    new Date('2026-10-02 10:00:00').getUTCDate(),
    'date héritée conservée',
  );
  const rowB = await queryOne(
    'SELECT reward_key, note, awarded_by_user_id FROM gl_player_rewards WHERE player_id = ?',
    [b.id],
  );
  assert.equal(rowB.reward_key, 'manuel.chuchoteur.1');
  assert.equal(rowB.note, LEGACY_NOTE);
  assert.equal(rowB.awarded_by_user_id, String(ctx.admin.id));

  // Idempotence : un second passage ne convertit rien et n'ajoute rien.
  const again = await runGlRewardsBackfill({ dryRun: false, db, playerIds: ids });
  assert.equal(again.converted, 0);
  assert.equal(again.skipped, 8, '7 déjà présents + 1 inconnu');
  const total = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_player_rewards WHERE player_id IN (?, ?)',
    [a.id, b.id],
  );
  assert.equal(Number(total.c), 7);

  // Table héritée intacte, bourses inchangées.
  const legacyAfter = await queryAll(
    'SELECT player_id, badge_code, awarded_at FROM gl_player_badges WHERE player_id IN (?, ?) ORDER BY badge_code',
    [a.id, b.id],
  );
  assert.deepEqual(legacyAfter, legacyBefore);
  const boursesApres = await Promise.all(ctx.players.map((p) => readPlayerBourses(p.id)));
  assert.deepEqual(boursesApres, boursesAvant);
  const reserved = await queryOne(
    "SELECT COUNT(*) AS c FROM gl_player_rewards WHERE reward_key LIKE 'reserve.%'",
  );
  assert.equal(Number(reserved.c), 0);
});

test('le script CLI s’exécute en dry-run sur la base de test et résume sans nommer un élève', async () => {
  const { main, formatDistribution } = require('../scripts/gl-rewards-backfill');
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const summary = await main([]);
    assert.equal(summary.dryRun, true);
  } finally {
    console.log = original;
  }
  assert.ok(logs[0].startsWith('Dry-run :'), logs[0]);
  for (const p of ctx.players) assert.ok(!logs.join('\n').includes(p.pseudo));
  assert.deepEqual(formatDistribution({ 'lecture.pages.2': 3 }), [
    `${'lecture.pages.2'.padEnd(28)} 📖 Lecteur palier 2 : 3 joueurs`,
  ]);
});
