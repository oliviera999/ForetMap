import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, test, expect } from 'vitest';

/**
 * Garde-fou de style : la barre verte de l'app doit rester réservée à `.app-header`.
 *
 * Un sélecteur d'élément nu (`header { … }`) s'appliquait à tous les `<header>`
 * sémantiques de l'app (cartes du studio narrateur OLU, en-têtes des vues pédago) :
 * fond vert collant hérité + titres en vert forêt = titres illisibles.
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('index.css — portée de la barre d’en-tête', () => {
  test('aucune règle ne cible l’élément `header` nu', () => {
    const bareHeaderRule = /(^|[},;>+~])\s*header\s*\{/m;
    expect(bareHeaderRule.test(css)).toBe(false);
  });

  test('le bandeau vert reste attaché à `.app-header`', () => {
    expect(css).toMatch(/header\.app-header\s*\{/);
  });
});
