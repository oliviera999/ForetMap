'use strict';

/**
 * Ensemble unifié, PR 1b, étape 1.5 (M23, L7) — Mentorat, Lettre, grimoire du voyageur.
 *
 * - **Lettre** (`SL048`) : coût 2, payée une fois ; un « pas encore » se réécrit sans repayer ;
 *   validée, c'est une page du voyageur **en marge**, qui ne compte pas pour le carnet complet.
 * - **Mentorat** (`SL027`) : coût 3, jamais remboursé ; un seul par séance et par classe (le
 *   second est refusé sans débit) ; un « pas encore » se retente une autre séance sans repayer ;
 *   un Mentorat que le prof n'a pas écouté ne reste pas en attente.
 * - **Grimoire du voyageur** : la Plume est sortie ; « Seconde chance » n'existe que si un
 *   délai d'attente est réglé (`tenir_delai_fiche_secondes`, 0 par défaut).
 *
 * Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
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
  setGlSetting,
} = require('./helpers/glTenirFixtures');
const { invalidateModulesCache, getGameplaySettings } = require('../lib/glSettings');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');
const { resolveEffectiveGatingPolicy } = require('../lib/shared/gatingPolicyLayersCore');
const { heuresDuDelai, delaiFicheForceHeures } = require('../lib/glDelaiFiche');
const lm = require('../lib/glLettreMentorat');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
// Équipes : 0 Gnomes A, 1 Gnomes B, 2 Licornes A, 3 Licornes B.
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const phase = (body) =>
  request(app).post(api('/tenir/tour/phase')).set(auth(ctx.adminToken)).send(body);
const sommeEquipe = async (i) => {
  let health = 0;
  let power = 0;
  for (const p of membres(i)) {
    const b = await readPlayerBourses(p.id);
    health += b.health;
    power += b.power;
  }
  return { health, power };
};
const sommeTotale = async (i) => {
  const s = await sommeEquipe(i);
  return s.health + s.power;
};
const invariants = async () =>
  (await checkTenirInvariantsFromDb(db, ctx.game.id, { settings: await getGameplaySettings() }))
    .violations || [];
const file = async () =>
  (await request(app).get(api('/tenir/demandes')).set(auth(ctx.adminToken))).body.demandes || [];
const moi = (p) => request(app).get('/api/gl/voyageur/me').set(auth(p.token));

/** Corps du dernier pot créé par `lancer` (ce que reçoit l'écran de l'élève). */
let dernierPot = null;

/** Lance un sort du Seuil depuis le compte de l'élève ; renvoie la réponse du lancement. */
async function lancer(code, i, joueur) {
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(joueur.token))
    .send({ spellCode: code, teamId: team(i).id });
  dernierPot = d.body;
  if (d.status !== 201) return d;
  return request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(joueur.token));
}

before(async () => {
  await db.initSchema();
  await db.execute(
    "INSERT INTO gl_settings (`key`, value_json, updated_at) VALUES ('modules.voyageur_enabled', 'true', NOW()) ON DUPLICATE KEY UPDATE value_json = 'true'",
  );
  invalidateModulesCache();
  // Plateau 3 : Mentorat et Lettre y sont ouverts.
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 3 });
  await importExempleChasse(db, { game: ctx.game });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await db.execute('UPDATE gl_game_tenir_state SET chapardeur_round = 99 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  // Un sort du Seuil se lance hors de la phase « jeu » : le tour reste en ouverture.
  await ouvrirTourEnJeu(request, app, ctx, { phase: 'ouverture' });
});

after(async () => {
  await setGlSetting('gameplay.tenir_delai_fiche_secondes', 0);
});

