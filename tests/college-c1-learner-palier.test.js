'use strict';

// Chantier collège (flux C1, point 5) : profil de palier d'un apprenant résolu par le
// résolveur unique (`lib/pedago/learnerLevel.js`, miroir `src/utils/learnerLevel.js`).
//
// - une séance règle le palier par `notionNiveau` (`cycle3` / `cycle4`) ;
// - une carte réglée « lycée » ne fait pas basculer un élève dont la classe est au collège ;
// - l'aperçu du professeur « 6e » / « 3e » donne le palier cycle 3 / cycle 4 ;
// - Visite sans compte et collégien sans classe : cycle 3 ;
// - parité front ↔ serveur sur ces cas.

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { resolveLearnerLevel } = require('../lib/pedago/learnerLevel');
const core = require('../lib/shared/pedagoVisibilityCore');

let frontResolve;

before(async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'learnerLevel.js')).href
  );
  frontResolve = mod.resolveLearnerLevel;
});

const CASES = [
  {
    name: 'classe de 6e, séance collège « cycle 4 »',
    input: { classNiveaux: ['cycle3'], session: { level: 'college', notionNiveau: 'cycle4' } },
    etape: 'college',
    palier: 'cycle4',
  },
  {
    name: 'classe de 3e, séance collège « cycle 3 »',
    input: { classNiveaux: ['cycle4'], session: { level: 'college', notionNiveau: 'cycle3' } },
    etape: 'college',
    palier: 'cycle3',
  },
  {
    name: 'classe de 6e, séance « tout le collège » : la classe précise',
    input: { classNiveaux: ['cycle3'], session: { level: 'college', notionNiveau: 'college' } },
    etape: 'college',
    palier: 'cycle3',
  },
  {
    name: 'séance « cycle 3 » sans public ni classe',
    input: { session: { level: null, notionNiveau: 'cycle3' } },
    etape: 'college',
    palier: 'cycle3',
  },
  {
    name: 'classe de 6e sur une carte réglée « lycée »',
    input: { classNiveaux: ['cycle3'], mapLevel: 'lycee', siteDefault: 'lycee' },
    etape: 'college',
    palier: 'cycle3',
  },
  {
    name: 'classe de 3e sur une carte réglée « lycée » et un groupe « université »',
    input: { classNiveaux: ['cycle4'], mapLevel: 'lycee', groupLevels: ['universite'] },
    etape: 'college',
    palier: 'cycle4',
  },
  {
    name: 'aperçu du professeur « 6e »',
    input: { teacherPreview: 'cycle3', classNiveaux: ['seconde'] },
    etape: 'college',
    palier: 'cycle3',
  },
  {
    name: 'aperçu du professeur « 3e »',
    input: { teacherPreview: 'cycle4' },
    etape: 'college',
    palier: 'cycle4',
  },
  {
    name: 'aperçu « collège » mémorisé avant le chantier',
    input: { teacherPreview: 'college' },
    etape: 'college',
    palier: 'cycle3',
  },
  {
    name: 'Visite sans compte',
    input: { isGuest: true, mapLevel: 'lycee' },
    etape: 'college',
    palier: 'cycle3',
  },
  {
    name: 'collégien sans classe (repli établissement)',
    input: { siteDefault: 'college' },
    etape: 'college',
    palier: 'cycle3',
  },
  {
    name: 'classe de seconde',
    input: { classNiveaux: ['seconde'] },
    etape: 'lycee',
    palier: 'lycee',
  },
];

for (const c of CASES) {
  test(`palier — ${c.name}`, () => {
    const server = resolveLearnerLevel(c.input);
    assert.equal(server.etape, c.etape, 'étape');
    assert.equal(core.palierProfileFor(server), c.palier, 'palier');
    const front = frontResolve(c.input);
    assert.deepEqual(front, server, 'parité front ↔ serveur');
  });
}

test('une carte « lycée » ne change aucune brique d’affichage d’un collégien', () => {
  const sansCarte = resolveLearnerLevel({ classNiveaux: ['cycle3'] });
  const carteLycee = resolveLearnerLevel({ classNiveaux: ['cycle3'], mapLevel: 'lycee' });
  for (const feature of core.PEDAGO_VISIBILITY_FEATURES) {
    assert.deepEqual(
      core.visibilityFor(feature, carteLycee),
      core.visibilityFor(feature, sansCarte),
      feature,
    );
  }
  for (const rule of core.PEDAGO_PALIER_RULES) {
    assert.deepEqual(
      core.palierRuleFor(rule, carteLycee),
      core.palierRuleFor(rule, sansCarte),
      rule,
    );
  }
});
