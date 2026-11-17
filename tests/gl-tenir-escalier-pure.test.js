'use strict';

/**
 * L'escalier du chapitre 1 (« Tenir à deux », ensemble unifié, M8) — cœur pur
 * `src/shared/glTenirEscalierCore.js` (miroir `lib/shared/glTenirEscalierCore.js`), 100 % des
 * branches : ce qui est ouvert à chaque séance, les sorts par marche, l'état lu dans les
 * réglages résolus d'une partie, et ce que le cœur des droits en fait.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/shared/glTenirEscalierCore');
const { resolveTenirPermissions } = require('../lib/shared/glTenirPermissionsCore');
const { resolveTenirSettings, parseOverrides, validateOverrides } = require('../lib/glTenir');
const { DEFAULT_GAMEPLAY } = require('../lib/glSettings');
const escalier = require('../lib/glEscalier');

const partie = (overrides) => ({
  tenir_profil: 'complet',
  tenir_overrides_json: overrides ? JSON.stringify(overrides) : null,
});
const resolu = (overrides) => resolveTenirSettings(DEFAULT_GAMEPLAY, partie(overrides));

test('escalierPourTour : la table des séances, cumulative, bornée', () => {
  assert.deepEqual(core.escalierPourTour(1), ['avancer', 'chercher', 'defi_case', 'trame']);
  assert.deepEqual(core.escalierPourTour(2), [
    'avancer',
    'chercher',
    'defi_case',
    'trame',
    'tenir',
    'erreur_du_jour',
  ]);
  assert.deepEqual(core.escalierPourTour(3).slice(6), ['voile', 'page_temoin', 'sorts', 'lumiere']);
  assert.deepEqual(core.escalierPourTour(4).slice(10), ['marche']);
  // Séances 5 et 6 : rien de nouveau.
  assert.deepEqual(core.escalierPourTour(5), core.escalierPourTour(4));
  assert.deepEqual(core.escalierPourTour(6), core.escalierPourTour(4));
  assert.deepEqual(core.escalierPourTour(99), [...core.ESCALIER_MODULES]);
  // Hors bornes ou illisible : la première marche, jamais moins.
  for (const n of [0, -3, null, undefined, 'x', NaN]) {
    assert.deepEqual(core.escalierPourTour(n), core.escalierPourTour(1), String(n));
  }
  assert.deepEqual(core.escalierPourTour(2.9), core.escalierPourTour(2), 'séance entière');
  assert.equal(core.ESCALIER_DERNIERE_SEANCE, 4);
  assert.equal(core.normaliserPas('3'), 3);
});

test('sorts : trois à la séance 3 pour chaque peuple, trois de plus à la séance 4', () => {
  assert.deepEqual(core.sortsDeLEscalier(1), []);
  assert.deepEqual(core.sortsDeLEscalier(2), []);
  // Progression ; Lanterne et Bourrasque (Licornes) ; Sentier et Relais (Gnomes).
  assert.deepEqual(core.sortsDeLEscalier(3), ['SL002', 'SL037', 'SL039', 'SL042', 'SL044']);
  // Relance, Farce, Question.
  assert.deepEqual(core.sortsDeLEscalier(4).slice(5), ['SL005', 'SL036', 'SL004']);
  assert.deepEqual(core.sortsDeLEscalier(6), [...core.ESCALIER_SORTS]);
  assert.equal(core.seanceDuSort('SL002'), 3);
  assert.equal(core.seanceDuSort('SL004'), 4);
  assert.equal(core.seanceDuSort('SL045'), null);
  assert.equal(core.seanceDuSort(null), null);
  assert.equal(core.seanceDuModule('tenir'), 2);
  assert.equal(core.seanceDuModule('marche'), 4);
  assert.equal(core.seanceDuModule('chapardeur'), null);
  assert.equal(core.seanceDuModule(undefined), null);
});

test('prochaine marche : ce qui s’ouvrira, puis plus rien', () => {
  assert.deepEqual(core.prochaineMarche(1), {
    seance: 2,
    modules: ['tenir', 'erreur_du_jour'],
    sorts: [],
  });
  assert.equal(core.prochaineMarche(3).seance, 4);
  assert.deepEqual(core.prochaineMarche(3).sorts, ['SL005', 'SL036', 'SL004']);
  assert.equal(core.prochaineMarche(4), null);
  assert.equal(core.prochaineMarche(12), null);
});

test('état d’une partie : hors escalier tout est ouvert ; dans l’escalier, seulement les marches montées', () => {
  for (const r of [null, undefined, {}, { escalier: true }, { escalier: false, escalier_pas: 2 }]) {
    assert.equal(core.etatEscalier(r), null);
    assert.equal(core.moduleOuvert(r, 'voile'), true);
    assert.equal(core.sortOuvert(r, 'SL045'), true);
  }
  const s1 = { escalier: true, escalier_pas: 1 };
  assert.deepEqual(core.etatEscalier(s1), {
    pas: 1,
    dernier: 4,
    monte: false,
    modules: ['avancer', 'chercher', 'defi_case', 'trame'],
    sorts: [],
    prochaine: { seance: 2, modules: ['tenir', 'erreur_du_jour'], sorts: [] },
  });
  assert.equal(core.moduleOuvert(s1, 'chercher'), true);
  assert.equal(core.moduleOuvert(s1, 'tenir'), false);
  assert.equal(core.moduleOuvert(s1, 'voile'), false);
  // Ce que l'escalier ne connaît pas n'est jamais fermé par lui.
  assert.equal(core.moduleOuvert(s1, 'chapardeur'), true);
  assert.equal(core.moduleOuvert(s1, null), true);
  assert.equal(core.sortOuvert(s1, 'SL002'), false);
  const s3 = { escalier: true, escalier_pas: 3 };
  assert.equal(core.sortOuvert(s3, 'SL002'), true);
  assert.equal(core.sortOuvert(s3, 'SL005'), false, 'Relance attend la séance 4');
  assert.equal(core.sortOuvert(s3, 'SL999'), false, 'un sort inconnu attend la dernière marche');
  assert.equal(core.sortOuvert(s3, null), false);
  const s4 = { escalier: true, escalier_pas: 4 };
  assert.equal(core.etatEscalier(s4).monte, true);
  assert.equal(core.etatEscalier(s4).prochaine, null);
  assert.equal(core.sortOuvert(s4, 'SL005'), true);
  assert.equal(core.sortOuvert(s4, 'SL999'), true, 'escalier monté : le chapitre décide');
  assert.equal(core.moduleOuvert(s4, 'marche'), true);
  // Un pas illisible retombe sur la première marche ; trop grand, sur la dernière.
  assert.equal(core.etatEscalier({ escalier: true, escalier_pas: 0 }).pas, 1);
  assert.equal(core.etatEscalier({ escalier: true, escalier_pas: 9 }).pas, 4);
});

test('réglages résolus d’une partie : l’escalier ferme le voile, le Marché et l’erreur du jour tant qu’ils ne sont pas ouverts', () => {
  const sans = resolu(null);
  assert.equal(sans.escalier, false);
  assert.equal(sans.escalier_pas, null);
  assert.equal(sans.escalier_modules, null);
  assert.deepEqual([sans.voile, sans.marche, sans.olu_erreur_du_jour], [true, true, true]);
  // Le réglage global seul ne fait monter personne : l'escalier vit dans la partie.
  assert.equal(resolu({ escalier: true }).escalier, false);
  assert.equal(resolu({ escalier: false, escalier_pas: 2 }).escalier, false);
  const attendu = {
    1: [false, false, false],
    2: [false, false, true],
    3: [true, false, true],
    4: [true, true, true],
  };
  for (const [pas, valeurs] of Object.entries(attendu)) {
    const r = resolu({ escalier: true, escalier_pas: Number(pas) });
    assert.equal(r.escalier, true);
    assert.equal(r.escalier_pas, Number(pas));
    assert.deepEqual(r.escalier_modules, core.escalierPourTour(Number(pas)));
    assert.deepEqual([r.voile, r.marche, r.olu_erreur_du_jour], valeurs, `séance ${pas}`);
  }
  // Le prof qui coupe le voile pour la partie le garde coupé une fois la marche montée.
  assert.equal(resolu({ escalier: true, escalier_pas: 4, voile: false }).voile, false);
  // Surcharges : booléen et pas borné, sinon écartés (la partie ne monte alors pas l'escalier).
  assert.deepEqual(parseOverrides('{"escalier": 1, "escalier_pas": 9}'), {});
  assert.deepEqual(parseOverrides('{"escalier": true, "escalier_pas": 2}'), {
    escalier: true,
    escalier_pas: 2,
  });
  assert.match(validateOverrides({ escalier: 'oui' }).error, /Surcharge invalide : escalier/);
  assert.match(validateOverrides({ escalier_pas: 0 }).error, /escalier_pas/);
});

test('droits : « tenir » et le Marché suivent l’escalier, pour l’équipe comme pour le prof', () => {
  const droits = (pas, extra = {}) =>
    resolveTenirPermissions({
      surface: 'tablette',
      phase: 'jeu',
      actorKind: 'player',
      settings: pas ? resolu({ escalier: true, escalier_pas: pas }) : resolu(null),
      ...extra,
    });
  assert.equal(droits(null).tenir, true, 'hors escalier');
  assert.deepEqual(
    [1, 2, 3, 4].map((pas) => droits(pas).tenir),
    [false, true, true, true],
  );
  assert.deepEqual(
    [1, 2, 3, 4].map((pas) => droits(pas).marche),
    [false, false, false, true],
  );
  // Lire reste permis à la séance 1 : la page trouvée se lit, elle se tiendra à la suivante.
  assert.equal(droits(1).lire, true);
  assert.equal(droits(1).fouiller, true);
  assert.equal(droits(1).lancer, true);
  assert.equal(droits(1, { surface: 'hybride' }).tenir, false);
  assert.equal(droits(2, { surface: 'hybride' }).tenir, true);
  assert.equal(
    droits(2, { surface: 'tableau' }).tenir,
    false,
    'au tableau, le prof porte le geste',
  );
  // Le prof, qui porte les gestes d'une équipe au tableau, monte le même escalier.
  assert.equal(droits(1, { actorKind: 'mj' }).tenir, false);
  assert.equal(droits(1, { actorKind: 'mj' }).marche, false);
  assert.equal(droits(1, { actorKind: 'mj' }).lancer, true);
  assert.equal(droits(2, { actorKind: 'mj' }).tenir, true);
  assert.equal(droits(4, { actorKind: 'projection' }).tenir, false);
  // Profil court : pendant le tour, on ne tient pas plus qu'on ne lit.
  assert.equal(
    resolveTenirPermissions({
      surface: 'tablette',
      phase: 'jeu',
      actorKind: 'player',
      settings: { lecture_pendant_tour: false },
    }).tenir,
    false,
  );
});

test('surcharges : la création pose l’escalier au plateau 1 ; le prof le coupe ou le remet, sans jamais choisir le pas', () => {
  const gameplay = { tenirEscalier: true };
  assert.deepEqual(escalier.surchargesDeCreation(null, { plateau: 1, gameplay }), {
    escalier: true,
    escalier_pas: 1,
  });
  assert.equal(escalier.surchargesDeCreation(null, { plateau: 2, gameplay }), null);
  assert.equal(
    escalier.surchargesDeCreation(null, { plateau: 1, gameplay: { tenirEscalier: false } }),
    null,
  );
  // Une configuration copiée garde ses surcharges, pas la séance d'une autre partie.
  assert.deepEqual(
    escalier.surchargesDeCreation(
      { surface: 'tablette', escalier: true, escalier_pas: 4 },
      { plateau: 1, gameplay },
    ),
    { surface: 'tablette', escalier: true, escalier_pas: 1 },
  );
  assert.deepEqual(
    escalier.surchargesDeCreation(
      { surface: 'tablette', escalier: true, escalier_pas: 4 },
      { plateau: 3, gameplay },
    ),
    { surface: 'tablette' },
  );
  // Le prof : le pas demandé n'est jamais écouté.
  const actuelles = { escalier: true, escalier_pas: 3 };
  assert.deepEqual(
    escalier.surchargesDuProf({ escalier: true, escalier_pas: 1, voile: true }, { actuelles }),
    { escalier: true, voile: true, escalier_pas: 3 },
  );
  // Remis après avoir été coupé : il repart de la séance en cours (tours clos + 1, 4 au plus).
  assert.deepEqual(escalier.surchargesDuProf({ escalier: true }, { toursClos: 1 }), {
    escalier: true,
    escalier_pas: 2,
  });
  assert.equal(escalier.surchargesDuProf({ escalier: true }, { toursClos: 9 }).escalier_pas, 4);
  assert.equal(escalier.surchargesDuProf({ escalier: true }).escalier_pas, 1);
  // Coupé, ou absent des surcharges envoyées : plus de pas, tout est ouvert.
  assert.deepEqual(escalier.surchargesDuProf({ escalier: false, escalier_pas: 2 }, { actuelles }), {
    escalier: false,
  });
  assert.deepEqual(escalier.surchargesDuProf({ surface: 'tablette' }, { actuelles }), {
    surface: 'tablette',
  });
  assert.deepEqual(escalier.surchargesDuProf(null), {});
  assert.equal(escalier.vueEscalier(resolu(null)), null);
  assert.equal(escalier.vueEscalier(resolu({ escalier: true, escalier_pas: 2 })).pas, 2);
});
