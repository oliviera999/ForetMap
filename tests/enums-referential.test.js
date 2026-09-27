'use strict';

// Référentiel des valeurs énumérées (audit du 25/09/2026, § 3.2.5, étape B1 de la piste B).
//
// Chaque colonne ENUM ou SET du schéma (hors `gl_*`), et chaque `varchar` utilisé comme
// énumération, a **une seule** définition dans `src/shared/enums/*Enums.js` (miroirs CJS
// `lib/shared/*Enums.js`). Ce fichier vérifie, sur la base de test :
//   - que chaque définition suit exactement l'ENUM ou le SET SQL qu'elle décrit (valeurs et
//     ordre — l'ordre d'un SET est un encodage par bit) ;
//   - qu'aucune colonne ENUM/SET n'échappe au référentiel (une colonne ajoutée sans
//     définition fait échouer la CI) ;
//   - que les `varchar` et `tinyint` énumérés ne portent que des valeurs connues ;
//   - que les contraintes CHECK de `tasks` (migration 308) listent les valeurs du référentiel.
// Patron d'origine : tests/plants-hazard-review.test.js (comparaison à information_schema).

require('./helpers/setup');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryAll } = require('../database');

const ENUM_MODULES = [
  'pedagoEnums',
  'taskEnums',
  'biodivEnums',
  'terrainEnums',
  'moodleSyncEnums',
  'platformEnums',
];

/** Toutes les définitions exportées (`*_ENUM`), avec leur module. */
function loadDefinitions() {
  const defs = [];
  for (const mod of ENUM_MODULES) {
    const exported = require(path.join(__dirname, '..', 'lib', 'shared', mod));
    for (const [name, def] of Object.entries(exported)) {
      if (name.endsWith('_ENUM')) defs.push({ mod, name, def });
    }
  }
  return defs;
}

const DEFS = loadDefinitions();
const DEF_BY_NAME = new Map(DEFS.map((d) => [d.name, d]));

