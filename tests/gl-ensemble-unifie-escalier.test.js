'use strict';

/**
 * Ensemble unifié, PR 2, étape 2.1 (M8) — l'escalier du chapitre 1, de bout en bout.
 * Au plateau 1, ce qui est ouvert dépend du nombre de tours clos :
 *   1. avancer, chercher, défi de case, défis de la Trame ;
 *   2. tenir, l'erreur du jour d'Olu ;
 *   3. le voile, la page témoin, trois sorts, la jauge de Lumière ;
 *   4. le Marché, trois sorts de plus.
 * Le serveur le rejoue (réglages résolus, droits, sorts) ; le prof peut ouvrir la suite d'un
 * appui, jamais reculer. Le profil `prologue` a disparu.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  setGlSetting,
} = require('./helpers/glTenirFixtures');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { presentJournalEvent } = require('../lib/glJournalPresent');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const prof = () => auth(ctx.adminToken);
const equipe = (type, i = 0) => ctx.teams.filter((t) => t.type === type)[i];
const membre = (team) => ctx.players.find((p) => Number(p.teamId) === Number(team.id));
const tenir = async () => (await request(app).get(api('/tenir')).set(prof())).body;
const phase = (nom, extra = {}) =>
  request(app)
    .post(api('/tenir/tour/phase'))
    .set(prof())
    .send({ phase: nom, ...extra });
const evenements = async (type) =>
  db.queryAll(
    'SELECT id, payload_json FROM gl_game_events WHERE game_id = ? AND event_type = ? ORDER BY id ASC',
    [ctx.game.id, type],
  );
const zoneId = async (zoneKey) =>
  Number((await db.queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', [zoneKey])).id);
const etatPage = async (zoneKey) =>
  String(
    (
      await db.queryOne(
        'SELECT etat FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ? LIMIT 1',
        [ctx.game.id, await zoneId(zoneKey)],
      )
    ).etat,
  );
/** Clôt le tour en cours (souffle puis clos) : une séance de plus. */
async function cloreLeTour() {
  const souffle = await phase('souffle');
  assert.equal(souffle.status, 200, JSON.stringify(souffle.body));
  const clos = await phase('clos');
  assert.equal(clos.status, 200, JSON.stringify(clos.body));
  return { souffle: souffle.body, clos: clos.body };
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({
    stamp: Date.now(),
    overrides: { escalier: true, escalier_pas: 1 },
  });
  await importExempleChasse(db, { game: ctx.game });
  await setGlSetting('gameplay.tenir_escalier', true);
});

after(async () => {
  await setGlSetting('gameplay.tenir_escalier', true);
});

test('création : une partie du plateau 1 monte l’escalier ; pas ailleurs, pas si le réglage est coupé, et une copie repart de la première marche', async () => {
  const chapitre = async (plateau) =>
    db.queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
      `tenir-ex-plateau-${plateau}`,
    ]);
  const creer = async (plateau, extra = {}) =>
    request(app)
      .post('/api/gl/games')
      .set(prof())
      .send({
        classId: ctx.cls.id,
        chapterId: (await chapitre(plateau)).id,
        name: `Escalier P${plateau} ${Date.now()}`,
        ...extra,
      });
  const p1 = await creer(1);
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  assert.deepEqual(p1.body.tenir.settings.overrides, { escalier: true, escalier_pas: 1 });
  assert.deepEqual(p1.body.tenir.escalier, {
    pas: 1,
    dernier: 4,
    monte: false,
    modules: ['avancer', 'chercher', 'defi_case', 'trame'],
    sorts: [],
    prochaine: { seance: 2, modules: ['tenir', 'erreur_du_jour'], sorts: [] },
  });
  assert.equal(p1.body.tenir.settings.voile, false);
  assert.equal(p1.body.tenir.settings.marche, false);
  const p2 = await creer(2);
  assert.equal(p2.body.tenir.escalier, null);
  assert.deepEqual(p2.body.tenir.settings.overrides, {});
  // Copier la configuration d'une partie avancée : les surcharges suivent, pas sa séance.
  await db.execute('UPDATE gl_games SET tenir_overrides_json = ? WHERE id = ?', [
    JSON.stringify({ escalier: true, escalier_pas: 4, peripeties: false }),
    p1.body.game.id,
  ]);
  const copie = await creer(1, { copyFromGameId: p1.body.game.id });
  assert.deepEqual(copie.body.tenir.settings.overrides, {
    peripeties: false,
    escalier: true,
    escalier_pas: 1,
  });
  const versP2 = await creer(2, { copyFromGameId: p1.body.game.id });
  assert.deepEqual(versP2.body.tenir.settings.overrides, { peripeties: false });
  // Réglage coupé : une partie neuve du plateau 1 ouvre tout d'emblée (plus de Marché éteint).
  await setGlSetting('gameplay.tenir_escalier', false);
  const sans = await creer(1);
  assert.equal(sans.body.tenir.escalier, null);
  assert.equal(sans.body.tenir.settings.marche, true);
  await setGlSetting('gameplay.tenir_escalier', true);
});

