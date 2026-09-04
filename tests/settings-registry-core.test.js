'use strict';

// Noyau commun des registres de réglages (lib pure, sans BDD) — `castValue` extrait de
// `lib/settings.js` : les messages historiques sont GELÉS ici, les extensions (`json`,
// `validate`, `normalize`, `errorMessage`) vérifiées une par une.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/shared/settingsRegistryCore');

const { castValue, defaultsOf, validateKey, metaOf, gatingRegistryEntries } = core;

test('castValue — clé inconnue', () => {
  assert.throws(() => castValue(null, 1), { message: 'Clé de réglage inconnue' });
  assert.throws(() => castValue({ type: 'mystere' }, 1), {
    message: 'Type de réglage non supporté',
  });
});

test('castValue — booléen : formes tolérées et message historique', () => {
  const meta = { type: 'boolean', default: false };
  assert.equal(castValue(meta, true), true);
  assert.equal(castValue(meta, 'true'), true);
  assert.equal(castValue(meta, 1), true);
  assert.equal(castValue(meta, '0'), false);
  assert.equal(castValue(meta, false), false);
  assert.throws(() => castValue(meta, 'oui'), { message: 'Valeur booléenne attendue' });
});

test('castValue — nombre : arrondi, bornes et messages historiques', () => {
  const meta = { type: 'number', min: 6, max: 32, default: 14 };
  assert.equal(castValue(meta, '20'), 20);
  assert.equal(castValue(meta, 19.6), 20);
  assert.throws(() => castValue(meta, 'abc'), { message: 'Valeur numérique attendue' });
  assert.throws(() => castValue(meta, 2), { message: 'Valeur trop petite (min 6)' });
  assert.throws(() => castValue(meta, 99), { message: 'Valeur trop grande (max 32)' });
  assert.equal(castValue({ type: 'number', default: 0 }, -5000), -5000, 'sans bornes');
});

test('castValue — enum et string : trim, bornes, messages historiques', () => {
  const enumMeta = { type: 'enum', values: ['login', 'register'], default: 'login' };
  assert.equal(castValue(enumMeta, '  register '), 'register');
  assert.throws(() => castValue(enumMeta, 'autre'), { message: 'Valeur invalide: autre' });
  const strMeta = { type: 'string', maxLength: 5, default: '' };
  assert.equal(castValue(strMeta, '  abc '), 'abc');
  assert.equal(castValue(strMeta, null), '');
  assert.throws(() => castValue(strMeta, 'abcdef'), {
    message: 'Texte trop long (max 5 caractères)',
  });
});

test('castValue — json : objet/tableau, chaîne JSON parsée, formes', () => {
  const meta = { type: 'json', default: {} };
  assert.deepEqual(castValue(meta, { a: 1 }), { a: 1 });
  assert.deepEqual(castValue(meta, [1, 2]), [1, 2]);
  assert.deepEqual(castValue(meta, '{"a":1}'), { a: 1 });
  assert.throws(() => castValue(meta, 'texte'), { message: 'Objet ou tableau JSON attendu' });
  assert.throws(() => castValue(meta, 42), { message: 'Objet ou tableau JSON attendu' });
  assert.throws(() => castValue(meta, null), { message: 'Objet ou tableau JSON attendu' });

  const objMeta = { type: 'json', shape: 'object', default: {} };
  assert.throws(() => castValue(objMeta, [1]), { message: 'Objet JSON attendu' });
  const arrMeta = { type: 'json', shape: 'array', default: [] };
  assert.throws(() => castValue(arrMeta, { a: 1 }), { message: 'Liste JSON attendue' });
  const anyMeta = { type: 'json', shape: 'any', default: null };
  assert.equal(castValue(anyMeta, 'texte'), 'texte', 'shape any : la forme est laissée à validate');
  assert.throws(() => castValue(anyMeta, undefined), { message: 'Valeur JSON attendue' });
});

