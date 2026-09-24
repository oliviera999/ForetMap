'use strict';

// Référentiel unique des échelles de niveau (lib/pedagoScales.js).
//
// Cinq échelles coexistent (étape d'affichage, niveau de question, difficulté, profondeur
// de terme, niveau scolaire du programme). Ce fichier garde leurs correspondances : une
// dérive ici se verrait en classe (question de lycée tirée pour une 6ᵉ, séance lycée en
// 400), jamais dans un test d'interface.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const scales = require('../lib/pedagoScales');
const { CURRICULUM_NIVEAUX } = require('../lib/curriculumNotions');
const { curriculumNiveauxForPedagoLevel } = require('../lib/biodivPedagoLevel');

const {
  CURRICULUM_NIVEAU_VALUES,
  CURRICULUM_PALIERS,
  ETAPE_CURRICULUM_NIVEAUX,
  QUIZ_NIVEAU_ENTRY,
  GLOSSARY_NIVEAU_ENTRY,
  curriculumPalier,
  etapeForCurriculumNiveau,
  curriculumNiveauxForEtape,
  curriculumNiveauxUpTo,
  parseNotionNiveauFilter,
  quizNiveauEntryPalier,
  glossaryNiveauEntryPalier,
  contentMayInheritNotion,
  inheritanceExclusionsFor,
  visibleCurriculumNiveaux,
} = scales;

test('le pivot suit exactement l’ENUM curriculum_notions.niveau', () => {
  assert.deepEqual(
    [...CURRICULUM_NIVEAU_VALUES],
    CURRICULUM_NIVEAUX.map((n) => n.value),
  );
  for (const value of CURRICULUM_NIVEAU_VALUES) {
    assert.ok(Number.isInteger(CURRICULUM_PALIERS[value]), `palier manquant : ${value}`);
  }
});

test('chaque niveau scolaire appartient à exactement une étape', () => {
  const covered = [...ETAPE_CURRICULUM_NIVEAUX.college, ...ETAPE_CURRICULUM_NIVEAUX.lycee];
  assert.deepEqual([...covered].sort(), [...CURRICULUM_NIVEAU_VALUES].sort());
  assert.equal(new Set(covered).size, covered.length);
  assert.equal(etapeForCurriculumNiveau('cycle3'), 'college');
  assert.equal(etapeForCurriculumNiveau('cycle4'), 'college');
  assert.equal(etapeForCurriculumNiveau('es_terminale'), 'lycee');
  assert.equal(etapeForCurriculumNiveau('quatrieme'), null);
  assert.deepEqual(curriculumNiveauxForEtape('universite'), []);
});

test('spécialité et enseignement scientifique sont au même palier', () => {
  assert.equal(curriculumPalier('premiere_spe'), curriculumPalier('es_premiere'));
  assert.equal(curriculumPalier('terminale_spe'), curriculumPalier('es_terminale'));
  assert.ok(curriculumPalier('cycle3') < curriculumPalier('cycle4'));
  assert.ok(curriculumPalier('cycle4') < curriculumPalier('seconde'));
  assert.deepEqual(curriculumNiveauxUpTo('cycle4'), ['cycle3', 'cycle4']);
  assert.deepEqual(curriculumNiveauxUpTo('seconde'), ['cycle3', 'cycle4', 'seconde']);
});

test('les paliers d’entrée des contenus pointent vers des niveaux réels', () => {
  for (const entry of [
    ...Object.values(QUIZ_NIVEAU_ENTRY),
    ...Object.values(GLOSSARY_NIVEAU_ENTRY),
  ]) {
    assert.ok(CURRICULUM_NIVEAU_VALUES.includes(entry), entry);
  }
  // Le niveau d'une question est une étape : son palier d'entrée ouvre la plage de l'étape.
  for (const [niveau, entry] of Object.entries(QUIZ_NIVEAU_ENTRY)) {
    assert.equal(ETAPE_CURRICULUM_NIVEAUX[niveau][0], entry);
  }
  assert.equal(quizNiveauEntryPalier('college'), 1);
  assert.equal(quizNiveauEntryPalier('lycee'), 3);
  assert.equal(glossaryNiveauEntryPalier('base'), 1);
  assert.equal(glossaryNiveauEntryPalier('approfondissement'), 2);
  assert.equal(glossaryNiveauEntryPalier('avance'), 3);
  assert.equal(glossaryNiveauEntryPalier('inconnu'), null);
});

test('une question de lycée n’hérite pas des notions de collège — l’inverse reste permis', () => {
  const lycee = quizNiveauEntryPalier('lycee');
  const college = quizNiveauEntryPalier('college');
  assert.equal(contentMayInheritNotion(lycee, 'cycle4'), false);
  assert.equal(contentMayInheritNotion(lycee, 'seconde'), true);
  assert.equal(contentMayInheritNotion(college, 'cycle3'), true);
  assert.equal(contentMayInheritNotion(college, 'terminale_spe'), true);
  // Palier d'entrée inconnu : aucune restriction plutôt qu'une question orpheline.
  assert.equal(contentMayInheritNotion(null, 'cycle3'), true);
});

