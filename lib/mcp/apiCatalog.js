'use strict';

/**
 * Catalogue des routes ForêtMap pour `foretmap_api_catalog` (hors Gnomes & Licornes).
 *
 * Source : les tableaux de `docs/API.md` (le fichier est livré avec le dépôt), analysés une fois
 * par processus — méthode, chemin, description, section, permission(s) citée(s) en code
 * (`tasks.manage`…). Croisés avec la pile des routeurs Express montés sur l'application : une
 * route servie mais absente de la documentation est signalée `documented: false`.
 */

const fs = require('node:fs');
const path = require('node:path');

const API_DOC = path.join(__dirname, '..', '..', 'docs', 'API.md');
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const PERMISSION_RE = /`([a-z_]+(?:\.[a-z_]+){1,3})`/g;
const GL_RE = /^\/api\/gl(?:\/|$)/;

let cache = null;

function stripMd(text) {
  return String(text || '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `/api/tasks/:id` ↔ `/api/tasks/{id}` ↔ `/api/tasks/<id>` : forme comparable. */
function normalizePath(p) {
  return String(p || '')
    .split('?')[0]
    .replace(/\/:[A-Za-z_][A-Za-z0-9_]*\??/g, '/:')
    .replace(/\/\{[^}]+\}/g, '/:')
    .replace(/\/<[^>]+>/g, '/:')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/** Analyse les lignes de tableau `| MÉTHODE | `/api/…` | … |` de `docs/API.md`. */
function parseApiDoc(markdown) {
  const routes = [];
  let section = '';
  for (const line of String(markdown).split(/\r?\n/)) {
    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    if (heading) {
      section = stripMd(heading[1]);
      continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const methodCell = cells[1] || '';
    const methods = methodCell
      .split(/[\s/,]+/)
      .map((m) => m.toUpperCase())
      .filter((m) => METHODS.has(m));
    if (!methods.length) continue;
    const urlMatch = /`([^`]+)`/.exec(cells[2] || '');
    if (!urlMatch) continue;
    const url = urlMatch[1].trim().split(/\s+/)[0];
    if (!url.startsWith('/api/') || GL_RE.test(url)) continue;
    const rest = cells.slice(3, -1).join(' | ');
    const permissions = [...new Set([...rest.matchAll(PERMISSION_RE)].map((m) => m[1]))].filter(
      (p) => !p.startsWith('ui.') && !p.startsWith('content.') && !/\.(?:js|md|sql)$/.test(p),
    );
    for (const method of methods) {
      routes.push({
        method,
        path: url,
        section,
        description: stripMd(rest).slice(0, 600),
        permissions,
        documented: true,
      });
    }
  }
  return routes;
}

/**
 * Parcourt la pile Express et renvoie les routes servies sous `/api/` (hors G&L). Le chemin de
 * montage d'un routeur n'est pas conservé par Express 5 : il est retrouvé en testant les
 * préfixes connus (documentation) contre le motif de la couche.
 */
function listExpressRoutes(app, candidatePrefixes) {
  const out = [];
  const stack = app?.router?.stack || app?._router?.stack || [];
  const tryMatch = (layer, p) => {
    try {
      return layer.match(p) ? layer.path : null;
    } catch (_) {
      return null;
    }
  };
  const walk = (layers, prefix, depth) => {
    if (depth > 4) return;
    for (const layer of layers) {
      if (layer.route) {
        const routePath = String(layer.route.path || '');
        if (typeof layer.route.path !== 'string') continue;
        const methods = Object.keys(layer.route.methods || {})
          .map((m) => m.toUpperCase())
          .filter((m) => METHODS.has(m));
        for (const method of methods) out.push({ method, path: `${prefix}${routePath}` });
        continue;
      }
      const sub = layer.handle && Array.isArray(layer.handle.stack) ? layer.handle.stack : null;
      if (!sub) continue;
      // Sous-routeur monté sans chemin (`router.use(require('./tasks/logs'))`).
      if (tryMatch(layer, '/__mcp_probe__') === '') {
        walk(sub, prefix, depth + 1);
        continue;
      }
      // Préfixe le plus long qui correspond à cette couche.
      let mount = null;
      for (const candidate of candidatePrefixes) {
        if (!candidate.startsWith(prefix)) continue;
        const relative = candidate.slice(prefix.length) || '/';
        const matched = tryMatch(layer, relative);
        if (matched && relative === matched && (!mount || candidate.length > mount.length)) {
          mount = candidate;
        }
      }
      if (mount) walk(sub, mount, depth + 1);
    }
  };
  walk(stack, '', 0);
  return out.filter((r) => r.path.startsWith('/api/') && !GL_RE.test(r.path));
}

/** Préfixes de montage plausibles : tous les préfixes de chemins documentés. */
function candidatePrefixesFrom(routes) {
  const set = new Set(['/api']);
  for (const r of routes) {
    const parts = r.path.split('?')[0].split('/').filter(Boolean);
    let acc = '';
    for (const part of parts) {
      if (part.startsWith(':') || part.startsWith('{') || part.startsWith('<')) break;
      acc += `/${part}`;
      set.add(acc);
    }
  }
  return [...set].sort((a, b) => a.length - b.length);
}

/**
 * Catalogue complet (mis en cache par processus).
 * @param {import('express').Express} [app]
 */
function loadCatalog(app) {
  if (cache && cache.app === app) return cache.routes;
  let documented = [];
  try {
    documented = parseApiDoc(fs.readFileSync(API_DOC, 'utf8'));
  } catch (_) {
    documented = [];
  }
  const routes = [...documented];
  if (app) {
    const seen = new Set(documented.map((r) => `${r.method} ${normalizePath(r.path)}`));
    const served = listExpressRoutes(app, candidatePrefixesFrom(documented));
    const servedKeys = new Set();
    for (const r of served) {
      const key = `${r.method} ${normalizePath(r.path)}`;
      servedKeys.add(key);
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push({
        method: r.method,
        path: r.path,
        section: 'Non documentée',
        description: 'Route servie par l’application, absente de docs/API.md.',
        permissions: [],
        documented: false,
      });
    }
    if (served.length > 0) {
      for (const r of routes) {
        if (r.documented) r.served = servedKeys.has(`${r.method} ${normalizePath(r.path)}`);
      }
    }
  }
  cache = { app, routes };
  return routes;
}

/**
 * Filtre le catalogue.
 * @param {object[]} routes
 * @param {{ prefix?: string, q?: string, method?: string, undocumented_only?: boolean }} f
 */
function filterCatalog(routes, f = {}) {
  const prefix = String(f.prefix || '').trim();
  const q = String(f.q || '')
    .trim()
    .toLowerCase();
  const method = String(f.method || '')
    .trim()
    .toUpperCase();
  return routes.filter((r) => {
    if (prefix && !r.path.startsWith(prefix)) return false;
    if (method && r.method !== method) return false;
    if (f.undocumented_only && r.documented) return false;
    if (q) {
      const hay =
        `${r.path} ${r.section} ${r.description} ${r.permissions.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function resetCatalogCacheForTests() {
  cache = null;
}

module.exports = {
  filterCatalog,
  listExpressRoutes,
  loadCatalog,
  normalizePath,
  parseApiDoc,
  resetCatalogCacheForTests,
};
