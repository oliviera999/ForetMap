'use strict';

/**
 * Correctifs relevés par le banc de simulation du 8 novembre 2026 (`tools/gl-sim`, graine 7) :
 * - (la case Souffle « passe ton tour » a disparu avec l'ensemble unifié, M3 : un seul dé au
 *   tour suivant, cf. `tests/gl-ensemble-unifie-souffle.test.js`) ;
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

before(async () => {
  await initSchema();
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