test('castValue — validate reçoit (casté, brut) et son message est conservé', () => {
  const meta = {
    type: 'number',
    min: 0,
    max: 99,
    default: 0,
    validate: (n, raw) => (Number.isInteger(Number(raw)) ? null : 'entier attendu'),
  };
  assert.equal(castValue(meta, 3), 3);
  assert.throws(() => castValue(meta, 3.5), { message: 'entier attendu' });
});

test('castValue — normalize s’applique après validation', () => {
  const meta = {
    type: 'json',
    default: [],
    validate: (v) => (Array.isArray(v) ? null : 'liste attendue'),
    normalize: (v) => v.map((x) => String(x).trim()).filter(Boolean),
  };
  assert.deepEqual(castValue(meta, [' a ', '', 'b']), ['a', 'b']);
  assert.throws(() => castValue(meta, { a: 1 }), { message: 'liste attendue' });
});

test('castValue — errorMessage remplace tout message (cast, validate, normalize)', () => {
  const msg = 'La valeur doit être un entier entre 0 et 99';
  const meta = {
    type: 'number',
    min: 0,
    max: 99,
    default: 3,
    validate: (n, raw) => (Number.isInteger(Number(raw)) ? null : 'non entier'),
    errorMessage: msg,
  };
  assert.throws(() => castValue(meta, 'abc'), { message: msg });
  assert.throws(() => castValue(meta, 120), { message: msg });
  assert.throws(() => castValue(meta, 2.5), { message: msg });
  assert.equal(castValue(meta, 42), 42);
  const boom = {
    type: 'string',
    default: '',
    normalize: () => {
      throw new Error('interne');
    },
    errorMessage: 'message public',
  };
  assert.throws(() => castValue(boom, 'x'), { message: 'message public' });
});

test('defaultsOf copie les défauts (tableaux/objets non partagés)', () => {
  const registry = {
    'a.list': { type: 'json', default: ['x'] },
    'a.obj': { type: 'json', default: { k: 1 } },
    'a.n': { type: 'number', default: 7 },
  };
  const d = defaultsOf(registry);
  assert.deepEqual(d, { 'a.list': ['x'], 'a.obj': { k: 1 }, 'a.n': 7 });
  d['a.list'].push('y');
  d['a.obj'].k = 2;
  assert.deepEqual(registry['a.list'].default, ['x']);
  assert.deepEqual(registry['a.obj'].default, { k: 1 });
});

test('validateKey / metaOf — propriétés propres uniquement', () => {
  const registry = { 'ui.x': { type: 'boolean', default: true } };
  assert.equal(validateKey(registry, 'ui.x'), registry['ui.x']);
  assert.throws(() => validateKey(registry, 'ui.y'), { message: 'Clé de réglage inconnue' });
  assert.throws(() => validateKey(registry, 'constructor'), {
    message: 'Clé de réglage inconnue',
  });
  assert.throws(() => validateKey(registry, '__proto__'), { message: 'Clé de réglage inconnue' });
  assert.equal(metaOf(registry, 'toString'), null);
  assert.equal(metaOf(registry, 'ui.x'), registry['ui.x']);
});

test('gatingRegistryEntries dérive le catalogue commun pour chaque produit', () => {
  const gatingCore = require('../lib/shared/gatingSettingsCore');
  const fm = gatingRegistryEntries('fm', { scope: 'teacher' });
  const gl = gatingRegistryEntries('gl', { group: 'gating' });
  assert.deepEqual(Object.keys(fm).sort(), gatingCore.gatingKeysFor('fm').sort());
  assert.deepEqual(Object.keys(gl).sort(), gatingCore.gatingKeysFor('gl').sort());
  assert.equal(fm['learning.gating.enabled'].scope, 'teacher');
  assert.equal(gl['gating.enabled'].group, 'gating');
  assert.deepEqual(gl['gating.default_mode'].values, [...gatingCore.GATING_MODE_VALUES]);
  assert.equal(gl['gating.retry_cooldown_days'].min, 0);
  assert.equal(gl['gating.retry_cooldown_days'].max, 365);
  assert.equal(fm['learning.gating.granularity'], undefined, 'clé propre à GL');
});
