'use strict';

/**
 * « Tenir à deux » v2 — économie globale (spec § 2 et § 8) : sur une séquence jouée, la somme
 * des bourses du groupe ne bouge que par les sources documentées (page tenue : +1 par membre
 * des deux équipes ; réparation : +1 cœur par Gnome ; carnet complet : +1 à tous ; sort :
 * −coût ; chapardeur : −1 puis nid rendu) — jamais par une bonne réponse de case, une lecture,
 * une arrivée, une fouille, un badge ni un honneur. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll } = db;
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
} = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

async function total() {
  const row = await queryOne(
    'SELECT SUM(p.health_points) + SUM(p.power_points) AS t FROM gl_players p INNER JOIN gl_team_members tm ON tm.player_id = p.id WHERE tm.game_id = ?',
    [ctx.game.id],
  );
  return Number(row.t) || 0;
}

async function bonneReponse(question) {
  const row = await queryOne(
    'SELECT choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte FROM gl_qcm_questions WHERE question_code = ?',
    [question.questionCode],
  );
  const text = row[`choix_${String(row.reponse_correcte).toLowerCase()}`];
  return question.choices.find((c) => c.text === text);
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 3 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 1 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('fouilles, pages trouvées, lectures, jets et arrivées neutres ne créent aucune ressource', async () => {
  const t0 = await total();
  const gnome = ctx.players[0];
  const licorne = ctx.players[2];
  const f = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(gnome.token))
    .send({ x: 0.35, y: 0.6 });
  assert.equal(f.status, 201, JSON.stringify(f.body));
  const right = await bonneReponse(f.body.question);
  const rep = await request(app).post(api('/chasse/repondre')).set(auth(gnome.token)).send({
    presentationToken: f.body.question.presentationToken,
    questionCode: f.body.question.questionCode,
    choiceId: right.id,
  });
  assert.equal(rep.status, 200, JSON.stringify(rep.body));
  assert.equal(rep.body.etat, 'trouvee');
  assert.equal(await total(), t0, 'page trouvée : rien');

  const lecture = await request(app)
    .post(api('/chasse/pages/cz-p3-01/ouvrir'))
    .set(auth(ctx.players[1].token));
  assert.equal(lecture.status, 200);
  assert.equal(await total(), t0, 'lecture même peuple : rien');

  const jet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(licorne.token))
    .send({ mode: 'physique', faces: [1, 2] });
  assert.equal(jet.status, 202);
  await request(app)
    .post(api(`/tenir/des/${jet.body.saisieId}/valider`))
    .set(auth(ctx.adminToken))
    .expect(200);
  // La case 3 est une étape neutre.
  assert.equal(await total(), t0, 'jet et arrivée sur une étape : rien');
});

test('page tenue : +1 par membre des deux équipes ; sort : −coût ; souffle : chapardeur −1 ; rien d’autre', async () => {
  const t0 = await total();
  const licorne = ctx.players[2];
  const membres = Number(
    (
      await queryOne(
        'SELECT COUNT(*) AS c FROM gl_team_members WHERE game_id = ? AND team_id IN (?, ?)',
        [ctx.game.id, ctx.teams[0].id, ctx.teams[2].id],
      )
    ).c,
  );
  const ouvert = await request(app)
    .post(api('/chasse/pages/cz-p3-01/ouvrir'))
    .set(auth(licorne.token));
  assert.equal(ouvert.body.peutTenir, true);
  const right = ouvert.body.question.choices.find((c) => c.text === 'Que la forêt respire');
  const tenue = await request(app)
    .post(api('/chasse/pages/cz-p3-01/tenir'))
    .set(auth(licorne.token))
    .send({
      presentationToken: ouvert.body.question.presentationToken,
      questionCode: ouvert.body.question.questionCode,
      choiceId: right.id,
    });
  assert.equal(tenue.status, 200, JSON.stringify(tenue.body));
  const t1 = await total();
  assert.equal(t1, t0 + membres, 'page tenue : +1 à chaque membre des deux équipes (sous plafond)');

  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(licorne.token))
    .send({ spellCode: 'SL037', teamId: ctx.teams[2].id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const l = await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(licorne.token));
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.equal(await total(), t1 - 2, 'Lanterne : −2 gemmes, rien de créé');

  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', faces: [2] })
    .expect(200);
  assert.equal(await total(), t1 - 3, 'souffle : le voile ne retire rien, le chapardeur prend 1');
  const nid = await queryOne('SELECT nid_json FROM gl_game_tenir_state WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.ok(nid.nid_json);

  // Le journal public ne porte aucune bourse : les payloads privés sont expurgés.
  const journal = await request(app)
    .get(`/api/gl/journal/games/${ctx.game.id}`)
    .set(auth(ctx.players[1].token));
  assert.equal(journal.status, 200);
  const raw = JSON.stringify(journal.body);
  assert.ok(!/"vitality"/.test(raw), 'aucune bourse dans le journal d’un élève');
  const classement = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type LIKE '%classement%'",
    [ctx.game.id],
  );
  assert.equal(classement.length, 0);
});

test('Progression sur une Trame ne crée pas de ressource nette (C1) : −coût seulement', async () => {
  const team = ctx.teams[1];
  const member = ctx.players.find((p) => p.teamId === Number(team.id));
  // Le tour précédent est en phase souffle : on le clôt et on ouvre le tour 2 en phase jeu.
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
  // Jet de l'équipe (dernier jet du tour), puis placement juste avant la Trame 1.
  const jet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'serveur', teamId: team.id });
  assert.equal(jet.status, 201, JSON.stringify(jet.body));
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[1].id,
    team.id,
  ]);
  const t0 = await total();
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(member.token))
    .send({ spellCode: 'SL002', teamId: team.id, effectParams: { delta: 1 }, ressource: 'coeurs' });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const l = await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(member.token));
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.equal(await total(), t0 - 1, 'Progression sur une Trame : −1 (coût), rien de créé');
});

test('cases positives (C4) : une case « +2 cœurs » du plateau donne +1 ressource du peuple à chaque membre', async () => {
  const team = ctx.teams[3]; // licorne
  const etape = ctx.markers[8]; // « Étape 2 » (point) : rendue positive le temps du test
  const saved = await queryOne(
    'SELECT event_type, event_config_json FROM gl_chapter_markers WHERE id = ?',
    [etape.id],
  );
  await execute(
    'UPDATE gl_chapter_markers SET event_type = ?, event_config_json = ? WHERE id = ?',
    [
      'behavior',
      JSON.stringify({
        version: 2,
        effects: {
          neutral: { label: null, deltaPv: 2, deltaGems: 0, deltaMove: 0, passTurn: false },
        },
        eventMeta: { tonalite: 'positif', rarete: 'commun' },
      }),
      etape.id,
    ],
  );
  try {
    await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
      ctx.markers[7].id,
      team.id,
    ]);
    const membres = (
      await queryAll('SELECT player_id FROM gl_team_members WHERE game_id = ? AND team_id = ?', [
        ctx.game.id,
        team.id,
      ])
    ).map((m) => Number(m.player_id));
    for (const id of membres)
      await execute('UPDATE gl_players SET health_points = 3, power_points = 3 WHERE id = ?', [id]);
    const t0 = await total();
    const libre = await request(app)
      .post(api('/tenir/lancer'))
      .set(auth(ctx.adminToken))
      .send({ mode: 'libre', cases: 1, motif: 'test C4', teamId: team.id });
    assert.equal(libre.status, 201, JSON.stringify(libre.body));
    assert.equal(await total(), t0 + membres.length, '+1 par membre, pas +2 cœurs');
    for (const id of membres) {
      const b = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [
        id,
      ]);
      assert.deepEqual(
        { h: Number(b.health_points), p: Number(b.power_points) },
        { h: 3, p: 4 },
        'licorne : +1 gemme, pas de cœur',
      );
    }
  } finally {
    await execute(
      'UPDATE gl_chapter_markers SET event_type = ?, event_config_json = ? WHERE id = ?',
      [saved.event_type, saved.event_config_json, etape.id],
    );
  }
});
