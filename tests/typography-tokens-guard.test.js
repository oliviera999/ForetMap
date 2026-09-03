'use strict';

// Garde-fou de l'audit homogénéité UI (B2/B3) : les tailles de police passent par les
// tokens (--text-*), pas par des littéraux rem. Sans ce contrat, chaque nouvel écran
// recrée la dispersion mesurée par l'audit (85 valeurs distinctes pour 879 déclarations).
// Si ce test casse : utilisez var(--text-2xs|xs|sm|base|md|lg|xl|2xl) — ou, pour une
// vraie taille « display » unique, ajoutez-la à l'allowlist ci-dessous en le justifiant.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

/** Littéraux rem tolérés en CSS (tailles « display » uniques, hors échelle). */
const CSS_REM_ALLOWLIST = new Set(['2.5rem', '3rem']);

const REQUIRED_TOKENS = [
  '--text-2xs',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-md',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--fw-regular',
  '--fw-medium',
  '--fw-semibold',
  '--fw-bold',
  '--lh-tight',
  '--lh-normal',
  '--lh-relaxed',
  '--ink-soft',
  '--ink-faint',
];

function walk(dir, ext, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, acc);
    else if (entry.name.endsWith(ext)) acc.push(full);
  }
  return acc;
}

test('CSS : plus aucun font-size littéral en rem hors allowlist', () => {
  const offenders = [];
  for (const file of walk(SRC, '.css')) {
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(/font-size:\s*(\.?[0-9.]+rem)/g)) {
      const value = m[1].startsWith('.') ? `0${m[1]}` : m[1];
      if (!CSS_REM_ALLOWLIST.has(value)) {
        offenders.push(`${path.relative(SRC, file)} → ${value}`);
      }
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `font-size littéraux hors tokens :\n${offenders.join('\n')}`,
  );
});

test('JSX : plus aucun fontSize inline littéral (rem ou nombre nu)', () => {
  const offenders = [];
  for (const file of walk(SRC, '.jsx')) {
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(/fontSize: ('\.?[0-9.]+rem'|[0-9]+(?=[,\s}]))/g)) {
      offenders.push(`${path.relative(SRC, file)} → fontSize: ${m[1]}`);
    }
  }
  assert.deepStrictEqual(offenders, [], `fontSize inline littéraux :\n${offenders.join('\n')}`);
});

test('les tokens sont déclarés une seule fois, dans la feuille partagée chargée par les deux entrées', () => {
  // Lot 0 (convergence) : les tokens communs vivent dans shared/styles/typography-tokens.css,
  // importée par src/index.css (ForetMap) et src/gl/main.jsx (G&L, qui ne charge pas index.css).
  const shared = fs.readFileSync(
    path.join(SRC, 'shared', 'styles', 'typography-tokens.css'),
    'utf8',
  );
  for (const token of REQUIRED_TOKENS) {
    assert.ok(
      new RegExp(`${token}:\\s`).test(shared),
      `${token} manquant dans typography-tokens.css`,
    );
  }
  const indexCss = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
  const glMain = fs.readFileSync(path.join(SRC, 'gl', 'main.jsx'), 'utf8');
  assert.ok(
    /@import\s+'\.\/shared\/styles\/typography-tokens\.css'/.test(indexCss),
    'src/index.css doit importer shared/styles/typography-tokens.css',
  );
  assert.ok(
    /import\s+'\.\.\/shared\/styles\/typography-tokens\.css'/.test(glMain),
    'src/gl/main.jsx doit importer shared/styles/typography-tokens.css',
  );
  // Aucune redéclaration côté produit : une copie divergerait en silence.
  for (const file of ['index.css', 'gl/styles/gl-base.css']) {
    const content = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const token of REQUIRED_TOKENS) {
      assert.ok(!new RegExp(`${token}:\\s`).test(content), `${token} redéclaré dans src/${file}`);
    }
  }
});

test('les six gris « texte secondaire » inline ont disparu au profit de --ink-*', () => {
  const offenders = [];
  for (const file of walk(SRC, '.jsx')) {
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(/color: '(#64748b|#6b7280|#555|#666|#999|#888)'/g)) {
      offenders.push(`${path.relative(SRC, file)} → ${m[1]}`);
    }
  }
  assert.deepStrictEqual(offenders, [], `gris inline hors tokens :\n${offenders.join('\n')}`);
});
