'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.9 — écran d'équipe : sorts rangés par moment du tour (un sort
 * hors fenêtre reste servi, fermé, avec son message), six cases à venir avant le jet, pastilles
 * du carnet (« attend un lecteur », « protégée »). Tout est calculé par le serveur.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  setPlayerBourses,
  ouvrirTourEnJeu,
  importExempleChasse,
} = require('./helpers/glTenirFixtures');
const { issueTeamSession } = require('../lib/glGuestToken');
const {
  SORT_MOMENTS,
  momentDeFenetre,
  rangerSortsParMoment,
  ROLES_EN_CONSEIL,
} = require('../lib/shared/glSortMomentsCore');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const sortsDe = async (token, query = '') =>
  (
    await request(app)
      .get(api(`/tenir/sorts${query}`))
      .set(auth(token))
  ).body;
const trouver = (data, code) =>
  data.moments
    .flatMap((m) => m.sorts.map((s) => ({ ...s, moment: m.key })))
    .find((s) => s.code === code);

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 2 });
  await importExempleChasse(db, { game: ctx.game });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
});

test('noyau partagé (M6) : cinq moments, chaque fenêtre a le sien, dans l’ordre de l’écran ; rôles sans mot interdit', () => {
  assert.deepEqual(
    SORT_MOMENTS.map((m) => m.label),
    [
      'Avant de lancer',
      'Après le jet',
      'Pendant le tour',
      'Pendant l’activité',
      'En fin de chapitre ou en veillée',
    ],
  );
  assert.equal(momentDeFenetre('avant_jet'), 'avant');
  assert.equal(momentDeFenetre('apres_jet'), 'apres');
  assert.equal(momentDeFenetre('jeu_avant_fouille'), 'pendant');
  for (const f of ['activite', 'fin_seance']) assert.equal(momentDeFenetre(f), 'activite', f);
  for (const f of ['seuil', 'seuil_veillee', 'trimestre_3', '', null, 'avant_jets_pacte']) {
    assert.equal(momentDeFenetre(f), 'fin_chapitre', String(f));
  }
  const ranges = rangerSortsParMoment([
    { code: 'b', fenetre: 'jeu' },
    { code: 'a', fenetre: 'avant_jet' },
  ]);
  assert.deepEqual(
    ranges.map((m) => [m.key, m.sorts.map((s) => s.code)]),
    [
      ['avant', ['a']],
      ['pendant', ['b']],
    ],
  );
  for (const ligne of Object.values(ROLES_EN_CONSEIL)) {
    assert.equal(findForbiddenString(ligne), null);
    assert.match(ligne, /^C’est le moment d/);
  }
});

test('sorts par moment (M6) : ceux du peuple de l’équipe, seulement lançables et payables', async () => {
  await ouvrirTourEnJeu(request, app, ctx);
  const gnome = membres(0)[0];
  const data = await sortsDe(gnome.token);
  assert.equal(data.teamId, Number(team(0).id));
  assert.deepEqual(
    data.moments.map((m) => m.key),
    ['avant', 'pendant', 'activite'],
    'avant le jet : rien « après le jet », rien de fin de chapitre pendant le tour',
  );
  assert.ok(
    data.moments.every((m) => m.sorts.every((x) => x.ouvert && x.payable)),
    'aucun sort grisé',
  );
  // Sorts de Licornes absents ; sorts de Gnomes et communs présents.
  assert.equal(trouver(data, 'SL039'), undefined, 'Bourrasque est un sort de Licornes');
  assert.equal(trouver(data, 'SL042').moment, 'avant');
  assert.equal(trouver(data, 'SL043').moment, 'pendant');
  // Avant le jet : Progression (après le jet) n'est pas montrée.
  assert.equal(trouver(data, 'SL002'), undefined);
  assert.equal(trouver(data, 'SL046').moment, 'activite');

  // Après le jet de l'équipe : Sentier (avant le jet) disparaît, Progression paraît.
  await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'physique', teamId: team(0).id, faces: [1, 2] })
    .expect(201);
  const apres = await sortsDe(gnome.token);
  assert.equal(trouver(apres, 'SL042'), undefined);
  assert.equal(trouver(apres, 'SL002').moment, 'apres');

  // Bourses vides : plus rien de payable, la liste se vide.
  for (const m of membres(0)) await setPlayerBourses(m.id, 0, 0);
  const vide = await sortsDe(gnome.token);
  assert.deepEqual(vide.moments, []);
  for (const m of membres(0)) await setPlayerBourses(m.id, 5, 5);

  // Tablette de l'équipe : la même liste ; le prof la lit avec `teamId`.
  const s = await issueTeamSession(db, { gameId: ctx.game.id, teamId: team(2).id });
  const licornes = await sortsDe(s.token);
  assert.equal(licornes.teamId, Number(team(2).id));
  assert.ok(trouver(licornes, 'SL039'), 'Bourrasque pour les Licornes');
  assert.equal(trouver(licornes, 'SL043'), undefined);
  const prof = await sortsDe(ctx.adminToken, `?teamId=${team(2).id}`);
  assert.deepEqual(
    prof.moments.map((m) => m.sorts.map((x) => x.code)),
    licornes.moments.map((m) => m.sorts.map((x) => x.code)),
  );
  const sansEquipe = await request(app).get(api('/tenir/sorts')).set(auth(ctx.adminToken));
  assert.equal(sansEquipe.status, 400);
});