test('séance 1 : on avance et on cherche ; ni voile, ni erreur du jour, ni sort, ni Marché ; la page trouvée se lit, elle ne se tient pas encore', async () => {
  const ouvert = await ouvrirTourEnJeu(request, app, ctx);
  assert.equal(ouvert.roundNumber, 1);
  const vue = await tenir();
  assert.equal(vue.escalier.pas, 1);
  assert.deepEqual([vue.settings.voile, vue.settings.marche], [false, false]);
  assert.equal(vue.permissions.tenir, false, 'le prof monte le même escalier');
  assert.equal(vue.permissions.lancer, true);
  // Pas d'erreur du jour avant la séance 2.
  assert.equal(vue.round.oluErreur, null);
  assert.equal((await evenements('olu_erreur')).length, 0);

  // Une page trouvée par des Gnomes : une Licorne la lit, sans question ; tenir est refusé.
  const gnomes = equipe('gnome');
  const licorne = membre(equipe('unicorn'));
  await db.execute(
    `UPDATE gl_game_chasse_pages SET etat = 'trouvee', trouvee_par_team_id = ?, trouvee_at = NOW()
      WHERE game_id = ? AND zone_id = ?`,
    [gnomes.id, ctx.game.id, await zoneId('cz-p1-01')],
  );
  const lue = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licorne.token));
  assert.equal(lue.status, 200, JSON.stringify(lue.body));
  assert.ok(lue.body.feuillet.titre);
  assert.equal(lue.body.peutTenir, false);
  assert.equal(lue.body.question, null);
  const carnet = await request(app).get(api('/chasse')).set(auth(licorne.token));
  assert.equal(
    carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-01').attendUnLecteur,
    false,
    '« attend un lecteur » ne se dit pas encore',
  );

  // Les sorts : aucun n'est montré, aucun ne se prépare — pour l'équipe comme pour le prof.
  const sorts = await request(app)
    .get(api(`/tenir/sorts?teamId=${gnomes.id}`))
    .set(prof());
  assert.equal(sorts.status, 200, JSON.stringify(sorts.body));
  assert.deepEqual(
    sorts.body.moments.flatMap((m) => m.sorts),
    [],
  );
  for (const jeton of [membre(gnomes).token, ctx.adminToken]) {
    const refus = await request(app)
      .post(api('/spell-casts/drafts'))
      .set(auth(jeton))
      .send({ spellCode: 'SL002', teamId: gnomes.id });
    assert.equal(refus.status, 409, JSON.stringify(refus.body));
    assert.equal(refus.body.code, 'SPELL_ESCALIER');
    assert.equal(findForbiddenString(refus.body.error), null);
  }
  // Le Marché : fermé.
  const marche = await request(app).get('/api/gl/market/annonces').set(auth(licorne.token));
  assert.equal(marche.status, 403);
  assert.equal(marche.body.code, 'MARCHE_FERME');

  // Les cartes Team Spirit gardées comptent déjà, mais la jauge n'est pas encore montrée et un
  // palier ne tombe pas avant la séance 3.
  await db.execute(
    `INSERT INTO gl_game_lumiere (game_id, total, paliers_json, updated_at) VALUES (?, 97, '[]', NOW())
     ON DUPLICATE KEY UPDATE total = 97, paliers_json = '[]'`,
    [ctx.game.id],
  );
  const bilan = await request(app)
    .put(api('/tenir/tour/team-spirit'))
    .set(prof())
    .send({ bilans: [{ teamId: gnomes.id, cartesGardees: 6 }] });
  assert.equal(bilan.status, 200, JSON.stringify(bilan.body));
  const jauge = await db.queryOne('SELECT total FROM gl_game_lumiere WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.equal(Number(jauge.total), 103, 'la jauge monte sans palier');
  assert.equal((await evenements('lumiere_palier')).length, 0);
  assert.equal((await evenements('voile_recul')).length, 0);
  const spirit = await request(app).get(api('/tenir/tour/team-spirit')).set(prof());
  assert.equal(spirit.body.lumiere.active, false, 'jauge pas encore montrée');

  // La phase du souffle passe sans dé gris : ni « le voile avance », ni « le voile dort ».
  const fin = await cloreLeTour();
  assert.equal(fin.souffle.souffle.ferme, true);
  assert.deepEqual(fin.souffle.souffle.faces, []);
  assert.equal((await evenements('voile_avance')).length, 0);
  assert.equal((await evenements('voile_dort')).length, 0);
  const etat = await db.queryOne(
    'SELECT voile_position FROM gl_game_tenir_state WHERE game_id = ?',
    [ctx.game.id],
  );
  assert.equal(Number(etat.voile_position), -1);
});

