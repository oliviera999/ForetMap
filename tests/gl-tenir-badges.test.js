'use strict';

/**
 * « Tenir à deux » v2 — badges individuels (spec § 12) : chaque règle sur des compteurs
 * construits, idempotence, badges réservés jamais attribués, badge à la main du prof. Aucune
 * ressource touchée. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll, withTransaction } = db;
const {
  createTenirGame,
  importExempleChasse,
  readPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { evaluateBadges, awardBadgeProfTx, listPlayerBadges } = require('../lib/glTenirBadges');

let ctx;

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await execute(
    `INSERT INTO gl_tenir_badges (code, nom, critere, regle_type, seuil, source, icone, actif) VALUES
      ('premiere_page', 'Première page', 'Une page au carnet personnel', 'compteur', 1, 'carnet_personnel_pages', 'page', 1),
      ('fouilleur', 'Fouilleur', '5 fouilles chaudes', 'compteur', 5, 'fouilles_chaudes', 'loupe', 1),
      ('mains_tendues', 'Mains tendues', '3 dons', 'compteur', 3, 'dons', 'main', 1),
      ('veilleur', 'Veilleur', '4 semaines de veillée de suite', 'serie_hebdo', 4, 'veillee_semaines', 'lune', 1),
      ('tisserand', 'Tisserand', 'réservé', 'reserve', NULL, 'defis_trame', 'fil', 1),
      ('chuchoteur', 'Chuchoteur', 'mission réussie', 'saisie_prof', 1, 'missions_reussies', 'bouche', 1)
     ON DUPLICATE KEY UPDATE regle_type = VALUES(regle_type), seuil = VALUES(seuil), source = VALUES(source), actif = 1`,
  );
});

test('compteurs : première page, fouilleur (5 chaudes), mains tendues (3 dons) ; aucun badge avant le seuil', async () => {
  const p = ctx.players[0];
  const before = await readPlayerBourses(p.id);
  let out = await evaluateBadges(db, p.id, { gameId: ctx.game.id });
  assert.ok(
    out.every((b) => !b.awarded),
    'rien au départ',
  );
  await execute(
    `INSERT IGNORE INTO gl_player_feuillet_states (player_id, feuillet_code, status, effacement_pct, acquired_via, acquired_at, updated_at) VALUES (?, 'tenir-ex-p1-1', 'discovered', 0, 'decouverte', NOW(), NOW())`,
    [p.id],
  );
  for (let i = 0; i < 5; i += 1) {
    await execute(
      `INSERT INTO gl_game_chasse_empreintes (game_id, team_id, player_id, round_number, x, y, verdict, created_at) VALUES (?, ?, ?, 1, 0.1, 0.1, ?, NOW())`,
      [ctx.game.id, p.teamId, p.id, i < 4 ? 'chaud' : 'froid'],
    );
  }
  for (let i = 0; i < 3; i += 1) {
    await execute(
      `INSERT INTO gl_market_dons (class_id, game_id, donneur_id, receveur_id, gemmes, coeurs, created_at) VALUES (?, ?, ?, ?, 1, 0, NOW())`,
      [ctx.cls.id, ctx.game.id, p.id, ctx.players[1].id],
    );
  }
  out = await evaluateBadges(db, p.id, { gameId: ctx.game.id });
  const by = Object.fromEntries(out.map((b) => [b.code, b]));
  assert.equal(by.premiere_page.awarded, true);
  assert.equal(by.fouilleur.awarded, false, '4 chaudes sur 5 fouilles : pas encore');
  assert.equal(by.mains_tendues.awarded, true);
  await execute(
    `INSERT INTO gl_game_chasse_empreintes (game_id, team_id, player_id, round_number, x, y, verdict, created_at) VALUES (?, ?, ?, 1, 0.2, 0.2, 'chaud', NOW())`,
    [ctx.game.id, p.teamId, p.id],
  );
  out = await evaluateBadges(db, p.id, { gameId: ctx.game.id });
  assert.equal(out.find((b) => b.code === 'fouilleur').awarded, true);
  // Idempotence : une seconde évaluation n'attribue rien de nouveau, la ligne reste unique.
  out = await evaluateBadges(db, p.id, { gameId: ctx.game.id });
  assert.ok(out.every((b) => !b.awarded));
  const rows = await listPlayerBadges(db, p.id);
  assert.deepEqual(rows.map((r) => r.code).sort(), ['fouilleur', 'mains_tendues', 'premiere_page']);
  assert.deepEqual(await readPlayerBourses(p.id), before, 'un badge ne donne aucune ressource');
});

test('série hebdomadaire : 4 semaines de veillée de suite', async () => {
  const p = ctx.players[2];
  const zone = await queryOne("SELECT id FROM gl_chasse_zones WHERE zone_key = 'cz-p1-01'");
  for (const semaine of ['2026-W40', '2026-W41', '2026-W43', '2026-W44']) {
    await execute(
      `INSERT INTO gl_game_chasse_ouvertures (game_id, zone_id, team_id, player_id, via, gain, semaine_iso, created_at) VALUES (?, ?, ?, ?, 'veillee', 0, ?, NOW())`,
      [ctx.game.id, zone.id, p.teamId, p.id, semaine],
    );
  }
  let out = await evaluateBadges(db, p.id);
  assert.equal(out.find((b) => b.code === 'veilleur').awarded, false, 'série rompue : 2 + 2');
  await execute(
    `INSERT INTO gl_game_chasse_ouvertures (game_id, zone_id, team_id, player_id, via, gain, semaine_iso, created_at) VALUES (?, ?, ?, ?, 'veillee', 0, '2026-W42', NOW())`,
    [ctx.game.id, zone.id, p.teamId, p.id],
  );
  out = await evaluateBadges(db, p.id);
  assert.equal(out.find((b) => b.code === 'veilleur').awarded, true);
});

test('badge prof : attribué une fois ; badge réservé refusé ; badge inconnu 404', async () => {
  const p = ctx.players[3];
  const first = await withTransaction((tx) =>
    awardBadgeProfTx(tx, {
      playerId: p.id,
      badgeCode: 'chuchoteur',
      gameId: ctx.game.id,
      actorId: ctx.admin.id,
    }),
  );
  assert.equal(first.awarded, true);
  const second = await withTransaction((tx) =>
    awardBadgeProfTx(tx, {
      playerId: p.id,
      badgeCode: 'chuchoteur',
      gameId: ctx.game.id,
      actorId: ctx.admin.id,
    }),
  );
  assert.equal(second.awarded, false);
  await assert.rejects(
    withTransaction((tx) =>
      awardBadgeProfTx(tx, { playerId: p.id, badgeCode: 'tisserand', actorId: ctx.admin.id }),
    ),
    (err) => err.code === 'BADGE_RESERVE' || err.message === 'BADGE_RESERVE',
  );
  await assert.rejects(
    withTransaction((tx) =>
      awardBadgeProfTx(tx, { playerId: p.id, badgeCode: 'inconnu', actorId: ctx.admin.id }),
    ),
    (err) => err.status === 404,
  );
  const reserved = await queryAll(
    "SELECT badge_code FROM gl_player_badges WHERE badge_code IN ('tisserand', 'revelateur')",
  );
  assert.equal(reserved.length, 0, 'jamais attribués');
});
