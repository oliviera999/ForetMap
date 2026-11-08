'use strict';

/**
 * Banc de simulation « Tenir à deux » (`tools/gl-sim/`) — fonctions pures, sans base :
 * garde-fou de base, statistiques (Spearman, Gini, quantiles), attendus d'équilibrage, lecture
 * d'une grille, instantané sans table nominative, personas reproductibles, stratégie de fouille,
 * crible des réponses servies à un élève (mots interdits, bourses d'une autre équipe).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { assertSimDatabaseAllowed } = require('../tools/gl-sim/garde');
const stats = require('../tools/gl-sim/stats');
const { evaluerAttendus, bilanAttendus } = require('../tools/gl-sim/attendus');
const { lireGrille, validerGrille, GrilleError } = require('../tools/gl-sim/grilles');
const { verifierSnapshotSansNominatif, CONTENT_TABLES } = require('../tools/gl-sim/snapshot');
const { genererPersonas, resumerPersonas } = require('../tools/gl-sim/personas');
const { choisirPointFouille } = require('../tools/gl-sim/strategie');
const { creerRng, hashSeed } = require('../tools/gl-sim/rng');
const { controlerCorpsEleve } = require('../tools/gl-sim/client');
const { trouverScenario, listerScenarios } = require('../tools/gl-sim/scenarios');

test('garde-fou n° 10 : seules les bases _sim / _test passent ; production refusée sans GL_SIM_ALLOW=1', () => {
  assert.deepEqual(assertSimDatabaseAllowed({ dbName: 'foretmap_sim', nodeEnv: 'test' }), {
    ok: true,
    dbName: 'foretmap_sim',
  });
  assert.ok(assertSimDatabaseAllowed({ dbName: 'foretmap_test', nodeEnv: 'development' }).ok);
  assert.throws(() => assertSimDatabaseAllowed({ dbName: 'oliviera_foretmap', nodeEnv: 'test' }), {
    code: 'SIM_DB_NOM',
  });
  assert.throws(() => assertSimDatabaseAllowed({ dbName: 'foretmap_local', nodeEnv: 'test' }), {
    code: 'SIM_DB_NOM',
  });
  assert.throws(() => assertSimDatabaseAllowed({ dbName: '', nodeEnv: 'test' }), {
    code: 'SIM_DB_NOM',
  });
  assert.throws(() => assertSimDatabaseAllowed({ dbName: 'foretmap_sim', nodeEnv: 'production' }), {
    code: 'SIM_PRODUCTION',
  });
  assert.ok(
    assertSimDatabaseAllowed({ dbName: 'foretmap_sim', nodeEnv: 'production', glSimAllow: '1' }).ok,
  );
});

test('statistiques : médiane, quantiles, Spearman (égalités), Gini, valeurs nulles ignorées', () => {
  assert.equal(stats.mediane([3, 1, 2]), 2);
  assert.equal(stats.mediane([1, 2, 3, 4]), 2.5);
  assert.equal(stats.quantile([0, 10], 0.1), 1);
  assert.equal(stats.mediane([]), null);
  assert.equal(stats.mediane([null, undefined, '']), null, 'Number(null) ne vaut pas 0 ici');
  assert.equal(stats.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(stats.spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.ok(
    Math.abs(stats.spearman([1, 2, 2, 4], [1, 3, 3, 2])) < 1,
    'rangs moyens en cas d’égalité',
  );
  assert.equal(stats.spearman([1], [2]), null);
  assert.equal(stats.gini([5, 5, 5, 5]), 0);
  assert.equal(stats.gini([0, 0, 0, 0]), 0);
  assert.ok(stats.gini([0, 0, 0, 10]) > 0.7);
  assert.equal(stats.gini([]), null);
  const r = stats.resume([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(r.n, 10);
  assert.equal(r.mediane, 5.5);
  assert.ok(r.p10 < r.mediane && r.mediane < r.p90);
});

test('attendus : classe moyenne P1 (plages), classe en difficulté P3 (plafonds), indicateur non mesuré → non évalué', () => {
  const lignes = evaluerAttendus({
    classe: 'moyenne',
    plateau: 1,
    indicateurs: {
      partEntre4et6: 100,
      equipesSousVoile: 22,
      pagesPalies: 10,
      pagesTenues: 80,
      carnetComplet: 30,
      partGnomes: 47,
      elevesZero: 0,
      matthieu: 0.1,
      gini: 0.1,
      badgesPalier: null,
    },
  });
  const par = Object.fromEntries(lignes.map((l) => [l.indicateur, l]));
  assert.equal(par.equipesSousVoile.ok, true);
  assert.equal(par.equipesSousVoile.attendu, '15 – 30');
  assert.equal(par.badgesPalier.ok, null, 'non mesuré');
  assert.equal(par.doublePlafond.ok, null);
  const bilan = bilanAttendus(lignes);
  assert.equal(bilan.ok, true);
  assert.equal(bilan.evaluees, 9);
  const diff = evaluerAttendus({
    classe: 'difficulte',
    plateau: 3,
    indicateurs: { pagesPalies: 70, pagesTenues: 40, equipesSousVoile: 75, carnetComplet: 0 },
  });
  const d = Object.fromEntries(diff.map((l) => [l.indicateur, l]));
  assert.equal(d.pagesPalies.ok, false, '70 > 65');
  assert.equal(d.pagesTenues.ok, true, '40 ≥ 33');
  assert.equal(d.equipesSousVoile.ok, true, '75 ≤ 80');
  assert.equal(d.carnetComplet.ok, null, 'aucun attendu en difficulté');
  assert.deepEqual(bilanAttendus(diff).manquees, ['pagesPalies']);
});

test('grille : la grille livrée se lit (7 variantes, actuel et e1) ; une grille invalide est refusée', () => {
  const grille = lireGrille(
    path.join(__dirname, '..', 'data', 'gl', 'sim', 'grilles', 'grille-voile.json'),
  );
  assert.equal(grille.variantes.length, 7);
  const ids = grille.variantes.map((v) => v.id);
  assert.ok(ids.includes('actuel') && ids.includes('e1') && ids.includes('e1-e2-e3-e4'));
  const e1 = grille.variantes.find((v) => v.id === 'e1');
  assert.deepEqual(e1.reglages['gameplay.tenir_voile_bonus_par_plateau'], {
    1: 3,
    2: 4,
    3: 5,
    4: 6,
  });
  assert.equal(e1.reglages['gameplay.tenir_fouilles_reparation_gnome'], 1);
  assert.throws(() => validerGrille({ format: 'autre', variantes: [] }), GrilleError);
  assert.throws(
    () =>
      validerGrille({
        format: 'gl-sim-grille v1',
        variantes: [{ id: 'a', reglages: { 'gameplay.autre': 1 } }],
      }),
    /hors du groupe/,
  );
  assert.throws(
    () =>
      validerGrille({
        format: 'gl-sim-grille v1',
        variantes: [
          { id: 'a', reglages: {} },
          { id: 'a', reglages: {} },
        ],
      }),
    /en double/,
  );
});

test('instantané : liste blanche de tables de contenu ; une table de personnes ou une colonne nominative est refusée', () => {
  assert.ok(!CONTENT_TABLES.some((t) => /players|games|classes|users|admins/.test(t)));
  const ok = verifierSnapshotSansNominatif({
    format: 'gl-sim-contenu v1',
    tables: { gl_chapters: { columns: ['id', 'slug'], rows: [[1, 'a']] } },
  });
  assert.equal(ok.ok, true);
  const ko = verifierSnapshotSansNominatif({
    format: 'gl-sim-contenu v1',
    tables: {
      gl_players: { columns: ['id', 'pseudo'], rows: [] },
      gl_species: { columns: ['id', 'email'], rows: [] },
    },
  });
  assert.equal(ko.ok, false);
  assert.ok(ko.erreurs.some((e) => /gl_players/.test(e)));
  assert.ok(ko.erreurs.some((e) => /colonne nominative : gl_species.email/.test(e)));
});

test('personas : reproductibles par graine, bornées, profils distincts, pseudos jamais nominatifs', () => {
  const a = genererPersonas({ profil: 'moyenne', effectif: 20, seed: 42 });
  const b = genererPersonas({ profil: 'moyenne', effectif: 20, seed: 42 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 20);
  for (const p of a) {
    assert.ok(p.justesse >= 0.05 && p.justesse <= 0.98);
    assert.ok(p.assiduite >= 0.5 && p.assiduite <= 1);
    assert.ok(p.veillee >= 0 && p.veillee <= 0.9);
    assert.ok(['aveugle', 'futee', 'mixte'].includes(p.strategieFouille));
    assert.ok(!('pseudo' in p) && !('nom' in p) && !('prenom' in p));
  }
  const moy = (xs) => xs.reduce((s, p) => s + p.justesse, 0) / xs.length;
  const difficile = genererPersonas({ profil: 'difficulte', effectif: 200, seed: 1 });
  const experte = genererPersonas({ profil: 'experte', effectif: 200, seed: 1 });
  assert.ok(moy(difficile) < moy(a) && moy(a) < moy(experte));
  const forcee = genererPersonas({
    profil: 'moyenne',
    effectif: 5,
    seed: 3,
    strategieFouille: 'aveugle',
    penchants: { sorts: 0.95 },
  });
  assert.ok(forcee.every((p) => p.strategieFouille === 'aveugle' && p.penchants.sorts === 0.95));
  assert.equal(resumerPersonas(forcee).strategies.aveugle, 5);
  assert.throws(() => genererPersonas({ profil: 'inconnu' }), /Profil de classe inconnu/);
});

test('stratégie de fouille : aveugle uniforme, futée vise les contours puis les empreintes chaudes, les gnomes réparent', () => {
  const rng = creerRng(hashSeed('strategie'));
  const aveugle = choisirPointFouille({ strategie: 'aveugle', rng });
  assert.ok(aveugle.x > 0 && aveugle.x < 1 && aveugle.y > 0 && aveugle.y < 1);
  const pages = [
    { etat: 'trouvee', contour: { x: 0.2, y: 0.2 } },
    { etat: 'revelee', contour: { x: 0.7, y: 0.4 } },
    { etat: 'palie', contour: { x: 0.5, y: 0.8 } },
  ];
  const licorne = choisirPointFouille({
    strategie: 'futee',
    rng,
    pages,
    empreintes: [],
    gnome: false,
  });
  assert.deepEqual([licorne.x, licorne.y, licorne.raison], [0.7, 0.4, 'revelee']);
  const gnome = choisirPointFouille({
    strategie: 'futee',
    rng,
    pages,
    empreintes: [],
    gnome: true,
  });
  assert.equal(gnome.raison, 'palie');
  const chaud = choisirPointFouille({
    strategie: 'futee',
    rng,
    pages: [{ etat: 'trouvee', contour: { x: 0.2, y: 0.2 } }],
    empreintes: [
      { x: 0.21, y: 0.21, verdict: 'chaud' }, // périmée : à côté d'une page trouvée
      { x: 0.6, y: 0.6, verdict: 'chaud' },
    ],
  });
  assert.equal(chaud.raison, 'chaud');
  assert.ok(Math.hypot(chaud.x - 0.6, chaud.y - 0.6) <= 0.051);
  const loin = choisirPointFouille({
    strategie: 'futee',
    rng,
    pages: [],
    empreintes: [{ x: 0.5, y: 0.5, verdict: 'froid' }],
  });
  assert.ok(['exploration', 'aveugle'].includes(loin.raison));
  for (let i = 0; i < 20; i += 1) {
    const m = choisirPointFouille({ strategie: 'mixte', rng, pages: [], empreintes: [] });
    assert.ok(['aveugle', 'exploration'].includes(m.raison));
  }
});

test('crible élève : mot interdit du moteur, mot de corpus en avertissement, bourses d’une autre équipe', () => {
  const propre = controlerCorpsEleve(
    {
      feedback: 'Pas encore : la page dort encore ici.',
      verdict: 'froid',
      roster: [{ playerId: 1, teamId: 1, healthPoints: 3 }],
    },
    { membres: [1, 2] },
  );
  assert.deepEqual(propre, { moteur: [], corpus: [], bourses: [] });
  const moteur = controlerCorpsEleve({ error: 'Réponse faux, perdu' }, { membres: [] });
  assert.equal(moteur.moteur.length, 1);
  assert.equal(moteur.moteur[0].mot, 'faux');
  const corpus = controlerCorpsEleve(
    {
      feuillet: { texte: 'Le corbeau est arrivé.' },
      question: 'Qui attaque ?',
      displayText: 'Krâ',
    },
    { membres: [] },
  );
  assert.equal(corpus.moteur.length, 0);
  assert.equal(corpus.corpus.length, 3);
  const fuite = controlerCorpsEleve(
    {
      roster: [
        { playerId: 1, teamId: 1, healthPoints: 3, powerPoints: 3 },
        { playerId: 9, teamId: 2, healthPoints: 3 },
      ],
      vitality: { byPlayerId: { 1: {}, 9: {} } },
      events: [{ payload: { results: [{ playerId: 9, health: 2, power: 1 }] } }],
    },
    { membres: [1, 2] },
  );
  assert.equal(fuite.bourses.length, 4);
  assert.ok(fuite.bourses.every((b) => b.playerId === 9));
});

test('scénarios : les identifiants attendus existent et sont décrits', () => {
  assert.ok(listerScenarios().length >= 23);
  for (const id of [
    'hybride-reference',
    'tablette-reference',
    'tableau-pur',
    'classe-en-difficulte',
    'classe-experte',
    'effectif-24',
    'effectif-17',
    'absences-retraits',
    'economie-agressive',
    'chasse-aveugle',
    'chasse-futee',
    'voile-max',
    'voile-dort',
    'prologue',
    'plateau-2',
    'plateau-3',
    'plateau-4',
    'annee-complete',
    'concurrence',
    'veillee-semaine',
    'regression-7nov',
    'equilibrage',
    'badges',
  ]) {
    const s = trouverScenario(id);
    assert.ok(s, `scénario ${id}`);
    assert.ok(String(s.description).length > 10);
  }
  assert.deepEqual(trouverScenario('annee-complete').plateaux, [1, 2, 3, 4]);
  assert.equal(trouverScenario('concurrence').parallele, true);
  assert.equal(trouverScenario('prologue').profil, 'prologue');
  assert.equal(trouverScenario('voile-dort').prof.voileDort(2), true);
  assert.equal(trouverScenario('voile-dort').prof.voileDort(3), false);
});
