import { describe, test, expect } from 'vitest';
import { enovOriginFrom, enovPrintUrl } from '../../src/utils/enovPrintLinks.js';

describe('enovOriginFrom', () => {
  test('déduit enov.* de l’adresse publique du plan', () => {
    expect(
      enovOriginFrom('https://planlyautey.olution.info', 'https://foretmap.olution.info'),
    ).toBe('https://enov.olution.info');
  });

  test('à défaut, déduit enov.* de l’hôte de la console', () => {
    expect(enovOriginFrom('', 'https://foretmap.olution.info')).toBe('https://enov.olution.info');
  });

  test('garde un hôte sans sous-domaine et son port', () => {
    expect(enovOriginFrom('', 'http://localhost:3000')).toBe('http://localhost:3000');
  });

  test('ignore une adresse publique invalide', () => {
    expect(enovOriginFrom('pas une url', 'https://foretmap.olution.info')).toBe(
      'https://enov.olution.info',
    );
  });
});

describe('enovPrintUrl', () => {
  test('toutes les cartes, une carte, plusieurs cartes', () => {
    expect(enovPrintUrl('https://enov.x.fr', [])).toBe('https://enov.x.fr/impression');
    expect(enovPrintUrl('https://enov.x.fr/', ['beaulieu'])).toBe(
      'https://enov.x.fr/impression?map_id=beaulieu',
    );
    expect(enovPrintUrl('https://enov.x.fr', ['lyautey', 'beaulieu'])).toBe(
      'https://enov.x.fr/impression?map_id=lyautey,beaulieu',
    );
  });
});
