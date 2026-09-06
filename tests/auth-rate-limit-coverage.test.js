'use strict';

/**
 * Couverture du limiteur strict d'authentification (audit comptes 2026-09, S1/S2).
 *
 * `POST /api/gl/auth/staff/login` vérifiait un mot de passe prof/admin ForetMap sans figurer
 * dans `authRateLimitPaths` : le durcissement du login principal (20 essais / 15 min) était
 * contournable à 1200 essais/min par la porte GL. Ce test lit les routeurs d'auth et exige que
 * toute route PUBLIQUE (sans middleware d'auth) qui vérifie un mot de passe soit limitée.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { listAuthRateLimitPaths } = require('../lib/products');

const ROUTERS = [
  { file: 'routes/auth.js', mount: '/api/auth' },
  { file: 'routes/gl/auth.js', mount: '/api/gl/auth' },
];

const PASSWORD_CHECK_MARKERS = [
  'bcrypt.compare(',
  'verifyGlPlayerPassword(',
  'attemptGlStaffPasswordLogin(',
];
const AUTH_MIDDLEWARE_MARKERS = [
  'requireGlAuth',
  'requireAuth',
  'requirePermission(',
  'requireTeacher',
];

/** Découpe un routeur Express en blocs `router.<verbe>('<chemin>', …)`. */
function listRouteBlocks(source) {
  const blocks = [];
  const re = /router\.(get|post|put|patch|delete)\(\s*\n?\s*'([^']+)'/g;
  const starts = [];
  let m;
  while ((m = re.exec(source))) starts.push({ index: m.index, method: m[1], route: m[2] });
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    blocks.push({ ...starts[i], body: source.slice(starts[i].index, end) });
  }
  return blocks;
}

test('toute route publique qui vérifie un mot de passe est sous le limiteur strict', () => {
  const limited = new Set(listAuthRateLimitPaths());
  const missing = [];
  const covered = [];
  for (const { file, mount } of ROUTERS) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    for (const block of listRouteBlocks(source)) {
      const checksPassword = PASSWORD_CHECK_MARKERS.some((marker) => block.body.includes(marker));
      if (!checksPassword) continue;
      const header = block.body.slice(0, 400);
      const authenticated = AUTH_MIDDLEWARE_MARKERS.some((marker) => header.includes(marker));
      const fullPath = `${mount}${block.route}`;
      if (limited.has(fullPath)) {
        covered.push(fullPath);
        continue;
      }
      // Une route authentifiée qui vérifie le mot de passe COURANT (profil, changement) n'est
      // pas un oracle sur d'autres comptes ; `link-foretmap`, lui, teste un compte tiers.
      if (authenticated && !block.route.includes('link-foretmap')) continue;
      missing.push(`${block.method.toUpperCase()} ${fullPath}`);
    }
  }
  assert.deepStrictEqual(
    missing,
    [],
    `Routes vérifiant un mot de passe hors limiteur : ${missing.join(', ')}`,
  );
  assert.ok(covered.includes('/api/gl/auth/staff/login'));
  assert.ok(covered.includes('/api/gl/auth/link-foretmap'));
  assert.ok(covered.includes('/api/auth/login'));
  assert.ok(covered.includes('/api/gl/auth/login'));
});