test('catalogue : Mentorat coûte 3, Lettre coûte 2 ; trois amorces ; aucun texte visible interdit', async () => {
  const mentorat = await db.queryOne(
    "SELECT cout, effet_court, effet_auto_json FROM gl_spells WHERE spell_code = 'SL027'",
  );
  const lettre = await db.queryOne(
    "SELECT cout, effet_court, effet_auto_json FROM gl_spells WHERE spell_code = 'SL048'",
  );
  assert.equal(Number(mentorat.cout), 3);
  assert.equal(Number(lettre.cout), 2);
  const tl = await lm.loadTextes(db, 'lettre');
  const tm = await lm.loadTextes(db, 'mentorat');
  assert.equal(tl.amorces.length, 3);
  assert.deepEqual(
    tl.amorces.map((a) => a.code),
    ['vu', 'surprise', 'question'],
  );
  assert.ok(tm.consigne && tm.critere_prof);
  const visibles = [
    mentorat.effet_court,
    lettre.effet_court,
    tl.presentation,
    tl.retour_pas_encore,
    tl.retour_valide,
    tm.consigne,
    tm.retour_pas_encore,
    tm.retour_valide,
    ...tl.amorces.flatMap((a) => [a.titre, a.texte]),
    lm.MENTORAT_DEJA_PREVU,
    lm.MENTORAT_DEJA_PAYE,
    lm.LETTRE_DEJA_PAYEE,
    lm.MENTORAT_REPORTE,
    lm.SEUIL_FERME,
  ];
  for (const texte of visibles) assert.equal(findForbiddenString(texte), null, texte);
});

