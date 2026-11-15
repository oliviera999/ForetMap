'use strict';

/**
 * « Tenir à deux » — courses entre requêtes simultanées (audit du 15 novembre 2026).
 *
 * La base tourne en REPEATABLE READ : une lecture simple dans une transaction renvoie
 * l'instantané pris à la première lecture, même après qu'un `SELECT … FOR UPDATE` a attendu une
 * transaction concurrente. Chaque test lance deux requêtes en même temps et vérifie un état
 * final cohérent QUEL QUE SOIT l'ordre d'arrivée (pas d'hypothèse sur qui gagne).
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
  readPlayerBourses,
  ouvrirTourEnJeu,
} = require('./helpers/glTenirFixtures');
const { rembourserCastTx } = require('../lib/glSpellCast');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
// Équipes : 0 Gnomes A (joueurs 0, 4, 8), 1 Gnomes B (1, 5, 9), 2 Licornes A (2, 6), 3 Licornes B (3, 7).
const team = (i) => ctx.teams[i];
const p = (i) => ctx.players[i];
const membres = (i) => ctx.players.filter((m) => Number(m.teamId) === Number(team(i).id));

const draft = (token, body) =>
  request(app).post(api('/spell-casts/drafts')).set(auth(token)).send(body);
const launch = (token, id) =>
  request(app)
    .post(api(`/spell-casts/drafts/${id}/launch`))
    .set(auth(token));
const cancel = (token, id) =>
  request(app)
    .delete(api(`/spell-casts/drafts/${id}`))
    .set(auth(token));
const phase = (body) =>
  request(app).post(api('/tenir/tour/phase')).set(auth(ctx.adminToken)).send(body);

async function clore() {
  await phase({ phase: 'souffle', dort: true }).expect(200);
  await phase({ phase: 'clos' }).expect(200);
}

async function tourSuivant() {
  await clore();
  await ouvrirTourEnJeu(request, app, ctx);
}

async function sommeEquipe(i) {
  let hearts = 0;
  let gems = 0;
  for (const m of membres(i)) {
    const b = await readPlayerBourses(m.id);
    hearts += b.health;
    gems += b.power;
  }
  return { hearts, gems };
}

async function partsEnBase(draftId) {
  const rows = await db.queryAll(
    'SELECT COALESCE(SUM(gems), 0) AS g, COALESCE(SUM(hearts), 0) AS h FROM gl_spell_cast_contributions WHERE draft_id = ?',
    [draftId],
  );
  return { gems: Number(rows[0].g) || 0, hearts: Number(rows[0].h) || 0 };
}

async function statut(draftId) {
  return String(
    (await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [draftId])).status,
  );
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 3 });
  for (const m of ctx.players) await setPlayerBourses(m.id, 5, 5);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('Héritage : un compte élève ne désigne pas un camarade comme élève engagé (403)', async () => {
  // Le statut du sort vit dans le catalogue partagé de la base de test : une autre suite peut
  // l'avoir laissé « proposé » (409 SPELL_NOT_OFFICIEL, contrôlé avant). Il est fixé ici, puis
  // remis tel quel.
  const avant = await db.queryOne("SELECT statut FROM gl_spells WHERE spell_code = 'SL033'");
  await db.execute("UPDATE gl_spells SET statut = 'officiel' WHERE spell_code = 'SL033'");
  try {
    const camarade = membres(2).find((m) => m.id !== p(2).id);
    const r = await draft(p(2).token, {
      spellCode: 'SL033',
      teamId: team(2).id,
      ressource: 'gemmes',
      playerId: camarade.id,
      effectParams: { beneficiairePlayerId: p(0).id, ressource: 'coeurs' },
    });
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(r.body.code, 'SPELL_COMPTE_ELEVE');
  } finally {
    await db.execute('UPDATE gl_spells SET statut = ? WHERE spell_code = ?', [
      avant.statut,
      'SL033',
    ]);
  }
});

test('annuler pendant un lancement : jamais un sort payé puis « annulé »', async () => {
  for (let essai = 0; essai < 3; essai += 1) {
    const avant = await sommeEquipe(0);
    const d = await draft(p(0).token, {
      spellCode: 'SL043',
      teamId: team(0).id,
      effectParams: { targetTeamId: team(2).id },
    });
    assert.equal(d.status, 201, JSON.stringify(d.body));
    const id = d.body.draft.id;
    const [l, c] = await Promise.all([launch(p(4).token, id), cancel(p(0).token, id)]);
    const fin = await statut(id);
    const apres = await sommeEquipe(0);
    if (fin === 'cast') {
      assert.equal(l.status, 200, JSON.stringify(l.body));
      assert.equal(c.status, 409, `annulation refusée : ${JSON.stringify(c.body)}`);
      assert.equal(avant.hearts - apres.hearts, 2, 'le sort lancé est payé');
    } else {
      assert.equal(fin, 'cancelled');
      assert.equal(c.status, 200, JSON.stringify(c.body));
      assert.notEqual(l.status, 200, 'pas de lancement d’un pot annulé');
      assert.deepEqual(apres, avant, 'rien n’est débité');
    }
    await tourSuivant();
  }
});

test('saisie d’une part pendant un lancement : le pot gardé en base = ce qui a été débité', async () => {
  for (let essai = 0; essai < 3; essai += 1) {
    const avant = await sommeEquipe(0);
    const d = await draft(p(0).token, {
      spellCode: 'SL043',
      teamId: team(0).id,
      effectParams: { targetTeamId: team(2).id },
    });
    assert.equal(d.status, 201, JSON.stringify(d.body));
    const id = d.body.draft.id;
    // Le lanceur veut payer seul (2 cœurs) pendant qu'un équipier lance le pot pré-rempli.
    const [l] = await Promise.all([
      launch(p(4).token, id),
      request(app)
        .put(api(`/spell-casts/drafts/${id}/contributions`))
        .set(auth(p(0).token))
        .send({ contributions: [{ playerId: p(0).id, gems: 0, hearts: 2 }] }),
    ]);
    const apres = await sommeEquipe(0);
    if ((await statut(id)) === 'cast') {
      const debite = avant.hearts - apres.hearts;
      const parts = await partsEnBase(id);
      assert.equal(parts.hearts, debite, 'le remboursement relira exactement ce qui a été payé');
    } else {
      assert.notEqual(l.status, 200);
      assert.deepEqual(apres, avant);
    }
    await tourSuivant();
  }
});

test('remboursement en masse : un sort dont l’effet est appliqué n’est pas rendu (sous verrou)', async () => {
  const d = await draft(p(0).token, {
    spellCode: 'SL043',
    teamId: team(0).id,
    effectParams: { targetTeamId: team(2).id },
  });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const l = await launch(p(0).token, d.body.draft.id);
  assert.equal(l.status, 200, JSON.stringify(l.body));
  // Sort auto : effet appliqué au lancement (effect_applied_at posé).
  const row = await db.queryOne('SELECT effect_applied_at FROM gl_spell_cast_drafts WHERE id = ?', [
    d.body.draft.id,
  ]);
  assert.ok(row.effect_applied_at, 'effet auto appliqué');
  const avant = await sommeEquipe(0);
  let rendu;
  await db.withTransaction(async (tx) => {
    rendu = await rembourserCastTx(tx, {
      gameId: ctx.game.id,
      draftId: d.body.draft.id,
      sauterSiResolu: true,
    });
  });
  assert.equal(rendu, null);
  assert.equal(await statut(d.body.draft.id), 'cast');
  assert.deepEqual(await sommeEquipe(0), avant);
  await tourSuivant();
});

test('double clic sur « Ouvrir le tour » : un seul tour ouvert, un seul « tour_ouvert » au journal', async () => {
  await clore();
  const avant = Number(
    (
      await db.queryOne('SELECT current_round_number AS n FROM gl_games WHERE id = ?', [
        ctx.game.id,
      ])
    ).n,
  );
  const ouvrir = () => request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  const [a, b] = await Promise.all([ouvrir(), ouvrir()]);
  const codes = [a.status, b.status].sort();
  assert.equal(codes[0], 200, JSON.stringify([a.body, b.body]));
  assert.equal(
    codes[1],
    409,
    `la seconde ouverture est refusée : ${JSON.stringify([a.body, b.body])}`,
  );
  const apres = Number(
    (
      await db.queryOne('SELECT current_round_number AS n FROM gl_games WHERE id = ?', [
        ctx.game.id,
      ])
    ).n,
  );
  assert.equal(apres, avant + 1);
  const evts = await db.queryAll(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'tour_ouvert'",
    [ctx.game.id],
  );
  const pourCeTour = evts.filter(
    (e) => Number(JSON.parse(e.payload_json || '{}').roundNumber) === apres,
  );
  assert.equal(pourCeTour.length, 1, `un seul tour_ouvert pour le tour ${apres}`);
});
