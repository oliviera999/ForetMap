'use strict';

// Garde des cycles d'import (audit du 25/09/2026, § 1.4.2 et question 17). Un cycle coupé par
// un `require` paresseux est toléré ; un cycle entre imports de premier niveau donnerait, au
// démarrage, un export à moitié initialisé. Script : scripts/check-import-cycles.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  SERVER_ENTRIES,
  FRONT_ENTRIES,
  buildImportGraph,
  findCycles,
  extractImports,
} = require('../scripts/check-import-cycles');

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cycles-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test('extractImports distingue premier niveau et paresseux', () => {
  const imports = extractImports(
    [
      "const a = require('./a');",
      'const {',
      '  x,',
      "} = require('./b');",
      'function f() {',
      "  return require('./c');",
      '}',
      "import d from './d';",
      "const e = () => import('./e');",
    ].join('\n'),
  );
  const bySpec = Object.fromEntries(imports.map((i) => [i.spec, i.topLevel]));
  assert.deepEqual(bySpec, {
    './a': true,
    './b': true,
    './c': false,
    './d': true,
    './e': false,
  });
});

test('un cycle de premier niveau est détecté, un cycle paresseux non', () => {
  const eager = fixture({
    'a.js': "const b = require('./b');\nmodule.exports = {};\n",
    'b.js': "const a = require('./a');\nmodule.exports = {};\n",
  });
  const eagerGraph = buildImportGraph(['a.js'], eager);
  assert.equal(findCycles(eagerGraph, { topLevelOnly: true }).length, 1);

  const lazy = fixture({
    'a.js': "const b = require('./b');\nmodule.exports = {};\n",
    'b.js': "function load() {\n  return require('./a');\n}\nmodule.exports = { load };\n",
  });
  const lazyGraph = buildImportGraph(['a.js'], lazy);
  assert.equal(findCycles(lazyGraph, { topLevelOnly: true }).length, 0);
  assert.equal(findCycles(lazyGraph).length, 1);
});

test('aucun cycle d’import de premier niveau côté serveur ni côté front', () => {
  const root = path.join(__dirname, '..');
  const server = buildImportGraph(SERVER_ENTRIES, root);
  const front = buildImportGraph(FRONT_ENTRIES, root);
  assert.ok(server.size > 200, `graphe serveur trop petit (${server.size})`);
  assert.ok(front.size > 200, `graphe front trop petit (${front.size})`);
  const rel = (cycles) => cycles.map((c) => c.map((f) => path.relative(root, f)).join(' ↔ '));
  assert.deepEqual(rel(findCycles(server, { topLevelOnly: true })), []);
  assert.deepEqual(rel(findCycles(front, { topLevelOnly: true })), []);
});
