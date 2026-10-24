'use strict';

/**
 * Garde : plus aucun avatar chargé chez un service tiers.
 *
 * Les avatars par défaut sont dessinés par le serveur (`lib/defaultAvatar.js`,
 * `GET /api/users/:id/default-avatar`). Aucun fichier livré ou exécuté — front (`src/`),
 * serveur (`lib/`, `routes/`, `middleware/`, `server.js`, `app.js`, `database.js`), fichiers
 * statiques (`public/`, entrées HTML) — ni aucune variante de la politique CSP ne doit
 * nommer l'API publique de DiceBear (`api.dicebear.com`).
 *
 * Une seule exception, nommée : le jeu G&L (`src/gl/utils/glAvatar.js`), hors du périmètre de
 * ce changement. Elle est vérifiée dans les deux sens : un nouveau fichier qui réintroduirait
 * l'appel échoue, et l'exception devra être retirée d'ici quand G&L aura suivi.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPolicyTable } = require('../lib/csp');

const ROOT = path.join(__dirname, '..');
/** L'API publique de DiceBear (la bibliothèque, elle, est citée et employée côté serveur). */
const THIRD_PARTY_AVATAR_RE = /api\.dicebear\.com/i;
const SCANNED_DIRS = ['src', 'lib', 'routes', 'middleware', 'public'];
const SCANNED_ROOT_FILES = ['server.js', 'app.js', 'database.js'];
const SCANNED_EXT = /\.(c|m)?jsx?$|\.(html|css|json|webmanifest|svg|txt)$/i;
const TOLERATED = new Set([path.join('src', 'gl', 'utils', 'glAvatar.js')]);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (SCANNED_EXT.test(entry.name)) acc.push(full);
  }
  return acc;
}

function scannedFiles() {
  const files = SCANNED_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  for (const f of SCANNED_ROOT_FILES) files.push(path.join(ROOT, f));
  for (const entry of fs.readdirSync(ROOT)) {
    if (entry.endsWith('.html')) files.push(path.join(ROOT, entry));
  }
  return files.filter((f) => fs.existsSync(f));
}

test('aucun fichier livré ou exécuté ne charge d’avatar chez DiceBear (hors exception G&L)', () => {
  const offenders = [];
  const toleratedHits = [];
  for (const file of scannedFiles()) {
    const rel = path.relative(ROOT, file);
    if (!THIRD_PARTY_AVATAR_RE.test(fs.readFileSync(file, 'utf8'))) continue;
    if (TOLERATED.has(rel)) toleratedHits.push(rel);
    else offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `Avatar chargé chez un tiers : ${offenders.join(', ')}`);
  // L'exception doit rester justifiée : si G&L ne l'emploie plus, la retirer de la liste.
  assert.deepEqual(toleratedHits, [...TOLERATED], 'exception G&L à retirer de ce test');
});

test('aucune variante de la CSP ne nomme le service d’avatars tiers', () => {
  const table = buildPolicyTable();
  for (const [mode, variants] of Object.entries(table)) {
    for (const [variant, policy] of Object.entries(variants)) {
      assert.doesNotMatch(policy, THIRD_PARTY_AVATAR_RE, `${mode}/${variant}`);
    }
  }
});

test('le front ForetMap ne construit plus d’URL d’avatar à partir d’un nom', () => {
  const avatarUtils = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'avatar.js'), 'utf8');
  assert.doesNotMatch(avatarUtils, /seed=/);
  assert.doesNotMatch(avatarUtils, /\.(first_name|last_name|pseudo)\b/);
  const shared = fs.readFileSync(
    path.join(ROOT, 'src', 'shared', 'profile', 'avatarUrl.js'),
    'utf8',
  );
  assert.doesNotMatch(shared, /https?:\/\//);
});
