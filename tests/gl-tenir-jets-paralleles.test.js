'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.5 — jets en suspens et fenêtres PAR ÉQUIPE (hybride et
 * tablette) : l'équipe la plus rapide ne ferme plus Relance et Progression aux autres. Un geste
 * ne confirme que les arrivées des équipes concernées ; une équipe déplacée par un sort garde sa
 * question de case ; un « Nommer » devenu sans objet se retire seul et est rendu. Au tableau,
 * rien ne change.
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
  importExempleChasse,
} = require('./helpers/glTenirFixtures');
const { lireDerniersJets, dernierJetDuTour } = require('../lib/glTour');
const { assertFenetre } = require('../lib/glSpellFenetres');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { presentJournalEvent } = require('../lib/glJournalPresent');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p, c = ctx) => `/api/gl/games/${c.game.id}${p}`;
// Équipes : 0 Gnomes A, 1 Gnomes B, 2 Licornes A, 3 Licornes B.
const team = (i, c = ctx) => c.teams[i];
const membres = (i, c = ctx) => c.players.filter((p) => Number(p.teamId) === Number(team(i, c).id));
const indexOf = async (teamId, c = ctx) => {
  const row = await db.queryOne('SELECT position_marker_id AS m FROM gl_teams WHERE id = ?', [
    teamId,
  ]);
  return c.markers.findIndex((m) => Number(m.id) === Number(row.m));
};
const jet = (i, faces, c = ctx) =>
  request(app)
    .post(api('/tenir/lancer', c))
    .set(auth(c.adminToken))
    .send({ mode: 'physique', teamId: team(i, c).id, faces });
