'use strict';

// Contrat de l'adaptateur de produit du verrouillage (audit du 25/09/2026, § 3.1 ; décision Q18).
//
//   1. Les deux adaptateurs exposent la même forme (un moteur, deux produits).
//   2. Les descripteurs reprennent exactement les tables, colonnes et types d'avant l'extraction.
//   3. Les trois lectures historiques du paramètre `product` sont conservées, valeur par valeur.
//   4. Garde d'isolement : hors de `lib/pedago/gatingProducts.js`, aucun module du moteur
//      n'importe de code GL ni ne teste le produit par une comparaison littérale.
//
// Tests purs : aucune base n'est lue (les hooks qui en ont besoin ne sont pas appelés ici ; ils
// sont couverts par tests/learning-gating-products-characterization.test.js).

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  GATING_PRODUCTS,
  FM_MARKABLE,
  GL_MARKABLE,
  resolveGatingProduct,
  gatingProductOrDefault,
  exactGatingProduct,
  gatingTablesOf,
} = require('../lib/pedago/gatingProducts');
const catalog = require('../lib/pedago/gatingProductCatalog');
const runtime = require('../lib/learningGatingRuntime');
const orphans = require('../lib/learningGatingOrphans');
const { filterGatingLinksByLevel } = require('../lib/pedago/eligibility');
const {
  FORETMAP_RESOURCE_TYPES,
  GL_RESOURCE_TYPES,
} = require('../lib/shared/resourceQuestionGatingCore');

const { fm, gl } = GATING_PRODUCTS;

test('les deux adaptateurs ont la même forme', () => {
  assert.deepEqual(Object.keys(fm).sort(), Object.keys(gl).sort());
  assert.deepEqual(Object.keys(fm.capabilities).sort(), Object.keys(gl.capabilities).sort());
  assert.deepEqual(Object.keys(fm.tables).sort(), ['cooldowns', 'links', 'policy']);
  assert.deepEqual(Object.keys(gl.tables).sort(), ['cooldowns', 'links', 'policy']);
  for (const hook of [
    'loadSiteSettings',
    'readerKey',
    'resolveLearner',
    'listCorrectCodes',
    'listTeamCorrectCodes',
    'resolveChapterGranularity',
    'decorateQuestionEntry',
    'lockLearner',
  ]) {
    assert.equal(typeof fm[hook], 'function', `fm.${hook}`);
    assert.equal(typeof gl[hook], 'function', `gl.${hook}`);
  }
  // Une capacité absente va de pair avec un hook absent.
  assert.equal(typeof fm.filterLinksByLevel, 'function');
  assert.equal(gl.filterLinksByLevel, null);
  assert.equal(fm.recordAttempt, null);
  assert.equal(typeof gl.recordAttempt, 'function');
  assert.ok(Object.isFrozen(fm) && Object.isFrozen(gl) && Object.isFrozen(GATING_PRODUCTS));
});

test('descripteurs : tables, types, capacités, source des questions (inchangés)', () => {
  assert.deepEqual(fm.tables, {
    links: 'resource_question_links',
    policy: 'resource_gating_policy',
    cooldowns: 'resource_gating_cooldowns',
  });
  assert.deepEqual(gl.tables, {
    links: 'gl_resource_question_links',
    policy: 'gl_resource_gating_policy',
    cooldowns: 'gl_resource_gating_cooldowns',
  });
  assert.equal(fm.resourceTypes, FORETMAP_RESOURCE_TYPES);
  assert.equal(gl.resourceTypes, GL_RESOURCE_TYPES);
  assert.deepEqual([...fm.markable].sort(), ['glossary', 'plant', 'tutorial']);
  assert.deepEqual([...gl.markable].sort(), [
    'content_page',
    'ecosystem',
    'feuillet',
    'glossary',
    'lore_glossary',
    'species',
    'tutorial',
  ]);
  assert.deepEqual(fm.capabilities, {
    levelFilter: true,
    questionDatasets: false,
    teamAnswers: false,
    chapterGranularity: false,
  });
  assert.deepEqual(gl.capabilities, {
    levelFilter: false,
    questionDatasets: true,
    teamAnswers: true,
    chapterGranularity: true,
  });
  assert.equal(fm.questions.source, 'quiz_questions');
  assert.equal(fm.questions.levelColumn, 'niveau');
  assert.match(fm.questions.linkColumnsSql, /AS question_niveau/);
  assert.deepEqual(gl.questions.source, {
    qcm: 'gl_qcm_questions',
    qcm_lore: 'gl_qcm_lore_questions',
  });
  assert.equal(gl.questions.levelColumn, null);
  assert.match(gl.questions.linkColumnsSql, /l\.question_dataset/);
  assert.equal(fm.filterLinksByLevel, filterGatingLinksByLevel);
});