test('Lettre : payée une fois (2), écrite, « pas encore » réécrit sans repayer, puis en marge du carnet', async () => {
  const eleve = membres(2)[0];
  const avant = await sommeTotale(2);
  const l = await lancer('SL048', 2, eleve);
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.equal(await sommeTotale(2), avant - 2, 'la Lettre coûte 2');
  // Ni le pot ni le lancement ne servent à l'élève les champs réservés au prof.
  for (const corps of [dernierPot, l.body]) {
    const brut = JSON.stringify(corps);
    assert.equal(brut.includes('relecture_prof'), false, 'points de relecture servis à l’élève');
    assert.equal(brut.includes('effetAutoJson'), false, 'effet_auto_json servi à l’élève');
  }

  // Le sort est soldé au lancement : rien « en attente d'effet », donc rien à rendre plus tard.
  const draft = await db.queryOne(
    "SELECT status, effect_applied_at FROM gl_spell_cast_drafts WHERE game_id = ? AND spell_code = 'SL048' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(draft.status, 'cast');
  assert.ok(draft.effect_applied_at, 'effet soldé');

  let me = await moi(eleve);
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.equal(me.body.lettre.statut, 'a_ecrire');
  assert.equal(me.body.lettre.amorces.length, 3);
  assert.equal(me.body.lettre.relecture_prof, undefined, 'les points de relecture restent au prof');
  const lettreId = me.body.lettre.id;

  // Trop court : refus qui dit quoi faire, rien ne change.
  const court = await request(app)
    .put(`/api/gl/voyageur/lettre/${lettreId}`)
    .set(auth(eleve.token))
    .send({ amorce: 'vu', titre: 'Le soir', texte: 'trop court' });
  assert.equal(court.status, 400, JSON.stringify(court.body));
  assert.equal(court.body.code, 'LETTRE_TEXTE');

  // Un camarade n'écrit pas la Lettre d'un autre.
  const autre = await request(app)
    .put(`/api/gl/voyageur/lettre/${lettreId}`)
    .set(auth(membres(2)[1].token))
    .send({
      titre: 'Le soir au bivouac',
      texte: 'Ce soir nous avons vu des traces dans le sable.',
    });
  assert.equal(autre.status, 404, JSON.stringify(autre.body));

  const ecrite = await request(app)
    .put(`/api/gl/voyageur/lettre/${lettreId}`)
    .set(auth(eleve.token))
    .send({
      amorce: 'vu',
      titre: 'Le soir au bivouac',
      texte: 'Ce soir nous avons vu des traces dans le sable, tout près du camp.',
    });
  assert.equal(ecrite.status, 200, JSON.stringify(ecrite.body));
  assert.equal(ecrite.body.lettre.statut, 'proposee');

  // File unique du prof : la Lettre attend sa relecture, avec les points de relecture.
  const ligne = (await file()).find((d) => d.kind === 'plume' && Number(d.refId) === lettreId);
  assert.ok(ligne, 'la Lettre est dans la file du prof');
  assert.equal(ligne.titre, 'Lettre à relire');
  assert.ok(Array.isArray(ligne.payload.relecture) && ligne.payload.relecture.length >= 3);

  // « Pas encore », avec une piste : rien n'est rendu, rien n'est repris.
  const pasEncore = await request(app)
    .put(api(`/tenir/plumes/${lettreId}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'pas_encore', piste: 'Dis quel animal a laissé ces traces.' });
  assert.equal(pasEncore.status, 200, JSON.stringify(pasEncore.body));
  assert.equal(pasEncore.body.statut, 'pas_encore');
  assert.equal(await sommeTotale(2), avant - 2, 'un « pas encore » ne coûte rien de plus');
  me = await moi(eleve);
  assert.equal(me.body.lettre.statut, 'pas_encore');
  assert.equal(me.body.lettre.piste, 'Dis quel animal a laissé ces traces.');
  assert.match(me.body.lettre.retour, /^Pas encore/);
  assert.equal(findForbiddenString(me.body.lettre.retour), null);

  // Une Lettre payée ne se repaie pas : un nouveau lancement est refusé sans débit.
  const encore = await lancer('SL048', 2, eleve);
  assert.equal(encore.status, 409, JSON.stringify(encore.body));
  assert.equal(encore.body.code, 'SPELL_LIMITE');
  assert.equal(await sommeTotale(2), avant - 2);

  // Réécriture sans repayer.
  const reecrite = await request(app)
    .put(`/api/gl/voyageur/lettre/${lettreId}`)
    .set(auth(eleve.token))
    .send({
      amorce: 'vu',
      titre: 'Le soir au bivouac',
      texte: 'Ce soir nous avons vu les traces d’un fennec dans le sable, tout près du camp.',
    });
  assert.equal(reecrite.status, 200, JSON.stringify(reecrite.body));
  assert.equal(await sommeTotale(2), avant - 2, 'réécrire ne coûte rien');

  // En relecture, l'élève ne la modifie plus.
  const verrou = await request(app)
    .put(`/api/gl/voyageur/lettre/${lettreId}`)
    .set(auth(eleve.token))
    .send({ titre: 'Autre titre', texte: 'Un autre texte assez long pour passer le contrôle.' });
  assert.equal(verrou.status, 409, JSON.stringify(verrou.body));
  assert.equal(verrou.body.code, 'LETTRE_EN_RELECTURE');

  const zonesAvant = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_game_chasse_pages WHERE game_id = ?',
    [ctx.game.id],
  );
  const valide = await request(app)
    .put(api(`/tenir/plumes/${lettreId}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'valider' });
  assert.equal(valide.status, 200, JSON.stringify(valide.body));
  assert.equal(valide.body.statut, 'validee');
  assert.equal(await sommeTotale(2), avant - 2, 'aucune ressource pour une Lettre validée');

  // L7 : en marge du carnet de la classe, hors du compte des pages.
  const carnet = await request(app).get(api('/chasse/carnet')).set(auth(eleve.token));
  assert.equal(carnet.status, 200, JSON.stringify(carnet.body));
  assert.equal(carnet.body.marge.length, 1);
  assert.equal(carnet.body.marge[0].titre, 'Le soir au bivouac');
  assert.ok(
    carnet.body.pages.every((p) => p.feuilletCode !== valide.body.feuilletCode),
    'la Lettre n’est pas une page du carnet à compléter',
  );
  const zonesApres = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_game_chasse_pages WHERE game_id = ?',
    [ctx.game.id],
  );
  assert.equal(Number(zonesApres.n), Number(zonesAvant.n));
  assert.deepEqual(await invariants(), []);
});

