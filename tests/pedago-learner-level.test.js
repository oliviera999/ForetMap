'use strict';

// Résolveur de niveau côté serveur et éligibilité des questions de verrouillage
// (audit du 25/09/2026, § 3.2.1 et § 3.2.2 ; décision Q1 du mainteneur : repli sur toutes
// les questions quand aucune n'est au niveau de l'élève).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  maxPalierForLevel,
  resolveLearnerLevel,
  ETAPE_MAX_PALIER,
} = require('../lib/pedago/learnerLevel');
const { filterGatingLinksByLevel } = require('../lib/pedago/eligibility');

test('maxPalierForLevel — étape seule, classe connue, université', () => {
  assert.equal(maxPalierForLevel({ etape: 'college', curriculumNiveaux: null }), 2);
  assert.equal(maxPalierForLevel({ etape: 'college', curriculumNiveaux: ['cycle3'] }), 1);
  assert.equal(maxPalierForLevel({ etape: 'lycee', curriculumNiveaux: null }), 5);
  assert.equal(maxPalierForLevel({ etape: 'universite', curriculumNiveaux: null }), null);
  assert.equal(ETAPE_MAX_PALIER.college, 2);
});

test('resolveLearnerLevel — le défaut Collège du site n’est qu’un repli', () => {
  // Groupe Lycée : l'élève est au lycée (le minimum avec le défaut du site le ramenait au collège).
  const lycee = resolveLearnerLevel({ siteDefault: 'college', groupLevels: ['lycee'] });
  assert.equal(lycee.etape, 'lycee');
  assert.equal(lycee.maxPalier, 5);
  // Aucune information : défaut du site.
  const rien = resolveLearnerLevel({ siteDefault: 'college' });
  assert.equal(rien.etape, 'college');
  assert.equal(rien.maxPalier, 2);
  // Classe de 6e (cycle 3) : palier 1.
  const sixieme = resolveLearnerLevel({
    siteDefault: 'college',
    groupLevels: ['college'],
    classNiveaux: ['cycle3'],
  });
  assert.equal(sixieme.maxPalier, 1);
});

const LINKS = [
  { question_code: 'Q1', question_niveau: 'college' },
  { question_code: 'Q2', question_niveau: 'lycee' },
];

test('filterGatingLinksByLevel — un élève de collège ne reçoit pas les questions de lycée', () => {
  const out = filterGatingLinksByLevel(LINKS, { maxPalier: 2 });
  assert.deepEqual(
    out.links.map((l) => l.question_code),
    ['Q1'],
  );
  assert.equal(out.levelFallback, 'none');
  assert.equal(out.outOfLevel, 1);
});

test('filterGatingLinksByLevel — repli sur toutes les questions (décision Q1)', () => {
  const onlyLycee = [{ question_code: 'Q2', question_niveau: 'lycee' }];
  const out = filterGatingLinksByLevel(onlyLycee, { maxPalier: 2 });
  assert.deepEqual(
    out.links.map((l) => l.question_code),
    ['Q2'],
  );
  assert.equal(out.levelFallback, 'all_levels');
});

test('filterGatingLinksByLevel — sans niveau (professeur, université) : aucun filtre', () => {
  assert.equal(filterGatingLinksByLevel(LINKS, null).links.length, 2);
  assert.equal(filterGatingLinksByLevel(LINKS, { maxPalier: null }).links.length, 2);
  assert.equal(filterGatingLinksByLevel(LINKS, { maxPalier: 5 }).links.length, 2);
});

// ---------------------------------------------------------------------------------------
// Échelle unique et séance qui impose son niveau (décisions du 25/09/2026, questions 4 et 5).
// ---------------------------------------------------------------------------------------

const {
  sessionLearnerNiveaux,
  readPedagoSessionParam,
  LEARNER_LEVEL_SOURCES,
} = require('../lib/pedago/learnerLevel');

const SEANCE_COLLEGE = { level: 'college', notionNiveau: 'college' };
const SEANCE_CYCLE4 = { level: 'college', notionNiveau: 'cycle4' };
const SEANCE_LYCEE = { level: 'lycee', notionNiveau: 'lycee' };