test('les ensembles « validables » restent les mêmes objets partout (réexports)', () => {
  assert.equal(FM_MARKABLE, catalog.FM_MARKABLE);
  assert.equal(GL_MARKABLE, catalog.GL_MARKABLE);
  assert.equal(runtime.FM_MARKABLE, FM_MARKABLE);
  assert.equal(runtime.GL_MARKABLE, GL_MARKABLE);
  assert.equal(fm.markable, FM_MARKABLE);
  assert.equal(gl.markable, GL_MARKABLE);
  assert.equal(runtime.getFmGatingSite, fm.loadSiteSettings);
});

test('clé du lecteur dans la table des verrous', () => {
  assert.equal(fm.learner.where, 'user_id = ?');
  assert.equal(fm.learner.insertColumns, 'user_id');
  assert.equal(fm.learner.insertPlaceholders, '?');
  assert.deepEqual(fm.learner.values({ userId: 42 }), ['42']);
  // Pas de contrôle dans `values` (lecture historique de readWrongAttempts) : c'est `isKnown`.
  assert.deepEqual(fm.learner.values({}), ['undefined']);
  assert.equal(fm.learner.isKnown({ userId: 'u1' }), true);
  assert.equal(fm.learner.isKnown({ userId: '' }), false);

  assert.equal(gl.learner.where, 'reader_user_type = ? AND reader_user_id = ?');
  assert.equal(gl.learner.insertColumns, 'reader_user_type, reader_user_id');
  assert.equal(gl.learner.insertPlaceholders, '?, ?');
  const reader = { reader_user_type: 'gl_player', reader_user_id: '7' };
  assert.deepEqual(gl.learner.values({ reader }), ['gl_player', '7']);
  assert.deepEqual(gl.learner.values({}), [undefined, undefined]);
  assert.equal(gl.learner.isKnown({ reader }), true);
  assert.equal(gl.learner.isKnown({ reader: { reader_user_type: 'gl_player' } }), false);
  assert.equal(gl.learner.isKnown({ userId: 'u1' }), false);
});

test('lecteur d’un défi : compte ForetMap ou couple GL, refus 403 historiques', () => {
  assert.deepEqual(fm.resolveLearner({ userId: 'u1', glAuth: { userType: 'x', userId: 'y' } }), {
    ok: true,
    userId: 'u1',
    reader: null,
  });
  assert.deepEqual(fm.resolveLearner({}), {
    ok: false,
    status: 403,
    error: 'Authentification requise',
  });
  assert.equal(fm.readerKey({ userType: 'gl_player', userId: '1' }), null);

  const glAuth = { userType: 'gl_player', userId: 12 };
  assert.deepEqual(gl.resolveLearner({ glAuth }), {
    ok: true,
    userId: null,
    reader: { reader_user_type: 'gl_player', reader_user_id: '12' },
  });
  assert.deepEqual(gl.resolveLearner({ userId: 'u1' }), {
    ok: false,
    status: 403,
    error: 'Profil invalide',
  });
  assert.deepEqual(gl.readerKey(glAuth), { reader_user_type: 'gl_player', reader_user_id: '12' });
});

test('hooks sans base : entrée de question, apprenant d’un verrou, capacités absentes', async () => {
  const fmEntry = { question_code: 'Q1', already_correct: false };
  fm.decorateQuestionEntry(fmEntry, { question_dataset: 'qcm_lore' });
  assert.deepEqual(fmEntry, { question_code: 'Q1', already_correct: false });

  const glEntry = { question_code: 'Q1', already_correct: true };
  gl.decorateQuestionEntry(glEntry, { question_dataset: ' QCM_Lore ' });
  assert.deepEqual(Object.keys(glEntry), ['question_code', 'already_correct', 'question_dataset']);
  assert.equal(glEntry.question_dataset, 'qcm_lore');
  const glDefault = {};
  gl.decorateQuestionEntry(glDefault, {});
  assert.equal(glDefault.question_dataset, 'qcm');

  const row = { user_id: 'u1', reader_user_type: 'gl_guest', reader_user_id: 'g9' };
  assert.deepEqual(fm.lockLearner(row), { user_id: 'u1', user_type: 'student' });
  assert.deepEqual(gl.lockLearner(row), { user_id: 'g9', user_type: 'gl_guest' });

  assert.deepEqual(await fm.listTeamCorrectCodes(null, { teamId: 3 }), []);
  assert.equal(await fm.resolveChapterGranularity(null, {}), null);
});

