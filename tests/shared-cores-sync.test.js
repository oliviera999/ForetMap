'use strict';

// Garde-fou de non-divergence des noyaux partagés ESM ↔ CJS (lot 0, garde-fous).
//
// Six noyaux vivent en double : la source ESM `src/shared/*Core.js` (front) et son miroir CJS
// `lib/shared/*Core.js` (API Express sans dossier src/). Avant ce lot, les deux copies étaient
// maintenues à la main — aucun script ne les régénérait et rien ne détectait une dérive.
// Ces tests verrouillent la propriété qui rend la duplication sûre : le miroir est exactement
// ce que `scripts/sync-shared-cores.js` produit depuis l'ESM, et les deux copies exposent la
// même API publique.

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert');

const {
  PAIRS,
  outDir,
  renderMirror,
  checkAll,
  esmCoreToCjs,
} = require('../scripts/sync-shared-cores');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'sync-shared-cores.js');

test('la liste des paires couvre bien les six noyaux attendus', () => {
  assert.deepStrictEqual(PAIRS.map(([, outName]) => outName).sort(), [
    'emojiMojibakeCore.js',
    'glBoardPathCore.js',
    'glImageFrameCore.js',
    'glMarkerAppearanceCore.js',
    'glMarkerBackgroundsCore.js',
    'glMarkerEventConfigCore.js',
  ]);
});

test('aucun miroir lib/shared/ ne diverge de sa source ESM (génération en mémoire)', () => {
  const diverged = checkAll();
  assert.deepStrictEqual(
    diverged,
    [],
    `miroirs divergents : ${diverged.map((d) => d.outName).join(', ')} — ` +
      'régénérer avec `npm run sync:shared-cores`',
  );
});

test('`node scripts/sync-shared-cores.js --check` sort en 0 et n’écrit rien', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `sortie : ${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /OK — 6 miroirs/);
});

test('chaque miroir porte l’en-tête « généré » et le mode strict', () => {
  for (const [relSrc, outName] of PAIRS) {
    const text = renderMirror(relSrc);
    assert.ok(
      text.startsWith('/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */\n'),
      `${outName} : en-tête manquant`,
    );
    assert.ok(text.includes(`/* Source : ${relSrc} —`), `${outName} : source non citée`);
    assert.ok(text.includes("'use strict';\n"), `${outName} : 'use strict' manquant`);
    assert.ok(!/^(import |export )/m.test(text), `${outName} : syntaxe ESM résiduelle`);
  }
});

test('les exports ESM et CJS ont exactement les mêmes clés, pour les six paires', async () => {
  for (const [relSrc, outName] of PAIRS) {
    const esm = await import(pathToFileURL(path.join(ROOT, relSrc)).href);
    const cjs = require(path.join(outDir, outName));
    const esmKeys = Object.keys(esm).sort();
    const cjsKeys = Object.keys(cjs).sort();
    assert.ok(esmKeys.length > 0, `${relSrc} : aucun export ESM`);
    assert.deepStrictEqual(cjsKeys, esmKeys, `${outName} : API publique différente de ${relSrc}`);
    for (const key of esmKeys) {
      assert.strictEqual(typeof cjs[key], typeof esm[key], `${outName}.${key} : type différent`);
    }
  }
});

test('la transformation gère les imports relatifs entre noyaux et refuse les inconnus', () => {
  // Import relatif vers un noyau connu → require à plat dans lib/shared/.
  const ok = esmCoreToCjs(
    "import { repairSupplementaryPlaneEmojiMojibake } from './emojiMojibakeCore.js';\n" +
      'export const X = 1;\n',
    'src/shared/glMarkerAppearanceCore.js',
  );
  assert.match(
    ok,
    /const \{ repairSupplementaryPlaneEmojiMojibake \} = require\('\.\/emojiMojibakeCore'\);/,
  );
  assert.match(ok, /module\.exports = \{\n {2}X,\n\};\n$/);

  // Depuis un sous-dossier (image-frame/), le chemin `../` est réaligné sur `./`.
  const sub = esmCoreToCjs(
    "import { GL_TRAME_EMOJI } from '../emojiMojibakeCore.js';\nexport function f() {}\n",
    'src/shared/image-frame/glImageFrameCore.js',
  );
  assert.match(sub, /require\('\.\/emojiMojibakeCore'\)/);

  // Import hors liste PAIRS ou non relatif → erreur explicite (pas de miroir silencieusement cassé).
  assert.throws(
    () =>
      esmCoreToCjs("import { z } from './inconnu.js';\nexport const X = 1;\n", 'src/shared/a.js'),
    /ne vise aucun noyau/,
  );
  assert.throws(
    () => esmCoreToCjs("import { z } from 'zod';\nexport const X = 1;\n", 'src/shared/a.js'),
    /non relatif/,
  );
  // Fichier sans export → erreur.
  assert.throws(() => esmCoreToCjs('const X = 1;\n', 'src/shared/a.js'), /aucun export/);
});