test('les six cases à venir sont servies avant le jet, pour chaque équipe', async () => {
  const vue = await request(app)
    .get(api('/tenir/tour'))
    .set(auth(membres(1)[0].token))
    .expect(200);
  const b = vue.body.teams.find((t) => Number(t.id) === Number(team(1).id));
  assert.equal(b.hasRolledDiceThisRound, false);
  assert.equal(b.casesAVenir.length, 6);
  assert.deepEqual(
    b.casesAVenir.map((c) => c.index),
    [
      b.pathIndex + 1,
      b.pathIndex + 2,
      b.pathIndex + 3,
      b.pathIndex + 4,
      b.pathIndex + 5,
      b.pathIndex + 6,
    ],
  );
  assert.deepEqual(Object.keys(b.casesAVenir[0]).sort(), [
    'eventType',
    'index',
    'label',
    'tonalite',
  ]);
  // Près du camp, la liste s'arrête au camp.
  await db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[ctx.markers.length - 3].id,
    team(3).id,
  ]);
  const fin = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken)).expect(200);
  const d = fin.body.teams.find((t) => Number(t.id) === Number(team(3).id));
  assert.equal(d.casesAVenir.length, 2);
  assert.equal(d.casesAVenir[1].index, ctx.markers.length - 1);
});

test('carnet : « attend un lecteur » pour une page trouvée non tenue ; « protégée » pour une page trouvée et lue par l’équipe', async () => {
  const zone = await db.queryOne(
    `SELECT z.id, z.zone_key, z.feuillet_code FROM gl_chasse_zones z
       INNER JOIN gl_game_chasse_pages p ON p.zone_id = z.id AND p.game_id = ? ORDER BY z.id ASC LIMIT 1`,
    [ctx.game.id],
  );
  assert.ok(zone);
  await db.execute(
    "UPDATE gl_game_chasse_pages SET etat = 'trouvee', trouvee_par_team_id = ?, trouvee_at = NOW() WHERE game_id = ? AND zone_id = ?",
    [team(0).id, ctx.game.id, zone.id],
  );
  const page = async (token) =>
    (await request(app).get(api('/chasse')).set(auth(token)).expect(200)).body.pages.find(
      (p) => p.zoneKey === zone.zone_key,
    );
  let vueTrouveuse = await page(membres(0)[0].token);
  assert.equal(vueTrouveuse.attendUnLecteur, true);
  assert.equal(vueTrouveuse.protegee, false, 'trouvée mais pas encore lue');
  assert.equal((await page(membres(2)[0].token)).attendUnLecteur, true, 'visible des deux peuples');

  // L'équipe qui l'a trouvée la lit : elle ne pâlira pas sous le voile (`lib/glVoile.js`).
  await db.execute(
    `INSERT INTO gl_game_feuillet_states (game_id, team_id, feuillet_code, status, read_at, updated_at)
     VALUES (?, ?, ?, 'read', NOW(), NOW())
     ON DUPLICATE KEY UPDATE read_at = NOW(), updated_at = NOW()`,
    [ctx.game.id, team(0).id, zone.feuillet_code],
  );
  vueTrouveuse = await page(membres(0)[0].token);
  assert.equal(vueTrouveuse.protegee, true);
  assert.equal((await page(membres(2)[0].token)).protegee, false, 'protégée pour sa seule équipe');
  assert.equal((await page(ctx.adminToken)).protegee, false);

  // Tenue : plus personne ne l'attend.
  await db.execute(
    "UPDATE gl_game_chasse_pages SET etat = 'tenue', tenue_par_team_id = ? WHERE game_id = ? AND zone_id = ?",
    [team(2).id, ctx.game.id, zone.id],
  );
  const tenue = await page(membres(0)[0].token);
  assert.deepEqual([tenue.attendUnLecteur, tenue.protegee], [false, false]);
});
