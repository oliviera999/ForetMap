'use strict';

/**
 * Garde : tout paquet chargé par le code d'exécution du serveur doit être une dépendance de
 * production.
 *
 * Le serveur de production installe `npm ci --omit=dev` (scripts/auto-deploy-cron.sh) et le
 * bundle d'exécution fait `npm prune --omit=dev` (scripts/prepare-runtime-deploy.js). Un
 * `require` d'une dépendance de développement passe donc tous les tests (où `node_modules`
 * contient tout) et ne casse qu'en production, au premier appel de la route concernée.
 * Cas réel : `lib/tutorialViewSanitize.js` chargeait `isomorphic-dompurify`, déclaré en
 * `devDependencies` (audit du 25/09/2026, § 1.4.3).
 *
 * Méthode : parcours du graphe des `require` / `import` relatifs depuis les points d'entrée du
 * serveur (y compris les modules de `src/` que le serveur charge à l'exécution), puis contrôle
 * de chaque paquet externe rencontré.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const RUNTIME_ENTRIES = ['server.js', 'app.js', 'database.js'];
const RESOLVE_EXTENSIONS = ['', '.js', '.cjs', '.mjs', '.jsx', '.json', '/index.js'];
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

function stripComments(source) {
  // Suffisant pour notre usage : retire les commentaires bloc (JSDoc `import('x')` compris)
  // et les commentaires de ligne qui ne suivent pas un `:` (URL `https://`).
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function extractSpecifiers(source) {
  const code = stripComments(source);
  const out = new Set();
  const patterns = [
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code))) out.add(m[1]);
  }
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

function packageNameOf(spec) {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

function collectRuntimePackages() {
  const seen = new Set();
  const packages = new Map(); // nom → premier fichier qui le charge
  const queue = RUNTIME_ENTRIES.map((f) => path.join(ROOT, f));
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(c|m)?jsx?$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const spec of extractSpecifiers(source)) {
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const resolved = resolveRelative(file, spec);
        if (resolved && !resolved.includes(`${path.sep}node_modules${path.sep}`)) {
          queue.push(resolved);
        }
        continue;
      }
      if (BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])) continue;
      const name = packageNameOf(spec);
      if (!packages.has(name)) packages.set(name, path.relative(ROOT, file));
    }
  }
  return { packages, files: seen };
}

test('le graphe d’exécution du serveur est parcouru (garde non vide)', () => {
  const { files, packages } = collectRuntimePackages();
  assert.ok(files.size > 200, `seulement ${files.size} fichiers atteints`);
  assert.ok(packages.has('express'), 'express devrait être atteint depuis server.js');
  assert.ok(
    [...files].some((f) => f.endsWith(path.join('lib', 'tutorialViewSanitize.js'))),
    'lib/tutorialViewSanitize.js devrait être atteint (route des tutoriels)',
  );
});

test('aucun paquet de développement n’est chargé par le code d’exécution du serveur', () => {
  const prod = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ]);
  const dev = new Set(Object.keys(pkg.devDependencies || {}));
  const { packages } = collectRuntimePackages();
  const offenders = [];
  for (const [name, file] of packages) {
    if (prod.has(name)) continue;
    offenders.push(
      `${name} (chargé par ${file}${dev.has(name) ? ', déclaré en devDependencies' : ', non déclaré'})`,
    );
  }
  assert.deepEqual(
    offenders,
    [],
    `Dépendances manquantes en production (npm ci --omit=dev) :\n  ${offenders.join('\n  ')}`,
  );
});
