'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  CONTEXT_CLAIM,
  CUSTOM_CLAIM,
  ROLES_CLAIM,
  resolveLaunchDestination,
} = require('../lib/lti/bindings');
const { DEFAULT_LAUNCH_BINDINGS } = require('../lib/lti/settingsRegistry');

const SETTINGS = {
  launchBindings: DEFAULT_LAUNCH_BINDINGS.map((b) => ({ ...b })),
  landingOptions: ['aiguillage', 'gl_game', 'gl_home', 'fm_map', 'fm_tasks'],
  instructorTargets: ['fm', 'gl'],
};

function claims({ courseId, roles = ['Learner'], custom = {} }) {
  return {
    [ROLES_CLAIM]: roles,
    [CONTEXT_CLAIM]: { id: String(courseId) },
    [CUSTOM_CLAIM]: custom,
  };
}

test('paramètre d’activité valide gagne sur la liaison du cours', () => {
  const dest = resolveLaunchDestination({
    claims: claims({
      courseId: 564,
      custom: { product: 'fm', landing: 'fm_tasks' },
    }),
    settings: SETTINGS,
  });
  assert.strictEqual(dest.ok, true);
  assert.strictEqual(dest.source, 'custom');
  assert.strictEqual(dest.product, 'fm');
  assert.strictEqual(dest.landing, 'fm_tasks');
  assert.strictEqual(dest.destinations.length, 1);
  assert.strictEqual(dest.destinations[0].id, 'fm_tasks');
});

test('sans paramètre valide : liaison du cours 564 → G&L', () => {
  const dest = resolveLaunchDestination({
    claims: claims({ courseId: 564 }),
    settings: SETTINGS,
  });
  assert.strictEqual(dest.source, 'binding');
  assert.strictEqual(dest.product, 'gl');
  assert.strictEqual(dest.chapterId, 1);
  assert.ok(dest.destinations.some((d) => d.id === 'gl_game'));
});

test('cours 511 → ForetMap', () => {
  const dest = resolveLaunchDestination({
    claims: claims({ courseId: 511 }),
    settings: SETTINGS,
  });
  assert.strictEqual(dest.product, 'fm');
  assert.ok(dest.destinations.some((d) => d.product === 'fm'));
});

test('cours inconnu : refus', () => {
  const dest = resolveLaunchDestination({
    claims: claims({ courseId: 99999 }),
    settings: SETTINGS,
  });
  assert.strictEqual(dest.ok, false);
  assert.match(dest.error, /n’est pas lié/);
  assert.strictEqual(dest.destinations.length, 0);
});

test('n3beur dans un cours G&L : aiguillage des deux produits', () => {
  const dest = resolveLaunchDestination({
    claims: claims({ courseId: 564 }),
    settings: SETTINGS,
    isN3beur: true,
  });
  assert.strictEqual(dest.product, 'both');
  assert.strictEqual(dest.landing, 'aiguillage');
  assert.ok(dest.destinations.some((d) => d.product === 'fm'));
  assert.ok(dest.destinations.some((d) => d.product === 'gl'));
});

test('Instructor : cibles enseignant, pas le landing élève', () => {
  const dest = resolveLaunchDestination({
    claims: claims({
      courseId: 564,
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
    }),
    settings: SETTINGS,
  });
  assert.strictEqual(dest.instructor, true);
  assert.strictEqual(dest.landing, 'aiguillage');
  assert.deepStrictEqual(dest.destinations.map((d) => d.product).sort(), ['fm', 'gl']);
});

test('custom both avec landing autre que aiguillage est ignoré (liaison)', () => {
  const dest = resolveLaunchDestination({
    claims: claims({
      courseId: 564,
      custom: { product: 'both', landing: 'gl_game' },
    }),
    settings: SETTINGS,
  });
  assert.strictEqual(dest.source, 'binding');
  assert.strictEqual(dest.product, 'gl');
});
