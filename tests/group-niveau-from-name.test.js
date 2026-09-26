'use strict';

// Niveau d'un groupe déduit de son nom (décision du mainteneur du 25/09/2026, question 5) :
// proposé dans le formulaire, posé par l'import Moodle et par la migration 301. Une seule
// règle (lib/pedago/groupNiveauFromName.js), son miroir ESM et sa copie SQL doivent dire la
// même chose — une divergence poserait en production un niveau que le formulaire ne
// proposerait pas.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, pool, splitSqlStatements } = require('../database');
const rule = require('../lib/pedago/groupNiveauFromName');

const { suggestCurriculumNiveauFromName: suggest, autoCurriculumNiveauForGroup: auto } = rule;

/** Jeu de noms : cas du fixture (classes « 26#6xx »), conventions courantes et pièges. */
const CORPUS = [
  ['26#6', 'unit', null],
  ['26#601', 'class', null],
  ['26#601-602', 'class', null],
  ['26#n3', 'class', null],
  ['601', 'class', null],
  ['6ème A', 'class', null],
  ['6ᵉ B', 'class', null],
  ['6°1', 'class', null],
  ['Sixième C', 'class', null],
  ['CM2 école voisine', 'class', null],
  ['Cycle 3', 'unit', null],
  ['5e/4e', 'class', null],
  ['4B', 'class', null],
  ['302', 'class', null],
  ['Troisième', 'class', null],
  ['cycle-4', 'unit', null],
  ['2nde 3', 'class', null],
  ['2ⁿᵈᵉ', 'class', null],
  ['201', 'class', null],
  ['Seconde', 'class', null],
  ['1ʳᵉ spé SVT', 'class', null],
  ['1re enseignement scientifique', 'class', null],
  ['1re', 'class', null],
  ['101', 'class', null],
  ['Tle spécialité SVT', 'class', null],
  ['Terminale ens. sci.', 'class', null],
  ['Terminale ES', 'class', null],
  ['Licence 1', 'class', null],
  ['Master MEEF', 'unit', null],
  ['6e-5e', 'class', null],
  ['Club 3D', 'club', null],
  ['6e A équipe 1', 'team', null],
  ['601', 'class', 'lycee'],
  ['601', 'class', 'college'],
  ['E2E n3beur e2e-n3-1789649098285', 'class', null],
  ['n3beurs 2025', 'team', null],
  ['Groupe 3', 'class', null],
  ['3', 'class', null],
  ['26#2', 'unit', null],
  ['2025-2026 4eA', 'class', null],
  ['test', 'class', null],
  ['T1', 'class', null],
];

test('la règle ne propose qu’un niveau sans ambiguïté', () => {
  assert.equal(suggest('26#601').niveau, 'cycle3');
  assert.equal(suggest('26#601-602').niveau, 'cycle3');
  assert.equal(suggest('26#6').niveau, 'cycle3'); // l'unité des 6ᵉ, préfixe d'année ignoré
  assert.equal(suggest('4B').niveau, 'cycle4');
  assert.equal(suggest('2ⁿᵈᵉ').niveau, 'seconde');
  assert.equal(suggest('1ʳᵉ spé SVT').niveau, 'premiere_spe');
  assert.equal(suggest('Terminale ens. sci.').niveau, 'es_terminale');
  assert.equal(suggest('Master MEEF').niveau, 'universite');

  assert.deepEqual(suggest('6e-5e'), {
    niveau: null,
    raison: 'plusieurs_niveaux',
    indices: ['cycle3', 'cycle4'],
  });
  // Première et terminale : deux voies au même palier, le nom doit dire laquelle ; « ES »
  // était aussi l'ancienne série économique et sociale.
  assert.equal(suggest('1re').raison, 'voie_a_preciser');
  assert.equal(suggest('Terminale ES').raison, 'voie_a_preciser');
  // Un chiffre isolé ne veut rien dire, sauf s'il est tout le nom.
  assert.equal(suggest('Groupe 3').raison, 'aucun_indice');
  assert.equal(suggest('n3beurs 2025').raison, 'aucun_indice');
  assert.equal(suggest('E2E n3beur e2e-n3-1789649098285').raison, 'aucun_indice');
  assert.equal(suggest('').raison, 'aucun_indice');
  assert.equal(suggest(null).raison, 'aucun_indice');
});

