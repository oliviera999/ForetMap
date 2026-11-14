'use strict';

/** Peuple d'une mascotte du catalogue G&L (lib/glMascotType.js) : fonction pure. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeGlMascotType,
  inferGlMascotTypeFromLabel,
  resolveGlMascotType,
} = require('../lib/glMascotType');

test('normalizeGlMascotType : gnome / unicorn seulement, insensible à la casse', () => {
  assert.equal(normalizeGlMascotType('gnome'), 'gnome');
  assert.equal(normalizeGlMascotType(' Unicorn '), 'unicorn');
  assert.equal(normalizeGlMascotType('licorne'), null);
  assert.equal(normalizeGlMascotType(''), null);
  assert.equal(normalizeGlMascotType(null), null);
});

test('inferGlMascotTypeFromLabel : libellés réels du studio', () => {
  assert.equal(inferGlMascotTypeFromLabel('Gnome des forêts (femme)'), 'gnome');
  assert.equal(inferGlMascotTypeFromLabel('gnome néon'), 'gnome');
  assert.equal(inferGlMascotTypeFromLabel('Licorne du bestiaire'), 'unicorn');
  assert.equal(inferGlMascotTypeFromLabel('Zeph — Licorne Dark-Punk'), 'unicorn');
  assert.equal(inferGlMascotTypeFromLabel('Unicorn test'), 'unicorn');
  assert.equal(inferGlMascotTypeFromLabel('Olu — pack unifié'), null);
  assert.equal(inferGlMascotTypeFromLabel('Kraa le voleur (compact)'), null);
  assert.equal(inferGlMascotTypeFromLabel('Ol'), null);
  assert.equal(inferGlMascotTypeFromLabel(undefined), null);
  // Les deux mots : le gnome gagne (ordre documenté, identique à la migration 343).
  assert.equal(inferGlMascotTypeFromLabel('Gnome à dos de licorne'), 'gnome');
});

test('resolveGlMascotType : le type du pack prime sur le libellé', () => {
  assert.equal(resolveGlMascotType({ type: 'unicorn', labels: ['Gnome néon'] }), 'unicorn');
  assert.equal(resolveGlMascotType({ type: 'gnome', labels: ['Olu'] }), 'gnome');
  // Type invalide ou absent : déduction depuis les libellés, dans l'ordre.
  assert.equal(resolveGlMascotType({ type: 'dragon', labels: ['Licorne marine'] }), 'unicorn');
  assert.equal(resolveGlMascotType({ labels: ['Ol', 'OLU (planches)'] }), null);
  assert.equal(resolveGlMascotType({ labels: ['Pack 3', 'Gnome du bestiaire'] }), 'gnome');
  assert.equal(resolveGlMascotType({}), null);
  assert.equal(resolveGlMascotType(), null);
});
