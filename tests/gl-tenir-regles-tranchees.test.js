'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.10 — règles tranchées par l'audit : Marché éteint d'office
 * au chapitre 1, profil `court` (Marché et lecture en veillée), Boussole sortie du grimoire,
 * Farce refusée sur une équipe sous le voile. La fouille sous le voile (ancien réglage
 * `fouille_sous_voile`) est remplacée par `fouilles_sous_voile` (ensemble unifié, M2) :
 * `tests/gl-ensemble-unifie-fouilles.test.js`.
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
const {
  TENIR_PROFILS,
  PROFIL_ECARTS,
  resolveTenirSettings,
  resolveTenirPermissions,
} = require('../lib/glTenir');
const { getGameplaySettings, GL_SETTINGS_REGISTRY } = require('../lib/glSettings');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p, c = ctx) => `/api/gl/games/${c.game.id}${p}`;
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 2 });
  await importExempleChasse(db, { game: ctx.game });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
});

test('réglages nouveaux : défauts qui gardent le comportement d’avant, profil court déclaré', async () => {
  const settings = await getGameplaySettings();
  const resolved = resolveTenirSettings(settings, { tenir_profil: 'complet' });
  assert.equal(resolved.lecture_pendant_tour, true);
  if (GL_SETTINGS_REGISTRY) {
    assert.ok(GL_SETTINGS_REGISTRY['gameplay.tenir_lecture_pendant_tour']);
    assert.equal(GL_SETTINGS_REGISTRY['gameplay.tenir_fouille_sous_voile'], undefined);
  }
  assert.deepEqual(TENIR_PROFILS, ['complet', 'prologue', 'court']);
  assert.deepEqual(PROFIL_ECARTS.court, {
    marche_pendant_tour: false,
    lecture_pendant_tour: false,
  });
  const court = resolveTenirSettings(settings, { tenir_profil: 'court' });
  assert.equal(court.marche_pendant_tour, false);
  assert.equal(court.lecture_pendant_tour, false);
  // Fichier de réglages : mêmes défauts, même profil.
  const fichier = require('../data/gl/tenir/reglages-defaut.json');
  assert.equal(fichier.defaut.lecture_pendant_tour, true);
  assert.equal(fichier.defaut.fouille_sous_voile, undefined);
  assert.deepEqual(fichier.profils.court.ecarts, PROFIL_ECARTS.court);
});

test('Marché au chapitre 1 : éteint d’office à la création d’une partie du plateau 1, modifiable ; pas ailleurs', async () => {
  const chapitre = async (plateau) =>
    db.queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
      `tenir-ex-plateau-${plateau}`,
    ]);
  const creer = async (plateau, name) =>
    request(app)
      .post('/api/gl/games')
      .set(auth(ctx.adminToken))
      .send({ classId: ctx.cls.id, chapterId: (await chapitre(plateau)).id, name });
  const p1 = await creer(1, `Partie plateau 1 ${Date.now()}`);
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  assert.equal(p1.body.tenir.settings.marche, false, 'Marché éteint au chapitre 1');
  assert.deepEqual(p1.body.tenir.settings.overrides, { marche: false });
  // Le prof le rallume d'un clic (surcharge de la partie).
  const rallume = await request(app)
    .put(`/api/gl/games/${p1.body.game.id}/tenir/profil`)
    .set(auth(ctx.adminToken))
    .send({ overrides: { marche: true } });
  assert.equal(rallume.status, 200, JSON.stringify(rallume.body));
  assert.equal(rallume.body.settings.marche, true);

  const p2 = await creer(2, `Partie plateau 2 ${Date.now()}`);
  assert.equal(p2.status, 201, JSON.stringify(p2.body));
  assert.equal(p2.body.tenir.settings.marche, true);
  assert.deepEqual(p2.body.tenir.settings.overrides, {});
  // Une partie existante ne change pas.
  const existante = await request(app).get(api('/tenir')).set(auth(ctx.adminToken));
  assert.equal(existante.body.settings.marche, true);
});