test('pose automatique : classes et unités seulement, sans contredire un ancien réglage', () => {
  assert.equal(auto({ name: '601', kind: 'class' }), 'cycle3');
  assert.equal(auto({ name: '26#6', kind: 'unit' }), 'cycle3');
  // « Club 3D » n'est pas une classe de 3ᵉ D : un club ou une équipe n'est jamais posé seul.
  assert.equal(suggest('Club 3D').niveau, 'cycle4');
  assert.equal(auto({ name: 'Club 3D', kind: 'club' }), null);
  assert.equal(auto({ name: '6e A équipe 1', kind: 'team' }), null);
  // Affichage réglé en Lycée sur une « 601 » : choix d'un administrateur, on ne tranche pas.
  assert.equal(auto({ name: '601', kind: 'class', pedagoLevel: 'lycee' }), null);
  assert.equal(auto({ name: '601', kind: 'class', pedagoLevel: 'college' }), 'cycle3');
  assert.equal(auto({ name: '1re', kind: 'class' }), null);
});

test('le miroir ESM rend exactement les mêmes propositions', async () => {
  const ui = await import('../src/utils/groupNiveauFromName.js');
  for (const name of [
    'NAME_PATTERNS',
    'VOIE_PATTERNS',
    'YEAR_PREFIX_PATTERN',
    'WHOLE_NAME_DIGIT',
    'SPECIAL_CHARS',
    'SUGGESTION_REASONS',
    'AUTO_NIVEAU_GROUP_KINDS',
  ]) {
    assert.deepEqual(ui[name], rule[name], `constante divergente : ${name}`);
  }
  for (const [name, kind, pedagoLevel] of CORPUS) {
    assert.deepEqual(ui.suggestCurriculumNiveauFromName(name), suggest(name), name);
    assert.equal(
      ui.autoCurriculumNiveauForGroup({ name, kind, pedagoLevel }),
      auto({ name, kind, pedagoLevel }),
      name,
    );
  }
});

const MIGRATION = path.join(
  __dirname,
  '..',
  'migrations',
  '301_groups_curriculum_niveau_unique.sql',
);

before(async () => {
  await initSchema();
});

test('migration 301 : `universite` accepté, `curriculum_niveau` posé comme la règle JS', async () => {
  const statements = splitSqlStatements(fs.readFileSync(MIGRATION, 'utf8'));
  const alter = statements.find((s) => /^ALTER TABLE/i.test(s.trim()));
  const update = statements.find((s) => /^UPDATE/i.test(s.trim()));
  assert.ok(alter && update, 'la migration doit contenir un ALTER et un UPDATE');

  const conn = await pool.getConnection();
  try {
    // L'ALTER est rejoué hors transaction (DDL) : il est idempotent, la base l'a déjà.
    await conn.query(alter);
    const [[column]] = await conn.query(
      `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups' AND COLUMN_NAME = 'curriculum_niveau'`,
    );
    assert.match(String(column.type), /'universite'\)$/);

    // La pose s'essaie dans une transaction annulée : elle ne touche pas aux groupes des
    // autres tests.
    await conn.beginTransaction();
    const stamp = crypto.randomBytes(4).toString('hex');
    const ids = [];
    for (const [i, [name, kind, pedagoLevel]] of CORPUS.entries()) {
      const id = `gnfn-${stamp}-${i}`;
      ids.push(id);
      await conn.query(
        'INSERT INTO `groups` (id, slug, name, kind, pedago_level, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [id, id, name, kind, pedagoLevel],
      );
    }
    // Un niveau déjà réglé n'est jamais écrasé.
    await conn.query("UPDATE `groups` SET curriculum_niveau = 'seconde' WHERE id = ?", [ids[4]]);
    await conn.query(update);
    await conn.query(update); // idempotent
    const [rows] = await conn.query(
      `SELECT id, curriculum_niveau FROM \`groups\` WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    const byId = new Map(rows.map((r) => [r.id, r.curriculum_niveau]));
    for (const [i, [name, kind, pedagoLevel]] of CORPUS.entries()) {
      const expected = i === 4 ? 'seconde' : auto({ name, kind, pedagoLevel });
      assert.equal(byId.get(ids[i]) ?? null, expected, `« ${name} » (${kind}, ${pedagoLevel})`);
    }
    await conn.rollback();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
});
