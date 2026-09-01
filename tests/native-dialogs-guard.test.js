'use strict';

// Garde-fou de l'audit homogénéité UI (D-1) : plus de dialogues natifs bloquants dans le
// front. `window.confirm/alert/prompt` gèlent le thread (animations, polling, Socket.IO),
// ignorent le thème et peuvent être supprimés silencieusement en PWA/WebView. Utiliser
// `useAppDialogs()` (src/shared/components/AppDialogsProvider.jsx) : confirm/prompt en
// promesses, notify en toast. Si ce test casse, migrez l'appel — ou, pour un vrai cas
// synchrone (beforeunload), ajoutez le fichier à l'allowlist en le justifiant.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

/** Fichiers autorisés à référencer les primitives natives. */
const ALLOWLIST = new Set([
  // Repli hors provider (tests montés sans shell) — seule implémentation légitime.
  'shared/components/AppDialogsProvider.jsx',
  // Repli injectable historique ; les appelants injectent le prompt du provider.
  'utils/profilesRolePrompts.js',
]);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(js|jsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

test('src/ : plus aucun window.confirm / window.alert / window.prompt hors allowlist', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    if (ALLOWLIST.has(rel)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(/window\.(confirm|alert|prompt)\s*\(/g)) {
      const line = content.slice(0, m.index).split('\n').length;
      offenders.push(`${rel}:${line} → window.${m[1]}()`);
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `dialogues natifs hors provider :\n${offenders.join('\n')}`,
  );
});
