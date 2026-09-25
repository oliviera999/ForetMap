'use strict';

// Détecteur d'incitations dans les textes visiteurs (lib/visitorTextGuard.js ; règle
// permanente : aucun texte affiché aux visiteurs n'invite à cueillir, goûter ou manipuler un
// être vivant). Le corpus semé est contrôlé à part (tests/content/visitor-texts.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scanVisitorText, findVisitorTextIncitations } = require('../lib/visitorTextGuard');

const classes = (text) => scanVisitorText(text).map((hit) => hit.cls);

test('incitations : impératif, tournure modale, « à goûter »', () => {
  assert.equal(findVisitorTextIncitations('Cueillez les fraises mûres !').length, 1);
  assert.equal(findVisitorTextIncitations('Tu peux goûter une feuille.').length, 1);
  assert.equal(findVisitorTextIncitations('Des baies bonnes à croquer.').length, 1);
  assert.equal(findVisitorTextIncitations('Écrase la feuille entre tes doigts.').length, 1);
});

test('faux positifs écartés : négation, geste d’écran, troisième personne', () => {
  assert.deepEqual(classes('Ne cueillez pas les fleurs.'), ['faux-positif:negation']);
  assert.equal(findVisitorTextIncitations('Ne pas toucher les chenilles.').length, 0);
  assert.deepEqual(classes('Touche une zone pour ouvrir sa fiche.'), ['faux-positif:geste-ecran']);
  assert.equal(findVisitorTextIncitations('L’oiseau mange des graines.').length, 0);
  // Style télégraphique d'une fiche : sujet sous-entendu, l'espèce.
  assert.equal(findVisitorTextIncitations('Régime. Mange pucerons et débris.').length, 0);
  // « mâche » est d'abord une salade.
  assert.equal(findVisitorTextIncitations('Laitues et mâche en hiver.').length, 0);
});

test('zones grises : listées, jamais bloquantes', () => {
  assert.ok(
    classes('Les jeunes pousses se mangent cuites.').includes(
      'zone-grise:information-consommation',
    ),
  );
  assert.ok(classes('Odorante quand on la froisse.').includes('zone-grise:manipulation-decrite'));
  assert.equal(findVisitorTextIncitations('Odorante quand on la froisse.').length, 0);
});

test('HTML : les balises sont ignorées', () => {
  assert.equal(findVisitorTextIncitations('<p><strong>Goûtez</strong> les mûres</p>').length, 1);
  assert.deepEqual(scanVisitorText(''), []);
  assert.deepEqual(scanVisitorText(null), []);
});
