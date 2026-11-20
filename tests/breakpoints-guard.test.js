'use strict';

// Garde-fou des points de bascule (lot R0 de l'audit UI/UX du 19/11/2026,
// `docs/AUDIT_UI_UX_2026-11-19.md`).
//
// L'échelle vit dans `src/shared/breakpoints.js` (source unique, lue ici). Une condition
// `@media` ne peut pas lire une propriété `--bp-*` : les feuilles écrivent donc la valeur
// en clair, et c'est ce test qui vérifie qu'elle appartient à l'échelle.
//
//   - Valeur canonique : `min-width: N` ou `max-width: N − 1` pour un N de l'échelle.
//     La forme historique décalée d'un pixel (`max-width: N`, `min-width: N + 1`) est
//     tolérée : elle ne crée pas de nouvelle bascule, seulement un recouvrement d'un pixel.
//   - Le reste (720, 900, 860…) est un CLIQUET : le nombre d'occurrences et le nombre de
//     valeurs distinctes hors échelle ne peuvent que baisser. Un lot qui migre une feuille
//     abaisse les plafonds dans le même commit.
//
// Le relevé couvre les feuilles CSS de `src/` ET les conditions écrites en clair dans le
// JavaScript (`useMediaQuery('(max-width: 480px)')`), qui doivent passer par `MEDIA`,
// `mediaUp()` ou `mediaDown()`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MODULE = path.join(SRC, 'shared', 'breakpoints.js');

/** Plafonds. À BAISSER quand un lot résorbe, jamais à monter. */
const CEILING_OFF_SCALE_OCCURRENCES = 51;
const CEILING_OFF_SCALE_DISTINCT = 21;

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, acc);
    } else if (/\.(css|js|jsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Toutes les bornes de largeur des conditions média de `src/`.
 * @returns {{ file: string, kind: 'min'|'max', value: number, unit: string }[]}
 */
function releverBornes() {
  const bornes = [];
  for (const file of walk(SRC)) {
    if (file === MODULE) continue;
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const raw = fs.readFileSync(file, 'utf8');
    // En CSS : seulement le prélude des `@media` (une propriété `max-width: 640px` dans une
    // règle n'est pas une bascule). En JS : une condition entre parenthèses, forme propre
    // aux chaînes de media query (`maxWidth` des styles en ligne n'a pas de tiret).
    const zones = file.endsWith('.css')
      ? [...stripCssComments(raw).matchAll(/@media([^{]*)\{/g)].map((m) => m[1])
      : [raw];
    for (const zone of zones) {
      for (const m of zone.matchAll(/\((min|max)-width\s*:\s*([0-9.]+)(px|rem|em)\s*\)/g)) {
        bornes.push({ file: rel, kind: m[1], value: Number(m[2]), unit: m[3] });
      }
    }
  }
  return bornes;
}

async function chargerEchelle() {
  return import(pathToFileURL(MODULE).href);
}

function estCanonique(borne, echelle) {
  if (borne.unit !== 'px') return false;
  return echelle.some((n) =>
    borne.kind === 'min'
      ? borne.value === n || borne.value === n + 1
      : borne.value === n - 1 || borne.value === n,
  );
}

test('breakpoints : échelle croissante et conditions mediaUp / mediaDown exactes', async () => {
  const { BREAKPOINTS, mediaUp, mediaDown, MEDIA } = await chargerEchelle();
  const valeurs = Object.values(BREAKPOINTS);
  assert.ok(valeurs.length >= 3, 'échelle trop courte');
  assert.deepStrictEqual(
    [...valeurs].sort((a, b) => a - b),
    valeurs,
    'échelle non croissante',
  );
  assert.strictEqual(mediaUp('lg'), `(min-width: ${BREAKPOINTS.lg}px)`);
  assert.strictEqual(mediaDown('lg'), `(max-width: ${BREAKPOINTS.lg - 1}px)`);
  assert.strictEqual(MEDIA.desktop, mediaUp('lg'));
  assert.strictEqual(MEDIA.belowDesktop, mediaDown('lg'));
  assert.throws(() => mediaUp('xxl'), /Point de bascule inconnu/);
});

test('breakpoints : la bascule ordinateur 1023/1024 px des feuilles est celle de l’échelle', async () => {
  // Garde-fou de cohérence : si l'échelle déplaçait `lg`, toutes les feuilles qui écrivent
  // 1023/1024 deviendraient silencieusement hors échelle.
  const { BREAKPOINTS } = await chargerEchelle();
  assert.strictEqual(BREAKPOINTS.lg, 1024);
  const index = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
  assert.match(index, /@media \(min-width:1024px\)/);
});

test('breakpoints : les valeurs hors échelle ne peuvent que diminuer (cliquet)', async () => {
  const { BREAKPOINTS } = await chargerEchelle();
  const echelle = Object.values(BREAKPOINTS);
  const hors = releverBornes().filter((b) => !estCanonique(b, echelle));
  const distinctes = new Set(hors.map((b) => `${b.kind}-width:${b.value}${b.unit}`));
  const detail = hors
    .map((b) => `  ${b.file} : ${b.kind}-width ${b.value}${b.unit}`)
    .sort()
    .join('\n');
  assert.ok(
    hors.length <= CEILING_OFF_SCALE_OCCURRENCES,
    `${hors.length} bornes média hors échelle (plafond ${CEILING_OFF_SCALE_OCCURRENCES}). ` +
      `Utiliser une valeur de src/shared/breakpoints.js (${echelle.join(', ')} px) :\n${detail}`,
  );
  assert.ok(
    distinctes.size <= CEILING_OFF_SCALE_DISTINCT,
    `${distinctes.size} valeurs distinctes hors échelle (plafond ${CEILING_OFF_SCALE_DISTINCT}) : ` +
      [...distinctes].sort().join(', '),
  );
  if (hors.length < CEILING_OFF_SCALE_OCCURRENCES || distinctes.size < CEILING_OFF_SCALE_DISTINCT) {
    // Pas un échec : un rappel pour resserrer le cliquet dans le même lot.
    console.log(
      `[breakpoints-guard] dette réduite : abaisser CEILING_OFF_SCALE_OCCURRENCES à ${hors.length} ` +
        `et CEILING_OFF_SCALE_DISTINCT à ${distinctes.size}.`,
    );
  }
});
