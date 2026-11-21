'use strict';

/**
 * Source unique des actions d'étape d'une séance pédagogique : aucune valeur `open_*` ne
 * s'écrit en littéral hors du référentiel `src/shared/enums/pedagoStepActions.js` et de son
 * miroir généré. Le serveur, le client et l'outil MCP lisent `PEDAGO_STEP_ACTION`.
 *
 * Même leçon que `tests/task-taxonomy-literals.test.js` : une action ajoutée à un seul endroit
 * est refusée (ou ignorée) en silence ailleurs. Code parcouru : `src/`, `lib/`, `routes/`,
 * hors GL ; commentaires ignorés. La recherche porte sur le mot entier, entre guillemets ou
 * non (une clé d'objet `open_plant: …` est aussi un littéral).
 *
 * `message` n'est pas recherché : le mot est trop courant (`err.message`, `{ message }`) pour
 * être distingué de l'action. Il reste couvert par le test d'alignement ci-dessous.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PEDAGO_STEP_ACTION,
  PEDAGO_STEP_ACTION_ENUM,
  PEDAGO_STEP_ACTION_PAYLOAD_FIELDS,
  isPedagoStepAction,
} = require('../lib/shared/pedagoStepActions');

const ROOT = path.join(__dirname, '..');
const SCANNED = ['src', 'lib', 'routes'];

/** Seuls fichiers à porter ces littéraux : la source et son miroir généré. */
const OWNERS = new Set([
  'src/shared/enums/pedagoStepActions.js',
  'lib/shared/pedagoStepActions.js',
]);

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

const SCANNED_VALUES = PEDAGO_STEP_ACTION_ENUM.values.filter(
  (value) => value !== PEDAGO_STEP_ACTION.MESSAGE,
);

test('aucune action d’étape en littéral hors de sa source', () => {
  assert.ok(SCANNED_VALUES.length >= 10, 'liste des actions recherchées inattendue');
  const pattern = new RegExp(`(?<![A-Za-z0-9_])(${SCANNED_VALUES.join('|')})(?![A-Za-z0-9_])`, 'g');
  const offenders = [];
  for (const dir of SCANNED) {
    for (const file of listFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (OWNERS.has(rel) || isGl(rel)) continue;
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const m of code.matchAll(pattern)) offenders.push(`${rel} : ${m[0]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `littéraux à remplacer par PEDAGO_STEP_ACTION :\n${offenders.join('\n')}`,
  );
});

test('le référentiel compte les onze actions, libellées, et la validation serveur le suit', () => {
  assert.deepEqual(
    [...PEDAGO_STEP_ACTION_ENUM.values],
    [
      'message',
      'open_id_key',
      'open_plant',
      'open_foodweb',
      'open_quiz',
      'open_glossary',
      'open_individual',
      'open_nested_groups',
      'open_map_route',
      'open_fresque',
      'open_tutorial',
    ],
  );
  assert.deepEqual(Object.values(PEDAGO_STEP_ACTION), [...PEDAGO_STEP_ACTION_ENUM.values]);
  for (const value of PEDAGO_STEP_ACTION_ENUM.values) {
    assert.ok(PEDAGO_STEP_ACTION_ENUM.labels[value], `libellé manquant : ${value}`);
    assert.equal(isPedagoStepAction(value), true);
  }
  assert.equal(isPedagoStepAction('open_inconnu'), false);
  for (const type of Object.keys(PEDAGO_STEP_ACTION_PAYLOAD_FIELDS)) {
    assert.equal(
      isPedagoStepAction(type),
      true,
      `champs de payload d’une action inconnue : ${type}`,
    );
  }
  const { ACTION_TYPES, validateAction } = require('../lib/pedagoSessions');
  assert.deepEqual([...ACTION_TYPES], [...PEDAGO_STEP_ACTION_ENUM.values]);
  for (const type of PEDAGO_STEP_ACTION_ENUM.values) {
    assert.equal(validateAction({ type, payload: {} }).ok, true, type);
  }
  assert.equal(validateAction({ type: 'open_inconnu' }).ok, false);
});

test('l’éditeur d’étape et l’outil MCP lisent la source unique', () => {
  const editor = fs.readFileSync(
    path.join(ROOT, 'src/components/pedago/SessionStepEditor.jsx'),
    'utf8',
  );
  assert.match(editor, /STEP_ACTION_LABELS = PEDAGO_STEP_ACTION_ENUM\.labels/);
  const tool = fs.readFileSync(path.join(ROOT, 'lib/mcp/tools/domains/pedagoSessions.js'), 'utf8');
  assert.match(tool, /PEDAGO_STEP_ACTION_ENUM\.values/);
});
