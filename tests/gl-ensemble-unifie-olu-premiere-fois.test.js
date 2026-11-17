'use strict';

/**
 * Ensemble unifié, PR 2, étape 2.2 (M8) — Olu « première fois » : 23 lignes dites une seule
 * fois par partie (ou par équipe quand la ligne porte `{equipe}`), à la première occurrence d'un
 * évènement. Le serveur désigne la ligne sur l'évènement (`payload.olu`) et s'en souvient
 * (`gl_game_olu_premieres`) ; dans l'escalier du chapitre 1, jamais avant la séance qui ouvre
 * la nouveauté.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
} = require('./helpers/glTenirFixtures');
const olu = require('../lib/glTenirOlu');
const { insertGameEvent, redactGameEventsForViewer } = require('../lib/glGameEvents');
const { etatEscalier } = require('../lib/shared/glTenirEscalierCore');
const { IMPORTERS } = require('../lib/glTenirImport');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

const DIR = path.join(__dirname, '..', 'data', 'gl', 'tenir');
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(DIR, 'olu-lignes.json'), 'utf8'));
const PREMIERES = CATALOGUE.lignes.filter((l) => l.moment === 'premiere_fois');
const cles = (input) =>
  olu.clesPremiereFois(input).map((c) => (c.teamId ? `${c.cle}@${c.teamId}` : c.cle));

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const prof = () => auth(ctx.adminToken);
const lignesDites = async (gameId = ctx.game.id) =>
  (
    await db.queryAll(
      'SELECT event_type, payload_json FROM gl_game_events WHERE game_id = ? ORDER BY id ASC',
      [gameId],
    )
  ).flatMap((e) =>
    (JSON.parse(e.payload_json || '{}').olu || []).map((o) =>
      o.teamId ? `${e.event_type}:${o.id}@${o.teamId}` : `${e.event_type}:${o.id}`,
    ),
  );
const emettre = (eventType, payload = {}, teamId = null, gameId = ctx.game.id) =>
  insertGameEvent(db, { gameId, teamId, actorType: 'system', eventType, payload });

before(async () => {
  await db.initSchema();
  // Le catalogue réel des lignes (les 23 « première fois » comprises).
  const rep = await IMPORTERS['olu-lignes'](db, CATALOGUE, {});
  assert.deepEqual(rep.errors, []);
  ctx = await createTenirGame({
    stamp: Date.now(),
    overrides: { escalier: true, escalier_pas: 1 },
  });
  await importExempleChasse(db, { game: ctx.game });
});

test('catalogue : 23 lignes « première fois », une par clé, avec leur séance de l’escalier ; aucune ne gronde', () => {
  assert.equal(PREMIERES.length, 23);
  assert.deepEqual(PREMIERES.map((l) => l.cle).sort(), [...olu.PREMIERE_FOIS_CLES].sort());
  for (const l of PREMIERES) {
    assert.equal(l.id, `olu-pf-${l.cle}`);
    assert.ok(Number.isInteger(l.seance_escalier) && l.seance_escalier >= 0, l.id);
    assert.equal(findForbiddenString(l.texte), null, l.id);
    assert.ok(l.texte.length <= 240, l.id);
  }
  // Les deux lignes qui nomment une équipe sont celles que le moteur dit par équipe.
  assert.deepEqual(
    PREMIERES.filter((l) => l.variables.includes('equipe'))
      .map((l) => l.cle)
      .sort(),
    ['sous_le_voile', 'un_de_joue'],
  );
});

test('évènement → clés : ce qu’Olu dirait, dans l’ordre (pur)', () => {
  const s = (pas) => etatEscalier({ escalier: true, escalier_pas: pas });
  assert.deepEqual(cles({ eventType: 'tour_ouvert', plateau: 1 }), ['avancer']);
  assert.deepEqual(cles({ eventType: 'tour_ouvert', plateau: 4 }), ['avancer', 'cordee_offerte']);
  // Escalier : ce que les séances déjà ouvertes ont apporté se dit à l'ouverture du tour.
  assert.deepEqual(cles({ eventType: 'tour_ouvert', escalier: s(1), plateau: 1 }), ['avancer']);
  assert.deepEqual(cles({ eventType: 'tour_ouvert', escalier: s(2), plateau: 1 }), [
    'avancer',
    'tenir',
  ]);
  assert.deepEqual(cles({ eventType: 'tour_ouvert', escalier: s(4), plateau: 1 }), [
    'avancer',
    'tenir',
    'sorts',
    'lumiere',
    'marche',
  ]);
  // « Ouvrir la suite » le dit tout de suite ; la clôture d'un tour attend l'ouverture du suivant.
  assert.deepEqual(
    cles({
      eventType: 'escalier_pas',
      payload: { pas: 3, motif: 'prof', modules: ['voile', 'page_temoin', 'sorts', 'lumiere'] },
    }),
    ['sorts', 'lumiere'],
  );
  assert.deepEqual(
    cles({
      eventType: 'escalier_pas',
      payload: { pas: 2, motif: 'tour_clos', modules: ['tenir'] },
    }),
    [],
  );
  assert.deepEqual(cles({ eventType: 'tour_phase', payload: { phase: 'jeu' } }), [
    'chercher',
    'role',
  ]);
  assert.deepEqual(cles({ eventType: 'tour_phase', payload: { phase: 'souffle' } }), []);
  // Ce qui n'existe pas dans la partie ne s'annonce pas : pas de rôles à l'écran au tableau,
  // pas de chapitre suivant au plateau 4, ni défis, ni Lumière, ni Marché quand ils sont coupés.
  assert.deepEqual(
    cles({ eventType: 'tour_phase', payload: { phase: 'jeu' }, surface: 'tableau' }),
    ['chercher'],
  );
  assert.deepEqual(cles({ eventType: 'seuil_clos', plateau: 4 }), []);
  assert.deepEqual(cles({ eventType: 'tour_clos', reglages: { defis: false } }), []);
  assert.deepEqual(cles({ eventType: 'team_spirit', reglages: { lumiere: false } }), []);
  assert.deepEqual(
    cles({
      eventType: 'tour_ouvert',
      escalier: { pas: 4 },
      reglages: { lumiere: false, marche: false },
    }),
    ['avancer', 'tenir', 'sorts'],
  );
  assert.deepEqual(cles({ eventType: 'tour_clos' }), ['trame']);
  assert.deepEqual(cles({ eventType: 'pas_encore', payload: { kind: 'case' } }), [
    'question_pas_encore',
  ]);
  assert.deepEqual(cles({ eventType: 'pas_encore', payload: { kind: 'chasse' } }), []);
  for (const verdict of ['chaud', 'tiede', 'froid']) {
    assert.deepEqual(cles({ eventType: 'fouille', payload: { verdict } }), ['chaud_froid']);
  }
  assert.deepEqual(cles({ eventType: 'fouille', payload: { verdict: 'zone' } }), []);
  assert.deepEqual(cles({ eventType: 'peripetie' }), ['peripetie']);
  assert.deepEqual(cles({ eventType: 'defi_case_recu' }), ['defi_case']);
  assert.deepEqual(cles({ eventType: 'page_trouvee' }), ['tenir']);
  assert.deepEqual(cles({ eventType: 'olu_erreur' }), ['erreur_du_jour']);
  assert.deepEqual(cles({ eventType: 'page_temoin' }), ['page_temoin']);
  assert.deepEqual(cles({ eventType: 'team_spirit' }), ['lumiere']);
  assert.deepEqual(cles({ eventType: 'un_de_pose' }), ['un_de_pose']);
  assert.deepEqual(cles({ eventType: 'un_de_joue', teamId: 7 }), ['un_de_joue@7']);
  assert.deepEqual(cles({ eventType: 'un_de_joue' }), []);
  assert.deepEqual(cles({ eventType: 'seuil_clos' }), ['camp']);
  assert.deepEqual(cles({ eventType: 'spell_effect', payload: { type: 'lettre' } }), ['lettre']);
  assert.deepEqual(cles({ eventType: 'spell_effect', payload: { type: 'abri' } }), []);
  // Le voile : le premier dé gris, chaque équipe recouverte, la première page qui pâlit.
  assert.deepEqual(
    cles({
      eventType: 'voile_avance',
      payload: { teamsUnderVoile: [3, 5], pagesPalies: [{ zoneKey: 'z' }] },
    }),
    ['voile', 'sous_le_voile@3', 'sous_le_voile@5', 'palissement'],
  );
  assert.deepEqual(cles({ eventType: 'voile_avance', payload: {} }), ['voile']);
  assert.deepEqual(cles({ eventType: 'dice_roll' }), []);
  assert.deepEqual(cles({ eventType: null, payload: null }), []);
  // Chaque clé a un déclencheur — sauf « la main », qui attend le lot « plusieurs appareils ».
  const declenchees = new Set(
    [
      { eventType: 'tour_ouvert', plateau: 4, escalier: s(4) },
      { eventType: 'tour_phase', payload: { phase: 'jeu' } },
      { eventType: 'tour_clos' },
      { eventType: 'pas_encore', payload: { kind: 'case' } },
      { eventType: 'fouille', payload: { verdict: 'chaud' } },
      { eventType: 'peripetie' },
      { eventType: 'defi_case_recu' },
      { eventType: 'olu_erreur' },
      { eventType: 'voile_avance', payload: { teamsUnderVoile: [1], pagesPalies: [1] } },
      { eventType: 'page_temoin' },
      { eventType: 'un_de_pose' },
      { eventType: 'un_de_joue', teamId: 1 },
      { eventType: 'seuil_clos' },
      { eventType: 'spell_effect', payload: { type: 'lettre' } },
    ].flatMap((e) => olu.clesPremiereFois(e).map((c) => c.cle)),
  );
  assert.deepEqual(
    olu.PREMIERE_FOIS_CLES.filter((c) => !declenchees.has(c)),
    ['main'],
  );
});

test('en partie : la ligne est portée par l’évènement, une seule fois ; l’escalier retient ce qui n’est pas encore ouvert', async () => {
  await ouvrirTourEnJeu(request, app, ctx);
  assert.deepEqual(await lignesDites(), [
    'tour_ouvert:olu-pf-avancer',
    'tour_phase:olu-pf-chercher',
    'tour_phase:olu-pf-role',
  ]);
  // Séance 1 : une page trouvée ne fait pas encore parler de « tenir » (séance 2), un bilan
  // Team Spirit pas encore de la jauge de Lumière (séance 3). Rien n'est mémorisé.
  const trouvee = await emettre('page_trouvee', { zoneKey: 'cz-p1-01' }, ctx.teams[0].id);
  assert.equal(trouvee.payload.olu, undefined);
  const bilan = await emettre('team_spirit', {
    roundNumber: 1,
    private: true,
    publicKeys: ['roundNumber'],
  });
  assert.equal(bilan.payload.olu, undefined);
  assert.deepEqual(bilan.payload.publicKeys, ['roundNumber']);
  // Une fouille « froid », puis une autre : la ligne ne se redit pas.
  const f1 = await emettre('fouille', { verdict: 'froid' }, ctx.teams[0].id);
  assert.deepEqual(f1.payload.olu, [{ id: 'olu-pf-chaud_froid' }]);
  const f2 = await emettre('fouille', { verdict: 'chaud' }, ctx.teams[1].id);
  assert.equal(f2.payload.olu, undefined);
  // Clore le tour : « les défis de la Trame sont ouverts ». La marche montée ne dit rien encore.
  for (const phase of ['souffle', 'clos']) {
    const r = await request(app).post(api('/tenir/tour/phase')).set(prof()).send({ phase });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.deepEqual((await lignesDites()).slice(3), [
    'fouille:olu-pf-chaud_froid',
    'tour_clos:olu-pf-trame',
  ]);

  // Séance 2 : « tenir » se dit à l'ouverture du tour ; « avancer » ne se redit pas.
  await ouvrirTourEnJeu(request, app, ctx);
  const dites = await lignesDites();
  assert.ok(dites.includes('tour_ouvert:olu-pf-tenir'), dites.join(' | '));
  assert.equal(dites.filter((l) => l.endsWith('olu-pf-avancer')).length, 1);
  assert.equal(dites.filter((l) => l.endsWith('olu-pf-chercher')).length, 1);
  const memoire = await db.queryAll(
    'SELECT cle, team_id FROM gl_game_olu_premieres WHERE game_id = ? ORDER BY cle ASC',
    [ctx.game.id],
  );
  assert.ok(memoire.every((m) => Number(m.team_id) === 0));
  assert.ok(memoire.some((m) => m.cle === 'tenir'));
  assert.ok(!memoire.some((m) => m.cle === 'lumiere'), 'rien de mémorisé avant sa séance');
});

test('par équipe : « {equipe} est sous le voile » se dit une fois pour chaque équipe ; un payload privé garde la ligne publique', async () => {
  const autre = await createTenirGame({ stamp: Date.now() + 3, plateau: 2 });
  const [a, b] = autre.teams;
  const premier = await emettre(
    'voile_avance',
    { roundNumber: 1, teamsUnderVoile: [a.id], pagesPalies: [] },
    null,
    autre.game.id,
  );
  assert.deepEqual(premier.payload.olu, [
    { id: 'olu-pf-voile' },
    { id: 'olu-pf-sous_le_voile', teamId: Number(a.id) },
  ]);
  const second = await emettre(
    'voile_avance',
    { roundNumber: 2, teamsUnderVoile: [a.id, b.id], pagesPalies: [{ zoneKey: 'z' }] },
    null,
    autre.game.id,
  );
  assert.deepEqual(second.payload.olu, [
    { id: 'olu-pf-sous_le_voile', teamId: Number(b.id) },
    { id: 'olu-pf-palissement' },
  ]);
  const troisieme = await emettre(
    'voile_avance',
    { roundNumber: 3, teamsUnderVoile: [a.id, b.id], pagesPalies: [{ zoneKey: 'z' }] },
    null,
    autre.game.id,
  );
  assert.equal(troisieme.payload.olu, undefined);
  const jeu = await emettre('un_de_joue', { roundNumber: 3 }, b.id, autre.game.id);
  assert.deepEqual(jeu.payload.olu, [{ id: 'olu-pf-un_de_joue', teamId: Number(b.id) }]);
  // Hors escalier (plateau 2), la jauge de Lumière se dit au premier bilan — privé, mais la
  // ligne d'Olu reste lisible de toute la classe.
  const bilan = await emettre(
    'team_spirit',
    { roundNumber: 1, note: 'pour le prof', private: true, publicKeys: ['roundNumber'] },
    null,
    autre.game.id,
  );
  assert.deepEqual(bilan.payload.olu, [{ id: 'olu-pf-lumiere' }]);
  assert.deepEqual(bilan.payload.publicKeys, ['roundNumber', 'olu']);
  const [vuParEleve] = redactGameEventsForViewer([bilan], { kind: 'player' });
  assert.deepEqual(vuParEleve.payload, {
    roundNumber: 1,
    olu: [{ id: 'olu-pf-lumiere' }],
    redacted: true,
  });
});

test('hors « Tenir à deux », ou base en retard : Olu se tait, le geste passe', async () => {
  const classique = await createTenirGame({ stamp: Date.now() + 5 });
  await db.execute('UPDATE gl_games SET tenir_profil = NULL WHERE id = ?', [classique.game.id]);
  const evt = await emettre('tour_ouvert', { roundNumber: 1 }, null, classique.game.id);
  assert.deepEqual(evt.payload, { roundNumber: 1 });
  // Une erreur de lecture ne remonte jamais jusqu'au geste.
  const casse = {
    queryOne: async () => {
      throw Object.assign(new Error('table absente'), { errno: 1146 });
    },
  };
  assert.deepEqual(
    await olu.avecPremieresFois(casse, {
      gameId: ctx.game.id,
      eventType: 'tour_ouvert',
      payload: { roundNumber: 9 },
    }),
    { roundNumber: 9 },
  );
  assert.equal(
    await olu.avecPremieresFois(db, { gameId: ctx.game.id, eventType: 'move', payload: null }),
    null,
    'un type sans ligne n’est pas touché',
  );
});

test('GET /tenir/olu : les lignes « première fois » sont servies avec les autres, sans correction', async () => {
  require('../routes/gl/games/tenir').invalidateOluCache();
  const res = await request(app).get(api('/tenir/olu')).set(auth(ctx.players[0].token));
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  const premieres = res.body.lignes.filter((l) => l.moment === 'premiere_fois');
  assert.equal(premieres.length, 23);
  assert.ok(premieres.every((l) => l.id.startsWith('olu-pf-') && l.texte));
  assert.ok(res.body.lignes.every((l) => l.correction === undefined));
});

test('chargeur : une ligne « première fois » porte une clé connue, unique ; les autres moments n’en portent pas', async () => {
  const essai = (modifier) => {
    const json = JSON.parse(JSON.stringify(CATALOGUE));
    modifier(json.lignes);
    return IMPORTERS['olu-lignes'](db, json, { dryRun: true });
  };
  const pf = (lignes) => lignes.find((l) => l.moment === 'premiere_fois');
  const cas = [
    [(l) => (pf(l).cle = 'inconnue'), /cle inconnue/],
    [
      (l) => (l.filter((x) => x.moment === 'premiere_fois')[1].cle = pf(l).cle),
      /cle avancer en double/,
    ],
    [(l) => (pf(l).seance_escalier = 9), /seance_escalier entier de 0 à 6/],
    [(l) => (l[0].cle = 'avancer'), /réservées au moment premiere_fois/],
    [(l) => (pf(l).id = 'x'.repeat(60)), /id manquant ou > 48/],
    [(l) => (pf(l).texte = 'Le voile vous attaque.'), /chaîne interdite/],
  ];
  for (const [modifier, attendu] of cas) {
    const rep = await essai(modifier);
    assert.ok(
      rep.errors.some((e) => attendu.test(e)),
      `${attendu} : ${rep.errors.join(' | ')}`,
    );
  }
  const propre = await essai(() => {});
  assert.deepEqual(propre.errors, []);
});
