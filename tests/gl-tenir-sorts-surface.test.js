'use strict';

/**
 * « Tenir à deux » : permission de **surface** rejouée au lancement d'un sort (14 novembre
 * 2026). Au tableau, un élève ne crée ni ne lance un sort dont la fenêtre exige la phase
 * `jeu` (403 `TENIR_PERMISSION`) ; les sorts de seuil, de veillée, d'activité et de fin de
 * séance restent ouverts. En hybride et sur tablette, rien ne change. Le prof peut toujours.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame, setPlayerBourses, ouvrirTourEnJeu } = require('./helpers/glTenirFixtures');
const {
  FENETRES_SORT_PHASE_JEU,
  isSortPermisSurSurface,
} = require('../lib/shared/glTenirPermissionsCore');

const LANTERNE = 'SL037'; // Licornes, fenêtre `jeu_avant_fouille`
const LETTRE = 'SL048'; // fenêtre `seuil_veillee`, ouverte au chapitre 3

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const licornes = () => ctx.teams[2];
const licorne = () => ctx.players.find((p) => Number(p.teamId) === Number(licornes().id));

async function surface(value) {
  await db.execute('UPDATE gl_games SET tenir_surface = ?, tenir_overrides_json = ? WHERE id = ?', [
    value,
    JSON.stringify({ surface: value }),
    ctx.game.id,
  ]);
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 3 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 6, 6);
});

test('noyau pur : au tableau, seules les fenêtres de la phase « jeu » sont réservées au prof', () => {
  for (const fenetre of FENETRES_SORT_PHASE_JEU) {
    assert.equal(
      isSortPermisSurSurface({ surface: 'tableau', actorKind: 'player', fenetre }),
      false,
    );
    assert.equal(isSortPermisSurSurface({ surface: 'tableau', actorKind: 'mj', fenetre }), true);
    assert.equal(
      isSortPermisSurSurface({ surface: 'hybride', actorKind: 'player', fenetre }),
      true,
    );
    assert.equal(
      isSortPermisSurSurface({ surface: 'tablette', actorKind: 'player', fenetre }),
      true,
    );
    assert.equal(
      isSortPermisSurSurface({ surface: 'tablette', actorKind: 'projection', fenetre }),
      false,
    );
  }
  for (const fenetre of ['activite', 'seuil', 'seuil_veillee', 'fin_seance', 'trimestre_3']) {
    assert.equal(
      isSortPermisSurSurface({ surface: 'tableau', actorKind: 'player', fenetre }),
      true,
    );
  }
});

test('au tableau, pendant « jeu » : un élève ne crée pas Lanterne (403), le prof oui', async () => {
  await surface('tableau');
  await ouvrirTourEnJeu(request, app, ctx);
  const refus = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(licorne().token))
    .send({ spellCode: LANTERNE, teamId: licornes().id });
  assert.equal(refus.status, 403, JSON.stringify(refus.body));
  assert.equal(refus.body.code, 'TENIR_PERMISSION');
  assert.equal(refus.body.error, 'Au tableau, ce sort se lance avec le prof.');
  const aucun = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_spell_cast_drafts WHERE game_id = ? AND spell_code = ?',
    [ctx.game.id, LANTERNE],
  );
  assert.equal(Number(aucun.n), 0, 'aucun brouillon créé');

  const prof = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(ctx.adminToken))
    .send({ spellCode: LANTERNE, teamId: licornes().id });
  assert.equal(prof.status, 201, JSON.stringify(prof.body));
});

test('brouillon créé sur tablette, partie repassée au tableau : le lancement par un élève est refusé', async () => {
  // Le brouillon du prof (test précédent) est celui de l'équipe : l'élève tente de le lancer.
  const draft = await db.queryOne(
    "SELECT id FROM gl_spell_cast_drafts WHERE game_id = ? AND spell_code = ? AND status = 'collecting' LIMIT 1",
    [ctx.game.id, LANTERNE],
  );
  assert.ok(draft);
  const refus = await request(app)
    .post(api(`/spell-casts/drafts/${draft.id}/launch`))
    .set(auth(licorne().token));
  assert.equal(refus.status, 403, JSON.stringify(refus.body));
  assert.equal(refus.body.code, 'TENIR_PERMISSION');

  // Sur tablette, le même lancement passe la permission de surface.
  await surface('tablette');
  const ok = await request(app)
    .post(api(`/spell-casts/drafts/${draft.id}/launch`))
    .set(auth(licorne().token));
  assert.notEqual(ok.body.code, 'TENIR_PERMISSION', JSON.stringify(ok.body));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('au tableau, en veillée (tour clos) : un élève lance Lettre', async () => {
  await surface('tableau');
  for (const phase of ['souffle', 'clos']) {
    const res = await request(app)
      .post(api('/tenir/tour/phase'))
      .set(auth(ctx.adminToken))
      .send(phase === 'souffle' ? { phase, dort: true } : { phase });
    assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
  }
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(licorne().token))
    .send({ spellCode: LETTRE, teamId: licornes().id, playerId: licorne().id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const l = await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(licorne().token));
  assert.equal(l.status, 200, JSON.stringify(l.body));
});
