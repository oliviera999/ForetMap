import { describe, test, expect } from 'vitest';

import { mapPlaceDisplayParts, mapPlaceKey } from '../../src/shared/map-guide/mapGuidePlace.js';

describe('mapPlaceKey', () => {
  test('le type fait partie de l’identité : la zone 3 n’est pas le repère 3', () => {
    expect(mapPlaceKey({ kind: 'zone', id: 3 })).toBe('zone:3');
    expect(mapPlaceKey({ kind: 'marker', id: 3 })).toBe('marker:3');
    expect(mapPlaceKey({ kind: 'zone', id: 3 })).not.toBe(mapPlaceKey({ kind: 'marker', id: 3 }));
  });

  test('sans identifiant exploitable, la clé est vide (aucun lieu ne peut être visé)', () => {
    expect(mapPlaceKey(null)).toBe('');
    expect(mapPlaceKey({ kind: 'zone' })).toBe('');
    expect(mapPlaceKey({ kind: 'zone', id: '  ' })).toBe('');
  });

  test('sans type explicite, un lieu est traité comme une zone', () => {
    expect(mapPlaceKey({ id: 7 })).toBe('zone:7');
  });
});

describe('mapPlaceDisplayParts', () => {
  test('l’emoji en tête du nom n’est pas affiché deux fois', () => {
    expect(mapPlaceDisplayParts({ kind: 'zone', name: '📚 CDI', emoji: '📚' })).toEqual({
      emoji: '📚',
      name: 'CDI',
    });
  });

  test('la colonne emoji prime, sinon le préfixe du nom, sinon le défaut du type', () => {
    expect(mapPlaceDisplayParts({ kind: 'marker', name: '🌰 Compost', emoji: '' }).emoji).toBe(
      '🌰',
    );
    expect(mapPlaceDisplayParts({ kind: 'marker', name: 'Compost' }).emoji).toBe('📍');
    expect(mapPlaceDisplayParts({ kind: 'zone', name: 'Verger' }).emoji).toBe('🗺️');
  });

  test('un repère nommé par `label` (format Visite) est lisible aussi', () => {
    expect(mapPlaceDisplayParts({ kind: 'marker', label: 'Compost' }).name).toBe('Compost');
  });
});
