#!/usr/bin/env node
'use strict';

/**
 * Contrôle des cycles d'import, sans dépendance (audit du 25/09/2026, § 1.4.2 et question 17).
 *
 * Côté serveur, 19 cycles existent et sont tous coupés par un `require` **paresseux** placé
 * dans une fonction (`effectiveRole ↔ rbac`, `settings → learningGatingLockMode → …`). Le
 * danger est de remonter un de ces `require` en tête de fichier : au démarrage, un des modules
 * reçoit un export à moitié initialisé, et l'erreur n'apparaît qu'à l'exécution. Côté front,
 * aucun cycle d'`import` statique aujourd'hui.
 *
 * Règle vérifiée : le graphe des imports **de premier niveau** (écrits en colonne 0 :
 * `const x = require(...)`, `} = require(...)`, `import … from '…'`) ne contient aucun cycle.
 * Les `require` indentés (dans une fonction) et les `import()` dynamiques sont paresseux : ils
 * sont listés à titre d'information, pas refusés.
 *
 * Le module Gnomes & Licornes (`routes/gl/`, `lib/gl*`, `src/gl/`) n'est pas parcouru.
 *
 *   npm run check:cycles
 *
 * Méthode inspirée de `madge --circular` (https://github.com/pahen/madge, licence MIT), réduite
 * à un parcours de texte : pas d'AST, donc pas de dépendance.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RESOLVE_EXTENSIONS = ['', '.js', '.cjs', '.mjs', '.jsx', '/index.js', '/index.jsx'];
const SERVER_ENTRIES = ['server.js', 'app.js', 'database.js'];
const FRONT_ENTRIES = ['src/main.jsx'];

function isExcluded(relPath) {
  const p = relPath.split(path.sep).join('/');
  return (
    p.startsWith('routes/gl/') ||
    /^lib\/gl[^/]*/.test(p) ||
    p.startsWith('src/gl/') ||
    p.includes('/node_modules/')
  );
}

function stripComments(source) {
  // Retire les commentaires bloc en gardant les sauts de ligne (numéros de ligne conservés),
  // puis les commentaires de ligne qui ne suivent pas un `:` (URL `https://`).
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/**
 * Imports relatifs d'un fichier, chacun marqué de premier niveau ou paresseux.
 * @returns {Array<{ spec: string, topLevel: boolean, line: number }>}
 */
function extractImports(source) {
  const lines = stripComments(source).split('\n');
  const out = [];
  lines.forEach((line, index) => {
    const topLevel = line.length > 0 && !/^\s/.test(line);
    let m;
    const requireRe = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = requireRe.exec(line))) out.push({ spec: m[1], topLevel, line: index + 1 });
    const staticImport = /^\s*(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/.exec(
      line,
    );
    if (staticImport) out.push({ spec: staticImport[1], topLevel: true, line: index + 1 });
    const fromOnly = /^\s*}\s*from\s+['"]([^'"]+)['"]/.exec(line); // fin d'un import multi-ligne
    if (fromOnly) out.push({ spec: fromOnly[1], topLevel: true, line: index + 1 });
    const dynamicRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = dynamicRe.exec(line))) out.push({ spec: m[1], topLevel: false, line: index + 1 });
  });
  return out;
}

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Graphe des imports relatifs atteints depuis `entries`.
 * @returns {Map<string, Array<{ to: string, topLevel: boolean, line: number }>>}
 */
function buildImportGraph(entries, root = ROOT) {
  const graph = new Map();
  const queue = entries.map((e) => path.join(root, e));
  while (queue.length) {
    const file = queue.shift();
    if (graph.has(file)) continue;
    const rel = path.relative(root, file);
    if (isExcluded(rel) || !/\.(c|m)?jsx?$/.test(file)) {
      graph.set(file, []);
      continue;
    }
    const edges = [];
    for (const imp of extractImports(fs.readFileSync(file, 'utf8'))) {
      if (!imp.spec.startsWith('.')) continue;
      const to = resolveRelative(file, imp.spec);
      if (!to || isExcluded(path.relative(root, to))) continue;
      edges.push({ to, topLevel: imp.topLevel, line: imp.line });
      queue.push(to);
    }
    graph.set(file, edges);
  }
  return graph;
}

/**
 * Composantes fortement connexes de taille > 1 (ou boucle sur soi), algorithme de Tarjan.
 * @param {{ topLevelOnly?: boolean }} [options] ne garder que les imports de premier niveau
 * @returns {string[][]} chaque cycle : fichiers qui le composent
 */
function findCycles(graph, { topLevelOnly = false } = {}) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const low = new Map();
  const result = [];
  const neighbours = (v) =>
    (graph.get(v) || []).filter((e) => !topLevelOnly || e.topLevel).map((e) => e.to);

  function strongConnect(v) {
    indices.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of neighbours(v)) {
      if (!indices.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1 || neighbours(v).includes(v)) result.push(component.sort());
    }
  }
  for (const v of graph.keys()) if (!indices.has(v)) strongConnect(v);
  return result;
}

function report(label, entries) {
  const graph = buildImportGraph(entries);
  const eager = findCycles(graph, { topLevelOnly: true });
  const all = findCycles(graph);
  const rel = (f) => path.relative(ROOT, f);
  console.log(
    `${label} : ${graph.size} modules, ${all.length} groupe(s) de cycles (dont ${eager.length} au premier niveau).`,
  );
  for (const cycle of eager)
    console.log(`  ✗ cycle au premier niveau : ${cycle.map(rel).join(' ↔ ')}`);
  return eager.length;
}

if (require.main === module) {
  const eager = report('Serveur', SERVER_ENTRIES) + report('Front', FRONT_ENTRIES);
  process.exitCode = eager > 0 ? 1 : 0;
}

module.exports = {
  SERVER_ENTRIES,
  FRONT_ENTRIES,
  extractImports,
  buildImportGraph,
  findCycles,
};
