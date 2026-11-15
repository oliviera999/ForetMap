'use strict';

/**
 * « Tenir à deux » — sabliers réglables d'un clic (14 novembre 2026, migration 347).
 * Réglages par défaut = comportement d'avant ; le prof règle d'un clic (enregistré pour la
 * partie) ; le sablier de phase vient du serveur (même état pour la console, les tablettes et
 * la projection) ; un élève ne règle rien (403).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame } = require('./helpers/glTenirFixtures');
const {
  SABLIER_DUREES_MINUTES,
  appliquerActionSablier,
  demarrerSablier,
  formatSablier,
  normaliserEtatSablier,
  normaliserSecondesSablier,
  restantSablier,
} = require('../lib/shared/glSablierCore');
const { buildSablierView, lireReglage } = require('../lib/glSablier');
const { OVERRIDABLE_KEYS, validateOverrides } = require('../lib/glTenir');
const { presentTenirJournalEvent } = require('../lib/glJournalPresentTenir');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const regler = (token, body) => request(app).put(api('/tenir/sablier')).set(auth(token)).send(body);
const lireTenir = (token) => request(app).get(api('/tenir')).set(auth(token));

async function surface(value) {
  const row = await db.queryOne('SELECT tenir_overrides_json FROM gl_games WHERE id = ?', [
    ctx.game.id,
  ]);
  const overrides = { ...(JSON.parse(row.tenir_overrides_json || '{}') || {}), surface: value };
  await db.execute('UPDATE gl_games SET tenir_surface = ?, tenir_overrides_json = ? WHERE id = ?', [
    value,
    JSON.stringify(overrides),
    ctx.game.id,
  ]);
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await surface('hybride');
});

test('noyau pur : départ, pause, reprise, remise à zéro, formats', () => {
  assert.deepEqual(SABLIER_DUREES_MINUTES, [1, 2, 3, 5, 8, 10]);
  assert.equal(formatSablier(180), '3:00');
  assert.equal(formatSablier(7), '0:07');
  assert.equal(normaliserSecondesSablier(5), 10);
  assert.equal(normaliserSecondesSablier(99999), 3600);
  assert.equal(normaliserSecondesSablier('abc'), null);
  assert.equal(normaliserEtatSablier(null), null);
  assert.equal(normaliserEtatSablier('{mal formé'), null);

  let etat = demarrerSablier(1000);
  assert.deepEqual(restantSablier({ secondes: 300, etat, nowMs: 61000 }), {
    restantSecondes: 240,
    enPause: false,
    termine: false,
  });
  etat = appliquerActionSablier(etat, 'pause', 61000);
  assert.equal(restantSablier({ secondes: 300, etat, nowMs: 999000 }).restantSecondes, 240);
  assert.equal(restantSablier({ secondes: 300, etat, nowMs: 999000 }).enPause, true);
  assert.deepEqual(appliquerActionSablier(etat, 'pause', 70000), etat, 'pause sur pause : rien');
  etat = appliquerActionSablier(etat, 'reprise', 121000);
  assert.equal(restantSablier({ secondes: 300, etat, nowMs: 131000 }).restantSecondes, 230);
  assert.deepEqual(restantSablier({ secondes: 300, etat, nowMs: 9999000 }), {
    restantSecondes: 0,
    enPause: false,
    termine: true,
  });
  etat = appliquerActionSablier(etat, 'zero', 200000);
  assert.equal(restantSablier({ secondes: 300, etat, nowMs: 200000 }).restantSecondes, 300);
  // Remise à zéro d'un sablier en pause : il repart plein et reste en pause.
  const enPause = appliquerActionSablier(
    appliquerActionSablier(etat, 'pause', 210000),
    'zero',
    250000,
  );
  assert.deepEqual(restantSablier({ secondes: 300, etat: enPause, nowMs: 900000 }), {
    restantSecondes: 300,
    enPause: true,
    termine: false,
  });
  // Sablier jamais démarré : plein, sans erreur.
  assert.equal(restantSablier({ secondes: 120, etat: null, nowMs: 5 }).restantSecondes, 120);
});

test('vue pure : phase seulement en hybride ou tablette, pendant « jeu », sablier allumé', () => {
  const resolved = { sablier_actif: true, sablier_secondes: 180, sablier_phase_secondes: 300 };
  const round = { phase: 'jeu', sablierEtat: demarrerSablier(1000) };
  const vue = (extra) =>
    buildSablierView({ resolved, surface: 'hybride', round, nowMs: 61000, ...extra });
  assert.equal(vue().phase.restantSecondes, 240);
  assert.equal(vue({ surface: 'tablette' }).phase.restantSecondes, 240);
  assert.equal(vue({ surface: 'tableau' }).phase, null, 'au tableau : comportement inchangé');
  assert.equal(vue({ round: { phase: 'ouverture' } }).phase, null);
  assert.equal(vue({ round: null }).phase, null);
  assert.equal(vue({ resolved: { ...resolved, sablier_actif: false } }).phase, null);
  assert.equal(vue({ resolved: { ...resolved, sablier_actif: false } }).actif, false);
  assert.equal(vue({ resolved: { ...resolved, sablier_phase_secondes: 0 } }).phase, null);
  assert.equal(vue().equipeSecondes, 180);
});

test('réglages : surchargeables par partie, validés ; corps vide ou invalide refusé', () => {
  for (const key of [
    'sablier_actif',
    'sablier_secondes',
    'sablier_phase_secondes',
    'sablier_phase_auto',
  ]) {
    assert.ok(OVERRIDABLE_KEYS.includes(key), key);
  }
  assert.ok(validateOverrides({ sablier_secondes: 5 }).error);
  assert.ok(validateOverrides({ sablier_phase_secondes: 5 }).error);
  assert.deepEqual(validateOverrides({ sablier_phase_secondes: 0 }).value, {
    sablier_phase_secondes: 0,
  });
  assert.deepEqual(lireReglage({ phaseSecondes: 300, phaseAuto: true }), {
    overrides: { sablier_phase_secondes: 300, sablier_phase_auto: true },
    action: null,
  });
  assert.throws(() => lireReglage({}), /SABLIER_INVALIDE/);
  assert.throws(() => lireReglage({ action: 'exploser' }), /SABLIER_INVALIDE/);
  assert.throws(() => lireReglage({ secondes: 'abc' }), /SABLIER_INVALIDE/);
});

test('par défaut : comportement d’avant (sablier allumé, 3 minutes, aucun sablier de phase)', async () => {
  const res = await lireTenir(ctx.adminToken);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.sablier, {
    actif: true,
    equipeSecondes: 180,
    phaseSecondes: 0,
    phaseAuto: false,
    phase: null,
  });
});

test('un élève ne règle pas le sablier (403) ; un réglage invalide est refusé (400)', async () => {
  const eleve = await regler(ctx.players[0].token, { phaseSecondes: 300 });
  assert.equal(eleve.status, 403, JSON.stringify(eleve.body));
  const invalide = await regler(ctx.adminToken, { phaseSecondes: 5 });
  assert.equal(invalide.status, 400, JSON.stringify(invalide.body));
  assert.equal(invalide.body.code, 'SABLIER_INVALIDE');
  const vide = await regler(ctx.adminToken, {});
  assert.equal(vide.status, 400);
});

test('durée changée d’un clic : enregistrée pour la partie, conservée après rechargement, lue par tous', async () => {
  await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken)).expect(200);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' })
    .expect(200);

  const res = await regler(ctx.adminToken, { phaseSecondes: 300, phaseAuto: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.sablier.phaseSecondes, 300);
  assert.equal(res.body.sablier.phaseAuto, true);
  assert.ok(res.body.sablier.phase.restantSecondes > 295);
  assert.equal(res.body.sablier.phase.auto, true);

  // « Rechargement » : la surcharge est en base, la surface n'a pas bougé.
  const row = await db.queryOne('SELECT tenir_overrides_json FROM gl_games WHERE id = ?', [
    ctx.game.id,
  ]);
  const overrides = JSON.parse(row.tenir_overrides_json);
  assert.equal(overrides.sablier_phase_secondes, 300);
  assert.equal(overrides.sablier_phase_auto, true);
  assert.equal(overrides.surface, 'hybride', 'les autres surcharges sont gardées');

  for (const token of [ctx.adminToken, ctx.players[0].token]) {
    const tenir = await lireTenir(token);
    assert.equal(tenir.status, 200);
    assert.equal(tenir.body.settings.sablier_phase_secondes, 300);
    assert.equal(tenir.body.sablier.phase.secondes, 300);
    const tour = await request(app).get(api('/tenir/tour')).set(auth(token));
    assert.equal(tour.body.sablier.phase.secondes, 300);
  }
  // L'évènement prévient les écrans ; il a son libellé au journal.
  const evt = await db.queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'sablier_regle' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).phaseSecondes, 300);
  assert.equal(JSON.parse(evt.payload_json).regle, 'phase');
});

test('pause, reprise, remise à zéro ; la durée du sablier de l’équipe active se règle aussi', async () => {
  const pause = await regler(ctx.adminToken, { action: 'pause' });
  assert.equal(pause.status, 200, JSON.stringify(pause.body));
  assert.equal(pause.body.sablier.phase.enPause, true);
  const reprise = await regler(ctx.adminToken, { action: 'reprise' });
  assert.equal(reprise.body.sablier.phase.enPause, false);
  // On vieillit le départ de deux minutes, puis remise à zéro : le sablier repart plein.
  await db.execute(
    'UPDATE gl_game_rounds SET sablier_json = ? WHERE game_id = ? AND round_number = 1',
    [JSON.stringify(demarrerSablier(Date.now() - 120000)), ctx.game.id],
  );
  const avant = await lireTenir(ctx.adminToken);
  assert.ok(avant.body.sablier.phase.restantSecondes <= 181);
  const zero = await regler(ctx.adminToken, { action: 'zero' });
  assert.ok(zero.body.sablier.phase.restantSecondes > 295);

  const equipe = await regler(ctx.adminToken, { secondes: 120 });
  assert.equal(equipe.body.sablier.equipeSecondes, 120);
  assert.ok(
    equipe.body.sablier.phase.restantSecondes > 295,
    'le sablier de phase n’est pas relancé',
  );
});

test('sablier éteint : plus aucun sablier de phase servi ; rallumé, il revient', async () => {
  const off = await regler(ctx.adminToken, { actif: false });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal(off.body.sablier.actif, false);
  assert.equal(off.body.sablier.phase, null);
  const eleve = await lireTenir(ctx.players[0].token);
  assert.equal(eleve.body.sablier.actif, false);
  assert.equal(eleve.body.sablier.phase, null);
  const on = await regler(ctx.adminToken, { actif: true });
  assert.equal(on.body.sablier.phase.secondes, 300);
});

test('au tableau : pas de sablier de phase, même réglé (comportement inchangé)', async () => {
  await surface('tableau');
  const res = await lireTenir(ctx.adminToken);
  assert.equal(res.body.sablier.phaseSecondes, 300);
  assert.equal(res.body.sablier.phase, null);
  assert.equal(res.body.sablier.equipeSecondes, 120);
  await surface('hybride');
});

test('un nouveau tour : le sablier de phase repart à l’entrée en « jeu »', async () => {
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true })
    .expect(200);
  const souffle = await lireTenir(ctx.adminToken);
  assert.equal(souffle.body.sablier.phase, null, 'hors phase « jeu » : pas de sablier de phase');
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken)).expect(200);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' })
    .expect(200);
  const jeu = await lireTenir(ctx.adminToken);
  assert.ok(jeu.body.sablier.phase.restantSecondes > 295);
  assert.equal(jeu.body.sablier.phase.enPause, false);
});

test('journal : le libellé dit le geste du prof, pas l’état courant du sablier', () => {
  const etat = { actif: true, equipeSecondes: 120, phaseSecondes: 300, phaseAuto: true };
  const corps = (extra) => presentTenirJournalEvent('sablier_regle', { ...etat, ...extra }).body;
  assert.equal(corps({ regle: 'phase' }), 'Sablier du tour : 5 min.');
  assert.equal(corps({ regle: 'phase', phaseSecondes: 0 }), 'Le tour se joue sans sablier.');
  assert.equal(corps({ regle: 'equipe' }), 'Sablier de l’équipe active : 2 min.');
  assert.equal(corps({ regle: 'auto' }), 'À la fin du sablier, le tour passera au souffle.');
  assert.equal(corps({ regle: 'actif' }), 'Le sablier est allumé.');
  assert.equal(corps({ regle: 'actif', actif: false }), 'Le sablier est éteint.');
  assert.equal(corps({ regle: 'action', action: 'pause' }), 'Le sablier est en pause.');
  assert.equal(corps({ regle: 'action', action: 'zero' }), 'Le sablier repart de zéro.');
});
