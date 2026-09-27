'use strict';

// Caractérisation des listes de valeurs du serveur branchées sur le référentiel partagé des ENUM
// (audit du 25/09/2026, § 3.2.5, étape B1 — piste B, sans changement de comportement).
//
// Valeurs, ordre et libellés écrits **en dur**, volontairement : ce fichier passe sur le code
// d'avant la bascule (listes recopiées dans chaque module) comme sur celui d'après (listes lues
// dans lib/shared/*Enums.js). Aucun accès à la base.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const scales = require('../lib/pedagoScales');
const biodivLevel = require('../lib/biodivPedagoLevel');
const sessions = require('../lib/pedagoSessions');
const learningLinks = require('../lib/pedago/learningLinks');
const fmQuizCrud = require('../lib/fmQuizCrud');
const fmQuizImport = require('../lib/fmQuizImport');

const CURRICULUM = [
  'cycle3',
  'cycle4',
  'seconde',
  'premiere_spe',
  'terminale_spe',
  'es_premiere',
  'es_terminale',
];

test('pedagoScales : étapes, niveaux du programme et de l’apprenant', () => {
  assert.deepEqual([...scales.ETAPES], ['college', 'lycee', 'universite']);
  assert.deepEqual([...scales.CURRICULUM_NIVEAU_VALUES], CURRICULUM);
  assert.deepEqual([...scales.LEARNER_NIVEAU_VALUES], [...CURRICULUM, 'universite']);
  for (const list of [
    scales.ETAPES,
    scales.CURRICULUM_NIVEAU_VALUES,
    scales.LEARNER_NIVEAU_VALUES,
  ]) {
    assert.ok(Object.isFrozen(list));
  }
  assert.equal(scales.normalizeEtape('Lycée'), 'lycee');
  assert.equal(scales.normalizeLearnerNiveau('UNIVERSITE'), 'universite');
  assert.equal(scales.normalizeLearnerNiveau('quatrieme'), null);
});

test('biodivPedagoLevel : étapes, libellés, rangs et types du collège', () => {
  assert.deepEqual([...biodivLevel.PEDAGO_LEVELS], ['college', 'lycee', 'universite']);
  assert.deepEqual(
    { ...biodivLevel.PEDAGO_LEVEL_LABELS },
    { college: 'Collège', lycee: 'Lycée', universite: 'Université' },
  );
  assert.deepEqual(
    [...biodivLevel.COLLEGE_FOODWEB_TYPES],
    [
      'pollinisation',
      'herbivorie',
      'predation',
      'plante_hote',
      'decomposition',
      'detritivorie',
      'parasitisme',
      'competition',
      'symbiose',
    ],
  );
  assert.equal(biodivLevel.normalizePedagoLevel(' Lycée '), 'lycee');
  assert.equal(biodivLevel.normalizePedagoLevel('bidon'), null);
  assert.equal(biodivLevel.pedagoLevelLabel('universite'), 'Université');
  assert.equal(biodivLevel.pedagoLevelLabel('bidon'), '');
  assert.equal(biodivLevel.minPedagoLevel(['universite', 'lycee']), 'lycee');
  assert.equal(biodivLevel.minPedagoLevel([null, 'bidon']), 'college');
});

test('pedagoSessions : publics visés d’une séance', () => {
  assert.deepEqual([...sessions.LEVELS], ['college', 'lycee', 'universite']);
  assert.ok(sessions.LEVELS instanceof Set);
  assert.equal(sessions.normalizeLevel('universite'), 'universite');
  assert.equal(sessions.normalizeLevel('cycle4'), 'college');
  assert.equal(sessions.normalizeLevel(null), 'college');
});

test('learningLinks : origines et statuts d’un lien (clés, valeurs, ordre)', () => {
  assert.deepEqual(Object.entries(learningLinks.LINK_ORIGINS), [
    ['MANUAL', 'manual'],
    ['AUTO', 'auto'],
    ['IMPORT', 'import'],
    ['GENERATED', 'generated'],
    ['KEYWORD', 'keyword'],
    ['EDITORIAL', 'editorial'],
  ]);
  assert.deepEqual(Object.entries(learningLinks.LINK_STATUSES), [
    ['APPROVED', 'approved'],
    ['SUGGESTED', 'suggested'],
    ['REJECTED', 'rejected'],
  ]);
  assert.ok(Object.isFrozen(learningLinks.LINK_ORIGINS));
  assert.ok(Object.isFrozen(learningLinks.LINK_STATUSES));
});

test('quiz (éditeur et import) : niveau borné, thème et statut admis', () => {
  const body = { question_code: 'QF9999', categorie_slug: 'x', question: 'Q ?' };
  assert.equal(fmQuizCrud.normalizeQuestionApiBody({ ...body, niveau: 'LYCEE' }).niveau, 'lycee');
  assert.equal(
    fmQuizCrud.normalizeQuestionApiBody({ ...body, niveau: 'universite' }).niveau,
    'college',
  );
  assert.equal(fmQuizImport.buildQuestionPayload({ niveau: 'Lycee' }).niveau, 'lycee');
  assert.equal(fmQuizImport.buildQuestionPayload({ niveau: 'cycle4' }).niveau, 'college');

  const cat = (theme) => fmQuizImport.validateCategoryPayload({ slug: 's', nom: 'n', theme }, 2);
  assert.deepEqual(cat('sciences'), []);
  assert.deepEqual(cat('jardinage'), []);
  assert.equal(cat('cuisine').length, 1);

  const row = {
    id: '1',
    categorie_slug: 'cat',
    numero_dans_categorie: '1',
    question: 'Q ?',
    choix_a: 'A',
    choix_b: 'B',
    choix_c: 'C',
    reponse_correcte: 'A',
  };
  const known = new Set(['cat']);
  for (const statut of ['actif', 'inactif', 'Inactif']) {
    const payload = fmQuizImport.buildQuestionPayload({ ...row, statut });
    assert.deepEqual(fmQuizImport.validateQuestionPayload(payload, 2, known), [], statut);
  }
  const bad = fmQuizImport.buildQuestionPayload({ ...row, statut: 'brouillon' });
  assert.ok(fmQuizImport.validateQuestionPayload(bad, 2, known).some((e) => e.field === 'statut'));
});
