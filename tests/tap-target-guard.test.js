'use strict';

// Garde-fou des « cibles tactiles ≥ 44 px » (bloc en fin de `src/index.css` et de
// `src/gl/styles/gl-theme.css`).
//
// Le pseudo-élément `::after` qui agrandit la zone cliquable mesure `max(100%, 44px)` : ses
// pourcentages se calculent sur le premier ancêtre POSITIONNÉ. Deux régressions sont nées de
// ce contrat (septembre 2026) :
//   1. un bouton repassé en `position: static` (croix des modales Profil / Statistiques) :
//      le `::after` a pris la taille de la modale entière, calque invisible qui avalait le
//      défilement (doigt et molette) et renvoyait les touchers vers le bouton « Fermer » ;
//   2. un `position: relative` de même spécificité posé en fin de feuille : il écrasait le
//      `position: absolute` des croix placées en haut à droite (modales, visionneuse photo),
//      qui retombaient dans le flux.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const SHEETS = ['index.css', path.join('gl', 'styles', 'gl-theme.css')];

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full, acc);
    } else if (entry.name.endsWith('.css')) acc.push(full);
  }
  return acc;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Blocs `sélecteur { corps }` de premier niveau ou imbriqués dans un @media. */
function rules(css) {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]
      .trim()
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean),
    rawSelector: m[1].trim().replace(/\s+/g, ' '),
    body: m[2],
  }));
}

/** Hôtes de l'agrandissement : sélecteurs dont le `::after` mesure `max(100%, 44px)`. */
function tapTargetHosts(css) {
  const hosts = [];
  for (const rule of rules(css)) {
    if (!/width\s*:\s*max\(\s*100%\s*,\s*44px\s*\)/.test(rule.body)) continue;
    for (const selector of rule.selectors) {
      if (selector.endsWith('::after')) hosts.push(selector.slice(0, -'::after'.length));
    }
  }
  return hosts;
}

/** Dernière classe du dernier composé (`.a .b > .c:hover` → `c`). */
function keyClass(selector) {
  const last = selector.split(/[\s>+~]+/).pop() || '';
  const classes = last.match(/\.[\w-]+/g);
  return classes ? classes[classes.length - 1].slice(1) : null;
}

test('chaque feuille déclare ses hôtes de cible tactile', () => {
  for (const sheet of SHEETS) {
    const hosts = tapTargetHosts(fs.readFileSync(path.join(SRC, sheet), 'utf8'));
    assert.ok(hosts.length > 0, `${sheet} : bloc « cibles tactiles ≥ 44 px » introuvable`);
  }
});