test('L7 : une Lettre validée ne compte pas pour le carnet complet', async () => {
  const { verifierCarnetCompletTx, loadZonesForGame } = require('../lib/glChasse');
  const { resolveTenirSettings } = require('../lib/glTenir');
  const settings = await getGameplaySettings();
  const game = await db.queryOne(
    `SELECT g.*, ch.plateau_number FROM gl_games g LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id WHERE g.id = ?`,
    [ctx.game.id],
  );
  const resolved = resolveTenirSettings(settings, game);
  const zones = await loadZonesForGame(db, game, resolved);
  assert.ok(zones.length > 0);
  assert.ok(
    zones.every((z) => !String(z.feuilletCode).startsWith('plume-')),
    'aucune zone ne porte une page écrite par un élève',
  );
  // Toutes les zones tenues sauf une : la Lettre validée ne comble pas le manque.
  await db.execute("UPDATE gl_game_chasse_pages SET etat = 'tenue' WHERE game_id = ?", [
    ctx.game.id,
  ]);
  await db.execute(
    "UPDATE gl_game_chasse_pages SET etat = 'trouvee' WHERE game_id = ? AND zone_id = ?",
    [ctx.game.id, zones[0].id],
  );
  const events = await db.withTransaction((tx) =>
    verifierCarnetCompletTx(tx, {
      gameId: ctx.game.id,
      game,
      resolved,
      settings,
      actorType: 'system',
      actorId: 'test',
    }),
  );
  assert.deepEqual(events, [], 'carnet incomplet malgré la Lettre en marge');
  const state = await db.queryOne(
    'SELECT carnet_complet_at FROM gl_game_tenir_state WHERE game_id = ?',
    [ctx.game.id],
  );
  assert.equal(state.carnet_complet_at, null);
  await db.execute("UPDATE gl_game_chasse_pages SET etat = 'endormie' WHERE game_id = ?", [
    ctx.game.id,
  ]);
});

