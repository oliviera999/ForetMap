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