test('séance : public `level`, précisé par `notionNiveau` dans la même étape', () => {
  assert.deepEqual(sessionLearnerNiveaux(SEANCE_COLLEGE), ['cycle3', 'cycle4']);
  assert.deepEqual(sessionLearnerNiveaux(SEANCE_CYCLE4), ['cycle4']);
  assert.equal(sessionLearnerNiveaux(SEANCE_LYCEE).length, 5);
  // Notions de collège révisées dans une séance lycée : filtre de contenu, pas un public.
  assert.equal(sessionLearnerNiveaux({ level: 'lycee', notionNiveau: 'cycle4' }).length, 5);
  assert.deepEqual(sessionLearnerNiveaux({ level: 'universite' }), ['universite']);
  assert.deepEqual(sessionLearnerNiveaux({ notionNiveau: 'seconde' }), ['seconde']);
  assert.deepEqual(sessionLearnerNiveaux(null), []);
  assert.deepEqual(sessionLearnerNiveaux({ notionNiveau: 'n’importe quoi' }), []);
});

test('la séance impose son niveau, y compris au verrouillage', () => {
  // Une 6ᵉ dans une séance lycée reçoit les questions de lycée.
  const sixiemeLycee = resolveLearnerLevel({ classNiveaux: ['cycle3'], session: SEANCE_LYCEE });
  assert.equal(sixiemeLycee.etape, 'lycee');
  assert.equal(sixiemeLycee.maxPalier, 5);
  assert.equal(sixiemeLycee.sources.niveau, 'seance');
  // Une seconde dans une séance collège : la séance impose aussi vers le bas.
  const secondeCollege = resolveLearnerLevel({
    classNiveaux: ['seconde'],
    session: SEANCE_COLLEGE,
  });
  assert.equal(secondeCollege.niveau, 'cycle4');
  assert.equal(secondeCollege.maxPalier, 2);
  assert.equal(secondeCollege.etape, 'college');
});

test('dans la plage de la séance, la classe précise le niveau', () => {
  const sixieme = resolveLearnerLevel({ classNiveaux: ['cycle3'], session: SEANCE_COLLEGE });
  assert.equal(sixieme.niveau, 'cycle3');
  assert.deepEqual(sixieme.curriculumNiveaux, ['cycle3']);
  assert.equal(sixieme.maxPalier, 1);
  // Séance « cycle 4 » explicite : respectée telle quelle pour une 6ᵉ.
  const explicite = resolveLearnerLevel({ classNiveaux: ['cycle3'], session: SEANCE_CYCLE4 });
  assert.equal(explicite.niveau, 'cycle4');
  assert.equal(explicite.maxPalier, 2);
});

test('la classe (curriculum_niveau) prime sur les anciens réglages de groupe et de carte', () => {
  const seconde = resolveLearnerLevel({
    siteDefault: 'college',
    classNiveaux: ['seconde'],
    groupLevels: ['college'],
    mapLevel: 'college',
  });
  assert.equal(seconde.niveau, 'seconde');
  assert.equal(seconde.etape, 'lycee');
  assert.equal(seconde.maxPalier, 3);
  assert.deepEqual(seconde.curriculumNiveaux, ['cycle3', 'cycle4', 'seconde']);
  assert.deepEqual(seconde.sources, { niveau: 'classe', affichage: 'classe' });
  // Plusieurs classes : la plus haute.
  assert.equal(resolveLearnerLevel({ classNiveaux: ['cycle3', 'cycle4'] }).niveau, 'cycle4');
});

test('université : niveau de l’échelle, aucune borne', () => {
  const club = resolveLearnerLevel({ classNiveaux: ['seconde', 'universite'] });
  assert.equal(club.niveau, 'universite');
  assert.equal(club.etape, 'universite');
  assert.equal(club.maxPalier, null);
  assert.equal(club.curriculumNiveaux, null);
  // L'ancienne valeur « Université » d'un groupe désigne ce niveau sans ambiguïté.
  const legacy = resolveLearnerLevel({ groupLevels: ['universite'] });
  assert.equal(legacy.niveau, 'universite');
  assert.equal(legacy.sources.niveau, 'groupe');
  assert.equal(resolveLearnerLevel({ session: { level: 'universite' } }).maxPalier, null);
});

test('replis hérités : groupe, carte, puis défaut de l’établissement', () => {
  assert.deepEqual(resolveLearnerLevel({ groupLevels: ['lycee'] }).sources.niveau, 'groupe');
  const carte = resolveLearnerLevel({ mapLevel: 'lycee' });
  assert.equal(carte.etape, 'lycee');
  assert.equal(carte.niveau, null);
  assert.equal(carte.maxPalier, 5);
  assert.equal(carte.sources.niveau, 'carte');
  const site = resolveLearnerLevel({ siteDefault: 'lycee' });
  assert.equal(site.sources.niveau, 'site');
  assert.equal(site.maxPalier, 5);
  // Groupe Collège sur une carte Lycée : l'ancienne règle (le plus simple) est gardée.
  assert.equal(
    resolveLearnerLevel({ groupLevels: ['college'], mapLevel: 'lycee' }).etape,
    'college',
  );
});

