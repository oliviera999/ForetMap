'use strict';

// Garde-fou des contrastes corrigés au lot accessibilité de l'audit du 25/09/2026 (§ 1.4.7).
//
// Quatre paires tenaient sous 3:1 — dont le message d'erreur de connexion et le nom
// scientifique des fiches, lus par des élèves de 11 ans. Ce test recalcule, par la cascade
// réelle de la feuille (`tests/helpers/cssCascade.js`, variables et `color-mix()` résolus),
// le ratio WCAG 2.x de chaque paire contre chacun de ses fonds, et exige 4,5:1 (texte normal).
//
// Il ne remplace pas un audit : il empêche ces paires-là de revenir. Ajouter une ligne ici
// quand une nouvelle paire est corrigée.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  computedValue,
  contrastRatio,
  loadSheet,
  parseColor,
  toHex,
} = require('./helpers/cssCascade');

const SRC = path.join(__dirname, '..', 'src');
const AA_NORMAL = 4.5;

const PHONE = { width: 390, height: 844, pointer: 'coarse', hover: 'none' };
const DESKTOP = { width: 1440, height: 900, pointer: 'fine', hover: 'hover' };

function foretSheets() {
  const main = fs.readFileSync(path.join(SRC, 'main.jsx'), 'utf8');
  return [...main.matchAll(/^import\s+['"](\.\/[^'"]+\.css)['"];?$/gm)].flatMap((m) =>
    loadSheet(path.join(SRC, m[1])),
  );
}

const el = (tag, classes = [], extra = {}) => ({ tag, classes, ...extra });
const DOC = [el('html'), el('body'), el('div', [], { id: 'root' })];

/**
 * Fonds nommés, résolus sur `:root` (donc par les tokens) : si un token de surface change,
 * le test recalcule. Le dégradé de la carte « promotion » est pris à son arrêt le plus sombre.
 */
const SURFACES = {
  blanc: 'var(--surface-plain)',
  crème: 'var(--cream)',
  'dégradé promotion (arrêt le plus sombre)': '#e2f0e8',
};

/**
 * `fg` : propriété lue sur la cible pour l'encre ; `bg` : propriété lue sur la cible pour le
 * fond, OU liste de surfaces (clés de SURFACES) sur lesquelles le texte est posé.
 */
const CASES = [
  {
    label: 'libellé de type des résultats de filtre (carte)',
    chain: [
      el('div', ['map-location-filter-results']),
      el('button', ['map-location-filter-results__item']),
      el('span', ['map-location-filter-results__kind']),
    ],
    fg: 'color',
    surfaces: ['blanc', 'crème'],
  },
  {
    label: 'surtitre de la carte « promotion »',
    chain: [el('div', ['profile-promo-card__inner']), el('p', ['profile-promo-card__kicker'])],
    fg: 'color',
    surfaces: ['dégradé promotion (arrêt le plus sombre)'],
  },
  {
    label: 'nom scientifique d’une fiche',
    chain: [el('article', ['biodiv-card']), el('p', ['plant-scientific'])],
    fg: 'color',
    surfaces: ['blanc', 'crème'],
  },
  {
    label: 'message d’erreur de connexion',
    chain: [el('div', ['pin-card']), el('div', ['pin-error'])],
    fg: 'color',
    surfaces: ['blanc', 'crème'],
  },
  {
    label: 'mention de crédit de l’accueil',
    chain: [el('div', ['auth-card']), el('p', ['auth-home-credit'])],
    fg: 'color',
    surfaces: ['blanc'],
  },
  {
    label: 'bouton secondaire enfoncé',
    chain: [el('button', ['btn', 'btn-secondary'], { states: ['active'] })],
    fg: 'color',
    bg: 'background',
  },
  {
    label: 'bouton secondaire survolé (souris)',
    chain: [el('button', ['btn', 'btn-secondary'], { states: ['hover'] })],
    fg: 'color',
    bg: 'background',
    env: DESKTOP,
  },
  {
    label: 'préréglage actif du réseau trophique',
    chain: [
      el('div', ['pedago-foodweb__preset-btns']),
      el('button', ['pedago-chip-btn', 'active']),
    ],
    fg: 'color',
    bg: 'background',
  },
];

/** Évalue une valeur CSS sur l'élément `chain` (variables résolues) puis en couleur. */
function colorOf(rules, chain, value, env) {
  const probe = [...chain.slice(0, -1), { ...chain[chain.length - 1], inline: { color: value } }];
  return parseColor(computedValue(rules, probe, 'color', env).value);
}

test('les paires corrigées tiennent 4,5:1 sur chacun de leurs fonds', () => {
  const rules = foretSheets();
  const failures = [];
  const report = [];
  for (const item of CASES) {
    const env = item.env || PHONE;
    const chain = [...DOC, ...item.chain];
    const fg = computedValue(rules, chain, item.fg, env);
    assert.ok(fg, `${item.label} : aucune règle ne pose « ${item.fg} »`);
    const ink = parseColor(fg.value);
    const grounds = item.bg
      ? [[item.bg, parseColor(computedValue(rules, chain, item.bg, env).value)]]
      : item.surfaces.map((name) => [name, colorOf(rules, DOC, SURFACES[name], env)]);
    for (const [name, ground] of grounds) {
      const ratio = contrastRatio(ink, ground);
      const line = `${item.label} : ${toHex(ink)} sur ${name} ${toHex(ground)} → ${ratio.toFixed(2)}:1`;
      report.push(line);
      if (ratio < AA_NORMAL) failures.push(`${line} (source : ${fg.source})`);
    }
  }
  assert.deepStrictEqual(
    failures,
    [],
    `Contrastes sous ${AA_NORMAL}:1 (WCAG AA, texte normal) :\n  ${failures.join('\n  ')}\n` +
      'Employer une encre assombrie (`--leaf`, `--ink-alert`, `--ink-muted`…) plutôt que la ' +
      'teinte d’aplat.',
  );
  assert.ok(report.length >= CASES.length);
});
