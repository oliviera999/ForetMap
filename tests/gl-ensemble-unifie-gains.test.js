'use strict';

/**
 * Ensemble unifié, PR 1a, étape 1.6 — gain de la page tenue (M19, 17 novembre 2026) :
 * - +1 gemme à chaque membre présent de l'équipe qui fait tenir (les lecteurs), pour les deux
 *   peuples ; rien à l'équipe qui a trouvé ; un lecteur absent du tour ne reçoit rien ;
 * - en veillée (tour clos), le gain va aux membres de l'équipe du lecteur ;
 * - carnet complet : +1 gemme à tous ;
 * - lignes d'Olu révisées ; une ligne `actif: false` (Nommer) ne se dit plus.
 * Fixtures anonymes.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  setPlayerBourses,
  readPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { importOluLignes } = require('../lib/glTenirImport');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (ctx, p) => `/api/gl/games/${ctx.game.id}${p}`;
const stamp = Date.now();

async function trouverPour(ctx, teamIndex, zoneKey) {
  const zone = await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', [zoneKey]);
  await execute(
    `INSERT INTO gl_game_chasse_pages (game_id, zone_id, etat, trouvee_par_team_id, trouvee_at, updated_at)
     VALUES (?, ?, 'trouvee', ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE etat = 'trouvee', trouvee_par_team_id = VALUES(trouvee_par_team_id)`,
    [ctx.game.id, zone.id, ctx.teams[teamIndex].id],
  );
}

async function tenir(ctx, joueur, zoneKey) {
  const ouvert = await request(app)
    .post(api(ctx, `/chasse/pages/${zoneKey}/ouvrir`))
    .set(auth(joueur.token));
  assert.equal(ouvert.status, 200, JSON.stringify(ouvert.body));
  assert.equal(ouvert.body.peutTenir, true);
  const bonne = ouvert.body.question.choices.find((c) => c.text === 'Que la forêt respire');
  const res = await request(app)
    .post(api(ctx, `/chasse/pages/${zoneKey}/tenir`))
    .set(auth(joueur.token))
    .send({
      presentationToken: ouvert.body.question.presentationToken,
      questionCode: ouvert.body.question.questionCode,
      choiceId: bonne.id,
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

const membres = (ctx, i) => ctx.players.filter((p) => Number(p.teamId) === Number(ctx.teams[i].id));

before(async () => {
  await initSchema();
});

test('page tenue au tour : +1 gemme aux lecteurs présents (gnomes compris), rien aux absents ni à l’équipe qui a trouvé', async () => {
  const ctx = await createTenirGame({ stamp: `${stamp}-tour`, plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  for (const p of ctx.players) await setPlayerBourses(p.id, 3, 3);
  await ouvrirTourEnJeu(request, app, ctx);
  const round = Number(
    (await queryOne('SELECT current_round_number AS r FROM gl_games WHERE id = ?', [ctx.game.id]))
      .r,
  );
  // Page trouvée par les Licornes A, tenue par les Gnomes A (dont un absent).
  await trouverPour(ctx, 2, 'cz-p1-01');
  const [lecteur, absent, ...autres] = membres(ctx, 0);
  await execute(
    'INSERT INTO gl_game_round_absences (game_id, round_number, player_id) VALUES (?, ?, ?)',
    [ctx.game.id, round, absent.id],
  );
  const res = await tenir(ctx, lecteur, 'cz-p1-01');
  assert.equal(res.etat, 'tenue');
  for (const p of [lecteur, ...autres]) {
    assert.deepEqual(await readPlayerBourses(p.id), { health: 3, power: 4 }, 'lecteur : +1 gemme');
  }
  assert.deepEqual(await readPlayerBourses(absent.id), { health: 3, power: 3 }, 'absent : rien');
  for (const p of membres(ctx, 2)) {
    assert.deepEqual(await readPlayerBourses(p.id), { health: 3, power: 3 }, 'découvreuse : rien');
  }
});

test('veillée : le gain va aux membres de l’équipe du lecteur', async () => {
  const ctx = await createTenirGame({ stamp: `${stamp}-veillee`, plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  for (const p of ctx.players) await setPlayerBourses(p.id, 3, 3);
  await trouverPour(ctx, 0, 'cz-p1-02');
  const lecteurs = membres(ctx, 3);
  const res = await tenir(ctx, lecteurs[0], 'cz-p1-02');
  assert.equal(res.etat, 'tenue');
  for (const p of lecteurs) assert.equal((await readPlayerBourses(p.id)).power, 4);
  for (const p of membres(ctx, 0)) assert.equal((await readPlayerBourses(p.id)).power, 3);
});

test('lignes d’Olu : révisions de l’ensemble unifié ; une ligne `actif: false` ne se dit plus', async () => {
  const json = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'gl', 'tenir', 'olu-lignes.json'), 'utf8'),
  );
  const ligne = (id) => json.lignes.find((l) => l.id === id);
  assert.match(ligne('olu-29').texte, /Une gemme pour chaque lecteur/);
  assert.match(ligne('olu-34').texte, /Il lui reste une fouille/);
  assert.equal(ligne('olu-44').actif, false, 'Nommer sort du grimoire');
  const rep = await importOluLignes(db, json, {});
  assert.equal(rep.refuse, false, rep.errors.join(' ; '));
  const row = await queryOne("SELECT actif FROM gl_tenir_olu_lignes WHERE id = 'olu-44'");
  assert.equal(Number(row.actif), 0);
  const tenue = await queryOne("SELECT texte, actif FROM gl_tenir_olu_lignes WHERE id = 'olu-29'");
  assert.equal(Number(tenue.actif), 1);
  assert.match(tenue.texte, /lecteur/);
});

test('M20 : une réussite de défi ouvre une piste (page endormie révélée), une seule par semaine et par élève', async () => {
  const { pisteDefiTx } = require('../lib/glChasse');
  const { resolveTenirSettings } = require('../lib/glTenir');
  const { getGameplaySettings } = require('../lib/glSettings');
  const ctx = await createTenirGame({ stamp: `${stamp}-piste`, plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  const game = await queryOne('SELECT * FROM gl_games WHERE id = ?', [ctx.game.id]);
  const resolved = resolveTenirSettings(await getGameplaySettings(), game);
  const [a, b] = membres(ctx, 0);
  const premiere = await db.withTransaction((tx) =>
    pisteDefiTx(tx, { gameId: ctx.game.id, playerIds: [a.id], resolved, actorType: 'system' }),
  );
  assert.equal(premiere.limite, false);
  assert.equal(premiere.playerId, a.id);
  const zone = await queryOne(
    `SELECT p.etat FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id
      WHERE p.game_id = ? AND z.zone_key = ?`,
    [ctx.game.id, premiere.zoneKey],
  );
  assert.equal(zone.etat, 'revelee');
  assert.equal(
    JSON.parse(premiere.event.payload_json || '{}').via ?? premiere.event.payload?.via,
    'defi_trame',
  );
  // Même élève, même semaine : limite ; un camarade qui a encore sa piste la prend.
  const limite = await db.withTransaction((tx) =>
    pisteDefiTx(tx, { gameId: ctx.game.id, playerIds: [a.id], resolved, actorType: 'system' }),
  );
  assert.equal(limite.limite, true);
  const camarade = await db.withTransaction((tx) =>
    pisteDefiTx(tx, {
      gameId: ctx.game.id,
      playerIds: [a.id, b.id],
      resolved,
      actorType: 'system',
    }),
  );
  assert.equal(camarade.playerId, b.id);
  assert.notEqual(camarade.zoneKey, premiere.zoneKey, 'la page suivante se révèle');
});
