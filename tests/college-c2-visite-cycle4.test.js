'use strict';

// Assouplissement du profil collège (22/11/2026, flux C2, lot 5) : la Visite sans compte
// (parents, visiteurs institutionnels) passe au palier **cycle 4** (décision 6). L'affichage
// reste celui du collège ; seules les règles de palier changent : glossaire jusqu'à
// `approfondissement`, questions de palier 2, types réservés au cycle 4 visibles. L'élève sans
// classe et le compte personnel sans groupe restent au cycle 3.

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { resolveLearnerLevel, GUEST_NIVEAU } = require('../lib/pedago/learnerLevel');
const core = require('../lib/shared/pedagoVisibilityCore');
const { foodWebTypesForPedagoLevel } = require('../lib/biodivPedagoLevel');
const {
  INTERACTION_TYPE_ENUM,
  CYCLE4_ONLY_INTERACTION_TYPE_ENUM,
} = require('../lib/shared/biodivEnums');
const { GLOSSARY_NIVEAU_ENUM } = require('../lib/shared/pedagoEnums');
const { learnerNiveauPalier, curriculumNiveauxForEtape } = require('../lib/pedagoScales');

let front;

before(async () => {
  front = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'learnerLevel.js')).href
  );
});

const [GLOSSARY_BASE, GLOSSARY_APPROFONDISSEMENT] = GLOSSARY_NIVEAU_ENUM.values;

/** Entrées d'un invité : tout le reste est ignoré (aucune échappatoire). */
const GUEST_INPUTS = [
  { isGuest: true },
  { isGuest: true, mapLevel: 'lycee', siteDefault: 'universite' },
  { isGuest: true, classNiveaux: ['seconde'], userPreference: 'universite', prefCanRaise: true },
  { isGuest: true, teacherPreview: 'cycle3', session: { level: 'lycee' } },
];

test('invité : niveau cycle 4, étape collège, palier 2, source « invite »', () => {
  assert.equal(GUEST_NIVEAU, 'cycle4');
  for (const input of GUEST_INPUTS) {
    const out = resolveLearnerLevel(input);
    assert.equal(out.niveau, GUEST_NIVEAU, JSON.stringify(input));
    assert.equal(out.etape, 'college');
    assert.equal(out.contentEtape, 'college');
    assert.equal(out.maxPalier, learnerNiveauPalier(GUEST_NIVEAU));
    assert.equal(out.sources.niveau, 'invite');
    assert.equal(core.palierProfileFor(out), 'cycle4');
    assert.equal(core.visibilityProfileFor(out), 'college');
  }
});

test('invité : parité front ↔ serveur', () => {
  assert.equal(front.GUEST_NIVEAU, GUEST_NIVEAU);
  for (const input of GUEST_INPUTS) {
    assert.deepEqual(front.resolveLearnerLevel(input), resolveLearnerLevel(input), input);
  }
});

test('invité : notions du collège entier (cycle 3 et cycle 4)', () => {
  const out = resolveLearnerLevel({ isGuest: true });
  assert.deepEqual(
    [...out.curriculumNiveaux].sort(),
    [...curriculumNiveauxForEtape('college')].sort(),
  );
});

test('invité : règles du palier cycle 4 (glossaire, quiz, types du réseau)', () => {
  const guest = resolveLearnerLevel({ isGuest: true });
  assert.equal(core.palierRuleFor('glossary_depth_max', guest), GLOSSARY_APPROFONDISSEMENT);
  assert.equal(core.palierRuleFor('quiz_entry_palier_max', guest), 2);
  assert.deepEqual(core.palierRuleFor('foodweb_types_cycle4_only', guest), []);
  const types = foodWebTypesForPedagoLevel(guest, INTERACTION_TYPE_ENUM.values);
  for (const t of CYCLE4_ONLY_INTERACTION_TYPE_ENUM.values) {
    assert.ok(types.includes(t), `type ${t} visible en Visite`);
  }
});

test('affichage collège simplifié inchangé pour l’invité', () => {
  const guest = resolveLearnerLevel({ isGuest: true });
  const sixieme = resolveLearnerLevel({ classNiveaux: ['cycle3'] });
  for (const feature of core.PEDAGO_VISIBILITY_FEATURES) {
    assert.deepEqual(
      core.visibilityFor(feature, guest),
      core.visibilityFor(feature, sixieme),
      `brique ${feature}`,
    );
  }
});

test('élève sans classe et compte personnel sans groupe : toujours cycle 3', () => {
  const sansClasse = resolveLearnerLevel({ siteDefault: 'college' });
  assert.equal(core.palierProfileFor(sansClasse), 'cycle3');
  assert.equal(core.palierRuleFor('glossary_depth_max', sansClasse), GLOSSARY_BASE);
  const staff = resolveLearnerLevel({ staff: true });
  assert.equal(staff.niveau, 'cycle3');
  assert.equal(core.palierProfileFor(staff), 'cycle3');
  for (const input of [{ siteDefault: 'college' }, { staff: true }]) {
    assert.deepEqual(front.resolveLearnerLevel(input), resolveLearnerLevel(input), input);
  }
});
