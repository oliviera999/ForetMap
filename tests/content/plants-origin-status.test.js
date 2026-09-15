'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne } = require('../../database');

before(async () => {
  await initSchema();
});

test('gambusie et élodée sont marquées envahissantes', async () => {
  for (const name of ['Gambusie', 'Elodée']) {
    const row = await queryOne('SELECT name, origin_status FROM plants WHERE name = ?', [name]);
    assert.ok(row, `fiche absente : ${name}`);
    assert.equal(row.origin_status, 'envahissant', `${name} doit être envahissante`);
  }
});

test('tilapia du Nil et figuier de Barbarie sont marqués introduits', async () => {
  for (const name of ['Tilapia du Nil', 'Figuier de Barbarie']) {
    const row = await queryOne('SELECT name, origin_status FROM plants WHERE name = ?', [name]);
    assert.ok(row, `fiche absente : ${name}`);
    assert.equal(row.origin_status, 'introduit', `${name} doit être introduit`);
  }
});

test('arganier et hérisson d’Algérie sont marqués indigènes', async () => {
  for (const name of ['Arganier', 'Hérisson d’Algérie']) {
    const row = await queryOne('SELECT name, origin_status FROM plants WHERE name = ?', [name]);
    assert.ok(row, `fiche absente : ${name}`);
    assert.equal(row.origin_status, 'indigene', `${name} doit être indigène`);
  }
});

test('gambusie porte UICN LC (contraste avec statut envahissant)', async () => {
  const row = await queryOne('SELECT name, origin_status, iucn_status FROM plants WHERE name = ?', [
    'Gambusie',
  ]);
  assert.ok(row, 'fiche Gambusie absente');
  assert.equal(row.origin_status, 'envahissant');
  assert.equal(row.iucn_status, 'LC');
});

test('arganier et tilapia portent UICN LC', async () => {
  for (const name of ['Arganier', 'Tilapia du Nil']) {
    const row = await queryOne('SELECT name, iucn_status FROM plants WHERE name = ?', [name]);
    assert.ok(row, `fiche absente : ${name}`);
    assert.equal(row.iucn_status, 'LC', `${name} doit être LC`);
  }
});