test('préférence de l’élève : affichage seulement, jamais les questions', () => {
  const simplifie = resolveLearnerLevel({ classNiveaux: ['seconde'], userPreference: 'college' });
  assert.equal(simplifie.etape, 'college');
  assert.equal(simplifie.contentEtape, 'lycee');
  assert.deepEqual(simplifie.curriculumNiveaux, ['cycle3', 'cycle4']);
  assert.equal(simplifie.maxPalier, 3, 'les questions suivent la classe');
  assert.equal(simplifie.sources.affichage, 'preference');
  // Sans l'option, elle ne relève pas ; avec, elle relève l'affichage (pas le palier).
  const refuse = resolveLearnerLevel({ classNiveaux: ['cycle3'], userPreference: 'universite' });
  assert.equal(refuse.etape, 'college');
  const releve = resolveLearnerLevel({
    classNiveaux: ['cycle3'],
    userPreference: 'universite',
    prefCanRaise: true,
  });
  assert.equal(releve.etape, 'universite');
  assert.equal(releve.maxPalier, 1);
});

test('invité, aperçu et vue complète du professeur', () => {
  const invite = resolveLearnerLevel({
    isGuest: true,
    classNiveaux: ['seconde'],
    session: SEANCE_LYCEE,
    userPreference: 'universite',
    prefCanRaise: true,
  });
  assert.equal(invite.etape, 'college');
  assert.equal(invite.maxPalier, 2);
  assert.equal(invite.sources.niveau, 'invite');
  const apercu = resolveLearnerLevel({ teacherPreview: 'college', session: SEANCE_LYCEE });
  assert.equal(apercu.etape, 'college');
  assert.equal(apercu.sources.niveau, 'apercu');
  // Aperçu d'un niveau précis (cycle 3) : l'échelle unique le permet.
  assert.equal(resolveLearnerLevel({ teacherPreview: 'cycle3' }).maxPalier, 1);
  const complet = resolveLearnerLevel({ teacherFullView: true, session: SEANCE_COLLEGE });
  assert.equal(complet.etape, 'universite');
  assert.equal(complet.maxPalier, null);
  for (const out of [invite, apercu, complet]) {
    assert.ok(LEARNER_LEVEL_SOURCES.includes(out.sources.niveau));
  }
});

test('paramètre de séance : chaîne courte seulement', () => {
  assert.equal(readPedagoSessionParam({ query: { pedagoSession: ' abc ' } }), 'abc');
  assert.equal(readPedagoSessionParam({ query: {}, body: { pedagoSession: 'x' } }), 'x');
  assert.equal(readPedagoSessionParam({ query: { pedagoSession: ['a', 'b'] } }), null);
  assert.equal(readPedagoSessionParam({ query: { pedagoSession: 'x'.repeat(121) } }), null);
  assert.equal(readPedagoSessionParam(null), null);
});

test('le miroir ESM résout exactement comme le serveur', async () => {
  const ui = await import('../src/utils/learnerLevel.js');
  const server = require('../lib/pedago/learnerLevel');
  assert.deepEqual(ui.ETAPE_MAX_PALIER, server.ETAPE_MAX_PALIER);
  assert.deepEqual(ui.LEARNER_LEVEL_SOURCES, server.LEARNER_LEVEL_SOURCES);
  const cases = [
    {},
    { isGuest: true },
    { teacherPreview: 'lycee' },
    { teacherPreview: 'cycle4' },
    { teacherFullView: true },
    { classNiveaux: ['cycle3'], session: SEANCE_LYCEE },
    { classNiveaux: ['cycle3'], session: SEANCE_COLLEGE },
    { classNiveaux: ['seconde'], session: SEANCE_CYCLE4 },
    { classNiveaux: ['es_premiere', 'cycle4'], userPreference: 'college' },
    { classNiveaux: ['universite'] },
    { groupLevels: ['lycee', 'universite'], mapLevel: 'college' },
    { mapLevel: 'universite', siteDefault: 'lycee', userPreference: 'college' },
    { siteDefault: 'lycee', userPreference: 'universite', prefCanRaise: true },
    { session: { level: 'lycee', notionNiveau: 'cycle4' } },
  ];
  for (const input of cases) {
    assert.deepEqual(ui.resolveLearnerLevel(input), server.resolveLearnerLevel(input), input);
    assert.deepEqual(
      ui.sessionLearnerNiveaux(input.session),
      server.sessionLearnerNiveaux(input.session),
    );
  }
});