test('lectures historiques du paramètre `product`, valeur par valeur', () => {
  const cases = [
    // valeur,       free (défi), orDefault (verrous…), exact (résumé, politiques)
    ['fm', 'fm', 'fm', 'fm'],
    ['gl', 'gl', 'gl', 'gl'],
    ['GL', 'gl', 'gl', null],
    [' gl ', 'gl', 'fm', null],
    ['foretmap', 'fm', 'fm', null],
    [' ForetMap ', 'fm', 'fm', null],
    ['FM', 'fm', 'fm', null],
    ['xx', null, 'fm', null],
    ['', null, 'fm', null],
    [null, null, 'fm', null],
    [undefined, null, 'fm', null],
  ];
  for (const [value, free, orDefault, exact] of cases) {
    const label = JSON.stringify(value);
    assert.equal(resolveGatingProduct(value)?.id ?? null, free, `free ${label}`);
    assert.equal(gatingProductOrDefault(value).id, orDefault, `orDefault ${label}`);
    assert.equal(exactGatingProduct(value)?.id ?? null, exact, `exact ${label}`);
    // Le catalogue et l'adaptateur lisent la valeur de la même façon.
    assert.equal(catalog.resolveGatingProduct(value)?.id ?? null, free);
    assert.equal(catalog.gatingProductOrDefault(value).id, orDefault);
    assert.equal(catalog.exactGatingProduct(value)?.id ?? null, exact);
  }
  // L'adaptateur renvoie l'objet complet (hooks compris), le catalogue la partie statique.
  assert.equal(resolveGatingProduct('gl'), gl);
  assert.equal(catalog.resolveGatingProduct('gl'), catalog.GATING_PRODUCT_CATALOG.gl);
  assert.equal(catalog.GATING_PRODUCT_CATALOG.gl.loadSiteSettings, undefined);
});

test('tables purgées avec une ressource (orphelins) : ordre et contenu inchangés', () => {
  assert.deepEqual(
    [...orphans.FM_TABLES],
    ['resource_question_links', 'resource_gating_policy', 'resource_gating_cooldowns'],
  );
  assert.deepEqual(
    [...orphans.GL_TABLES],
    ['gl_resource_question_links', 'gl_resource_gating_policy', 'gl_resource_gating_cooldowns'],
  );
  assert.deepEqual(gatingTablesOf(fm), orphans.FM_TABLES);
});

// ---------------------------------------------------------------------
// Garde d'isolement GL
// ---------------------------------------------------------------------

const ROOT = path.join(__dirname, '..');
/** Modules du moteur : tout ce qui est commun aux deux produits. */
const ENGINE_FILES = [
  'lib/learningGatingAcknowledge.js',
  'lib/learningGatingAdmin.js',
  'lib/learningGatingCooldown.js',
  'lib/learningGatingLockMode.js',
  'lib/learningGatingOrphans.js',
  'lib/learningGatingPresentation.js',
  'lib/learningGatingProgress.js',
  'lib/learningGatingRuntime.js',
  'lib/learningGatingSummary.js',
  'lib/gatingPolicyLoad.js',
  'lib/gatingPolicyRouteHelpers.js',
  'lib/learningLinksBulk.js',
  'lib/pedago/gatingProductCatalog.js',
];

function codeOf(relPath) {
  // Commentaires retirés : la documentation a le droit de nommer GL et ses tables.
  return fs
    .readFileSync(path.join(ROOT, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

test('isolement : seul l’adaptateur importe du code Gnomes & Licornes', () => {
  for (const file of ENGINE_FILES) {
    const imports = [...codeOf(file).matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
    const glImports = imports.filter((spec) => /(^|\/)gl[A-Z]/.test(spec) || /\/gl\//.test(spec));
    assert.deepEqual(glImports, [], `${file} importe du code GL : ${glImports.join(', ')}`);
  }
  const adapterImports = [
    ...codeOf('lib/pedago/gatingProducts.js').matchAll(/require\(\s*'([^']+)'\s*\)/g),
  ].map((m) => m[1]);
  assert.deepEqual(adapterImports.filter((spec) => /(^|\/)gl[A-Z]/.test(spec)).sort(), [
    '../glGatingChapterGranularity',
    '../glPlayerMembership',
    '../glQcmAttempts',
    '../glSettings',
  ]);
});

test('isolement : plus aucune comparaison littérale du produit dans le moteur', () => {
  const comparison = /[!=]==\s*'(gl|fm)'|'(gl|fm)'\s*[!=]==/;
  for (const file of ENGINE_FILES.filter((f) => !f.includes('gatingProductCatalog'))) {
    const lines = codeOf(file).split('\n');
    const hits = lines.map((l, i) => [i + 1, l]).filter(([, l]) => comparison.test(l));
    assert.deepEqual(
      hits,
      [],
      `${file} teste encore le produit : ${hits.map(([n]) => `l. ${n}`).join(', ')}`,
    );
  }
});

test('isolement : aucune table `gl_*` nommée en dur hors du catalogue', () => {
  for (const file of ENGINE_FILES.filter((f) => !f.includes('gatingProductCatalog'))) {
    const hits = codeOf(file).match(/\bgl_[a-z_]+\b/g) || [];
    // `gl_player` est un type de lecteur (valeur de `reader_user_type`), pas une table.
    const tables = hits.filter((h) => h !== 'gl_player');
    assert.deepEqual(tables, [], `${file} nomme une table GL : ${tables.join(', ')}`);
  }
});