test('séance 2 : la clôture du tour monte une marche — tenir s’ouvre (dès la veillée), l’erreur du jour arrive', async () => {
  const vue = await tenir();
  assert.equal(vue.escalier.pas, 2, 'tours clos + 1');
  assert.deepEqual(vue.settings.overrides, { escalier: true, escalier_pas: 2 });
  const marches = await evenements('escalier_pas');
  assert.equal(marches.length, 1);
  assert.deepEqual(JSON.parse(marches[0].payload_json), {
    pas: 2,
    modules: ['tenir', 'erreur_du_jour'],
    sorts: [],
    motif: 'tour_clos',
    roundNumber: 1,
  });
  // Libellé de journal : pour le prof, sans mot interdit.
  const libelle = presentJournalEvent({
    eventType: 'escalier_pas',
    payload: JSON.parse(marches[0].payload_json),
  });
  assert.match(libelle.title, /Séance 2/);
  assert.equal(findForbiddenString(`${libelle.title} ${libelle.body}`), null);

  // En veillée déjà, la page trouvée attend un lecteur de l'autre peuple : elle se tient.
  const licorne = membre(equipe('unicorn'));
  const ouverte = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licorne.token));
  assert.equal(ouverte.status, 200, JSON.stringify(ouverte.body));
  assert.equal(ouverte.body.peutTenir, true);
  assert.ok(ouverte.body.question.presentationToken);

  await db.execute(
    `INSERT INTO gl_tenir_olu_lignes (id, moment, expression, texte, variables_json, correction, actif)
     VALUES ('olu-esc-t1', 'erreur', 'neutre', 'Le zèbre mange des lions.', '[]', 'Le zèbre broute.', 1)
     ON DUPLICATE KEY UPDATE actif = 1`,
  );
  await ouvrirTourEnJeu(request, app, ctx);
  const tour = await tenir();
  assert.ok(tour.round.oluErreur?.texte, 'l’erreur du jour est tirée à la séance 2');
  assert.equal(tour.permissions.tenir, true);
  assert.equal(tour.settings.voile, false, 'le voile attend la séance 3');
  // Pas de page témoin avant la séance 3.
  assert.equal((await evenements('page_temoin')).length, 0);
});