async function suspens(teamId, c = ctx) {
  const rows = await db.queryAll(
    "SELECT payload_json FROM gl_game_tenir_effets WHERE game_id = ? AND team_id = ? AND kind = 'arrivee_suspendue' ORDER BY id DESC",
    [c.game.id, teamId],
  );
  return rows.map((r) => JSON.parse(r.payload_json));
}
async function cast(token, body, c = ctx) {
  const d = await request(app).post(api('/spell-casts/drafts', c)).set(auth(token)).send(body);
  if (d.status !== 201) return d;
  return request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`, c))
    .set(auth(token));
}
async function tourSuivant(c = ctx) {
  for (const body of [{ phase: 'souffle', dort: true }, { phase: 'clos' }]) {
    await request(app)
      .post(api('/tenir/tour/phase', c))
      .set(auth(c.adminToken))
      .send(body)
      .expect(200);
  }
  await ouvrirTourEnJeu(request, app, c);
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  for (const p of ctx.players) await setPlayerBourses(p.id, 6, 6);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('dernier jet : un par équipe, ancien format encore lu', () => {
  const ancien = lireDerniersJets(
    '{"teamId":7,"beneficiaryTeamId":7,"eventId":3,"mode":"serveur","at":"2026-11-01T10:00:00.000Z"}',
  );
  assert.deepEqual(Object.keys(ancien), ['7']);
  assert.equal(ancien['7'].gesteSuivant, false);
  const jets = lireDerniersJets(
    JSON.stringify({
      7: { eventId: 3, mode: 'serveur', at: '2026-11-01T10:00:00.000Z', gesteSuivant: 1 },
      9: { eventId: 5, mode: 'physique', at: '2026-11-01T10:00:02.000Z', gesteSuivant: false },
    }),
  );
  assert.equal(jets['7'].gesteSuivant, true);
  assert.equal(dernierJetDuTour(jets).teamId, 9);
  assert.equal(dernierJetDuTour({}), null);
  assert.deepEqual(lireDerniersJets(null), {});

  // Fenêtre « après le jet » : par équipe en parallèle, dernier jet de la partie au tableau.
  const spell = { fenetre: 'apres_jet' };
  const round = { phase: 'jeu', dernierJet: { teamId: 9 }, derniersJets: jets };
  assert.doesNotThrow(() =>
    assertFenetre({ spell, round, teamRolled: true, teamId: 9, parallele: true }),
  );
  assert.throws(
    () => assertFenetre({ spell, round, teamRolled: true, teamId: 7, parallele: true }),
    (err) => err.code === 'SPELL_FENETRE' && /avant tout autre geste de l’équipe/.test(err.message),
  );
  assert.throws(
    () => assertFenetre({ spell, round, teamRolled: true, teamId: 7 }),
    (err) => /avant qu’une autre équipe ne joue/.test(err.message),
  );
});

test('A en suspens, B jette : A reste en suspens et peut encore lancer Relance', async () => {
  const a = await jet(0, [1, 1]);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.arrival?.enSuspens, true, JSON.stringify(a.body.arrival));
  const b = await jet(1, [2, 1]);
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal((await suspens(team(0).id))[0].issue, undefined, 'le jet de B ne touche pas A');

  const vue = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken)).expect(200);
  assert.deepEqual(
    Object.keys(vue.body.round.derniersJets).sort(),
    [String(team(0).id), String(team(1).id)].sort(),
  );
  assert.equal(vue.body.round.dernierJet.teamId, Number(team(1).id));

  const relance = await cast(membres(0)[0].token, {
    spellCode: 'SL005',
    teamId: team(0).id,
    ressource: 'coeurs',
  });
  assert.equal(relance.status, 200, JSON.stringify(relance.body));
  // Une seule monnaie : `ressource: 'coeurs'` est ignoré, Relance se paie en gemmes.
  assert.deepEqual(relance.body.draft.required, { gems: 2, hearts: 0 });
  assert.equal(await indexOf(team(0).id), 0, 'la mascotte de A revient sur sa case de départ');
  assert.equal((await suspens(team(0).id))[0].issue, 'annulee');
});

test('Progression : ouverte à A même si B a joué depuis ; fermée dès que A fouille', async () => {
  // Licornes A jette, puis Licornes B : en parallèle, la fenêtre de Licornes A reste ouverte.
  assert.equal((await jet(2, [1, 2])).status, 201);
  assert.equal((await jet(3, [1, 1])).status, 201);
  const ouverte = await cast(membres(2)[0].token, {
    spellCode: 'SL002',
    teamId: team(2).id,
    effectParams: { delta: 1 },
    ressource: 'gemmes',
  });
  assert.equal(ouverte.status, 200, JSON.stringify(ouverte.body));

  // Licornes B fouille : son jet est gardé (la case s'applique), sa fenêtre se ferme.
  const fouille = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(membres(3)[0].token))
    .send({ x: 0.96, y: 0.96 });
  assert.equal(fouille.status, 201, JSON.stringify(fouille.body));
  const arrivee = (await suspens(team(3).id))[0];
  if (arrivee) assert.equal(arrivee.issue, 'appliquee', 'fouiller, c’est garder son jet');
  const fermee = await cast(membres(3)[0].token, {
    spellCode: 'SL002',
    teamId: team(3).id,
    effectParams: { delta: 1 },
    ressource: 'gemmes',
  });
  assert.equal(fermee.status, 409, JSON.stringify(fermee.body));
  assert.equal(fermee.body.code, 'SPELL_FENETRE');
  assert.match(fermee.body.error, /avant tout autre geste de l’équipe/);
  const vue = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken)).expect(200);
  assert.equal(vue.body.round.derniersJets[String(team(3).id)].gesteSuivant, true);
});

test('Bourrasque sur une équipe en suspens : son jet s’applique, puis +3 cases ; elle garde sa question de case', async () => {
  await tourSuivant();
  // Gnomes B posée sur « Étape » (case 3) : un jet de 2 l'amène sur « Question 2 » (case 5).
  await db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[3].id,
    team(1).id,
  ]);
  const quiz = ctx.markers[5];
  const j = await jet(1, [1, 1]);
  assert.equal(j.status, 201, JSON.stringify(j.body));
  assert.equal(j.body.arrival?.enSuspens, true, JSON.stringify(j.body.arrival));
  assert.equal(await indexOf(team(1).id), 5);

  const bourrasque = await cast(membres(2)[0].token, {
    spellCode: 'SL039',
    teamId: team(2).id,
    effectParams: { targetTeamId: team(1).id },
  });
  assert.equal(bourrasque.status, 200, JSON.stringify(bourrasque.body));
  assert.equal((await suspens(team(1).id))[0].issue, 'appliquee', 'le jet de Gnomes B est gardé');
  assert.equal(await indexOf(team(1).id), 8, 'puis +3 cases');

  // La question est due à l'arrivée du tour : l'équipe déplacée la garde.
  const vue = await request(app)
    .get(api('/tenir/tour'))
    .set(auth(membres(1)[0].token));
  assert.deepEqual(vue.body.round.questionsEnAttente, [
    { teamId: Number(team(1).id), markerId: Number(quiz.id) },
  ]);
  const ailleurs = await request(app)
    .post(api(`/markers/${ctx.markers[1].id}/present-question`))
    .set(auth(membres(1)[0].token))
    .send({});
  assert.equal(ailleurs.status, 409, 'une autre case reste fermée');
  const question = await request(app)
    .post(api(`/markers/${quiz.id}/present-question`))
    .set(auth(membres(1)[0].token))
    .send({});
  assert.equal(question.status, 200, JSON.stringify(question.body));
  // Bonne réponse (le jeton n'expose pas la clé : on essaie les choix un à un, sans rien perdre).
  let juste = false;
  let presentation = question.body;
  for (let essai = 0; essai < 6 && !juste; essai += 1) {
    const choix =
      presentation.presentation.choices[essai % presentation.presentation.choices.length];
    const rep = await request(app)
      .post(api('/qcm/answer'))
      .set(auth(membres(1)[0].token))
      .send({
        questionCode: presentation.questionCode,
        presentationToken: presentation.presentation.presentationToken,
        choiceId: choix.id,
      });
    assert.equal(rep.status, 200, JSON.stringify(rep.body));
    juste = rep.body.correct === true;
    if (!juste) {
      const encore = await request(app)
        .post(api(`/markers/${quiz.id}/present-question`))
        .set(auth(membres(1)[0].token))
        .send({});
      assert.equal(
        encore.status,
        200,
        `« pas encore » : la question reste due (${JSON.stringify(encore.body)})`,
      );
      presentation = encore.body;
    }
  }
  if (juste) {
    // Bonne réponse : la question de CETTE case est soldée (la case suivante, atteinte par le
    // « +1 case », peut en poser une nouvelle).
    const apres = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken));
    assert.ok(
      !apres.body.round.questionsEnAttente.some(
        (q) => Number(q.teamId) === Number(team(1).id) && Number(q.markerId) === Number(quiz.id),
      ),
      'question soldée',
    );
  }
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
});

test('« Nommer » sans objet : la page est réparée entre-temps, la ligne se retire seule et le sort est rendu', async (t) => {
  // Nommer est sorti du grimoire (ensemble unifié, M6) : remis le temps du test.
  t.after(await require('./helpers/glTenirFixtures').activerSortRetire(ctx.chapter.id, 'SL041'));
  await tourSuivant();
  const zone = await db.queryOne(
    `SELECT z.id, z.zone_key FROM gl_chasse_zones z
       INNER JOIN gl_game_chasse_pages p ON p.zone_id = z.id AND p.game_id = ? LIMIT 1`,
    [ctx.game.id],
  );
  assert.ok(zone, 'une page de chasse');
  await db.execute(
    "UPDATE gl_game_chasse_pages SET etat = 'palie' WHERE game_id = ? AND zone_id = ?",
    [ctx.game.id, zone.id],
  );
  for (const i of [0, 1]) for (const p of membres(i)) await setPlayerBourses(p.id, 4, 4);
  const lance = [];
  for (const i of [0, 1]) {
    const res = await cast(membres(i)[0].token, {
      spellCode: 'SL041',
      teamId: team(i).id,
      effectParams: { zoneKey: zone.zone_key },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    lance.push(res.body.draft.id);
  }
  // Une seule monnaie : Nommer (sort de Gnomes) se paie en gemmes ; les cœurs ne bougent pas.
  const somme = async (i) => {
    const total = { health: 0, power: 0 };
    for (const p of membres(i)) {
      const b = await readPlayerBourses(p.id);
      total.health += b.health;
      total.power += b.power;
    }
    return total;
  };
  const sommeB = () => somme(1);
  const pleinB = { health: membres(1).length * 4, power: membres(1).length * 4 };
  assert.deepEqual(
    await sommeB(),
    { health: pleinB.health, power: pleinB.power - 2 },
    'Gnomes B a payé 2 gemmes',
  );
  const avantA = await somme(0);
  const file = async () =>
    (await request(app).get(api('/spell-casts/awaiting-effect')).set(auth(ctx.adminToken))).body;

  // Le prof applique le Nommer de Gnomes A : la page est réparée, celui de Gnomes B n'a plus d'objet.
  const applique = await request(app)
    .post(api(`/spell-casts/drafts/${lance[0]}/effect-applied`))
    .set(auth(ctx.adminToken))
    .send({ zoneKey: zone.zone_key });
  assert.equal(applique.status, 200, JSON.stringify(applique.body));
  assert.deepEqual(await somme(0), avantA, 'la page réparée ne donne rien à Gnomes A');
  const restante = JSON.stringify(await file());
  assert.ok(!restante.includes(`"id":${lance[1]},`), 'la ligne de Gnomes B s’est retirée seule');
  const draftB = await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    lance[1],
  ]);
  assert.equal(draftB.status, 'rembourse');
  assert.deepEqual(await sommeB(), pleinB, 'remboursement exact');
  const evt = await db.queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'spell_rembourse' ORDER BY id DESC LIMIT 1",
    [ctx.game.id, team(1).id],
  );
  assert.equal(JSON.parse(evt.payload_json).motif, 'page_reparee');
  const libelle = presentJournalEvent(
    { eventType: 'spell_rembourse', teamId: team(1).id, payload: JSON.parse(evt.payload_json) },
    {
      teamsById: { [team(1).id]: { id: team(1).id, name: 'Gnomes B' } },
      forPlayer: true,
      tenir: true,
    },
  );
  assert.match(libelle.body, /Rien n’est retiré/);
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
});

test('au tableau, rien ne change : le jet d’une autre équipe applique d’office l’arrivée en suspens', async () => {
  const tab = await createTenirGame({ stamp: Date.now() + 11 });
  await db.execute(
    "UPDATE gl_games SET tenir_surface = 'tableau', tenir_overrides_json = NULL WHERE id = ?",
    [tab.game.id],
  );
  for (const p of tab.players) await setPlayerBourses(p.id, 6, 6);
  await ouvrirTourEnJeu(request, app, tab);
  const vue = await request(app).get(api('/tenir/tour', tab)).set(auth(tab.adminToken)).expect(200);
  const ordre = vue.body.round.ordre.map(Number);
  const iA = tab.teams.findIndex((t) => Number(t.id) === ordre[0]);
  const iB = tab.teams.findIndex((t) => Number(t.id) === ordre[1]);
  const a = await jet(iA, [1, 1], tab);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.arrival?.enSuspens, true, JSON.stringify(a.body.arrival));
  await request(app)
    .post(api('/tenir/tour/equipe-suivante', tab))
    .set(auth(tab.adminToken))
    .expect(200);
  assert.equal(
    (await suspens(team(iA, tab).id, tab))[0].issue,
    'appliquee',
    'équipe suivante : jet gardé',
  );
  const b = await jet(iB, [1, 2], tab);
  assert.equal(b.status, 201, JSON.stringify(b.body));
  // Progression de A : refusée, une autre équipe a joué depuis (règle du tableau, inchangée).
  const d = await request(app)
    .post(api('/spell-casts/drafts', tab))
    .set(auth(tab.adminToken))
    .send({
      spellCode: 'SL002',
      teamId: team(iA, tab).id,
      effectParams: { delta: 1 },
      ressource: 'coeurs',
    });
  assert.equal(d.status, 409, JSON.stringify(d.body));
  assert.match(d.body.error, /avant qu’une autre équipe ne joue/);
});
