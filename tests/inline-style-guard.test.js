'use strict';

// Cliquet des styles en ligne `style={{ … }}` (lot R0 de l'audit UI/UX du 19/11/2026,
// `docs/AUDIT_UI_UX_2026-11-19.md`) : 1 397 occurrences au relevé, +9 % depuis l'audit du
// 16/09. Un style en ligne échappe aux jetons, au thème sombre, aux garde-fous de couleur
// et de typographie, et ne se surcharge pas depuis une feuille.
//
// Même mécanique que `tests/a11y-static-guard.test.js` : un inventaire par fichier, qui ne
// peut que rétrécir.
//   - un fichier absent de l'inventaire ne doit contenir aucun style en ligne compté ;
//   - un fichier inventorié ne doit pas dépasser son compte ;
//   - une entrée devenue trop haute (dette résorbée) fait échouer le test avec la commande
//     pour régénérer : la baisse est enregistrée dans le même lot.
//
// EXEMPTÉ : un objet dont TOUTES les clés sont des propriétés personnalisées
// (`style={{ '--zone-x': x }}`). C'est la forme recommandée pour une valeur réellement
// dynamique (position, progression, couleur venant des données) : le JSX transmet la
// valeur, la feuille de style décide de son usage.
//
// Régénérer après avoir résorbé des styles en ligne :
//   INLINE_STYLE_BASELINE_UPDATE=1 node --test --test-force-exit tests/inline-style-guard.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(__dirname, 'fixtures', 'inline-style-baseline.json');
const REGEN =
  '  INLINE_STYLE_BASELINE_UPDATE=1 node --test --test-force-exit tests/inline-style-guard.test.js';

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, acc);
    } else if (/\.(js|jsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * Corps de l'objet littéral qui suit `style={{` (accolades équilibrées, chaînes ignorées).
 * @param {string} src
 * @param {number} start index juste après `style={{`
 * @returns {string}
 */
function corpsObjet(src, start) {
  let depth = 1;
  let quote = null;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i);
    }
  }
  return src.slice(start);
}

/** Vrai si l'objet ne déclare que des propriétés personnalisées `--…`. */
function seulementProprietesPersonnalisees(corps) {
  // Clés de premier niveau, séparées par les virgules hors parenthèses/accolades. Tout ce
  // qui n'est pas strictement `'--x': …` est compté.
  const sansChaines = corps.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (m) =>
    /^['"]--[\w-]+['"]$/.test(m) ? 'CUSTOMPROP' : 'STR',
  );
  if (/\.\.\./.test(sansChaines)) return false;
  const entrees = [];
  let depth = 0;
  let courant = '';
  for (const c of sansChaines) {
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    if (c === ',' && depth === 0) {
      entrees.push(courant.trim());
      courant = '';
    } else courant += c;
  }
  entrees.push(courant.trim());
  const nonVides = entrees.filter(Boolean);
  return nonVides.length > 0 && nonVides.every((e) => /^CUSTOMPROP\s*:/.test(e));
}

/** @returns {Record<string, number>} nombre de styles en ligne comptés, par fichier */
function relever() {
  const inventaire = {};
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    let n = 0;
    for (const m of src.matchAll(/style=\{\{/g)) {
      if (!seulementProprietesPersonnalisees(corpsObjet(src, m.index + m[0].length))) n += 1;
    }
    if (n > 0) inventaire[path.relative(ROOT, file).split(path.sep).join('/')] = n;
  }
  return inventaire;
}

function ecrire(inventaire) {
  const trie = {};
  for (const f of Object.keys(inventaire).sort()) trie[f] = inventaire[f];
  fs.writeFileSync(BASELINE, `${JSON.stringify(trie, null, 2)}\n`, 'utf8');
}

const total = (inv) => Object.values(inv).reduce((a, b) => a + b, 0);

test('style en ligne : la détection exempte les objets de propriétés personnalisées seules', () => {
  const compte = (s) =>
    seulementProprietesPersonnalisees(corpsObjet(s, s.indexOf('{{') + 2)) ? 0 : 1;
  assert.strictEqual(compte("style={{ '--x': x, '--y': `${y}px` }}"), 0);
  assert.strictEqual(compte("style={{ '--x': x, padding: 8 }}"), 1);
  assert.strictEqual(compte('style={{ color: c }}'), 1);
  assert.strictEqual(compte('style={{ ...base }}'), 1);
  assert.strictEqual(compte("style={{ '--c': fn({ a: 1, b: 2 }) }}"), 0);
});

test('style en ligne : aucun fichier ne dépasse son inventaire (cliquet)', () => {
  const actuel = relever();
  if (process.env.INLINE_STYLE_BASELINE_UPDATE === '1') {
    ecrire(actuel);
    return;
  }
  assert.ok(fs.existsSync(BASELINE), `Inventaire absent. Le créer avec :\n${REGEN}`);
  const reference = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const hausses = Object.entries(actuel)
    .filter(([f, n]) => n > (reference[f] || 0))
    .map(([f, n]) => `  ${f} : ${n} (inventaire : ${reference[f] || 0})`);
  assert.deepStrictEqual(
    hausses,
    [],
    'Nouveaux style={{ … }} : passer par une classe et des jetons (couleur, espacement, ' +
      "typographie), ou par des propriétés personnalisées seules (style={{ '--x': v }}) " +
      `pour une valeur dynamique.\n${hausses.join('\n')}`,
  );
});

test('style en ligne : l’inventaire suit la décroissance (pas d’entrée périmée)', () => {
  if (process.env.INLINE_STYLE_BASELINE_UPDATE === '1') return;
  const actuel = relever();
  const reference = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const perimees = Object.entries(reference)
    .filter(([f, n]) => (actuel[f] || 0) < n)
    .map(([f, n]) => `  ${f} : ${actuel[f] || 0} (inventaire : ${n})`);
  assert.deepStrictEqual(
    perimees,
    [],
    `Dette résorbée (total ${total(actuel)} contre ${total(reference)}) : régénérer l'inventaire avec :\n${REGEN}\n${perimees.join('\n')}`,
  );
});