test('le positionnement des hôtes passe par :where() (spécificité nulle)', () => {
  const offenders = [];
  for (const sheet of SHEETS) {
    const css = fs.readFileSync(path.join(SRC, sheet), 'utf8');
    const hosts = new Set(tapTargetHosts(css));
    let wrapped = 0;
    for (const rule of rules(css)) {
      if (!/position\s*:\s*relative/.test(rule.body)) continue;
      if (/^:where\(/.test(rule.rawSelector)) {
        if ([...hosts].every((host) => rule.rawSelector.includes(host))) wrapped += 1;
        continue;
      }
      const bare = rule.selectors.filter((s) => hosts.has(s));
      if (bare.length) offenders.push(`${sheet} → ${bare.join(', ')}`);
    }
    if (wrapped === 0) offenders.push(`${sheet} → aucun :where(…) ne positionne tous les hôtes`);
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Hôtes positionnés avec leur spécificité propre :\n  ${offenders.join('\n  ')}\n` +
      'Envelopper dans :where(…) : sinon la règle écrase le `position: absolute` des croix ' +
      'placées par leur composant.',
  );
});

test('aucun hôte de cible tactile n’est repassé en position: static', () => {
  const keys = new Set();
  for (const sheet of SHEETS) {
    for (const host of tapTargetHosts(fs.readFileSync(path.join(SRC, sheet), 'utf8'))) {
      const key = keyClass(host);
      if (key) keys.add(key);
    }
  }
  assert.ok(keys.size > 0);
  const offenders = [];
  for (const file of walk(SRC)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const rule of rules(content)) {
      if (!/position\s*:\s*static/.test(rule.body)) continue;
      for (const selector of rule.selectors) {
        const key = keyClass(selector);
        if (key && keys.has(key) && !/::?(after|before)$/.test(selector)) {
          offenders.push(`${path.relative(SRC, file)} → ${selector}`);
        }
      }
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Hôtes de cible tactile en position: static :\n  ${offenders.join('\n  ')}\n` +
      'Le ::after se calerait sur la modale entière et bloquerait défilement et touchers. ' +
      'Utiliser position: relative (avec top/right: auto pour annuler un placement).',
  );
});

// ── Taille effective au doigt (cascade statique) ────────────────────────────────────────
//
// Les trois tests ci-dessus gardent le mécanisme `::after`. Ceux-ci répondent à la question
// posée par l'audit du 25/09/2026 (§ 1.4.7) : AU DOIGT, combien mesure chaque cible, À
// L'ENDROIT où l'élève la touche ? La règle `pointer:coarse` à 44 px existait déjà ; elle
// était battue sur l'écran carte par une compaction de spécificité supérieure
// (`.main.main--map-visible .map-view-toolbar button { min-height: 30px }`, plus des
// `!important`). Chercher « la règle de la classe » ne l'aurait pas vu : on rejoue donc la
// cascade (`tests/helpers/cssCascade.js`) pour une chaîne d'ancêtres réaliste.

const { computedValue, loadSheet, toPx } = require('./helpers/cssCascade');

/** Feuilles de l'entrée ForetMap, dans l'ordre de `src/main.jsx` (`index.css` et ses @import). */
function foretSheets() {
  const main = fs.readFileSync(path.join(SRC, 'main.jsx'), 'utf8');
  const files = [...main.matchAll(/^import\s+['"](\.\/[^'"]+\.css)['"];?$/gm)].map((m) =>
    path.join(SRC, m[1]),
  );
  return files.flatMap((file) => loadSheet(file));
}

const TAP = 44;
const PHONE = { width: 390, height: 844, pointer: 'coarse', hover: 'none' };
const TABLET = { width: 1180, height: 820, pointer: 'coarse', hover: 'none' };
const DESKTOP = { width: 1440, height: 900, pointer: 'fine', hover: 'hover' };

const el = (tag, classes = [], extra = {}) => ({ tag, classes, ...extra });
const DOC = [el('html'), el('body'), el('div', [], { id: 'root' })];

/** Écrans où vit la barre d'outils de la carte (`MapViewToolbar`, `App.jsx`, `map-views.jsx`). */
const MAP_SCREENS = {
  'élève, carte seule': [
    el('main', ['main', 'app-main-shell', 'app-main-shell--student', 'main--map-visible']),
    el('div', ['map-view-root', 'map-view-root--solo']),
  ],
  'prof, carte intégrée': [
    el('main', ['main', 'teacher-main', 'app-main-shell', 'teacher-main--map-visible']),
    el('div', ['map-view-root', 'map-view-root--embedded']),
  ],
  // Sans compaction : c'est là que `.map-toolbar-pill { min-height: 36px }` battait le bloc
  // `pointer:coarse` écrit AVANT lui.
  'carte intégrée, barre non compactée': [
    el('main', ['main', 'app-main-shell']),
    el('div', ['map-view-root', 'map-view-root--embedded']),
  ],
};

/** Commandes de la barre, avec leur conteneur. `square` : commande en icône seule. */
const TOOLBAR_TARGETS = {
  'bascule de carte': [el('div', ['map-switch-inline']), el('button', ['map-toolbar-mode-btn'])],
  'mode Nav / Zone / Repère': [
    el('div'),
    el('button', ['map-toolbar-mode-btn', 'map-toolbar-mode-btn--nav']),
  ],
  'pilule (Repères, Voisins, Aimant…)': [el('div'), el('button', ['map-toolbar-pill'])],
  'suivi GPS': [el('div'), el('button', ['map-gps-follow-toggle', 'map-toolbar-pill'])],
  'gestes carte': [el('div'), el('button', ['map-gesture-toggle'])],
  'plein écran': [el('div'), el('button', ['fm-map-fullscreen-open'])],
  'bouton générique compact': [el('div'), el('button', ['btn', 'btn-ghost', 'btn-sm'])],
  'taille du texte': [
    el('div'),
    el('span', ['fm-tooltip-wrap']),
    el('button', ['map-toolbar-text-size-btn'], { square: true }),
  ],
  'noms / regroupement': [
    el('div'),
    el('span', ['fm-tooltip-wrap']),
    el('button', ['map-toolbar-labels-btn'], { square: true }),
  ],
  'zoom + / − / recentrer': [
    el('div'),
    el('div', ['map-toolbar-zoom-group', 'fm-pct-map-controls']),
    el('button', ['fm-map-action', 'fm-map-action--display', 'fm-map-action--icon-only'], {
      square: true,
    }),
  ],
  'aide « ? »': [el('div'), el('button', ['fm-help-btn'], { square: true })],
  'liste des cartes': [el('select', ['map-switch-select'])],
};

/** Autres cibles relevées par l'audit (puces des modules pédagogiques). */
const OTHER_TARGETS = {
  'puce Quiz / Glossaire / fiche': [
    el('main', ['main']),
    el('div', ['pedago-chip-row']),
    el('button', ['pedago-chip-btn']),
  ],
  'préréglage du réseau trophique': [
    el('main', ['main']),
    el('div', ['pedago-foodweb__preset-btns']),
    el('button', ['pedago-chip-btn', 'active']),
  ],
  'puce d’espèce isolée (réseau trophique)': [
    el('main', ['main']),
    el('div', ['pedago-foodweb-graph__selection']),
    el('button', ['pedago-foodweb-graph__chip']),
  ],
  'puce d’espèce (groupes emboîtés)': [
    el('main', ['main']),
    el('div', ['nested-groups-setup__picks']),
    el('label', ['nested-groups-chip']),
  ],
};

/**
 * Dimension effective (px) d'une boîte : `max(min-<dim>, <dim>)`, ou 44 si un `::after`
 * de la cible s'étend à `max(100%, 44px)` (zone d'appui agrandie, bloc de fin de feuille).
 */
function effectiveSize(rules, chain, dim, env) {
  const expanded = computedValue(rules, chain, dim, env, { pseudoElement: 'after' });
  if (expanded && /^max\(\s*100%\s*,\s*44px\s*\)$/.test(expanded.value)) {
    return { px: TAP, source: `::after ${expanded.source}` };
  }
  const min = computedValue(rules, chain, `min-${dim}`, env);
  const fixed = computedValue(rules, chain, dim, env);
  const minPx = min ? toPx(min.value) : 0;
  const fixedPx = fixed ? toPx(fixed.value) : 0;
  const px = Math.max(Number.isNaN(minPx) ? 0 : minPx, Number.isNaN(fixedPx) ? 0 : fixedPx);
  const source = minPx >= fixedPx ? min?.source : fixed?.source;
  return { px, source: source || '(aucune règle)' };
}

function tapTargetOffenders(rules, env) {
  const offenders = [];
  const check = (label, chain) => {
    const target = chain[chain.length - 1];
    const dims = target.square ? ['height', 'width'] : ['height'];
    for (const dim of dims) {
      const { px, source } = effectiveSize(rules, chain, dim, env);
      if (!(px >= TAP)) offenders.push(`${label} → ${dim} ${px}px (${source})`);
    }
  };
  for (const [screen, ancestors] of Object.entries(MAP_SCREENS)) {
    for (const [label, tail] of Object.entries(TOOLBAR_TARGETS)) {
      check(`${screen} · ${label}`, [
        ...DOC,
        ...ancestors,
        el('div', ['map-view-toolbar']),
        ...tail,
      ]);
    }
  }
  for (const [label, chain] of Object.entries(OTHER_TARGETS)) check(label, [...DOC, ...chain]);
  return offenders;
}

test('au doigt, chaque cible de la barre carte et des puces pédago fait au moins 44 px', () => {
  const rules = foretSheets();
  for (const [name, env] of [
    ['téléphone', PHONE],
    ['tablette', TABLET],
  ]) {
    const offenders = tapTargetOffenders(rules, env);
    assert.deepStrictEqual(
      offenders,
      [],
      `Cibles tactiles sous 44 px (${name}, pointeur grossier) :\n  ${offenders.join('\n  ')}\n` +
        'Une règle plus spécifique (ou posée plus bas) écrase le minimum tactile : ajouter la ' +
        'cible au bloc `@media (pointer:coarse)` de même spécificité, APRÈS la règle fautive.',
    );
  }
});

test('à la souris, la barre carte compacte reste compacte (le correctif ne fuit pas)', () => {
  // Contre-épreuve : sans elle, un moteur qui appliquerait toutes les requêtes média
  // ferait passer le test précédent à vide.
  const rules = foretSheets();
  const chain = [
    ...DOC,
    ...MAP_SCREENS['élève, carte seule'],
    el('div', ['map-view-toolbar']),
    ...TOOLBAR_TARGETS['pilule (Repères, Voisins, Aimant…)'],
  ];
  const { px, source } = effectiveSize(rules, chain, 'height', DESKTOP);
  assert.ok(px < TAP, `Pilule à ${px}px à la souris (${source}) : la compaction a sauté.`);
});
