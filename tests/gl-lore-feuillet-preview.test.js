'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeFeuilletPreviewFields,
  maskLockedFeuillet,
  DEFAULT_FEUILLET_PREVIEW_FIELDS,
} = require('../lib/glLoreFeuilletPreview');

test('normalizeFeuilletPreviewFields : défaut incipit si valeur absente/invalide', () => {
  assert.deepStrictEqual(normalizeFeuilletPreviewFields(undefined), [
    ...DEFAULT_FEUILLET_PREVIEW_FIELDS,
  ]);
  assert.deepStrictEqual(normalizeFeuilletPreviewFields('incipit'), ['incipit']);
  assert.deepStrictEqual(normalizeFeuilletPreviewFields(null), ['incipit']);
});

test('normalizeFeuilletPreviewFields : filtre inconnus, déduplique, préserve autorisés', () => {
  assert.deepStrictEqual(
    normalizeFeuilletPreviewFields(['incipit', 'texte', 'ideeCle', 'incipit', 'bidon']),
    ['incipit', 'ideeCle'],
  );
  assert.deepStrictEqual(normalizeFeuilletPreviewFields([]), []);
  assert.deepStrictEqual(normalizeFeuilletPreviewFields(['imageUrl', 'ancrageScientifique']), [
    'imageUrl',
    'ancrageScientifique',
  ]);
});

test('maskLockedFeuillet : masque le contenu, garde titre + champs autorisés', () => {
  const formatted = {
    feuilletCode: 'ep-I-01',
    titre: 'Premier matin',
    liasse: 'I',
    incipit: 'Sélène regarde…',
    ideeCle: 'la nature change',
    texte: 'texte intégral MJ',
    texteAccessible: 'texte accessible',
    displayText: 'texte accessible',
    ancrageScientifique: 'succession écologique',
    imageUrl: '/uploads/x.png',
    imageCoupeUrl: '/uploads/coupe.png',
    effacementPct: 40,
  };
  const masked = maskLockedFeuillet(formatted, ['incipit']);
  // Structure toujours visible.
  assert.strictEqual(masked.titre, 'Premier matin');
  assert.strictEqual(masked.feuilletCode, 'ep-I-01');
  assert.strictEqual(masked.liasse, 'I');
  // Aperçu autorisé conservé.
  assert.strictEqual(masked.incipit, 'Sélène regarde…');
  // Contenu masqué.
  assert.strictEqual(masked.displayText, null);
  assert.strictEqual(masked.texteAccessible, null);
  assert.strictEqual(masked.ancrageScientifique, null);
  assert.strictEqual(masked.imageUrl, null);
  assert.strictEqual(masked.imageCoupeUrl, null);
  assert.strictEqual(masked.ideeCle, null);
  assert.strictEqual(masked.texte, undefined);
  assert.strictEqual(masked.effacementPct, 0);
  // Objet source non altéré.
  assert.strictEqual(formatted.displayText, 'texte accessible');
});

test('maskLockedFeuillet : champ supplémentaire révélé quand autorisé', () => {
  const formatted = { titre: 'T', incipit: 'i', ideeCle: 'k', displayText: 'd' };
  const masked = maskLockedFeuillet(formatted, ['incipit', 'ideeCle']);
  assert.strictEqual(masked.incipit, 'i');
  assert.strictEqual(masked.ideeCle, 'k');
  assert.strictEqual(masked.displayText, null);
});
