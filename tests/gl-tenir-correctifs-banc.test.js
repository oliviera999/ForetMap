'use strict';

/**
 * Correctifs relevés par le banc de simulation du 8 novembre 2026 (`tools/gl-sim`, graine 7) :
 * - une case Souffle `passTurn` fait **réellement** passer le jet suivant de l'équipe
 *   (`TOUR_PASSE`), l'avance libre du prof reste possible, l'équipe fouille et lit quand même ;
 * - l'événement `spell_cast` est privé en partie tenir : une autre équipe ne lit ni les
 *   contributions, ni les noms des lanceurs, ni les soldes (garde-fou § 1.6) ;
 * - `seuil_clos.honneurs` porte le résumé des honneurs (plus `null`) ;
 * - l'import des questions de lecture écarte une question dont la zone, présente dans le
 *   fichier, a été écartée en base (plus d'erreur de clé étrangère).
 * Fixtures anonymes.
 */

require('./helpers/setup');
const path = require('node:path');
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
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (ctx, p) => `/api/gl/games/${ctx.game.id}${p}`;
const stamp = Date.now();

async function phase(ctx, p, extra = {}) {
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: p, ...extra })
    .expect(200);
}

before(async () => {
  await initSchema();
});

test('une case Souffle « passe ton tour » fait passer le jet suivant ; avance libre du prof possible ; le tour d’après est libre', async () => {
  const ctx = await createTenirGame({ stamp: `${stamp}-pt`, plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 99 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const souffle = ctx.markers[4]; // « Souffle 1 »
  await execute('UPDATE gl_chapter_markers SET event_config_json = ? WHERE id = ?', [
    JSON.stringify({
      version: 2,
      effects: {
        gnome: { label: 'Gnome : recule de 1 case.', deltaMove: -1 },
        unicorn: { label: 'Licorne : passe ton tour.', passTurn: true },
      },
      eventMeta: { tonalite: 'souffle', rarete: null },
    }),
    souffle.id,
  ]);
  const licornes = ctx.teams[2];
  const licorne = ctx.players.find((p) => Number(p.teamId) === Number(licornes.id));
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[3].id,
    licornes.id,
  ]);
  await ouvrirTourEnJeu(request, app, ctx);
  const round1 = Number(
    (await queryOne('SELECT current_round_number AS r FROM gl_games WHERE id = ?', [ctx.game.id]))
      .r,
  );
  const libre = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', cases: 1, motif: 'test tour passé', teamId: licornes.id });
  assert.equal(libre.status, 201, JSON.stringify(libre.body));
  assert.equal(libre.body.arrival?.tourPasse, round1 + 1, 'le résumé annonce le tour passé');
  assert.match(String(libre.body.arrival?.effectSummary || ''), /passe son tour/);
  const effet = await queryOne(
    "SELECT round_number FROM gl_game_tenir_effets WHERE game_id = ? AND kind = 'tour_passe' AND team_id = ?",
    [ctx.game.id, licornes.id],
  );
  assert.equal(Number(effet.round_number), round1 + 1);
  const evt = await queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'tour_passe' AND team_id = ?",
    [ctx.game.id, licornes.id],
  );
  assert.ok(evt, 'événement tour_passe au journal');

  // Tour suivant (le dé gris dort : l'équipe n'est pas sous le voile) : le jet de l'équipe est
  // refusé, elle fouille quand même, le prof peut la porter.
  await phase(ctx, 'souffle', { dort: true });
  await phase(ctx, 'clos');
  await ouvrirTourEnJeu(request, app, ctx);
  const vue = await request(app).get(api(ctx, '/tenir/tour')).set(auth(ctx.adminToken)).expect(200);
  assert.equal(vue.body.teams.find((t) => Number(t.id) === Number(licornes.id)).tourPasse, true);
  const jet = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(licorne.token))
    .send({ mode: 'serveur' });
  assert.equal(jet.status, 409, JSON.stringify(jet.body));
  assert.equal(jet.body.code, 'TOUR_PASSE');
  assert.ok(!/faux|rat[ée]|perdu/i.test(String(jet.body.error)));
  const fouille = await request(app)
    .post(api(ctx, '/chasse/fouiller'))
    .set(auth(licorne.token))
    .send({ x: 0.9, y: 0.9 });
  assert.equal(fouille.status, 201, `fouiller reste permis : ${JSON.stringify(fouille.body)}`);
  const porte = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', cases: 1, motif: 'arbitrage', teamId: licornes.id });
  assert.equal(porte.status, 201, JSON.stringify(porte.body));

  // Tour d'après : libre à nouveau.
  await phase(ctx, 'souffle', { dort: true });
  await phase(ctx, 'clos');
  await ouvrirTourEnJeu(request, app, ctx);
  const jet2 = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(licorne.token))
    .send({ mode: 'serveur' });
  assert.ok([200, 201, 202].includes(jet2.status), JSON.stringify(jet2.body));
});

