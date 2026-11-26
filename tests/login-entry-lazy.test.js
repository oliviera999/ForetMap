'use strict';
// Ce qui ne sert pas à se connecter reste hors de l'écran de connexion (audit UI/UX du
// 19/11/2026, U1 — lot K). Le budget de bundle (`scripts/check-bundle-budget.js`) verrait un
// retour en arrière, mais seulement sur un build de production en CI, et sans dire par où le
// module est revenu. Ce test suit les imports **statiques** depuis `src/main.jsx` et nomme
// le chemin fautif.
//
// Le piège d'origine : une fonction utilitaire exportée par le fichier d'un composant
// (`readGlossaryTermMessage` dans `GlossaryPopover.jsx`…) et importée par un hook du shell.
// L'import ramenait le composant entier et ses dépendances (Markdown, éditeur riche, écran
// Séances) : 270 Ko de JavaScript pour trois fonctions de dix lignes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ENTRY = 'src/main.jsx';

/** Paquets npm absents de l'écran de connexion (chargés par `import()` au besoin). */
const FORBIDDEN_PACKAGES = [
  'socket.io-client',
  'marked',
  'isomorphic-dompurify',
  'dompurify',
  'turndown',
];

/** Modules du dépôt absents de l'écran de connexion. */
const FORBIDDEN_MODULES = [
  'src/shared/platform/markdown.js',
  'src/components/MarkdownTextarea.jsx',
  'src/components/RichTextEditor.jsx',
  'src/components/TutorialPreviewModal.jsx',
  'src/components/pedago/GlossaryPopover.jsx',
  'src/components/pedago/SessionsView.jsx',
  'src/components/app/authenticatedShellParts.js',
  // Pagination tâches (lot B) : réservée au shell connecté / temps réel.
  'src/utils/tasksListResponse.js',
];

/** Spécificateurs des imports et réexports statiques d'un fichier (pas les `import()`). */
function staticImportSources(source) {
  const sources = [];
  const re =
    /^[ \t]*(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|^[ \t]*export\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(source))) sources.push(m[1] || m[2]);
  return sources;
}

const EXTENSIONS = ['', '.js', '.jsx', '/index.js', '/index.jsx'];

/** Chemin relatif au dépôt d'un import relatif, ou `null` (paquet npm, ressource). */
function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.join(path.dirname(fromFile), spec);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (
      fs.existsSync(path.join(ROOT, candidate)) &&
      fs.statSync(path.join(ROOT, candidate)).isFile()
    ) {
      return candidate.split(path.sep).join('/');
    }
  }
  return null;
}

/**
 * Parcours en largeur des imports statiques depuis l'entrée.
 * @returns {{ parents: Map<string, string|null>, packages: Map<string, string> }} parent de
 *   chaque module atteint, et premier importeur de chaque paquet npm
 */
function walkStaticImports(entry) {
  const parents = new Map([[entry, null]]);
  const packages = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (!/\.jsx?$/.test(file)) continue;
    for (const spec of staticImportSources(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      const resolved = resolveRelative(file, spec);
      if (resolved) {
        if (!parents.has(resolved)) {
          parents.set(resolved, file);
          queue.push(resolved);
        }
      } else if (!spec.startsWith('.') && !packages.has(spec)) {
        packages.set(spec, file);
      }
    }
  }
  return { parents, packages };
}

function chainTo(parents, file) {
  const chain = [];
  for (let current = file; current; current = parents.get(current)) chain.unshift(current);
  return chain.join(' → ');
}

const graph = walkStaticImports(ENTRY);

test('le parcours atteint bien l’écran de connexion', () => {
  // Garde contre un parcours cassé qui ferait passer tout le reste à vide.
  for (const file of [
    'src/App.jsx',
    'src/components/auth-views.jsx',
    'src/hooks/useAppPedago.js',
  ]) {
    assert.ok(graph.parents.has(file), `${file} devrait être atteint depuis ${ENTRY}`);
  }
  assert.ok(graph.packages.has('react'), 'react devrait être importé');
});

for (const pkg of FORBIDDEN_PACKAGES) {
  test(`l’écran de connexion n’importe pas statiquement ${pkg}`, () => {
    const hit = [...graph.packages.keys()].find(
      (spec) => spec === pkg || spec.startsWith(`${pkg}/`),
    );
    assert.strictEqual(
      hit,
      undefined,
      hit &&
        `Import statique à charger à la demande : ${chainTo(graph.parents, graph.packages.get(hit))} → ${hit}`,
    );
  });
}

for (const file of FORBIDDEN_MODULES) {
  test(`l’écran de connexion n’importe pas statiquement ${file}`, () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, file)),
      `${file} a été déplacé : mettre la liste à jour`,
    );
    assert.ok(
      !graph.parents.has(file),
      `Import statique à couper (import() ou module sans composant) : ${chainTo(graph.parents, file)}`,
    );
  });
}

test('useForetmapRealtime charge le client Socket.IO par import()', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/hooks/useForetmapRealtime.js'), 'utf8');
  assert.match(source, /import\('socket\.io-client'\)/);
});

test('staticImportSources lit imports et réexports, pas les import() dynamiques', () => {
  const src = [
    "import { io } from 'socket.io-client';",
    "import './c.css';",
    'import {',
    '  a,',
    "} from './multi.js';",
    "export { b } from './reexport.js';",
    "export * from './star.js';",
    "const load = () => import('./lazy.js');",
    " * import { x } from './commentaire.js';",
  ].join('\n');
  assert.deepStrictEqual(staticImportSources(src), [
    'socket.io-client',
    './c.css',
    './multi.js',
    './reexport.js',
    './star.js',
  ]);
});
