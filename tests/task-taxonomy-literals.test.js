'use strict';

/**
 * Source unique de la taxonomie des tâches (migration 329) : aucune valeur de métier, de
 * format, de phase ou de type de projet ne doit être écrite en littéral hors du référentiel
 * (`src/shared/enums/taskEnums.js`), du noyau `src/shared/taskTaxonomyCore.js`, des règles
 * de suggestion `src/shared/taskCategoryGuessCore.js` et de leurs miroirs générés.
 *
 * Leçon de l'audit du 25/09/2026 (« 7 endroits ») : une valeur ajoutée à un seul endroit est
 * remise à NULL en silence ailleurs. Code parcouru : `src/`, `lib/`, `routes/`, hors GL ;
 * commentaires ignorés.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TASK_CATEGORY_KEYS,
  TASK_FORMAT_KEYS,
  PROJECT_PHASE_KEYS,
  PROJECT_TYPE_KEYS,
} = require('../lib/shared/taskTaxonomyCore');

const ROOT = path.join(__dirname, '..');
const SCANNED = ['src', 'lib', 'routes'];

/** Fichiers sources de la taxonomie (et miroirs générés), seuls à porter ces littéraux. */
const OWNERS = new Set([
  'src/shared/enums/taskEnums.js',
  'lib/shared/taskEnums.js',
  'src/shared/taskTaxonomyCore.js',
  'lib/shared/taskTaxonomyCore.js',
  'src/shared/taskCategoryGuessCore.js',
  'lib/shared/taskCategoryGuessCore.js',
]);

/**
 * Homonymes d'un autre domaine (fichier → valeurs), à ne pas confondre avec la taxonomie :
 * `jardinage` est aussi une catégorie pédagogique ; `seance` désigne une séance pédagogique.
 */
const HOMONYMS = {
  'src/shared/enums/pedagoEnums.js': ['jardinage'],
  'lib/shared/pedagoEnums.js': ['jardinage'],
  'src/utils/learnerLevel.js': ['seance'],
  'lib/pedago/learnerLevel.js': ['seance'],
  'src/utils/pedagoSessionLink.js': ['seance'],
};

/** Gnomes & Licornes, hors périmètre : dossiers `gl/`, `gl-pack/`, fichiers `gl*.js`. */
function isGl(rel) {
  return /(^|\/)gl(-pack)?\//.test(rel) || /^gl[A-Z]/.test(path.posix.basename(rel));
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...listFiles(full));
    } else if (/\.(c?js|jsx|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

test('aucune valeur de taxonomie en littéral hors de sa source', () => {
  const values = [
    ...TASK_CATEGORY_KEYS,
    ...TASK_FORMAT_KEYS,
    ...PROJECT_PHASE_KEYS,
    ...PROJECT_TYPE_KEYS,
  ];
  const pattern = new RegExp(`(['"\`])(${values.join('|')})\\1`, 'g');
  const offenders = [];
  for (const dir of SCANNED) {
    for (const file of listFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (OWNERS.has(rel) || isGl(rel)) continue;
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      const allowed = new Set(HOMONYMS[rel] || []);
      for (const m of code.matchAll(pattern)) {
        if (!allowed.has(m[2])) offenders.push(`${rel} : ${m[0]}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `littéraux à remplacer par taskTaxonomyCore :\n${offenders.join('\n')}`,
  );
});

test('le référentiel des valeurs et le noyau partagé restent alignés', () => {
  const enums = require('../lib/shared/taskEnums');
  assert.strictEqual(TASK_CATEGORY_KEYS, enums.TASK_CATEGORY_ENUM.values);
  assert.strictEqual(TASK_FORMAT_KEYS, enums.TASK_FORMAT_ENUM.values);
  assert.strictEqual(PROJECT_PHASE_KEYS, enums.TASK_PROJECT_PHASE_ENUM.values);
  assert.strictEqual(PROJECT_TYPE_KEYS, enums.TASK_PROJECT_TYPE_ENUM.values);
});
