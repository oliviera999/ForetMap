'use strict';

// Mise en avant des lieux (`map_highlight`, plan e-nov) : mouvement BORNÉ. Une respiration sans
// fin attirait l'œil partout à la fois, repeignait la carte à chaque image et dépassait le seuil
// de 5 s au-delà duquel une animation automatique doit pouvoir être mise en pause. Ce test
// empêche qu'une règle `.is-highlight` redevienne `infinite`, et vérifie que chaque animation
// de mise en avant est coupée sous « réduire les animations ».

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs
  .readFileSync(path.join(__dirname, '..', 'src', 'shared', 'styles', 'pct-map-layers.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Règles `sélecteur { déclarations }` de premier niveau et des blocs `@media`. */
function rules(css) {
  return [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim().replace(/\s+/g, ' '),
    body: m[2],
  }));
}

const highlightAnimated = rules(CSS).filter(
  (r) => r.selector.includes('.is-highlight') && /\banimation\s*:/.test(r.body),
);

test('des règles de mise en avant animées existent (garde-fou du test)', () => {
  assert.ok(highlightAnimated.length >= 2, highlightAnimated.map((r) => r.selector).join('\n'));
});

test('aucune animation de mise en avant n’est infinie', () => {
  const offenders = highlightAnimated.filter((r) => /\binfinite\b/.test(r.body));
  assert.deepStrictEqual(
    offenders.map((r) => r.selector),
    [],
    'animation de mise en avant sans fin',
  );
});

test('chaque animation de mise en avant est coupée sous « réduire les animations »', () => {
  const reduced = [
    ...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\})\s*\}/g),
  ]
    .flatMap((m) => rules(m[1]))
    .filter((r) => /animation\s*:\s*none/.test(r.body))
    .flatMap((r) => r.selector.split(',').map((s) => s.trim()));
  const animatedSelectors = highlightAnimated
    .filter((r) => !/animation\s*:\s*none/.test(r.body))
    .flatMap((r) => r.selector.split(',').map((s) => s.trim()));
  const missing = animatedSelectors.filter((s) => !reduced.includes(s));
  assert.deepStrictEqual(missing, [], 'sélecteurs animés sans repli « mouvement réduit »');
});
