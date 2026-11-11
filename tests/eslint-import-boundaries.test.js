'use strict';

/**
 * Frontières d'import entre surfaces du front (`scripts/lib/eslint-import-boundaries.cjs`,
 * exploitation, lot 7) :
 * - résolution des chemins relatifs et des trois frontières (G&L → ForêtMap, ForêtMap → G&L,
 *   surface publique → écran du personnel) ;
 * - la liste des violations recensées colle exactement à l'état du code : aucune entrée
 *   périmée (violation résorbée à retirer), aucune violation hors liste ;
 * - dans ESLint, une nouvelle violation est une **erreur**, une violation recensée un
 *   **avertissement**.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ESLint } = require('eslint');

const { boundaryViolations } = require('../scripts/lib/eslint-import-boundaries.cjs');
const { currentViolations } = require('../scripts/import-boundaries-baseline.js');
const baseline = require('../scripts/data/import-boundaries-baseline.json');

const ROOT = path.join(__dirname, '..');
const abs = (rel) => path.join(ROOT, rel);
const zonesOf = (file, spec) => boundaryViolations(abs(file), spec).map((v) => v.zone);

test('G&L → ForêtMap interdit, sauf src/shared/', () => {
  assert.deepEqual(zonesOf('src/gl/components/X.jsx', '../../components/DialogShell.jsx'), [
    'gl-vers-foretmap',
  ]);
  assert.deepEqual(zonesOf('src/gl/components/X.jsx', '../../shared/ui/Button.jsx'), []);
  assert.deepEqual(zonesOf('src/gl/components/X.jsx', '../hooks/useGl.js'), []);
  assert.deepEqual(zonesOf('src/gl/components/X.jsx', 'react'), []);
});

test('ForêtMap → G&L interdit', () => {
  assert.deepEqual(zonesOf('src/App.jsx', './gl/AppGL.jsx'), ['foretmap-vers-gl']);
  assert.deepEqual(zonesOf('src/components/tasks/X.jsx', '../../gl/x.js'), ['foretmap-vers-gl']);
  assert.deepEqual(zonesOf('src/components/X.jsx', '../shared/gl-like.js'), []);
});

test('surface publique → écran du personnel interdit', () => {
  assert.deepEqual(
    zonesOf('src/plan/components/PlanTopBar.jsx', '../../components/tasks-views.jsx'),
    ['public-vers-personnel'],
  );
  assert.deepEqual(zonesOf('src/components/visit/VisitX.jsx', '../settings/SettingsPanel.jsx'), [
    'public-vers-personnel',
  ]);
  assert.deepEqual(zonesOf('src/components/visit-views.jsx', './profiles-views.jsx'), [
    'public-vers-personnel',
  ]);
  assert.deepEqual(zonesOf('src/plan/components/PlanTopBar.jsx', '../../shared/ui/Button.jsx'), []);
  // Un écran du personnel peut, lui, importer la visite.
  assert.deepEqual(zonesOf('src/components/tasks-views.jsx', './visit-views.jsx'), []);
});

test('liste des violations recensées = état du code (ni périmée, ni incomplète)', () => {
  const { keys } = currentViolations();
  const listed = new Set(baseline.violations);
  const stale = baseline.violations.filter((k) => !keys.includes(k));
  const unlisted = keys.filter((k) => !listed.has(k));
  assert.deepEqual(
    stale,
    [],
    'violations résorbées à retirer : node scripts/import-boundaries-baseline.js --write',
  );
  assert.deepEqual(unlisted, [], 'nouvelles violations : à corriger (pas à ajouter à la liste)');
});

test('ESLint : nouvelle violation en erreur, violation recensée en avertissement', async () => {
  const eslint = new ESLint({ cwd: ROOT });
  const [fresh] = await eslint.lintText(
    "import { TasksView } from '../components/tasks-views.jsx';\nexport default TasksView;\n",
    { filePath: abs('src/plan/NouvelEcran.jsx') },
  );
  const freshMsgs = fresh.messages.filter((m) => m.ruleId?.startsWith('foretmap/'));
  assert.equal(freshMsgs.length, 1, JSON.stringify(fresh.messages));
  assert.equal(freshMsgs[0].ruleId, 'foretmap/import-boundaries');
  assert.equal(freshMsgs[0].severity, 2);

  const [known] = await eslint.lintText(
    "import DialogShell from '../components/DialogShell.jsx';\nexport default DialogShell;\n",
    { filePath: abs('src/gl/AppGL.jsx') },
  );
  const knownMsgs = known.messages.filter((m) => m.ruleId?.startsWith('foretmap/'));
  assert.equal(knownMsgs.length, 1, JSON.stringify(known.messages));
  assert.equal(knownMsgs[0].ruleId, 'foretmap/import-boundaries-baseline');
  assert.equal(knownMsgs[0].severity, 1);
});