test('les exclusions SQL se déduisent des paliers d’entrée', () => {
  assert.deepEqual(inheritanceExclusionsFor(QUIZ_NIVEAU_ENTRY), [
    { contentNiveau: 'lycee', notionNiveaux: ['cycle3', 'cycle4'] },
  ]);
  assert.deepEqual(inheritanceExclusionsFor(GLOSSARY_NIVEAU_ENTRY), [
    { contentNiveau: 'approfondissement', notionNiveaux: ['cycle3'] },
    { contentNiveau: 'avance', notionNiveaux: ['cycle3', 'cycle4'] },
  ]);
});

test('notionNiveau accepte un niveau, une étape ou une liste', () => {
  assert.equal(parseNotionNiveauFilter(''), null);
  assert.equal(parseNotionNiveauFilter(null), null);
  assert.deepEqual(parseNotionNiveauFilter('cycle4'), { niveaux: ['cycle4'] });
  assert.deepEqual(parseNotionNiveauFilter('Collège'), { niveaux: ['cycle3', 'cycle4'] });
  assert.deepEqual(parseNotionNiveauFilter('lycee').niveaux, [...ETAPE_CURRICULUM_NIVEAUX.lycee]);
  assert.deepEqual(parseNotionNiveauFilter('seconde, cycle3,seconde'), {
    niveaux: ['cycle3', 'seconde'],
  });
  assert.deepEqual(parseNotionNiveauFilter('quatrieme'), { error: 'notionNiveau invalide' });
  // L'université n'a pas de notion propre : la demander n'a pas de sens comme filtre.
  assert.deepEqual(parseNotionNiveauFilter('universite'), { error: 'notionNiveau invalide' });
});

test('niveaux visibles : l’étape plafonne, la classe resserre', () => {
  assert.deepEqual(visibleCurriculumNiveaux({ level: 'college' }), ['cycle3', 'cycle4']);
  assert.equal(visibleCurriculumNiveaux({ level: 'lycee' }), null);
  // Une 6ᵉ (cycle 3) ne voit plus le cycle 4.
  assert.deepEqual(visibleCurriculumNiveaux({ level: 'college', classNiveaux: ['cycle3'] }), [
    'cycle3',
  ]);
  // Une seconde voit ce qui précède sa classe.
  assert.deepEqual(visibleCurriculumNiveaux({ level: 'lycee', classNiveaux: ['seconde'] }), [
    'cycle3',
    'cycle4',
    'seconde',
  ]);
  // Plusieurs classes : le plus haut palier l'emporte.
  assert.deepEqual(
    visibleCurriculumNiveaux({ level: 'college', classNiveaux: ['cycle3', 'cycle4', null] }),
    ['cycle3', 'cycle4'],
  );
  // Classe de lycée mais affichage Collège : l'étape, plus restrictive, l'emporte.
  assert.deepEqual(visibleCurriculumNiveaux({ level: 'college', classNiveaux: ['seconde'] }), [
    'cycle3',
    'cycle4',
  ]);
  assert.deepEqual(curriculumNiveauxForPedagoLevel('college', ['cycle3']), ['cycle3']);
  assert.equal(curriculumNiveauxForPedagoLevel('universite'), null);
});

test('le miroir ESM reste identique au module serveur', async () => {
  const ui = await import('../src/utils/pedagoScales.js');
  const constants = [
    'CURRICULUM_NIVEAU_VALUES',
    'CURRICULUM_PALIERS',
    'ETAPES',
    'ETAPE_CURRICULUM_NIVEAUX',
    'QUIZ_NIVEAU_ENTRY',
    'GLOSSARY_NIVEAU_ENTRY',
  ];
  for (const name of constants) {
    assert.deepEqual(ui[name], scales[name], `constante divergente : ${name}`);
  }
  const functions = Object.keys(scales).filter((name) => typeof scales[name] === 'function');
  for (const name of functions) {
    assert.equal(typeof ui[name], 'function', `fonction absente du miroir : ${name}`);
  }
  const samples = [
    ['parseNotionNiveauFilter', ['college,seconde']],
    ['visibleCurriculumNiveaux', [{ level: 'lycee', classNiveaux: ['es_premiere'] }]],
    ['inheritanceExclusionsFor', [GLOSSARY_NIVEAU_ENTRY]],
    ['etapeForCurriculumNiveau', ['terminale_spe']],
    ['contentMayInheritNotion', [3, 'cycle4']],
  ];
  for (const [name, args] of samples) {
    assert.deepEqual(ui[name](...args), scales[name](...args), `résultat divergent : ${name}`);
  }
});
