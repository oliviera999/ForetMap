'use strict';

/**
 * Ensemble unifié, PR 1b, étape 1.8 (M14) — charge du prof.
 *
 * - un sort du Travail est **payé au lancement** ; le prof l'honore, ou le refuse et le rembourse ;
 * - un **Retrait** se lève tout seul à la clôture du tour ;
 * - **présences sans confirmation** (détail : `tests/gl-tenir-presences.test.js`) ;
 * - « **Copier la configuration** » d'une partie à la création de la suivante ;
 * - **mot de passe provisoire** d'un élève en un appui, montré une fois, jamais journalisé.
 *
 * Le bilan Team Spirit « 6 par défaut » est un geste d'écran : `tests-ui/gl/GLTeamSpiritPanel`.
 * Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  setPlayerBourses,
  readPlayerBourses,
  ouvrirTourEnJeu,
} = require('./helpers/glTenirFixtures');
const { isPlayerEnRetrait, listPresentMembers } = require('../lib/glTenir');
const { presentJournalEvent } = require('../lib/glJournalPresent');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');
const { DEMANDE_KINDS, DEMANDE_LIBELLES } = require('../lib/glDemandes');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p, c = ctx) => `/api/gl/games/${c.game.id}${p}`;
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const phase = (body) =>
  request(app).post(api('/tenir/tour/phase')).set(auth(ctx.adminToken)).send(body);
const sommeEquipe = async (i) => {
  let total = 0;
  for (const p of membres(i)) {
    const b = await readPlayerBourses(p.id);
    total += b.health + b.power;
  }
  return total;
};
const file = async () =>
  (await request(app).get(api('/tenir/demandes')).set(auth(ctx.adminToken)).expect(200)).body
    .demandes;

before(async () => {
  await db.initSchema();
  // Plateau 2 : « Pause » (sort du Travail) y est ouverte.
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 2 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await db.execute('UPDATE gl_game_tenir_state SET chapardeur_round = 99 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  await ouvrirTourEnJeu(request, app, ctx, { presences: false });
});

test('file du prof : plus aucune famille « présence à confirmer » ; libellés sans mot interdit', () => {
  assert.ok(!DEMANDE_KINDS.includes('presence_a_confirmer'));
  assert.deepEqual(DEMANDE_LIBELLES.sort_a_appliquer, {
    titre: 'Sort à honorer',
    action: 'Honorer',
  });
  for (const { titre, action } of Object.values(DEMANDE_LIBELLES)) {
    assert.equal(findForbiddenString(titre), null, titre);
    assert.equal(findForbiddenString(action), null, action);
  }
});

test('sort du Travail : payé dès le lancement ; « Honorer » le solde, « Refuser » le rembourse en entier', async () => {
  const eleve = membres(1)[0];
  const avant = await sommeEquipe(1);
  const lancer = async () => {
    const d = await request(app)
      .post(api('/spell-casts/drafts'))
      .set(auth(eleve.token))
      .send({ spellCode: 'SL046', teamId: team(1).id });
    assert.equal(d.status, 201, JSON.stringify(d.body));
    const l = await request(app)
      .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
      .set(auth(eleve.token));
    assert.equal(l.status, 200, JSON.stringify(l.body));
    return d.body.draft.id;
  };

  // Refusé : remboursé à l'unité près, la ligne quitte la file.
  const refuse = await lancer();
  assert.equal(await sommeEquipe(1), avant - 3, 'Pause (3) est payée au lancement');
  let lignes = await file();
  assert.deepEqual(
    lignes.map((d) => [d.kind, d.titre, d.action]),
    [['sort_a_appliquer', 'Sort à honorer', 'Honorer']],
  );
  await request(app)
    .post(api(`/spell-casts/drafts/${refuse}/refuser`))
    .set(auth(ctx.adminToken))
    .send({ mot: 'Pas aujourd’hui : on la garde pour jeudi.' })
    .expect(200);
  assert.equal(await sommeEquipe(1), avant, 'refusé : tout est rendu');
  assert.deepEqual(await file(), []);

  // Honoré : payé, soldé, la ligne quitte la file.
  const honore = await lancer();
  await request(app)
    .post(api(`/spell-casts/drafts/${honore}/effect-applied`))
    .set(auth(ctx.adminToken))
    .send({})
    .expect(200);
  assert.equal(await sommeEquipe(1), avant - 3);
  assert.deepEqual(await file(), []);
  // Honoré, il ne se refuse plus.
  const tard = await request(app)
    .post(api(`/spell-casts/drafts/${honore}/refuser`))
    .set(auth(ctx.adminToken))
    .send({});
  assert.equal(tard.status, 409, JSON.stringify(tard.body));
});

test('Retrait : levé d’office à la clôture du tour, sans toucher aux bourses ni nommer personne', async () => {
  const eleve = membres(0)[0];
  const avant = await readPlayerBourses(eleve.id);
  await request(app)
    .post(api('/tenir/retrait'))
    .set(auth(ctx.adminToken))
    .send({ playerId: eleve.id, entree: true, motif: 'bavardage' })
    .expect(200);
  assert.equal(await isPlayerEnRetrait(db, ctx.game.id, eleve.id), true);
  const tour = Number(
    (
      await db.queryOne('SELECT current_round_number AS r FROM gl_games WHERE id = ?', [
        ctx.game.id,
      ])
    ).r,
  );
  assert.ok(!(await listPresentMembers(db, ctx.game.id, team(0).id, tour)).includes(eleve.id));

  await phase({ phase: 'souffle', dort: true }).expect(200);
  assert.equal(
    await isPlayerEnRetrait(db, ctx.game.id, eleve.id),
    true,
    'encore en retrait au souffle',
  );
  await phase({ phase: 'clos' }).expect(200);

  assert.equal(await isPlayerEnRetrait(db, ctx.game.id, eleve.id), false, 'levé à la clôture');
  assert.deepEqual(await readPlayerBourses(eleve.id), avant, 'conduite hors économie');
  const evt = await db.queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'retrait' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.equal(payload.tous, true);
  assert.equal(payload.count, 1);
  assert.equal(payload.playerId, undefined, 'aucune identité dans l’évènement');
  assert.equal(payload.motif, undefined);
  const libelle = presentJournalEvent(
    { eventType: 'retrait', payload },
    { teamsById: {}, forPlayer: true, tenir: true },
  );
  assert.equal(libelle.body, 'Fin du tour : chacun revient dans la partie.');
  assert.equal(findForbiddenString(`${libelle.title} ${libelle.body}`), null);

  // Tour suivant : il joue, et rien ne se lève une seconde fois.
  await ouvrirTourEnJeu(request, app, ctx, { presences: false });
  assert.ok(
    (await listPresentMembers(db, ctx.game.id, team(0).id, tour + 1)).includes(eleve.id),
    'présent au tour suivant',
  );
  await phase({ phase: 'souffle', dort: true }).expect(200);
  await phase({ phase: 'clos' }).expect(200);
  const leves = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND event_type = 'retrait' AND JSON_EXTRACT(payload_json, '$.tous') = true",
    [ctx.game.id],
  );
  assert.equal(Number(leves.n), 1, 'un seul évènement : rien à lever au second tour');
});

test('« Copier la configuration » : profil, surface, surcharges et bascules repris ; rien de ce qui s’est joué', async () => {
  // La partie source porte une configuration choisie par le prof.
  await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({
      profil: 'court',
      overrides: { surface: 'hybride', sablier_secondes: 240, marche: true, defi_recul: 3 },
    })
    .expect(200);
  // Un état passager de séance (« Tout au tableau ») ne se copie pas.
  await db.execute(
    `UPDATE gl_games
        SET tenir_overrides_json = JSON_SET(tenir_overrides_json, '$.surface_avant_tableau', 'hybride'),
            zone_content_retrigger = 'once_per_team'
      WHERE id = ?`,
    [ctx.game.id],
  );

  const cree = await request(app).post('/api/gl/games').set(auth(ctx.adminToken)).send({
    classId: ctx.cls.id,
    chapterId: ctx.chapter.id,
    name: 'Suite',
    copyFromGameId: ctx.game.id,
  });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const copie = await db.queryOne(
    `SELECT status, tenir_profil, tenir_surface, tenir_overrides_json, zone_content_retrigger,
            current_round_number
       FROM gl_games WHERE id = ?`,
    [cree.body.game.id],
  );
  assert.equal(copie.status, 'draft');
  assert.equal(copie.tenir_profil, 'court');
  assert.equal(copie.tenir_surface, 'hybride');
  assert.deepEqual(JSON.parse(copie.tenir_overrides_json), {
    surface: 'hybride',
    sablier_secondes: 240,
    marche: true,
    defi_recul: 3,
  });
  assert.equal(copie.zone_content_retrigger, 'once_per_team');
  assert.equal(Number(copie.current_round_number) || 0, 0, 'aucun tour repris');
  const etat = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_game_tenir_state WHERE game_id = ?',
    [cree.body.game.id],
  );
  assert.equal(Number(etat.n), 0, 'ni voile, ni pages, ni Lumière');

  // Sans copie : les défauts d'avant.
  const neuve = await request(app)
    .post('/api/gl/games')
    .set(auth(ctx.adminToken))
    .send({ classId: ctx.cls.id, chapterId: ctx.chapter.id, name: 'Neuve' });
  assert.equal(neuve.status, 201, JSON.stringify(neuve.body));
  const defaut = await db.queryOne(
    'SELECT tenir_profil, tenir_overrides_json FROM gl_games WHERE id = ?',
    [neuve.body.game.id],
  );
  assert.equal(defaut.tenir_profil, 'complet');
  assert.equal(defaut.tenir_overrides_json, null);

  // Partie inconnue : refus propre, rien n'est créé.
  const inconnue = await request(app)
    .post('/api/gl/games')
    .set(auth(ctx.adminToken))
    .send({ classId: ctx.cls.id, chapterId: ctx.chapter.id, copyFromGameId: 99999999 });
  assert.ok([403, 404].includes(inconnue.status), JSON.stringify(inconnue.body));
});

test('mot de passe provisoire : un appui, montré une fois, à changer à la connexion, jamais journalisé', async () => {
  const eleve = membres(2)[0];
  const res = await request(app)
    .post(api(`/tenir/players/${eleve.id}/mot-de-passe`))
    .set(auth(ctx.adminToken))
    .send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const mdp = res.body.motDePasse;
  assert.match(mdp, /^[a-z2-9]{10}$/);
  assert.equal(res.headers['cache-control'], 'no-store');

  const compte = await db.queryOne(
    `SELECT u.id, u.password_hash, u.password_must_reset
       FROM gl_players p INNER JOIN users u ON u.id = p.linked_foretmap_user_id WHERE p.id = ?`,
    [eleve.id],
  );
  assert.equal(await bcrypt.compare(mdp, compte.password_hash), true);
  assert.equal(Number(compte.password_must_reset), 1);

  // Nulle part ailleurs que dans la réponse : ni journal d'audit, ni évènement de partie.
  const audit = await db.queryAll(
    "SELECT * FROM audit_log WHERE action = 'gl_player_reset_password' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [String(eleve.id)],
  );
  assert.equal(audit.length, 1, 'le geste est tracé');
  assert.ok(!JSON.stringify(audit).includes(mdp), 'le mot de passe n’entre pas dans le journal');
  const events = await db.queryAll('SELECT payload_json FROM gl_game_events WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.ok(!JSON.stringify(events).includes(mdp));

  // Un élève ne réinitialise personne.
  const parEleve = await request(app)
    .post(api(`/tenir/players/${eleve.id}/mot-de-passe`))
    .set(auth(membres(2)[1].token))
    .send({});
  assert.equal(parEleve.status, 403, JSON.stringify(parEleve.body));

  // Un élève d'une autre classe : introuvable depuis cette partie.
  const ailleurs = await createTenirGame({ stamp: Date.now() + 11 });
  const etranger = await request(app)
    .post(api(`/tenir/players/${ailleurs.players[0].id}/mot-de-passe`))
    .set(auth(ctx.adminToken))
    .send({});
  assert.equal(etranger.status, 404, JSON.stringify(etranger.body));

  // Un vrai compte ForêtMap ne se réécrit pas depuis le jeu.
  await db.execute("UPDATE users SET auth_provider = 'local' WHERE id = ?", [compte.id]);
  const reel = await request(app)
    .post(api(`/tenir/players/${eleve.id}/mot-de-passe`))
    .set(auth(ctx.adminToken))
    .send({});
  assert.equal(reel.status, 403, JSON.stringify(reel.body));
  assert.equal(reel.body.code, 'GL_PLAYER_REAL_ACCOUNT');
  await db.execute("UPDATE users SET auth_provider = 'gl_bridge' WHERE id = ?", [compte.id]);
});
