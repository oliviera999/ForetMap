'use strict';

// Garde-fou du lot couleur (docs/AUDIT_UI_2026-09-16.md §H2, « la couleur est la dernière
// couche non tokenisée »).
//
// Deux contrats distincts, parce que le sujet en comporte deux :
//
//   1. UN LITTÉRAL QUI VAUT DÉJÀ UN TOKEN EST INTERDIT. C'est le contrat fort : réécrire
//      `#6b7280` plutôt que `var(--ink-muted)` recrée exactement la dispersion qu'on vient
//      de résorber, et cette assertion-là n'a aucune tolérance.
//   2. LE RESTE EST UN CLIQUET. Il subsiste une longue traîne de teintes uniques. Le test
//      plafonne leur nombre : la dette ne peut plus grandir, et chaque lot qui en résorbe
//      abaisse le plafond.
//
// Les DEUX FAMILLES DE GRIS (neutre `#222`…`#888`, ardoise `--ink-*`) que ce commentaire
// disait irréconciliables ont été fusionnées : les 18 encres de texte en gris pur et les
// 2 filets de `src/index.css` sont passés à l'échelle ardoise. Le bleutage est réel et
// assumé (ΔE 8 à 12), mais il ne dégrade aucun contraste sous le seuil AA qu'il tenait
// déjà. Reste la traîne d'off-whites teintés vert du thème forêt : les fusionner
// changerait la direction de teinte du thème, ce qui est une autre décision.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

/** Feuilles qui DÉFINISSENT les tokens : elles seules portent les valeurs littérales. */
const DEFINERS = new Set([
  path.join('shared', 'styles', 'color-tokens.css'),
  path.join('shared', 'styles', 'state-inks.css'),
  path.join('shared', 'styles', 'typography-tokens.css'),
]);

/** Entrées de produit qui doivent charger l'échelle. */
const PRODUCT_ENTRIES = [
  'index.css',
  path.join('gl', 'main.jsx'),
  path.join('plan', 'main.jsx'),
  path.join('staff', 'main.jsx'),
];

/**
 * Plafonds. À BAISSER quand un lot résorbe, jamais à monter : une hausse signifie qu'une
 * couleur a été écrite en dur là où un rôle existait.
 */
const CEILING_CSS_HEX = 663;
const CEILING_CSS_RGBA = 579;
const CEILING_INLINE_COLOR = 144;

/** Les illustrations ont leur propre palette : une mascotte n'obéit pas à l'échelle d'UI. */
const isIllustration = (file) => /Svg\.jsx$/.test(file);

function walk(dir, ext, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, ext, acc);
    } else if (entry.name.endsWith(ext)) acc.push(full);
  }
  return acc;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const expand = (hex) => {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};

/** Valeur littérale de chaque token de l'échelle, lue dans les feuilles de définition. */
function tokenValues() {
  const values = new Map();
  for (const rel of DEFINERS) {
    const content = stripComments(fs.readFileSync(path.join(SRC, rel), 'utf8'));
    for (const m of content.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      values.set(expand(m[2]), m[1]);
    }
  }
  return values;
}

test('l’échelle de couleur est définie et chargée par chaque produit', () => {
  const values = tokenValues();
  const REQUIRED = [
    '--surface-plain',
    '--line-soft',
    '--ink-strong',
    '--ink-muted',
    '--tint-success',
    '--accent-success-solid',
    '--ink-danger',
  ];
  const defined = new Set(values.values());
  const missing = REQUIRED.filter((t) => !defined.has(t));
  assert.deepStrictEqual(missing, [], `Tokens de couleur manquants : ${missing.join(', ')}`);

  const offenders = [];
  for (const entry of PRODUCT_ENTRIES) {
    const source = fs.readFileSync(path.join(SRC, entry), 'utf8');
    if (!source.includes('color-tokens.css')) offenders.push(entry);
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Produits qui ne chargent pas l'échelle de couleur : ${offenders.join(', ')}`,
  );
});

test('aucun littéral CSS ne redit la valeur d’un token', () => {
  const values = tokenValues();
  const offenders = [];
  for (const file of walk(SRC, '.css')) {
    const rel = path.relative(SRC, file);
    if (DEFINERS.has(rel)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = stripComments(content).split('\n');
    lines.forEach((line, index) => {
      // Une DÉCLARATION de custom property est le seul endroit où une couleur s'écrit :
      // c'est ainsi qu'un produit pose sa propre palette (`--gl-surface: #fff`).
      if (/^\s*--[\w-]+\s*:/.test(line)) return;
      // Un repli `var(--forest, #1a4731)` est légitime : hors ForetMap, c'est lui qui rend.
      const withoutFallbacks = line.replace(/var\([^)]*\)/g, '');
      for (const m of withoutFallbacks.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        const token = values.get(expand(m[0]));
        if (token) offenders.push(`${rel}:${index + 1} → ${m[0]} vaut ${token}`);
      }
    });
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Couleur réécrite en dur alors qu'un token porte exactement cette valeur :\n  ${offenders.join('\n  ')}`,
  );
});

test('la dette de couleur ne grandit pas (cliquet)', () => {
  let hex = 0;
  let rgba = 0;
  for (const file of walk(SRC, '.css')) {
    if (DEFINERS.has(path.relative(SRC, file))) continue;
    const content = stripComments(fs.readFileSync(file, 'utf8'));
    hex += [...content.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length;
    rgba += [...content.matchAll(/\brgba?\([^)]*\)/g)].length;
  }
  assert.ok(
    hex <= CEILING_CSS_HEX,
    `Littéraux hexadécimaux en CSS : ${hex} (plafond ${CEILING_CSS_HEX}). ` +
      'Employer un token de src/shared/styles/color-tokens.css, ou abaisser le plafond si le lot en résorbe.',
  );
  assert.ok(
    rgba <= CEILING_CSS_RGBA,
    `Littéraux rgb()/rgba() en CSS : ${rgba} (plafond ${CEILING_CSS_RGBA}).`,
  );
});

test('un style inline ne prend pas de nouvelle couleur en dur (cliquet)', () => {
  // Un style inline est à spécificité maximale : une couleur écrite là est hors de portée
  // de toute feuille, donc invisible à toute retouche de palette.
  const COLOR_PROP =
    /\b(color|background|backgroundColor|borderColor|border|boxShadow|fill|stroke|outline|outlineColor|border(?:Top|Bottom|Left|Right))\s*:/;
  let count = 0;
  for (const file of walk(SRC, '.jsx').concat(walk(SRC, '.js'))) {
    if (isIllustration(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/style=\{\{/g)) {
      let depth = 0;
      let end = -1;
      for (let j = m.index + 7; j < source.length; j += 1) {
        const c = source[j];
        if (c === '{') depth += 1;
        else if (c === '}') {
          if (depth === 0) {
            end = j;
            break;
          }
          depth -= 1;
        }
      }
      if (end < 0) continue;
      const body = source.slice(m.index + 7, end);
      if (COLOR_PROP.test(body) && /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(body)) count += 1;
    }
  }
  assert.ok(
    count <= CEILING_INLINE_COLOR,
    `Styles inline portant une couleur littérale : ${count} (plafond ${CEILING_INLINE_COLOR}). ` +
      'Passer par une classe et un token — un style inline est hors de portée de toute feuille.',
  );
});