test('Mentorat : 3, jamais remboursé ; un seul par séance et par classe, le second refusé sans débit', async () => {
  const mentor = membres(0)[0];
  const avantA = await sommeTotale(0);
  const avantB = await sommeTotale(3);
  const l = await lancer('SL027', 0, mentor);
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.equal(await sommeTotale(0), avantA - 3, 'le Mentorat coûte 3');
  for (const corps of [dernierPot, l.body]) {
    assert.equal(JSON.stringify(corps).includes('critere_prof'), false, 'critère servi à l’élève');
  }

  const ligne = (await file()).find((d) => d.kind === 'mentorat');
  assert.ok(ligne, 'le Mentorat est dans la file du prof');
  assert.equal(ligne.titre, 'Mentorat à écouter');
  assert.ok(ligne.payload.critere, 'le critère est servi au prof');
  assert.ok(ligne.payload.consigne);

  // Une autre équipe, le même jour : refus avec le message, avant tout débit.
  const second = await lancer('SL027', 3, membres(3)[0]);
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.equal(second.body.code, 'SPELL_LIMITE');
  assert.equal(second.body.error, lm.MENTORAT_DEJA_PREVU);
  assert.equal(await sommeTotale(3), avantB, 'aucun débit pour le Mentorat refusé');

  // L'élève voit sa consigne, jamais le critère du prof.
  let me = await moi(mentor);
  assert.equal(me.body.mentorat.statut, 'prevu');
  assert.ok(me.body.mentorat.consigne);
  assert.equal(me.body.mentorat.critere_prof, undefined);
  assert.equal(me.body.mentorat.critere, undefined);
  const mentoratId = me.body.mentorat.id;

  // « Pas encore », avec une piste : rien n'est rendu.
  const pasEncore = await request(app)
    .put(api(`/tenir/mentorats/${mentoratId}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'pas_encore', piste: 'Dis où vit cette espèce.' });
  assert.equal(pasEncore.status, 200, JSON.stringify(pasEncore.body));
  assert.equal(pasEncore.body.mentorat.statut, 'pas_encore');
  assert.equal(await sommeTotale(0), avantA - 3, 'jamais remboursé');
  const draft = await db.queryOne(
    "SELECT status FROM gl_spell_cast_drafts WHERE game_id = ? AND spell_code = 'SL027' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(draft.status, 'cast', 'le sort reste lancé : il n’est pas rendu');
  me = await moi(mentor);
  assert.equal(me.body.mentorat.piste, 'Dis où vit cette espèce.');
  assert.match(me.body.mentorat.retour, /^Pas encore/);
  assert.equal(me.body.mentorat.reporte, false, 'jugé par le prof, pas reporté');

  // Le même jour : pas de seconde tentative (un seul Mentorat par séance et par classe).
  const memeJour = await request(app)
    .post(`/api/gl/voyageur/mentorat/${mentoratId}/retenter`)
    .set(auth(mentor.token));
  assert.equal(memeJour.status, 409, JSON.stringify(memeJour.body));
  assert.equal(memeJour.body.error, lm.MENTORAT_DEJA_PREVU);

  // Deux fois jugé : refus propre.
  const deuxFois = await request(app)
    .put(api(`/tenir/mentorats/${mentoratId}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'valider' });
  assert.equal(deuxFois.status, 409, JSON.stringify(deuxFois.body));
  assert.equal(deuxFois.body.code, 'MENTORAT_DEJA_JUGE');

  // Séance suivante : il retente sans repayer, puis réussit.
  await phase({ phase: 'jeu' }).expect(200);
  await phase({ phase: 'souffle', dort: true }).expect(200);
  await phase({ phase: 'clos' }).expect(200);
  await ouvrirTourEnJeu(request, app, ctx, { phase: 'ouverture' });
  const avantRetente = await sommeTotale(0);
  // Un Mentorat payé ne se repaie pas.
  const repaye = await lancer('SL027', 0, mentor);
  assert.equal(repaye.status, 409, JSON.stringify(repaye.body));
  const retente = await request(app)
    .post(`/api/gl/voyageur/mentorat/${mentoratId}/retenter`)
    .set(auth(mentor.token));
  assert.equal(retente.status, 200, JSON.stringify(retente.body));
  assert.equal(retente.body.mentorat.statut, 'prevu');
  // Le compteur de tentatives reste au prof : l'élève ne le reçoit pas.
  assert.equal(retente.body.mentorat.tentatives, undefined);
  const compteur = await db.queryOne('SELECT tentatives FROM gl_game_mentorats WHERE id = ?', [
    mentoratId,
  ]);
  assert.equal(Number(compteur.tentatives), 2);
  assert.equal(await sommeTotale(0), avantRetente, 'retenter ne coûte rien');
  const relance = (await file()).find(
    (d) => d.kind === 'mentorat' && Number(d.refId) === mentoratId,
  );
  assert.ok(relance, 'de nouveau dans la file du prof');
  assert.match(relance.detail, /nouvelle tentative/);

  const reussi = await request(app)
    .put(api(`/tenir/mentorats/${mentoratId}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'valider' });
  assert.equal(reussi.status, 200, JSON.stringify(reussi.body));
  assert.equal(reussi.body.mentorat.statut, 'valide');
  assert.equal(await sommeTotale(0), avantRetente, 'aucune ressource pour un Mentorat réussi');
  const evt = await db.queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'mentorat_valide' LIMIT 1",
    [ctx.game.id],
  );
  assert.ok(evt, 'le journal garde le Mentorat réussi');
  me = await moi(mentor);
  assert.equal(me.body.mentorat.statut, 'valide');
  assert.deepEqual(await invariants(), []);
});

test('garde-fou 11 : un Mentorat que le prof n’a pas écouté repasse en « pas encore » à la séance suivante, sans rien coûter', async () => {
  // Séance suivante (le Mentorat du test précédent a pris celle-ci).
  await phase({ phase: 'jeu' }).expect(200);
  await phase({ phase: 'souffle', dort: true }).expect(200);
  await phase({ phase: 'clos' }).expect(200);
  await ouvrirTourEnJeu(request, app, ctx, { phase: 'ouverture' });
  const mentor = membres(1)[0];
  const avant = await sommeTotale(1);
  const l = await lancer('SL027', 1, mentor);
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const id = (await moi(mentor)).body.mentorat.id;

  await phase({ phase: 'jeu' }).expect(200);
  await phase({ phase: 'souffle', dort: true }).expect(200);
  await phase({ phase: 'clos' }).expect(200);
  // Tour clos : le Mentorat attend encore (le prof peut l'écouter avant la séance suivante).
  assert.equal((await moi(mentor)).body.mentorat.statut, 'prevu');
  await ouvrirTourEnJeu(request, app, ctx, { phase: 'ouverture' });

  const row = await db.queryOne('SELECT statut, piste FROM gl_game_mentorats WHERE id = ?', [id]);
  assert.equal(row.statut, 'pas_encore', 'reporté d’office');
  assert.equal(row.piste, null);
  assert.equal(await sommeTotale(1), avant - 3, 'ni rendu ni repris');
  const demande = await db.queryOne(
    "SELECT statut FROM gl_game_demandes WHERE game_id = ? AND kind = 'mentorat' AND ref_id = ?",
    [ctx.game.id, String(id)],
  );
  assert.equal(demande.statut, 'annulee', 'la ligne de la file se ferme seule');
  // L'élève n'a pas parlé : il ne lit pas le retour d'une écoute, mais un texte neutre.
  const vue = (await moi(mentor)).body.mentorat;
  assert.equal(vue.reporte, true);
  assert.equal(vue.retour, lm.MENTORAT_REPORTE);
  assert.equal(vue.piste, null);
  // Il retente dès cette séance, sans repayer.
  const retente = await request(app)
    .post(`/api/gl/voyageur/mentorat/${id}/retenter`)
    .set(auth(mentor.token));
  assert.equal(retente.status, 200, JSON.stringify(retente.body));
  assert.equal(await sommeTotale(1), avant - 3);
});

test('délai des fiches : 0 par défaut — le réglage prime sur toutes les couches du conditionnement', async () => {
  assert.equal(heuresDuDelai(0), 0);
  assert.equal(heuresDuDelai(1), 1, 'arrondi à l’heure supérieure');
  assert.equal(heuresDuDelai(3600), 1);
  assert.equal(heuresDuDelai(3601), 2);
  await setGlSetting('gameplay.tenir_delai_fiche_secondes', 0);
  assert.equal(await delaiFicheForceHeures(), 0);

  const couches = {
    perResource: { retry_cooldown_hours: 12 },
    typePolicy: { retry_cooldown_hours: 6 },
    site: { enabled: true, retryCooldownHours: 1 },
    product: 'gl',
  };
  assert.equal(resolveEffectiveGatingPolicy(couches).retryCooldownHours, 12, 'sans réglage imposé');
  const force = resolveEffectiveGatingPolicy({
    ...couches,
    site: { ...couches.site, retryCooldownForcedHours: 0 },
  });
  assert.equal(force.retryCooldownHours, 0, 'aucun délai en mode « Tenir »');
  assert.equal(force.effectiveSources.retryCooldownHours, 'product');

  // Les réglages de site servis au moteur G&L portent la valeur imposée.
  const { GATING_PRODUCTS } = require('../lib/pedago/gatingProducts');
  const site = await GATING_PRODUCTS.gl.loadSiteSettings();
  assert.equal(site.retryCooldownForcedHours, 0);
});

test('grimoire du voyageur : Plume sortie ; « Seconde chance » seulement si un délai est réglé', async () => {
  const eleve = membres(3)[1];
  await setGlSetting('gameplay.tenir_delai_fiche_secondes', 0);
  let me = await moi(eleve);
  assert.deepEqual(
    me.body.grimoire.map((s) => s.code),
    ['loupe', 'memoire', 'flair', 'messager'],
  );
  const sansObjet = await request(app)
    .post('/api/gl/voyageur/spells/seconde_chance/cast')
    .set(auth(eleve.token))
    .send({ target: 'species:SP0001' });
  assert.equal(sansObjet.status, 409, JSON.stringify(sansObjet.body));
  assert.equal(sansObjet.body.code, 'SPELL_SANS_OBJET');
  const plume = await request(app)
    .post('/api/gl/voyageur/spells/plume/cast')
    .set(auth(eleve.token))
    .send({ target: 'x' });
  assert.equal(plume.status, 404, 'la Plume n’existe plus');

  // Retour en arrière d'un réglage : le délai revient, « Seconde chance » avec lui.
  await setGlSetting('gameplay.tenir_delai_fiche_secondes', 3600);
  assert.equal(await delaiFicheForceHeures(), 1);
  me = await moi(eleve);
  assert.deepEqual(
    me.body.grimoire.map((s) => s.code),
    ['seconde_chance', 'loupe', 'memoire', 'flair', 'messager'],
  );
});

test('garde-fou 11 : une Lettre en relecture suit son auteur quand sa partie d’origine est close', async () => {
  const eleve = membres(1)[1];
  const l = await lancer('SL048', 1, eleve);
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const lettreId = (await moi(eleve)).body.lettre.id;
  // Une autre partie, close : celle où la Lettre aurait été payée au chapitre précédent.
  const ancienne = await createTenirGame({ stamp: Date.now() + 7, plateau: 3 });
  await db.execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [ancienne.game.id]);
  await db.execute('UPDATE gl_voyageur_plumes SET game_id = ? WHERE id = ?', [
    ancienne.game.id,
    lettreId,
  ]);

  // Écrite après la clôture : elle entre dans la file du prof de la partie où l'élève joue.
  const ecrite = await request(app)
    .put(`/api/gl/voyageur/lettre/${lettreId}`)
    .set(auth(eleve.token))
    .send({
      amorce: 'question',
      titre: 'Les traces du matin',
      texte: 'Je me demande quel animal a traversé la lande avant nous ce matin.',
    });
  assert.equal(ecrite.status, 200, JSON.stringify(ecrite.body));
  let row = await db.queryOne('SELECT game_id, statut FROM gl_voyageur_plumes WHERE id = ?', [
    lettreId,
  ]);
  assert.equal(Number(row.game_id), Number(ctx.game.id));
  assert.ok(
    (await file()).find((d) => d.kind === 'plume' && Number(d.refId) === lettreId),
    'la Lettre attend dans la file de la partie en cours',
  );

  // Restée en relecture dans une partie close : l'ouverture de la séance suivante la ramène.
  await db.execute('UPDATE gl_voyageur_plumes SET game_id = ? WHERE id = ?', [
    ancienne.game.id,
    lettreId,
  ]);
  await db.execute(
    "DELETE FROM gl_game_demandes WHERE game_id = ? AND kind = 'plume' AND ref_id = ?",
    [ctx.game.id, String(lettreId)],
  );
  await phase({ phase: 'jeu' }).expect(200);
  await phase({ phase: 'souffle', dort: true }).expect(200);
  await phase({ phase: 'clos' }).expect(200);
  await ouvrirTourEnJeu(request, app, ctx, { phase: 'ouverture' });
  row = await db.queryOne('SELECT game_id, statut FROM gl_voyageur_plumes WHERE id = ?', [
    lettreId,
  ]);
  assert.equal(Number(row.game_id), Number(ctx.game.id), 'rattachée à la séance qui s’ouvre');
  assert.equal(row.statut, 'proposee');
  const ligne = (await file()).find((d) => d.kind === 'plume' && Number(d.refId) === lettreId);
  assert.ok(ligne, 'de nouveau dans la file du prof');
  // Le prof la relit depuis cette partie.
  const valide = await request(app)
    .put(api(`/tenir/plumes/${lettreId}`))
    .set(auth(ctx.adminToken))
    .send({ decision: 'valider' });
  assert.equal(valide.status, 200, JSON.stringify(valide.body));
});

test('Seuil coupé : Lettre et Mentorat sont refusés avant tout débit', async () => {
  const eleve = membres(3)[0];
  const avant = await sommeTotale(3);
  await db.execute(
    "UPDATE gl_settings SET value_json = 'false' WHERE `key` = 'modules.voyageur_enabled'",
  );
  invalidateModulesCache();
  try {
    for (const code of ['SL048', 'SL027']) {
      const refus = await lancer(code, 3, eleve);
      assert.equal(refus.status, 409, JSON.stringify(refus.body));
      assert.equal(refus.body.code, 'SPELL_SANS_OBJET');
      assert.equal(refus.body.error, lm.SEUIL_FERME);
    }
    assert.equal(await sommeTotale(3), avant, 'aucun débit');
  } finally {
    await db.execute(
      "UPDATE gl_settings SET value_json = 'true' WHERE `key` = 'modules.voyageur_enabled'",
    );
    invalidateModulesCache();
  }
});