test('profil court : pendant le tour, lire et tenir une page affichent « À lire en veillée » ; tout reste ouvert hors tour', async () => {
  const permissions = (phase, extra = {}) =>
    resolveTenirPermissions({
      surface: 'tablette',
      phase,
      actorKind: 'player',
      settings: { marche: true, marche_pendant_tour: false, lecture_pendant_tour: false },
      ...extra,
    });
  assert.equal(permissions('jeu').lire, false);
  assert.equal(permissions('jeu').marche, false);
  assert.equal(permissions('jeu').lancer, true, 'le tour se joue');
  assert.equal(permissions('clos').lire, true);
  assert.equal(permissions(null).lire, true);
  assert.equal(permissions(null).marche, true);
  assert.equal(permissions('jeu', { actorKind: 'mj' }).lire, true, 'le prof garde la main');

  const profil = await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ profil: 'court', overrides: { surface: 'tablette' } });
  assert.equal(profil.status, 200, JSON.stringify(profil.body));
  assert.equal(profil.body.settings.lecture_pendant_tour, false);
  const zone = await db.queryOne(
    `SELECT z.id, z.zone_key FROM gl_chasse_zones z
       INNER JOIN gl_game_chasse_pages p ON p.zone_id = z.id AND p.game_id = ? ORDER BY z.id ASC LIMIT 1`,
    [ctx.game.id],
  );
  await db.execute(
    "UPDATE gl_game_chasse_pages SET etat = 'trouvee', trouvee_par_team_id = ?, trouvee_at = NOW() WHERE game_id = ? AND zone_id = ?",
    [team(0).id, ctx.game.id, zone.id],
  );
  const ouvrir = (token) =>
    request(app)
      .post(api(`/chasse/pages/${zone.zone_key}/ouvrir`))
      .set(auth(token))
      .send({});
  // Hors tour (veillée) : la page se lit.
  const veillee = await ouvrir(membres(2)[0].token);
  assert.equal(veillee.status, 200, JSON.stringify(veillee.body));

  await ouvrirTourEnJeu(request, app, ctx);
  const etat = await request(app)
    .get(api(''))
    .set(auth(membres(2)[0].token));
  assert.equal(etat.body.tenir.permissions.lire, false);
  assert.equal(etat.body.tenir.permissions.marche, false);
  const pendant = await ouvrir(membres(2)[0].token);
  assert.equal(pendant.status, 409, JSON.stringify(pendant.body));
  assert.equal(pendant.body.code, 'LECTURE_EN_VEILLEE');
  assert.equal(pendant.body.error, 'À lire en veillée.');
  assert.equal(findForbiddenString(pendant.body.error), null);
  const invalide = await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ profil: 'express' });
  assert.equal(invalide.status, 400);
  await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ profil: 'complet', overrides: { surface: 'tablette' } })
    .expect(200);
});

test('Boussole : sortie du grimoire (non lançable, absente des sorts de l’équipe), son information est servie gratuitement', async () => {
  const row = await db.queryOne("SELECT statut FROM gl_spells WHERE spell_code = 'SL038' LIMIT 1");
  assert.equal(row.statut, 'propose', 'en base, non lançable');
  const fichier = require('../data/gl/tenir/sorts.json');
  assert.equal(fichier.sorts.find((s) => s.code === 'SL038').actif, false);
  const sorts = await request(app)
    .get(api('/tenir/sorts'))
    .set(auth(membres(2)[0].token));
  assert.equal(sorts.status, 200, JSON.stringify(sorts.body));
  assert.ok(
    !sorts.body.moments.some((m) => m.sorts.some((s) => s.code === 'SL038')),
    'absente de l’écran d’équipe',
  );
  const pot = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(2)[0].token))
    .send({ spellCode: 'SL038', teamId: team(2).id });
  assert.ok([400, 409].includes(pot.status), JSON.stringify(pot.body));
  const vue = await request(app)
    .get(api('/tenir/tour'))
    .set(auth(membres(2)[0].token));
  const mienne = vue.body.teams.find((t) => Number(t.id) === Number(team(2).id));
  assert.ok(mienne.casesAVenir.length > 0, 'les cases à venir sont affichées sans rien payer');
});

test('Farce : refusée si l’équipe visée est sous le voile, sans débit', async () => {
  // Le voile recouvre la case des Gnomes B (rang 1).
  await db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[1].id,
    team(1).id,
  ]);
  await db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id IN (?, ?)', [
    ctx.markers[6].id,
    team(0).id,
    team(3).id,
  ]);
  await db.execute('UPDATE gl_game_tenir_state SET voile_position = 2 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const farce = async (cible) => {
    const d = await request(app)
      .post(api('/spell-casts/drafts'))
      .set(auth(membres(3)[0].token))
      .send({
        spellCode: 'SL036',
        teamId: team(3).id,
        ressource: 'gemmes',
        effectParams: { targetTeamId: cible },
      });
    if (d.status !== 201) return d;
    return request(app)
      .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
      .set(auth(membres(3)[0].token));
  };
  const avant = await db.queryOne(
    'SELECT SUM(power_points) AS g FROM gl_players WHERE id IN (?, ?)',
    membres(3).map((m) => m.id),
  );
  const refus = await farce(team(1).id);
  assert.equal(refus.status, 409, JSON.stringify(refus.body));
  assert.equal(refus.body.code, 'SPELL_CIBLE_SOUS_VOILE');
  assert.equal(refus.body.error, 'Cette équipe résiste déjà au voile : choisissez-en une autre.');
  assert.equal(findForbiddenString(refus.body.error), null);
  const apres = await db.queryOne(
    'SELECT SUM(power_points) AS g FROM gl_players WHERE id IN (?, ?)',
    membres(3).map((m) => m.id),
  );
  assert.equal(Number(apres.g), Number(avant.g), 'rien n’est débité');
  // Une équipe hors du voile, elle, danse.
  const ok = await farce(team(0).id);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});
