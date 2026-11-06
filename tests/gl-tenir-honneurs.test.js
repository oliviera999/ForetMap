'use strict';

/**
 * « Tenir à deux » v2 — honneurs, sceaux, titres, missions (spec § 12) sur un jeu de données
 * construit : Éclaireurs (première au camp), Gardiens (pages tenues), Passeurs (aides), Esprit
 * d'équipe (cartes) ; un honneur par équipe au plus ; sceaux par peuple ; titres propagés aux
 * membres ; mission saisie par le prof. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll, withTransaction } = db;
const { createTenirGame, importExempleChasse } = require('./helpers/glTenirFixtures');
const { computeHonneurs, attribuerHonneursTx, titreMajoritaire } = require('../lib/glHonneurs');
const { cloreTenirPartieTx } = require('../lib/glSeuil');
const { getGameplaySettings } = require('../lib/glSettings');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

async function zoneId(zoneKey) {
  return Number(
    (await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', [zoneKey])).id,
  );
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await execute(
    `INSERT INTO gl_tenir_titres (code, famille, honneur, peuple, biome, plateau, libelle, actif) VALUES
      ('honneurs.eclaireurs.tropiques', 'honneur', 'eclaireurs', NULL, 'tropiques', 1, 'Compagnie du Calao Pressé', 1),
      ('honneurs.gardiens.tropiques', 'honneur', 'gardiens', NULL, 'tropiques', 1, 'Gardiens de la Canopée', 1),
      ('honneurs.passeurs.tropiques', 'honneur', 'passeurs', NULL, 'tropiques', 1, 'Passeurs de Lianes', 1),
      ('honneurs.esprit.tropiques', 'honneur', 'esprit', NULL, 'tropiques', 1, 'Esprit de la Clairière', 1),
      ('sceaux_peuple.eclaireuses.tropiques', 'sceau_peuple', 'eclaireuses', 'unicorn', 'tropiques', 1, 'Éclaireuses du Matin', 1),
      ('sceaux_peuple.mains.tropiques', 'sceau_peuple', 'mains', 'gnome', 'tropiques', 1, 'Mains de Terre', 1)
     ON DUPLICATE KEY UPDATE libelle = VALUES(libelle), actif = 1`,
  );
  await execute(
    `INSERT INTO gl_tenir_missions (id, texte, type, titre_sceau, actif) VALUES ('mis-test', 'Offrir une page', 'cooperative', 'Ambassadeurs de l’Autre Peuple', 1)
     ON DUPLICATE KEY UPDATE actif = 1`,
  );
  const [gA, gB, lA, lB] = ctx.teams.map((t) => Number(t.id));
  // Pages : cz-p1-01 trouvée par Licornes A, tenue par Gnomes A ; cz-p1-02 réparée par Gnomes B, tenue par Licornes B.
  await execute(
    `UPDATE gl_game_chasse_pages SET etat = 'tenue', trouvee_par_team_id = ?, tenue_par_team_id = ?, trouvee_at = NOW(), tenue_at = NOW() WHERE game_id = ? AND zone_id = ?`,
    [lA, gA, ctx.game.id, await zoneId('cz-p1-01')],
  );
  await execute(
    `UPDATE gl_game_chasse_pages SET etat = 'tenue', trouvee_par_team_id = ?, tenue_par_team_id = ?, trouvee_at = NOW(), tenue_at = NOW(), reparee_at = NOW() WHERE game_id = ? AND zone_id = ?`,
    [gB, lB, ctx.game.id, await zoneId('cz-p1-02')],
  );
  // Cartes Team Spirit : Licornes A 6, Gnomes A 4.
  await execute(
    `INSERT INTO gl_game_team_spirit (game_id, round_number, team_id, cartes_gardees) VALUES (?, 1, ?, 6), (?, 1, ?, 4)
     ON DUPLICATE KEY UPDATE cartes_gardees = VALUES(cartes_gardees)`,
    [ctx.game.id, lA, ctx.game.id, gA],
  );
  // Première au camp : Gnomes A.
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await execute('UPDATE gl_game_tenir_state SET premiere_arrivee_team_id = ? WHERE game_id = ?', [
    gA,
    ctx.game.id,
  ]);
});

test('computeHonneurs : un honneur par équipe au plus, le second va à la suivante ; sceaux par peuple', async () => {
  const [gA, gB, lA, lB] = ctx.teams.map((t) => Number(t.id));
  const state = await queryOne(
    'SELECT premiere_arrivee_team_id FROM gl_game_tenir_state WHERE game_id = ?',
    [ctx.game.id],
  );
  const out = await computeHonneurs(db, ctx.game.id, {
    premiereArriveeTeamId: Number(state.premiere_arrivee_team_id),
  });
  const by = Object.fromEntries(out.honneurs.map((h) => [h.honneur, h.teamId]));
  assert.equal(by.eclaireurs, gA, 'première au camp');
  // Gardiens : toutes à 1 page tenue (gA tenue, lA découverte, gB découverte, lB tenue) → égalité → plus petit id
  // hors gA (déjà honorée) → gB.
  assert.equal(by.gardiens, gB);
  // Passeurs : aides = pages tenues pour l'autre peuple : gA 1, lB 1 → gA prise → lB.
  assert.equal(by.passeurs, lB);
  // Esprit : lA 6 cartes.
  assert.equal(by.esprit, lA);
  const teams = out.honneurs.map((h) => h.teamId);
  assert.equal(new Set(teams).size, teams.length, 'jamais deux honneurs à la même équipe');
  const sceaux = Object.fromEntries(out.sceaux.map((s) => [s.honneur, s.teamId]));
  assert.equal(sceaux.eclaireuses, lA, 'licornes : le plus de pages trouvées (égalité → id)');
  assert.equal(sceaux.mains, gB, 'gnomes : le plus de pages réparées');
});

test('attribuerHonneursTx : titres par biome, propagés aux membres, idempotent ; clôture de partie', async () => {
  const settings = await getGameplaySettings();
  const result = await withTransaction((tx) =>
    cloreTenirPartieTx(tx, { gameId: ctx.game.id, actorId: ctx.admin.id, settings }),
  );
  assert.equal(result.closed, true);
  assert.ok(result.honneurs?.honneurs?.length >= 4, JSON.stringify(result.honneurs));
  const rows = await queryAll(
    'SELECT team_id, honneur, libelle, double_honneur FROM gl_game_honneurs WHERE game_id = ? ORDER BY id',
    [ctx.game.id],
  );
  const gA = Number(ctx.teams[0].id);
  const eclaireurs = rows.find((r) => r.honneur === 'eclaireurs');
  assert.equal(Number(eclaireurs.team_id), gA);
  assert.equal(eclaireurs.libelle, 'Compagnie du Calao Pressé');
  assert.equal(Number(eclaireurs.double_honneur), 0);
  const titres = await queryAll(
    'SELECT pt.player_id, pt.libelle, pt.famille FROM gl_player_titres pt INNER JOIN gl_team_members tm ON tm.player_id = pt.player_id AND tm.game_id = ? AND tm.team_id = ? WHERE pt.game_id = ?',
    [ctx.game.id, gA, ctx.game.id],
  );
  assert.ok(titres.length >= 2, 'chaque membre de Gnomes A porte le titre');
  assert.ok(
    titres.every((t) => t.libelle === 'Compagnie du Calao Pressé' && t.famille === 'honneur'),
  );

  // Rejouer n'ajoute rien.
  const again = await withTransaction((tx) =>
    attribuerHonneursTx(tx, {
      gameId: ctx.game.id,
      actorId: ctx.admin.id,
      premiereArriveeTeamId: gA,
    }),
  );
  assert.deepEqual(again.honneurs, []);
  const count = await queryOne('SELECT COUNT(*) AS c FROM gl_game_honneurs WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.equal(Number(count.c), rows.length);

  // Le titre majoritaire suit les élèves dans une autre partie.
  const next = await createTenirGame({ stamp: Date.now() + 7 });
  const mates = (
    await queryAll('SELECT player_id FROM gl_team_members WHERE game_id = ? AND team_id = ?', [
      ctx.game.id,
      gA,
    ])
  ).map((r) => Number(r.player_id));
  for (const pid of mates) {
    await execute(
      'INSERT IGNORE INTO gl_team_members (game_id, team_id, player_id, joined_at) VALUES (?, ?, ?, NOW())',
      [next.game.id, next.teams[2].id, pid],
    ).catch(async () => {
      await execute(
        'INSERT IGNORE INTO gl_team_members (game_id, team_id, player_id) VALUES (?, ?, ?)',
        [next.game.id, next.teams[2].id, pid],
      );
    });
  }
  const titre = await titreMajoritaire(db, next.game.id, next.teams[2].id);
  assert.equal(titre, 'Compagnie du Calao Pressé');
  assert.equal(await titreMajoritaire(db, next.game.id, next.teams[0].id), null);
});

test('honneur gagné deux fois dans la classe → préfixe « Très Grands »', async () => {
  const again = await createTenirGame({ stamp: Date.now() + 11 });
  // Même classe que la partie précédente, même nom d'équipe (Gnomes A).
  await execute('UPDATE gl_games SET class_id = ? WHERE id = ?', [ctx.cls.id, again.game.id]);
  const result = await withTransaction((tx) =>
    attribuerHonneursTx(tx, {
      gameId: again.game.id,
      actorId: again.admin.id,
      premiereArriveeTeamId: Number(again.teams[0].id),
    }),
  );
  const ecl = result.honneurs.find((h) => h.honneur === 'eclaireurs');
  assert.equal(ecl.titre, 'Très Grands Compagnie du Calao Pressé');
});
