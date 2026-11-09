'use strict';

/**
 * « Tenir à deux » v2 — grimoire exécuté (spec § 10) : fenêtres (message), limites (tour /
 * partie / séance / chapitre-élève / trimestre-élève), peuple, pot pré-rempli, effets
 * automatiques (Lanterne, Abri, Progression, Relance, Grand Regard, Bourrasque, Sentier,
 * Cordée, Relais, Farce, Héritage), file du prof (Nommer via effect-applied, Esquive), sort
 * `propose` refusé. Assertion globale : aucun sort ne crée de ressource (sauf Nommer : +1 cœur
 * par Gnome, documenté). Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll, withTransaction } = db;
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { appliquerHeritagesTx } = require('../lib/glHeritage');
const { getGameplaySettings } = require('../lib/glSettings');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
// Équipes : 0 Gnomes A (joueurs 0, 4, 8), 1 Gnomes B (1, 5, 9), 2 Licornes A (2, 6), 3 Licornes B (3, 7).
const gA = () => ctx.teams[0];
const gB = () => ctx.teams[1];
const lA = () => ctx.teams[2];
const lB = () => ctx.teams[3];
const p = (i) => ctx.players[i];

async function totalBourses() {
  const rows = await queryAll(
    'SELECT SUM(p.health_points) AS h, SUM(p.power_points) AS g FROM gl_players p INNER JOIN gl_team_members tm ON tm.player_id = p.id WHERE tm.game_id = ?',
    [ctx.game.id],
  );
  return { h: Number(rows[0].h) || 0, g: Number(rows[0].g) || 0 };
}

async function draft(token, body) {
  return request(app).post(api('/spell-casts/drafts')).set(auth(token)).send(body);
}

async function launch(token, draftId) {
  return request(app)
    .post(api(`/spell-casts/drafts/${draftId}/launch`))
    .set(auth(token));
}

async function cast(token, body) {
  const d = await draft(token, body);
  if (d.status !== 201) return d;
  return launch(token, d.body.draft.id);
}

async function teamIndex(teamId) {
  const team = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [teamId]);
  return ctx.markers.findIndex((m) => Number(m.id) === Number(team.position_marker_id));
}

async function place(teamId, index) {
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[index].id,
    teamId,
  ]);
}

async function effets(kind) {
  return queryAll(
    'SELECT * FROM gl_game_tenir_effets WHERE game_id = ? AND kind = ? ORDER BY id ASC',
    [ctx.game.id, kind],
  );
}

before(async () => {
  await initSchema();
  // Plateau 3 : tout le grimoire v2 utile est ouvert (ouvertures cumulatives 1 → 3 ; celles par
  // chapitre sont testées dans gl-tenir-import).
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 3 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('Lanterne : licornes seulement, pot pré-rempli (1 + 1), effet auto → page révélée, effect_applied_at posé ; limite 1/tour/équipe', async () => {
  const gnome = await draft(p(0).token, { spellCode: 'SL037', teamId: gA().id });
  assert.equal(gnome.status, 403, JSON.stringify(gnome.body));
  assert.equal(gnome.body.code, 'SPELL_PEUPLE');

  const avant = await totalBourses();
  const d = await draft(p(2).token, { spellCode: 'SL037', teamId: lA().id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  assert.deepEqual(d.body.draft.required, { gems: 2, hearts: 0 });
  assert.equal(d.body.draft.fenetre, 'jeu_avant_fouille');
  const suggested = d.body.draft.suggestedContributions.map((c) => c.gems).sort();
  assert.deepEqual(suggested, [1, 1], 'parts égales entre les deux présentes');
  assert.equal(d.body.draft.ready, true, 'le pot est pré-rempli : lançable sans retouche');

  const l = await launch(p(2).token, d.body.draft.id);
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.ok(l.body.draft.effectAppliedAt, 'effet automatique : appliqué par le système');
  assert.ok(l.body.effectEvents.some((e) => e.eventType === 'page_revelee'));
  const apres = await totalBourses();
  assert.equal(apres.g, avant.g - 2);
  assert.equal(apres.h, avant.h);
  const carnet = await request(app)
    .get(api('/chasse'))
    .set(auth(p(2).token));
  assert.ok(carnet.body.pages.some((pg) => pg.etat === 'revelee'));

  const again = await draft(p(2).token, { spellCode: 'SL037', teamId: lA().id });
  assert.equal(again.status, 409, JSON.stringify(again.body));
  assert.equal(again.body.code, 'SPELL_LIMITE');
});

test('Abri : pot sans l’élève en retrait, cible une autre équipe, effet « abri » ce tour', async () => {
  await request(app)
    .post(api('/tenir/retrait'))
    .set(auth(ctx.adminToken))
    .send({ playerId: p(8).id, entree: true, motif: 'conduite' })
    .expect(200);
  const d = await draft(p(0).token, {
    spellCode: 'SL043',
    teamId: gA().id,
    effectParams: { targetTeamId: lA().id },
  });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const byPlayer = Object.fromEntries(
    d.body.draft.suggestedContributions.map((c) => [c.playerId, c.hearts]),
  );
  assert.equal(byPlayer[p(8).id], undefined, 'l’élève en retrait ne verse pas');
  assert.deepEqual([byPlayer[p(0).id], byPlayer[p(4).id]].sort(), [1, 1]);
  const l = await launch(p(0).token, d.body.draft.id);
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const rows = await effets('abri');
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].team_id), lA().id);
  assert.equal(Number(rows[0].source_team_id), gA().id);
  await request(app)
    .post(api('/tenir/retrait'))
    .set(auth(ctx.adminToken))
    .send({ playerId: p(8).id, entree: false })
    .expect(200);
});

test('Relance : pas avant le jet ; après le jet la case attend, Relance annule le jet (la mascotte revient, la case ne s’applique pas) ; Progression part de la case jouée (C1)', async () => {
  const early = await draft(p(1).token, {
    spellCode: 'SL002',
    teamId: gB().id,
    effectParams: { delta: 1 },
    ressource: 'coeurs',
  });
  assert.equal(early.status, 409, JSON.stringify(early.body));
  assert.equal(early.body.code, 'SPELL_FENETRE');
  assert.match(early.body.error, /après le jet/);
  const relanceAvant = await draft(p(1).token, {
    spellCode: 'SL005',
    teamId: gB().id,
    ressource: 'coeurs',
  });
  assert.equal(relanceAvant.status, 409, 'pas de Relance avant le jet');
  assert.equal(relanceAvant.body.code, 'SPELL_FENETRE');

  const depart = await teamIndex(gB().id);
  const avantJet = await totalBourses();
  const jet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(p(1).token))
    .send({ mode: 'physique', faces: [1, 1] });
  assert.equal(jet.status, 202, JSON.stringify(jet.body));
  const valide = await request(app)
    .post(api(`/tenir/des/${jet.body.saisieId}/valider`))
    .set(auth(ctx.adminToken))
    .expect(200);
  // Relance encore possible : la mascotte avance, la case s'affiche sans s'appliquer.
  assert.equal(valide.body.arrival?.enSuspens, true, JSON.stringify(valide.body.arrival));
  assert.equal(valide.body.arrival?.relanceSpellCode, 'SL005');
  assert.equal(await teamIndex(gB().id), depart + 2);
  assert.deepEqual(await totalBourses(), avantJet, 'case pas encore appliquée');
  const vue = await request(app)
    .get(api('/tenir/tour'))
    .set(auth(p(1).token))
    .expect(200);
  const suspens = vue.body.round.arriveesEnSuspens;
  assert.equal(suspens.length, 1);
  assert.equal(suspens[0].teamId, gB().id);
  assert.equal(suspens[0].total, 2);

  const relance = await cast(p(1).token, {
    spellCode: 'SL005',
    teamId: gB().id,
    ressource: 'coeurs',
  });
  assert.equal(relance.status, 200, JSON.stringify(relance.body));
  assert.ok(relance.body.effectEvents.some((e) => e.eventType === 'jet_annule'));
  assert.equal(await teamIndex(gB().id), depart, 'la mascotte revient sur sa case de départ');
  const apresRelance = await totalBourses();
  assert.equal(apresRelance.h, avantJet.h - 2, 'seul le coût de Relance est payé');
  assert.equal(apresRelance.g, avantJet.g);
  const [ligne] = await effets('arrivee_suspendue');
  assert.equal(JSON.parse(ligne.payload_json).issue, 'annulee');
  assert.equal((await effets('relance')).length, 1);

  // L'équipe rejette les dés ; Relance est prise ce tour : la case s'applique aussitôt.
  const rejet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(p(1).token))
    .send({ mode: 'physique', faces: [1, 1] });
  assert.equal(rejet.status, 202, 'la Relance autorise une nouvelle saisie');
  const second = await request(app)
    .post(api(`/tenir/des/${rejet.body.saisieId}/valider`))
    .set(auth(ctx.adminToken))
    .expect(200);
  assert.notEqual(second.body.arrival?.enSuspens, true);
  assert.equal(await teamIndex(gB().id), depart + 2);
  const deja = await draft(p(1).token, {
    spellCode: 'SL005',
    teamId: gB().id,
    ressource: 'coeurs',
  });
  assert.equal(deja.status, 409, 'plus de jet en suspens à annuler');

  // Un second sort différent dans le même tour est accepté (pas de quota global).
  const avant = await totalBourses();
  const res = await cast(p(1).token, {
    spellCode: 'SL002',
    teamId: gB().id,
    effectParams: { delta: 1 },
    ressource: 'coeurs',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await teamIndex(gB().id), depart + 3);
  assert.equal(res.body.draft.required.hearts, 1);
  // C1 : la case d'arrivée (ici une Trame) n'est pas appliquée — aucune ressource créée.
  assert.equal(res.body.effectResult?.arrival, undefined, 'case non appliquée');
  const apres = await totalBourses();
  assert.equal(apres.h, avant.h - 1);
  assert.equal(apres.g, avant.g);
});

test('Relance : une arrivée laissée en suspens s’applique quand l’équipe garde son jet', async () => {
  await place(lB().id, 0);
  await execute(
    'UPDATE gl_teams SET last_dice_round_number = 0, last_move_round_number = 0 WHERE id = ?',
    [lB().id],
  );
  const jet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'physique', teamId: lB().id, faces: [1, 2] });
  assert.equal(jet.status, 201, JSON.stringify(jet.body));
  assert.equal(jet.body.arrival?.enSuspens, true, JSON.stringify(jet.body.arrival));
  const autre = await request(app)
    .post(api('/tenir/arrivee/garder'))
    .set(auth(p(1).token))
    .send({});
  assert.equal(autre.status, 409, 'une autre équipe n’a rien à garder');
  const garde = await request(app)
    .post(api('/tenir/arrivee/garder'))
    .set(auth(p(3).token))
    .send({});
  assert.equal(garde.status, 200, JSON.stringify(garde.body));
  assert.equal(await teamIndex(lB().id), 3);
  const ligne = (await effets('arrivee_suspendue')).find((r) => Number(r.team_id) === lB().id);
  assert.equal(JSON.parse(ligne.payload_json).issue, 'appliquee');
  const gardee = await queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'arrivee_gardee'",
    [ctx.game.id, lB().id],
  );
  assert.ok(gardee);
  const relance = await draft(p(3).token, {
    spellCode: 'SL005',
    teamId: lB().id,
    ressource: 'gemmes',
  });
  assert.equal(relance.status, 409, 'case appliquée : Relance n’a plus rien à annuler');
});

test('Grand Regard : 1/tour/partie, +1 fouille à chaque équipe ; Bourrasque : +3 cases sans effet de case', async () => {
  const gr = await cast(p(2).token, { spellCode: 'SL040', teamId: lA().id });
  assert.equal(gr.status, 200, JSON.stringify(gr.body));
  const carnet = await request(app)
    .get(api('/chasse'))
    .set(auth(p(0).token));
  assert.equal(carnet.body.fouilles.quota, 2, 'gnome : 1 + 1 (Grand Regard)');
  const second = await draft(p(3).token, { spellCode: 'SL040', teamId: lB().id });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'SPELL_LIMITE');

  await setPlayerBourses(p(3).id, 3, 5);
  const before = await teamIndex(gA().id);
  const evBefore = Number(
    (
      await queryOne(
        "SELECT COUNT(*) AS c FROM gl_game_events WHERE game_id = ? AND event_type = 'marker_effect'",
        [ctx.game.id],
      )
    ).c,
  );
  const b = await cast(p(3).token, {
    spellCode: 'SL039',
    teamId: lB().id,
    effectParams: { targetTeamId: gA().id },
  });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(await teamIndex(gA().id), before + 3);
  const evAfter = Number(
    (
      await queryOne(
        "SELECT COUNT(*) AS c FROM gl_game_events WHERE game_id = ? AND event_type = 'marker_effect'",
        [ctx.game.id],
      )
    ).c,
  );
  assert.equal(evAfter, evBefore, 'aucun effet de case');
});

test('Sentier : avant le jet seulement ; la prochaine case Souffle n’a pas d’effet', async () => {
  const late = await draft(p(1).token, { spellCode: 'SL042', teamId: gB().id });
  assert.equal(late.status, 409, 'Gnomes B ont déjà jeté');
  await place(gA().id, 3); // la case 4 est un Souffle (gnome : recule de 1)
  const s = await cast(p(0).token, { spellCode: 'SL042', teamId: gA().id });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const libre = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', teamId: gA().id, cases: 1, motif: 'test sentier' });
  assert.equal(libre.status, 201, JSON.stringify(libre.body));
  assert.equal(await teamIndex(gA().id), 4, 'pas de recul : le Souffle est neutralisé');
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'marker_effect' AND team_id = ? ORDER BY id DESC LIMIT 1",
    [ctx.game.id, gA().id],
  );
  assert.equal(JSON.parse(evt.payload_json).sentier, true);
});

test('Cordée (pacte) : cœurs des Gnomes + gemmes des Licornes, avant les jets des deux équipes ; le meilleur des deux jets', async () => {
  await place(gA().id, 0);
  await place(lA().id, 0);
  await execute('UPDATE gl_teams SET last_dice_round_number = 0 WHERE id IN (?, ?)', [
    gA().id,
    lA().id,
  ]);
  for (const i of [0, 4, 8, 2, 6]) await setPlayerBourses(p(i).id, 4, 4);
  const noPartner = await draft(p(0).token, { spellCode: 'SL045', teamId: gA().id });
  assert.equal(noPartner.status, 400);
  assert.equal(noPartner.body.code, 'SPELL_PARTENAIRE');
  const d = await draft(p(0).token, {
    spellCode: 'SL045',
    teamId: gA().id,
    partnerTeamId: lA().id,
  });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  assert.deepEqual(d.body.draft.required, { gems: 2, hearts: 2 });
  const hearts = d.body.draft.suggestedContributions.filter((c) => c.hearts > 0);
  const gems = d.body.draft.suggestedContributions.filter((c) => c.gems > 0);
  assert.ok(
    hearts.every((c) => c.teamId === gA().id),
    'cœurs des Gnomes',
  );
  assert.ok(
    gems.every((c) => c.teamId === lA().id),
    'gemmes des Licornes',
  );
  const l = await launch(p(0).token, d.body.draft.id);
  assert.equal(l.status, 200, JSON.stringify(l.body));

  const j1 = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(p(0).token))
    .send({ mode: 'physique', faces: [1, 1] });
  assert.equal(j1.status, 202);
  await request(app)
    .post(api(`/tenir/des/${j1.body.saisieId}/valider`))
    .set(auth(ctx.adminToken))
    .expect(200);
  assert.equal(await teamIndex(gA().id), 2);
  const j2 = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(p(2).token))
    .send({ mode: 'physique', faces: [3, 3] });
  assert.equal(j2.status, 202);
  await request(app)
    .post(api(`/tenir/des/${j2.body.saisieId}/valider`))
    .set(auth(ctx.adminToken))
    .expect(200);
  assert.equal(await teamIndex(lA().id), 6);
  assert.equal(await teamIndex(gA().id), 6, 'les Gnomes rattrapent le meilleur jet');
});

test('Relais : l’équipe la plus en retard rejoint la case du lanceur (1/tour/partie)', async () => {
  await place(gB().id, 1);
  await place(lB().id, 3);
  for (const i of [0, 4, 8]) await setPlayerBourses(p(i).id, 4, 2);
  const r = await cast(p(0).token, { spellCode: 'SL044', teamId: gA().id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await teamIndex(gB().id), await teamIndex(gA().id));
});

test('Farce : 1/séance/équipe, la mascotte d’une autre équipe danse ; Nommer (prof) : en file puis effet appliqué avec zoneKey', async () => {
  await setPlayerBourses(p(3).id, 3, 3);
  const f = await cast(p(3).token, {
    spellCode: 'SL036',
    teamId: lB().id,
    ressource: 'gemmes',
    effectParams: { targetTeamId: gA().id },
  });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  assert.ok(
    f.body.effectEvents.some(
      (e) => e.eventType === 'spell_effect' && e.payload?.type === 'mascotte_danse',
    ),
  );
  const again = await draft(p(3).token, {
    spellCode: 'SL036',
    teamId: lB().id,
    ressource: 'gemmes',
    effectParams: { targetTeamId: gA().id },
  });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'SPELL_LIMITE');

  for (const i of [1, 5, 9]) await setPlayerBourses(p(i).id, 3, 3);
  const zone = await queryOne("SELECT id FROM gl_chasse_zones WHERE zone_key = 'cz-p3-02'");
  await execute(
    "UPDATE gl_game_chasse_pages SET etat = 'palie', trouvee_par_team_id = NULL WHERE game_id = ? AND zone_id = ?",
    [ctx.game.id, zone.id],
  );
  const n = await cast(p(1).token, {
    spellCode: 'SL041',
    teamId: gB().id,
    effectParams: { zoneKey: 'cz-p3-02' },
  });
  assert.equal(n.status, 200, JSON.stringify(n.body));
  assert.equal(n.body.draft.effectAppliedAt, null, 'exécution du prof : rien d’automatique');
  assert.ok(n.body.effectEvents.some((e) => e.eventType === 'spell_file'));
  const file = await request(app)
    .get(api('/spell-casts/awaiting-effect'))
    .set(auth(ctx.adminToken));
  assert.ok(
    file.body.drafts.some((d) => d.id === n.body.draft.id),
    'Nommer attend le prof',
  );
  assert.ok(
    !file.body.drafts.some((d) => d.spellCode === 'SL036'),
    'la Farce (auto) n’est pas en file',
  );
  const avant = await readPlayerBourses(p(1).id);
  const applied = await request(app)
    .post(api(`/spell-casts/drafts/${n.body.draft.id}/effect-applied`))
    .set(auth(ctx.adminToken))
    .send({});
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const page = await queryOne(
    'SELECT etat FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ?',
    [ctx.game.id, zone.id],
  );
  assert.equal(page.etat, 'reparee');
  assert.equal(
    (await readPlayerBourses(p(1).id)).health,
    avant.health + 1,
    'Nommer : +1 cœur par Gnome (documenté)',
  );
});

test('Héritage : au seuil seulement, 1/chapitre/élève, versé à l’ouverture de la partie suivante', async () => {
  await setPlayerBourses(p(2).id, 3, 5);
  const inGame = await draft(p(2).token, {
    spellCode: 'SL033',
    teamId: lA().id,
    ressource: 'gemmes',
    effectParams: { beneficiairePlayerId: p(0).id, ressource: 'coeurs' },
  });
  assert.equal(inGame.status, 409, JSON.stringify(inGame.body));
  assert.equal(inGame.body.code, 'SPELL_FENETRE');
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true })
    .expect(200);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  const h = await cast(p(2).token, {
    spellCode: 'SL033',
    teamId: lA().id,
    ressource: 'gemmes',
    effectParams: { beneficiairePlayerId: p(0).id, ressource: 'coeurs' },
  });
  assert.equal(h.status, 200, JSON.stringify(h.body));
  const row = await queryOne(
    'SELECT * FROM gl_game_heritages WHERE game_id = ? ORDER BY id DESC LIMIT 1',
    [ctx.game.id],
  );
  assert.equal(Number(row.beneficiaire_player_id), p(0).id);
  assert.equal(row.ressource, 'health');
  assert.equal(row.applique_at, null);
  const again = await draft(p(2).token, {
    spellCode: 'SL033',
    teamId: lA().id,
    ressource: 'gemmes',
    effectParams: { beneficiairePlayerId: p(0).id, ressource: 'coeurs' },
  });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'SPELL_LIMITE');

  const before = await readPlayerBourses(p(0).id);
  const settings = await getGameplaySettings();
  const next = await createTenirGame({ stamp: Date.now() + 3 });
  const applied = await withTransaction((tx) =>
    appliquerHeritagesTx(tx, { gameId: next.game.id, classId: ctx.cls.id, settings }),
  );
  assert.equal(applied.applied, 1);
  assert.equal((await readPlayerBourses(p(0).id)).health, Math.min(8, before.health + 2));
});

test('Esquive : 1/trimestre/élève (prof) ; sort proposé → 409 ; Lumière → route dédiée', async () => {
  await setPlayerBourses(p(6).id, 3, 6);
  const e = await cast(p(6).token, { spellCode: 'SL010', teamId: lA().id });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.ok(e.body.effectEvents.some((ev) => ev.eventType === 'spell_file'));
  const again = await draft(p(6).token, { spellCode: 'SL010', teamId: lA().id });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'SPELL_LIMITE');
  assert.match(again.body.error, /trimestre/);

  await execute("UPDATE gl_spells SET statut = 'propose' WHERE spell_code = 'SL047'");
  const propose = await draft(p(6).token, { spellCode: 'SL047', teamId: lA().id });
  assert.equal(propose.status, 409, JSON.stringify(propose.body));
  assert.equal(propose.body.code, 'SPELL_NOT_OFFICIEL');
  await execute("UPDATE gl_spells SET statut = 'officiel' WHERE spell_code = 'SL047'");

  const lumiere = await draft(ctx.adminToken, { spellCode: 'SL050', teamId: lA().id });
  assert.equal(lumiere.status, 409);
  assert.equal(lumiere.body.code, 'SPELL_CLASSE');
});