test('« Ouvrir la suite » : le prof monte une marche tout de suite — le voile, trois sorts, et la page témoin se pose', async () => {
  const refuse = await request(app)
    .post(api('/tenir/escalier/suite'))
    .set(auth(membre(equipe('gnome')).token));
  assert.equal(refuse.status, 403, 'réservé au prof');

  assert.equal(await etatPage('cz-p1-02'), 'endormie');
  const suite = await request(app).post(api('/tenir/escalier/suite')).set(prof());
  assert.equal(suite.status, 200, JSON.stringify(suite.body));
  assert.equal(suite.body.escalier.pas, 3);
  assert.deepEqual(suite.body.ouvert, {
    modules: ['voile', 'page_temoin', 'sorts', 'lumiere'],
    sorts: ['SL002', 'SL037', 'SL039', 'SL042', 'SL044'],
  });
  // La page témoin : la zone encore endormie la plus proche du départ pâlit, une seule fois.
  const temoins = await evenements('page_temoin');
  assert.equal(temoins.length, 1);
  assert.equal(JSON.parse(temoins[0].payload_json).zoneKey, 'cz-p1-02');
  assert.equal(await etatPage('cz-p1-02'), 'palie');
  assert.equal(await etatPage('cz-p1-01'), 'trouvee', 'une page trouvée n’est pas touchée');
  const libelle = presentJournalEvent({
    eventType: 'page_temoin',
    payload: JSON.parse(temoins[0].payload_json),
  });
  assert.equal(findForbiddenString(`${libelle.title} ${libelle.body}`), null);
  // Une zone pâlie ne se fouille que par des Gnomes : c'est la réparation, sans danger.
  const zone = await db.queryOne(
    'SELECT centre_x, centre_y FROM gl_chasse_zones WHERE zone_key = ?',
    ['cz-p1-02'],
  );
  const point = { x: Number(zone.centre_x), y: Number(zone.centre_y) };
  const licorne = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(membre(equipe('unicorn')).token))
    .send(point);
  assert.equal(licorne.status, 201, JSON.stringify(licorne.body));
  assert.equal(licorne.body.verdict, 'palie');
  assert.equal(licorne.body.reservee, 'gnome');
  const gnome = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(membre(equipe('gnome')).token))
    .send(point);
  assert.equal(gnome.status, 201, JSON.stringify(gnome.body));
  assert.equal(gnome.body.verdict, 'zone');
  assert.ok(gnome.body.question, 'la question de zone est posée aux Gnomes');

  // Trois sorts pour chaque peuple : Progression et les deux du peuple. L'écran ne montre que
  // ce qui est lançable et payable à cet instant : jamais un sort d'une marche pas montée.
  const codes = async (team) =>
    (
      await request(app)
        .get(api(`/tenir/sorts?teamId=${team.id}`))
        .set(prof())
    ).body.moments.flatMap((m) => m.sorts.map((s) => s.code));
  const gnomes = await codes(equipe('gnome'));
  assert.ok(gnomes.length > 0, 'des sorts sont montrés aux Gnomes');
  assert.ok(
    gnomes.every((c) => ['SL002', 'SL042', 'SL044'].includes(c)),
    gnomes.join(' '),
  );
  const licornes = await codes(equipe('unicorn'));
  assert.ok(licornes.length > 0, 'des sorts sont montrés aux Licornes');
  assert.ok(
    licornes.every((c) => ['SL002', 'SL037', 'SL039'].includes(c)),
    licornes.join(' '),
  );
  // Un sort de la marche se prépare ; Relance attend la séance 4.
  const relais = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(prof())
    .send({ spellCode: 'SL044', teamId: equipe('gnome').id });
  assert.equal(relais.status, 201, JSON.stringify(relais.body));
  const relance = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(prof())
    .send({ spellCode: 'SL005', teamId: equipe('gnome').id });
  assert.equal(relance.body.code, 'SPELL_ESCALIER', 'Relance attend la séance 4');

  // La jauge de Lumière se montre ; le palier resté en attente tombe au premier ajout.
  const spirit = await request(app).get(api('/tenir/tour/team-spirit')).set(prof());
  assert.equal(spirit.body.lumiere.active, true);
  const corrige = await request(app)
    .post(api('/tenir/tour/olu-corrige'))
    .set(prof())
    .send({ teamId: equipe('gnome').id });
  assert.equal(corrige.status, 200, JSON.stringify(corrige.body));
  assert.equal((await evenements('lumiere_palier')).length, 1);
  assert.equal(
    Number(
      (await db.queryOne('SELECT total FROM gl_game_lumiere WHERE game_id = ?', [ctx.game.id]))
        .total,
    ),
    4,
    '103 + 1 − 100',
  );

  // Le dé gris se lance : le voile avance pour la première fois.
  const souffle = await phase('souffle', { faces: [2] });
  assert.equal(souffle.status, 200, JSON.stringify(souffle.body));
  assert.equal(souffle.body.souffle.ferme, undefined);
  assert.deepEqual(souffle.body.souffle.faces, [2]);
  assert.equal((await evenements('voile_avance')).length, 1);
  assert.equal((await phase('clos')).status, 200);
});

