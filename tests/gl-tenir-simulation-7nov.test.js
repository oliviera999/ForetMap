'use strict';

/**
 * Correctifs de règles et d'équilibre issus de la simulation du 7 novembre 2026 (étape 3) :
 * C1/C2 fenêtre « après le jet » = dernier jet du tour ; Progression sans application de la case ;
 * C4 cases positives converties en ressource du peuple ; C5 péripéties sur les cases `behavior`
 * sans effet (tonalité négative ou neutre) ; pistes de veillée par `especes` de zone ; C6 un
 * élève en retrait lit et tient ; erreur d'Olu filtrée par plateau. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const { createTenirGame, importExempleChasse } = require('./helpers/glTenirFixtures');
const { resolveTenirMarkerDeltas } = require('../lib/glMarkerVitalityEffects');
const { caseTirePeripetie, tirerErreurDuJour } = require('../lib/glTour');
const { assertFenetre } = require('../lib/glSpellFenetres');

let ctx;
let stamp;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
const species = (n) => `SPSIM${String(stamp).slice(-5)}${n}`;
const membersOf = (teamId) => ctx.players.filter((p) => p.teamId === Number(teamId));
const indexOf = (markerId) => ctx.markers.findIndex((m) => Number(m.id) === Number(markerId));
const posOf = async (teamId) =>
  indexOf(
    (await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [teamId]))
      .position_marker_id,
  );

async function cast(token, body) {
  const d = await request(app).post(api('/spell-casts/drafts')).set(auth(token)).send(body);
  if (d.status !== 201) return d;
  return request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(token));
}

async function totalBourses(teamId) {
  const row = await queryOne(
    'SELECT SUM(p.health_points) + SUM(p.power_points) AS t FROM gl_players p INNER JOIN gl_team_members tm ON tm.player_id = p.id WHERE tm.game_id = ? AND tm.team_id = ?',
    [ctx.game.id, teamId],
  );
  return Number(row.t) || 0;
}

before(async () => {
  await initSchema();
  stamp = Date.now();
  ctx = await createTenirGame({ stamp });
  await execute('UPDATE gl_games SET tenir_surface = ?, tenir_overrides_json = ? WHERE id = ?', [
    'tablette',
    JSON.stringify({ surface: 'tablette' }),
    ctx.game.id,
  ]);
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken)).expect(200);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' })
    .expect(200);
});

test('C1/C2 : Progression refusée si une autre équipe a joué depuis le jet ; acceptée juste après le jet, sans appliquer la case', async () => {
  const [gA, gB] = [ctx.teams[0], ctx.teams[1]];
  // gA puis gB jettent (jets libres du prof = « quelqu'un a joué depuis »).
  const jetA = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'serveur', teamId: gA.id });
  assert.equal(jetA.status, 201, JSON.stringify(jetA.body));
  const jetB = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'serveur', teamId: gB.id });
  assert.equal(jetB.status, 201, JSON.stringify(jetB.body));
  const tour = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken));
  assert.equal(tour.body.round?.dernierJet?.teamId, Number(gB.id), 'dernier jet du tour mémorisé');

  const memberA = membersOf(gA.id)[0];
  const refus = await cast(memberA.token, {
    spellCode: 'SL002',
    teamId: gA.id,
    effectParams: { delta: 1 },
    ressource: 'coeurs',
  });
  assert.equal(refus.status, 409, JSON.stringify(refus.body));
  assert.equal(refus.body.code, 'SPELL_FENETRE');
  assert.match(refus.body.error, /avant qu’une autre équipe ne joue/);

  // gB, auteure du dernier jet : placée juste avant une Trame pour vérifier qu'elle ne s'applique pas.
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[1].id,
    gB.id,
  ]);
  const memberB = membersOf(gB.id)[0];
  const avant = await totalBourses(gB.id);
  const ok = await cast(memberB.token, {
    spellCode: 'SL002',
    teamId: gB.id,
    effectParams: { delta: 1 },
    ressource: 'coeurs',
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(await posOf(gB.id), 2, '+1 case → Trame 1');
  assert.equal(ok.body.effectResult?.arrival, undefined, 'case non appliquée');
  assert.equal(await totalBourses(gB.id), avant - 1, 'coût 1, aucune ressource de Trame créée');
  const trame = await queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'marker_effect' AND JSON_EXTRACT(payload_json, '$.markerId') = ?",
    [ctx.game.id, gB.id, ctx.markers[2].id],
  );
  assert.ok(!trame, 'aucun effet de case journalisé');
});

test('assertFenetre apres_jet : dernier jet d’une autre équipe → refus ; sans jet enregistré → teamRolled suffit', () => {
  const spell = { fenetre: 'apres_jet' };
  assert.throws(
    () =>
      assertFenetre({
        spell,
        round: { phase: 'jeu', dernierJet: { teamId: 2 } },
        teamRolled: true,
        teamId: 1,
      }),
    { code: 'SPELL_FENETRE' },
  );
  assert.doesNotThrow(() =>
    assertFenetre({
      spell,
      round: { phase: 'jeu', dernierJet: { teamId: 1 } },
      teamRolled: true,
      teamId: 1,
    }),
  );
  assert.doesNotThrow(() =>
    assertFenetre({
      spell,
      round: { phase: 'jeu', dernierJet: null },
      teamRolled: true,
      teamId: 1,
    }),
  );
  assert.throws(
    () => assertFenetre({ spell, round: { phase: 'jeu' }, teamRolled: false, teamId: 1 }),
    { code: 'SPELL_FENETRE' },
  );
});

test('C4 : une case positive du plateau (+2 cœurs, +1 gemme) devient +1 ressource du peuple ; neutre → rien ; brut → plateau ; une perte hors Souffle ne retire rien', () => {
  const positive = (deltaPv, deltaGems) => ({
    branch: 'neutral',
    deltaPv,
    deltaGems,
    deltaMove: 0,
    passTurn: false,
  });
  const marker = {
    event_type: 'behavior',
    event_config_json: '{"version":2,"eventMeta":{"tonalite":"positif"}}',
  };
  const gnome = resolveTenirMarkerDeltas(marker, 'gnome', positive(2, 0));
  assert.deepEqual(
    { h: gnome.healthDelta, p: gnome.powerDelta, t: gnome.tonalite },
    { h: 1, p: 0, t: 'positif' },
  );
  const licorne = resolveTenirMarkerDeltas(marker, 'unicorn', positive(2, 0));
  assert.deepEqual({ h: licorne.healthDelta, p: licorne.powerDelta }, { h: 0, p: 1 });
  const gemme = resolveTenirMarkerDeltas(marker, 'gnome', positive(0, 1), {
    casesPositives: 'ressource_peuple',
  });
  assert.deepEqual({ h: gemme.healthDelta, p: gemme.powerDelta }, { h: 1, p: 0 });
  const neutre = resolveTenirMarkerDeltas(marker, 'gnome', positive(2, 0), {
    casesPositives: 'neutre',
  });
  assert.deepEqual({ h: neutre.healthDelta, p: neutre.powerDelta }, { h: 0, p: 0 });
  const brut = resolveTenirMarkerDeltas(marker, 'gnome', positive(2, 0), {
    casesPositives: 'brut',
  });
  assert.deepEqual({ h: brut.healthDelta, p: brut.powerDelta }, { h: 2, p: 0 });
  // Déplacement conservé, perte neutre neutralisée, branche explicite inchangée.
  const avecMove = resolveTenirMarkerDeltas(marker, 'gnome', { ...positive(1, 0), deltaMove: 1 });
  assert.equal(avecMove.moveDelta, 1);
  const perte = resolveTenirMarkerDeltas(
    {
      event_type: 'behavior',
      event_config_json: '{"version":2,"eventMeta":{"tonalite":"negatif"}}',
    },
    'gnome',
    positive(-1, 0),
  );
  assert.deepEqual({ h: perte.healthDelta, p: perte.powerDelta }, { h: 0, p: 0 });
  const explicite = resolveTenirMarkerDeltas(
    {
      event_type: 'behavior',
      event_config_json: '{"version":2,"eventMeta":{"tonalite":"souffle"}}',
    },
    'unicorn',
    { branch: 'unicorn', deltaPv: 0, deltaGems: -1, deltaMove: 0, passTurn: false },
  );
  assert.equal(explicite.powerDelta, -1, 'case Souffle : effet du plateau tel quel');
});

test('C5 : péripétie sur une case behavior sans effet de tonalité négative ou neutre, jamais sur un Défi ni une case à effet', () => {
  const cfg = (eventMeta, effects = null) =>
    JSON.stringify({ version: 2, ...(effects ? { effects } : {}), eventMeta });
  const resolved = { peripeties_cases_neutres: true };
  const behavior = (label, config) => ({
    event_type: 'behavior',
    label,
    event_config_json: config,
  });
  assert.equal(
    caseTirePeripetie(behavior('Averse tropicale', cfg({ tonalite: 'negatif' })), resolved),
    true,
  );
  assert.equal(
    caseTirePeripetie(behavior('Troupe de chimpanzés', cfg({ tonalite: 'neutre' })), resolved),
    true,
  );
  assert.equal(
    caseTirePeripetie(behavior('Point d’eau', cfg({ tonalite: 'positif' })), resolved),
    false,
  );
  assert.equal(
    caseTirePeripetie(
      behavior(
        'Feu de brousse',
        cfg({ tonalite: 'negatif' }, { neutral: { deltaPv: 0, deltaGems: 0, deltaMove: -3 } }),
      ),
      resolved,
    ),
    false,
    'une case à effet garde son effet, sans péripétie',
  );
  assert.equal(caseTirePeripetie(behavior("Défi d'équipe", null), resolved), false);
  assert.equal(
    caseTirePeripetie(behavior('Défi d’équipe', cfg({ tonalite: 'neutre' })), resolved),
    false,
  );
  assert.equal(
    caseTirePeripetie(behavior('Averse tropicale', cfg({ tonalite: 'negatif' })), {
      peripeties_cases_neutres: false,
    }),
    false,
    'réglage désactivé',
  );
  assert.equal(caseTirePeripetie({ event_type: 'event', description: '' }, resolved), true);
  assert.equal(caseTirePeripetie({ event_type: 'event', description: 'Texte' }, resolved), false);
});

test('pistes : étudier une espèce listée dans `especes` de la zone révèle la zone (sans lien du feuillet)', async () => {
  await execute(
    `INSERT INTO gl_species (species_code, biome_slug, type, nom_commun, statut, created_at, updated_at)
     VALUES (?, 'jungle_afc', 'faune', 'Espèce de zone', 'actif', NOW(), NOW())
     ON DUPLICATE KEY UPDATE statut = 'actif', updated_at = NOW()`,
    [species('Z')],
  );
  await execute('UPDATE gl_chasse_zones SET especes_json = ? WHERE zone_key = ?', [
    JSON.stringify([species('Z')]),
    'cz-p1-02',
  ]);
  const player = ctx.players[0];
  const res = await request(app)
    .post(`/api/gl/learning/species/${species('Z')}`)
    .set(auth(player.token))
    .send({ confirm: true, gameId: ctx.game.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.piste?.zoneKey, 'cz-p1-02');
  const page = await queryOne(
    'SELECT p.etat FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id WHERE p.game_id = ? AND z.zone_key = ?',
    [ctx.game.id, 'cz-p1-02'],
  );
  assert.equal(page.etat, 'revelee');
});

test('C6 : un élève en retrait peut ouvrir une page trouvée (200) ; le Marché lui reste fermé', async () => {
  const gnome = ctx.players.find((p) => p.teamId === Number(ctx.teams[0].id));
  const licorneTeam = ctx.teams[2];
  const zone = await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', ['cz-p1-01']);
  await execute(
    `INSERT INTO gl_game_chasse_pages (game_id, zone_id, etat, trouvee_par_team_id, trouvee_at, updated_at)
     VALUES (?, ?, 'trouvee', ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE etat = 'trouvee', trouvee_par_team_id = VALUES(trouvee_par_team_id), updated_at = NOW()`,
    [ctx.game.id, zone.id, licorneTeam.id],
  );
  await request(app)
    .post(api('/tenir/retrait'))
    .set(auth(ctx.adminToken))
    .send({ playerId: gnome.id, entree: true, motif: 'test' })
    .expect(200);
  const ouvert = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(gnome.token));
  assert.equal(ouvert.status, 200, JSON.stringify(ouvert.body));
  assert.equal(ouvert.body.peutTenir, true);
  const marche = await request(app).get('/api/gl/market/annonces').set(auth(gnome.token));
  assert.equal(marche.status, 403, JSON.stringify(marche.body));
  await request(app)
    .post(api('/tenir/retrait'))
    .set(auth(ctx.adminToken))
    .send({ playerId: gnome.id, entree: false })
    .expect(200);
});

test('erreur d’Olu : tirée sur le plateau de la partie, repli sur « tous », puis sur tout', async () => {
  const rows = [
    { id: 'o-1', texte: 'toundra', correction: 'c', plateaux_json: '[4]' },
    { id: 'o-2', texte: 'savane', correction: 'c', plateaux_json: '[1]' },
    { id: 'o-3', texte: 'partout', correction: 'c', plateaux_json: null },
  ];
  const fake = { queryAll: async () => rows };
  for (let i = 0; i < 20; i += 1) {
    assert.equal((await tirerErreurDuJour(fake, 1)).id, 'o-2');
    assert.equal((await tirerErreurDuJour(fake, 3)).id, 'o-3', 'repli sur « tous »');
  }
  const sansTous = { queryAll: async () => rows.slice(0, 2) };
  assert.ok(['o-1', 'o-2'].includes((await tirerErreurDuJour(sansTous, 3)).id), 'repli sur tout');
  assert.equal(await tirerErreurDuJour({ queryAll: async () => [] }, 1), null);
});
