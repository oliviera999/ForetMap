'use strict';

/**
 * Garde-fou de la convention « toute route publique nouvelle ou modifiée → `docs/API.md` »
 * (CLAUDE.md). Rapproche les routes réellement montées (`server.js` → `routes/**`) des URL
 * documentées. Audit du 13/09/2026 (§3.5) : treize routes d'administration du lore G&L
 * manquaient sans que rien ne le dise.
 *
 * Sans base ni serveur : lecture des sources. Les URL de la doc peuvent être absolues
 * (`/api/...`), relatives sous un titre qui porte le préfixe entre accents graves
 * (`## Lien Moodle (\`/api/admin/integrations/moodle\`)` puis `| GET | \`/status\` |`), ou
 * couvertes par un préfixe joker (`/api/x/*`). Les paramètres (`:id`, `{id}`) sont neutralisés.
 */
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Routes dont l'absence de documentation est assumée (préfixes). */
const UNDOCUMENTED_ALLOWLIST = [
  // Rien pour l'instant : toute exception doit être justifiée ici, avec la raison.
];

function normalizePath(p) {
  return String(p)
    .replace(/\/+$/, '')
    .replace(/:[A-Za-z0-9_]+\??/g, ':X')
    .replace(/\{[^}]+\}/g, ':X')
    .replace(/\(:X\)\?/g, '');
}

/** Fichiers de routes montés, avec leur préfixe : `server.js` puis `router.use(require(...))`. */
function collectMountedRouteFiles() {
  const server = read('server.js');
  const requires = new Map();
  for (const m of server.matchAll(
    /const\s+([A-Za-z0-9_]+)\s*=\s*require\('\.\/routes\/([^']+)'\)/g,
  )) {
    requires.set(m[1], `routes/${m[2]}${m[2].endsWith('.js') ? '' : '.js'}`);
  }
  const mounts = [];
  for (const m of server.matchAll(/app\.use\('(\/api[^']*)',\s*([A-Za-z0-9_]+)\)/g)) {
    const file = requires.get(m[2]);
    if (file) mounts.push({ prefix: m[1], file });
  }
  // Routeurs « santé » et « exploitation » montés sans préfixe ou via une fabrique.
  mounts.push({ prefix: '', file: 'routes/health.js' });
  mounts.push({ prefix: '', file: 'routes/admin-ops.js' });
  // Sous-routeurs inclus par un routeur parent : même préfixe.
  const out = [];
  const seen = new Set();
  const visit = (prefix, file) => {
    if (!fs.existsSync(path.join(ROOT, file)) || seen.has(`${prefix}|${file}`)) return;
    seen.add(`${prefix}|${file}`);
    out.push({ prefix, file });
    const src = read(file);
    for (const m of src.matchAll(/router\.use\(\s*(?:'([^']*)',\s*)?require\('(\.[^']+)'\)/g)) {
      const sub = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[2]));
      visit(prefix + (m[1] || ''), sub.endsWith('.js') ? sub : `${sub}.js`);
    }
  };
  for (const { prefix, file } of mounts) visit(prefix, file);
  return out;
}

function collectDeclaredRoutes() {
  const declared = new Set();
  for (const { prefix, file } of collectMountedRouteFiles()) {
    const src = read(file);
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*['`]([^'`]+)['`]/g)) {
      const p = m[2].startsWith('/') ? m[2] : `/${m[2]}`;
      declared.add(`${m[1].toUpperCase()} ${normalizePath(prefix + p) || prefix}`);
    }
  }
  return declared;
}

function collectDocumentedRoutes() {
  const doc = read('docs/API.md');
  const paths = new Set();
  const wildcards = [];
  let sectionPrefix = '';
  for (const line of doc.split('\n')) {
    const heading = /^#{2,4}\s.*?`(\/api[^`\s]*)`/.exec(line);
    if (/^#{2,4}\s/.test(line)) sectionPrefix = heading ? heading[1].replace(/\/+$/, '') : '';
    for (const m of line.matchAll(/`(\/api\/[^`\s]+)`|(?<![\w/`])(\/api\/[^\s`|)]+)/g)) {
      const raw = (m[1] || m[2]).replace(/[.,;:]+$/, '');
      if (raw.endsWith('/*')) wildcards.push(normalizePath(raw.slice(0, -2)));
      else paths.add(normalizePath(raw));
    }
    // Ligne de tableau avec URL relative : `| GET | \`/status\` |` — préfixée par le titre de
    // section quand il en porte un, sinon prise telle quelle (alias hors `/api`, ex. `/health`).
    for (const m of line.matchAll(/\|\s*`(\/(?!api\/)[^`\s]*)`\s*\|/g)) {
      const rel = m[1] === '/' ? '' : m[1];
      paths.add(normalizePath(sectionPrefix ? sectionPrefix + rel : rel));
    }
  }
  return { paths, wildcards };
}

test('chaque route montée est décrite dans docs/API.md', () => {
  const declared = collectDeclaredRoutes();
  const { paths, wildcards } = collectDocumentedRoutes();
  const missing = [...declared]
    .filter((route) => {
      const p = route.split(' ')[1];
      if (paths.has(p)) return false;
      if (wildcards.some((w) => p.startsWith(`${w}/`) || p === w)) return false;
      return !UNDOCUMENTED_ALLOWLIST.some((prefix) => p.startsWith(prefix));
    })
    .sort();
  assert.ok(declared.size > 300, `trop peu de routes détectées (${declared.size})`);
  assert.deepEqual(
    missing,
    [],
    `Routes montées absentes de docs/API.md (${missing.length}) :\n  ${missing.join('\n  ')}`,
  );
});