/** `enum('a','b')` / `set('a','b')` → ['a', 'b'] (quote doublée tolérée). */
function parseSqlValueList(columnType) {
  const inner = /^(?:enum|set)\((.*)\)$/i.exec(String(columnType).trim());
  assert.ok(inner, `type SQL inattendu : ${columnType}`);
  return [...inner[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

/** Colonnes de tables réelles (pas de vues) décrites par une définition du référentiel. */
function declaredColumns() {
  const out = new Map();
  for (const { name, def } of DEFS) {
    for (const column of def.columns) {
      assert.ok(
        !out.has(column),
        `${column} déclarée deux fois (${out.get(column)} et ${name}) : une seule définition`,
      );
      out.set(column, name);
    }
  }
  return out;
}

let schemaColumns = new Map();

before(async () => {
  await initSchema();
  const rows = await queryAll(
    `SELECT c.TABLE_NAME AS t, c.COLUMN_NAME AS c, c.DATA_TYPE AS dt, c.COLUMN_TYPE AS ct,
            c.COLUMN_DEFAULT AS def
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES tb
         ON tb.TABLE_SCHEMA = c.TABLE_SCHEMA AND tb.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE() AND tb.TABLE_TYPE = 'BASE TABLE'`,
  );
  schemaColumns = new Map(rows.map((r) => [`${r.t}.${r.c}`, r]));
});

test('le référentiel est bien formé (valeurs, libellés, sous-ensembles, gel)', () => {
  assert.ok(DEFS.length >= 40, `trop peu de définitions chargées : ${DEFS.length}`);
  for (const { mod, name, def } of DEFS) {
    const where = `${mod}.${name}`;
    assert.ok(Object.isFrozen(def), `${where} : définition non gelée`);
    assert.ok(Object.isFrozen(def.values), `${where} : valeurs non gelées`);
    assert.ok(Object.isFrozen(def.labels), `${where} : libellés non gelés`);
    assert.ok(Array.isArray(def.values) && def.values.length > 0, `${where} : aucune valeur`);
    assert.equal(new Set(def.values).size, def.values.length, `${where} : valeur en double`);
    assert.deepEqual(
      Object.keys(def.labels).sort(),
      def.values.map(String).sort(),
      `${where} : un libellé par valeur, ni plus ni moins`,
    );
    for (const value of def.values) {
      assert.ok(String(def.labels[value]).trim(), `${where} : libellé vide pour ${value}`);
    }
    if (def.subsetOf) {
      const parent = DEF_BY_NAME.get(def.subsetOf);
      assert.ok(parent, `${where} : parent inconnu ${def.subsetOf}`);
      for (const value of def.values) {
        assert.ok(parent.def.values.includes(value), `${where} : ${value} absent du parent`);
        assert.equal(def.labels[value], parent.def.labels[value], `${where} : libellé recopié`);
      }
    }
  }
});

test('la marque n’apparaît dans aucun libellé du référentiel', () => {
  for (const { name, def } of DEFS) {
    for (const label of Object.values(def.labels)) {
      assert.doesNotMatch(label, /for[eê]t ?map|lyautey/i, `${name} : marque en dur (${label})`);
    }
  }
});

test('chaque colonne ENUM/SET hors gl_ a exactement une définition', () => {
  const declared = declaredColumns();
  const missing = [];
  for (const [key, col] of schemaColumns) {
    if (!['enum', 'set'].includes(String(col.dt).toLowerCase())) continue;
    if (col.t.startsWith('gl_')) continue;
    if (!declared.has(key)) missing.push(key);
  }
  assert.deepEqual(missing, [], `colonnes sans définition dans src/shared/enums : ${missing}`);
});

test('chaque définition suit exactement son ENUM ou SET SQL (valeurs et ordre)', () => {
  let compared = 0;
  for (const [column, name] of declaredColumns()) {
    const col = schemaColumns.get(column);
    assert.ok(col, `${name} décrit ${column}, absente du schéma`);
    const dataType = String(col.dt).toLowerCase();
    if (dataType !== 'enum' && dataType !== 'set') continue;
    assert.deepEqual(
      parseSqlValueList(col.ct),
      [...DEF_BY_NAME.get(name).def.values],
      `${column} (${col.ct}) diverge de ${name}`,
    );
    compared += 1;
  }
  assert.ok(compared >= 46, `trop peu de colonnes ENUM/SET comparées : ${compared}`);
});

test('les varchar et tinyint énumérés ne portent que des valeurs du référentiel', async () => {
  for (const [column, name] of declaredColumns()) {
    const col = schemaColumns.get(column);
    const dataType = String(col.dt).toLowerCase();
    if (dataType === 'enum' || dataType === 'set') continue;
    const values = DEF_BY_NAME.get(name).def.values.map(String);
    if (col.def != null && !/^null$/i.test(String(col.def))) {
      const def = String(col.def).replace(/^'(.*)'$/, '$1');
      assert.ok(values.includes(def), `${column} : défaut SQL « ${def} » hors de ${name}`);
    }
    const [table, field] = column.split('.');
    // Identifiants issus du référentiel (jamais d'une requête), et échappés.
    const rows = await queryAll(
      `SELECT DISTINCT \`${field}\` AS v FROM \`${table}\` WHERE \`${field}\` IS NOT NULL`,
    );
    const unknown = rows.map((r) => String(r.v)).filter((v) => !values.includes(v));
    assert.deepEqual(unknown, [], `${column} : valeurs hors de ${name}`);
  }
});

test('les contraintes CHECK de tasks listent exactement les valeurs du référentiel', async () => {
  const {
    TASK_STATUS_ENUM,
    TASK_DANGER_LEVEL_ENUM,
    TASK_DIFFICULTY_LEVEL_ENUM,
    TASK_IMPORTANCE_LEVEL_ENUM,
  } = require('../lib/shared/taskEnums');
  const expected = {
    chk_tasks_status: ['status', TASK_STATUS_ENUM],
    chk_tasks_danger_level: ['danger_level', TASK_DANGER_LEVEL_ENUM],
    chk_tasks_difficulty_level: ['difficulty_level', TASK_DIFFICULTY_LEVEL_ENUM],
    chk_tasks_importance_level: ['importance_level', TASK_IMPORTANCE_LEVEL_ENUM],
  };
  const rows = await queryAll(
    `SELECT CONSTRAINT_NAME AS name, CHECK_CLAUSE AS clause
       FROM information_schema.CHECK_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks'`,
  );
  const byName = new Map(rows.map((r) => [r.name, String(r.clause)]));
  for (const [constraint, [column, def]] of Object.entries(expected)) {
    const clause = byName.get(constraint);
    assert.ok(clause, `contrainte ${constraint} absente (migration 308)`);
    assert.match(clause, new RegExp(`\`?${column}\`? is null`, 'i'), `${constraint} : NULL admis`);
    const listed = [...clause.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    assert.deepEqual(listed, [...def.values], `${constraint} diverge du référentiel`);
  }
});

test('les modules consommateurs lisent le référentiel au lieu d’une copie', () => {
  const pedago = require('../lib/shared/pedagoEnums');
  const scales = require('../lib/pedagoScales');
  const biodivLevel = require('../lib/biodivPedagoLevel');
  const sessions = require('../lib/pedagoSessions');
  const { COLLEGE_INTERACTION_TYPE_ENUM } = require('../lib/shared/biodivEnums');
  const { LINK_STATUSES, LINK_ORIGINS } = require('../lib/pedago/learningLinks');

  assert.strictEqual(scales.ETAPES, pedago.PEDAGO_ETAPE_ENUM.values);
  assert.strictEqual(scales.CURRICULUM_NIVEAU_VALUES, pedago.CURRICULUM_NIVEAU_ENUM.values);
  assert.strictEqual(scales.LEARNER_NIVEAU_VALUES, pedago.LEARNER_NIVEAU_ENUM.values);
  assert.strictEqual(biodivLevel.PEDAGO_LEVELS, pedago.PEDAGO_ETAPE_ENUM.values);
  assert.strictEqual(biodivLevel.PEDAGO_LEVEL_LABELS, pedago.PEDAGO_ETAPE_ENUM.labels);
  assert.strictEqual(biodivLevel.COLLEGE_FOODWEB_TYPES, COLLEGE_INTERACTION_TYPE_ENUM.values);
  assert.deepEqual([...sessions.LEVELS], [...pedago.PEDAGO_ETAPE_ENUM.values]);
  assert.deepEqual(
    Object.values(LINK_STATUSES).sort(),
    [...pedago.RESOURCE_LINK_STATUS_ENUM.values].sort(),
  );
  assert.deepEqual(
    Object.values(LINK_ORIGINS).sort(),
    [...pedago.RESOURCE_LINK_ORIGIN_ENUM.values].sort(),
  );
});

test('le libellé de difficulté se dérive de la difficulté (1 à 3)', () => {
  const { quizDifficulteLabel, QUIZ_DIFFICULTE_ENUM } = require('../lib/shared/pedagoEnums');
  assert.deepEqual([...QUIZ_DIFFICULTE_ENUM.values], [1, 2, 3]);
  assert.equal(quizDifficulteLabel(1), '⭐ Facile');
  assert.equal(quizDifficulteLabel('2'), '⭐⭐ Moyen');
  assert.equal(quizDifficulteLabel(3), '⭐⭐⭐ Difficile');
  for (const outside of [null, undefined, '', 0, 4, 5, '2.5', 'facile']) {
    assert.equal(quizDifficulteLabel(outside), null, `hors échelle : ${outside}`);
  }
});