test('séance 4 et après : le Marché et les trois derniers sorts ; l’escalier est monté, il ne redescend jamais', async () => {
  const vue = await tenir();
  assert.equal(vue.escalier.pas, 4, 'deux tours clos + une avance du prof');
  assert.equal(vue.escalier.monte, true);
  assert.equal(vue.escalier.prochaine, null);
  assert.equal(vue.settings.marche, true);
  const licorne = membre(equipe('unicorn'));
  assert.equal(
    (await request(app).get('/api/gl/market/annonces').set(auth(licorne.token))).status,
    200,
  );
  await ouvrirTourEnJeu(request, app, ctx);
  // Les trois derniers sorts se préparent : Relance, Farce, Question.
  for (const spellCode of ['SL036', 'SL004']) {
    const pret = await request(app)
      .post(api('/spell-casts/drafts'))
      .set(prof())
      .send({ spellCode, teamId: equipe('unicorn').id });
    assert.notEqual(pret.body.code, 'SPELL_ESCALIER', `${spellCode} ouvert à la séance 4`);
  }
  // La page témoin ne se repose pas.
  assert.equal((await evenements('page_temoin')).length, 1);

  const haut = await request(app).post(api('/tenir/escalier/suite')).set(prof());
  assert.equal(haut.status, 409);
  assert.equal(haut.body.code, 'ESCALIER_MONTE');
  // Clore un tour de plus ne change rien, et n'écrit plus de marche.
  await cloreLeTour();
  assert.equal((await tenir()).escalier.pas, 4);
  assert.equal((await evenements('escalier_pas')).length, 3);

  // Le pas ne se choisit pas : un profil renvoyé avec un pas plus petit le garde tel quel.
  const profil = (overrides) =>
    request(app).put(api('/tenir/profil')).set(prof()).send({ profil: 'complet', overrides });
  const recul = await profil({ surface: 'tablette', escalier: true, escalier_pas: 1 });
  assert.equal(recul.status, 200, JSON.stringify(recul.body));
  assert.equal(recul.body.settings.escalier_pas, 4);
  // Coupé : tout est ouvert, « Ouvrir la suite » n'a plus d'objet.
  const coupe = await profil({ surface: 'tablette', escalier: false });
  assert.equal(coupe.body.settings.escalier, false);
  assert.equal((await tenir()).escalier, null);
  const inactif = await request(app).post(api('/tenir/escalier/suite')).set(prof());
  assert.equal(inactif.status, 409);
  assert.equal(inactif.body.code, 'ESCALIER_INACTIF');
  // Remis : il repart de la séance en cours (tours clos + 1, borné à la dernière marche).
  const remis = await profil({ surface: 'tablette', escalier: true });
  assert.equal(remis.body.settings.escalier_pas, 4);

  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
});

test('une partie hors escalier garde toutes ses règles dès le premier tour (plateau 2, ou escalier coupé)', async () => {
  const autre = await createTenirGame({ stamp: Date.now() + 7, plateau: 2 });
  const vue = (await request(app).get(`/api/gl/games/${autre.game.id}/tenir`).set(prof())).body;
  assert.equal(vue.escalier, null);
  assert.deepEqual([vue.settings.voile, vue.settings.marche], [true, true]);
  assert.equal(vue.permissions.tenir, true);
  const suite = await request(app)
    .post(`/api/gl/games/${autre.game.id}/tenir/escalier/suite`)
    .set(prof());
  assert.equal(suite.status, 409);
  assert.equal(suite.body.code, 'ESCALIER_INACTIF');
});

test('migration 368 : une partie restée en profil prologue passe en complet, avec l’escalier à sa séance', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '368_gl_ensemble_unifie_escalier.sql'),
    'utf8',
  );
  const update = sql.slice(sql.indexOf('UPDATE gl_games g')).replace(/;\s*$/, '');
  const vieille = await createTenirGame({ stamp: Date.now() + 9, status: 'draft' });
  await db.execute(
    "UPDATE gl_games SET tenir_profil = 'prologue', tenir_overrides_json = ? WHERE id = ?",
    [JSON.stringify({ surface: 'hybride' }), vieille.game.id],
  );
  await db.execute(
    `INSERT INTO gl_game_rounds (game_id, round_number, started_by, started_at, phase)
     VALUES (?, 1, 'test', NOW(), 'clos'), (?, 2, 'test', NOW(), 'jeu')`,
    [vieille.game.id, vieille.game.id],
  );
  await db.execute(update);
  await db.execute(update);
  const ligne = await db.queryOne(
    'SELECT tenir_profil, tenir_overrides_json FROM gl_games WHERE id = ?',
    [vieille.game.id],
  );
  assert.equal(ligne.tenir_profil, 'complet');
  assert.deepEqual(JSON.parse(ligne.tenir_overrides_json), {
    surface: 'hybride',
    escalier: true,
    escalier_pas: 2,
  });
  const reste = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_games WHERE tenir_profil = 'prologue'",
  );
  assert.equal(Number(reste.n), 0);
});
