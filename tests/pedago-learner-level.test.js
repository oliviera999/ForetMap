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
