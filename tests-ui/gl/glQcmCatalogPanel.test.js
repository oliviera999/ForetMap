import { describe, test, expect } from 'vitest';
import { buildExportQuery, buildQuestionsListQuery } from '../../src/gl/utils/glQcmCatalogPanel.js';

describe('glQcmCatalogPanel - buildExportQuery', () => {
  test('ajoute statut=all uniquement pour l’export complet', () => {
    expect(
      buildExportQuery({
        exportStatut: 'all',
        scopeQueryKey: 'biomeSlug',
        scopeSlug: '',
        categorieSlug: '',
      }),
    ).toBe('statut=all');
    expect(
      buildExportQuery({
        exportStatut: 'actif',
        scopeQueryKey: 'biomeSlug',
        scopeSlug: '',
        categorieSlug: '',
      }),
    ).toBe('');
  });

  test('utilise la clé de scope dynamique et trimme les valeurs', () => {
    expect(
      buildExportQuery({
        exportStatut: 'actif',
        scopeQueryKey: 'biomeSlug',
        scopeSlug: '  sahara  ',
        categorieSlug: '  cosmologie  ',
      }),
    ).toBe('biomeSlug=sahara&categorieSlug=cosmologie');
  });

  test('combine statut, scope et catégorie', () => {
    expect(
      buildExportQuery({
        exportStatut: 'all',
        scopeQueryKey: 'chapterSlug',
        scopeSlug: 'ch1',
        categorieSlug: 'cat',
      }),
    ).toBe('statut=all&chapterSlug=ch1&categorieSlug=cat');
  });

  test('ignore les valeurs vides ou absentes', () => {
    expect(
      buildExportQuery({
        exportStatut: 'actif',
        scopeQueryKey: 'biomeSlug',
        scopeSlug: '   ',
        categorieSlug: undefined,
      }),
    ).toBe('');
  });
});

describe('glQcmCatalogPanel - buildQuestionsListQuery', () => {
  test('ajoute scope, catégorie et recherche trimmés', () => {
    expect(
      buildQuestionsListQuery({
        scopeQueryKey: 'biomeSlug',
        scopeSlug: ' sahara ',
        categorieSlug: ' cosmologie ',
        search: ' trame ',
      }),
    ).toBe('biomeSlug=sahara&categorieSlug=cosmologie&q=trame');
  });

  test('renvoie une chaîne vide sans filtre', () => {
    expect(
      buildQuestionsListQuery({
        scopeQueryKey: 'biomeSlug',
        scopeSlug: '',
        categorieSlug: '',
        search: '',
      }),
    ).toBe('');
  });

  test('n’ajoute que la recherche si seule renseignée', () => {
    expect(
      buildQuestionsListQuery({
        scopeQueryKey: 'biomeSlug',
        scopeSlug: '  ',
        categorieSlug: undefined,
        search: 'arbre',
      }),
    ).toBe('q=arbre');
  });
});
