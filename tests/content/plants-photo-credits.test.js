'use strict';

require('../helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryAll, queryOne } = require('../../database');

/**
 * Attribution des photos du catalogue (migration 247).
 *
 * Test de **contenu** et non de code : il porte sur les données semées par les migrations,
 * pas sur une fonction. Une dérive du corpus — une photo Wikimedia ajoutée sans crédit —
 * doit tomber sous son propre nom dans le job CI `contenu`, sans bloquer une PR de
 * documentation (cf. CLAUDE.md, « Tests de contenu séparés du code »).
 */

before(async () => {
  await initSchema();
});

test('toute photo Wikimedia porte un auteur et une licence', async () => {
  const rows = await queryAll(
    `SELECT name, photo
       FROM plants
      WHERE photo LIKE 'http%'
        AND (photo LIKE '%wikimedia%' OR photo LIKE '%wikipedia%')
        AND (photo_credit IS NULL OR photo_credit = '' OR photo_licence IS NULL OR photo_licence = '')
      ORDER BY name`,
  );
  assert.deepStrictEqual(
    rows.map((row) => row.name),
    [],
    'fiches sans attribution : les licences CC du catalogue imposent de nommer l’auteur',
  );
});

test('une licence renseignée n’est jamais seule sans auteur, ni l’inverse', async () => {
  const rows = await queryAll(
    `SELECT name FROM plants
      WHERE (photo_credit IS NOT NULL AND photo_credit <> '' AND (photo_licence IS NULL OR photo_licence = ''))
         OR (photo_licence IS NOT NULL AND photo_licence <> '' AND (photo_credit IS NULL OR photo_credit = ''))
      ORDER BY name`,
  );
  assert.deepStrictEqual(
    rows.map((row) => row.name),
    [],
    'attribution incomplète',
  );
});

test('la fiche Laitue n’est plus illustrée par Lactuca virosa', async () => {
  const row = await queryOne(
    'SELECT name, photo, scientific_name, lookalike_species FROM plants WHERE name = ?',
    ['Laitue'],
  );
  assert.ok(row, 'fiche Laitue absente');
  assert.ok(
    !/virosa/i.test(String(row.photo || '')),
    'la photo principale montre encore la laitue vireuse, espèce sauvage toxique',
  );
});

test('la confusion avec la laitue vireuse est signalée sur la fiche', async () => {
  const row = await queryOne('SELECT lookalike_species FROM plants WHERE name = ?', ['Laitue']);
  assert.ok(row, 'fiche Laitue absente');
  assert.match(
    String(row.lookalike_species || ''),
    /virosa/i,
    'la confusion avec Lactuca virosa doit rester documentée dans les confusions possibles',
  );
});

test('les licences stockées ressemblent à des licences connues', async () => {
  const rows = await queryAll(
    `SELECT DISTINCT photo_licence FROM plants
      WHERE photo_licence IS NOT NULL AND photo_licence <> ''`,
  );
  const known = /^(CC0|CC BY|CC BY-SA|GFDL|Public domain|Domaine public)/i;
  const odd = rows.map((row) => row.photo_licence).filter((value) => !known.test(value));
  assert.deepStrictEqual(odd, [], 'licence non reconnue — vérifier la saisie');
});