test('spell_cast est privé en partie tenir : une autre équipe ne lit ni contributions, ni lanceurs, ni soldes ; le prof lit tout ; seuil_clos porte les honneurs', async () => {
  const ctx = await createTenirGame({ stamp: `${stamp}-sc`, plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
  const licornes = ctx.teams[2];
  const licorne = ctx.players.find((p) => Number(p.teamId) === Number(licornes.id));
  const gnome = ctx.players.find((p) => Number(p.teamId) === Number(ctx.teams[0].id));
  for (const p of ctx.players.filter((x) => Number(x.teamId) === Number(licornes.id))) {
    await setPlayerBourses(p.id, 3, 5);
  }
  const d = await request(app)
    .post(api(ctx, '/spell-casts/drafts'))
    .set(auth(licorne.token))
    .send({ spellCode: 'SL037', teamId: licornes.id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const l = await request(app)
    .post(api(ctx, `/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(licorne.token));
  assert.equal(l.status, 200, JSON.stringify(l.body));

  const journalGnome = await request(app)
    .get(`/api/gl/journal/games/${ctx.game.id}`)
    .set(auth(gnome.token))
    .expect(200);
  const texte = JSON.stringify(journalGnome.body);
  assert.ok(/spell_cast/.test(texte), 'le sort figure au journal');
  assert.ok(!/"results"/.test(texte) && !/"casters"/.test(texte) && !/"contributions"/.test(texte));
  assert.ok(!/"displayName"/.test(texte) && !/"power":/.test(texte));
  const etatGnome = await request(app)
    .get(`/api/gl/games/${ctx.game.id}`)
    .set(auth(gnome.token))
    .expect(200);
  // Tout l'état (événements, replay.timeline…) : aucun lanceur ni solde d'une autre équipe.
  const texteEtat = JSON.stringify(etatGnome.body);
  assert.ok(!/"casters"/.test(texteEtat) && !/"contributions"/.test(texteEtat));
  assert.ok(!/"results":\[\{"playerId"/.test(texteEtat));
  assert.ok(Array.isArray(etatGnome.body.replay?.timeline), 'le replay reste servi');
  const journalProf = await request(app)
    .get(`/api/gl/journal/games/${ctx.game.id}`)
    .set(auth(ctx.adminToken))
    .expect(200);
  assert.ok(
    /"casters"/.test(JSON.stringify(journalProf.body)),
    'le prof relit la version complète',
  );

  await request(app).post(api(ctx, '/end')).set(auth(ctx.adminToken)).expect(200);
  const seuil = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'seuil_clos' LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(seuil.payload_json);
  assert.ok(Array.isArray(payload.honneurs), 'seuil_clos.honneurs est un tableau, pas null');
});

test('import des questions de lecture : une zone présente dans le fichier mais absente en base est écartée sans erreur', async () => {
  const { runImports } = require('../scripts/gl-import-tenir');
  const dossier = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
  await runImports(db, { fichier: 'chasse-zones', dossier });
  const zone = await queryOne("SELECT id FROM gl_chasse_zones WHERE zone_key = 'cz-p4-02' LIMIT 1");
  assert.ok(zone);
  await execute('DELETE FROM gl_game_chasse_pages WHERE zone_id = ?', [zone.id]);
  await execute('DELETE FROM gl_tenir_questions_lecture WHERE zone_key = ?', ['cz-p4-02']);
  await execute("DELETE FROM gl_chasse_zones WHERE zone_key = 'cz-p4-02'");
  try {
    const [rapport] = await runImports(db, { fichier: 'questions-lecture', dossier });
    assert.deepEqual(rapport.errors, []);
    assert.ok(rapport.warnings.some((w) => /cz-p4-02 : zone inconnue — question écartée/.test(w)));
    assert.ok(rapport.ecartees >= 1);
    const rows = await queryAll(
      'SELECT zone_key FROM gl_tenir_questions_lecture WHERE zone_key = ?',
      ['cz-p4-02'],
    );
    assert.equal(rows.length, 0);
  } finally {
    await runImports(db, { fichier: 'chasse-zones', dossier });
    await runImports(db, { fichier: 'questions-lecture', dossier });
  }
});
