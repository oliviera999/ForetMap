import { describe, test, expect } from 'vitest';
import { isSecondaryHighlight, planPlacesFromContent } from '../../src/plan/utils/planPlaces.js';

/**
 * Plan e-nov, migration 326 : le niveau servi par `/api/enov/content` (`enov_tier`) devient
 * un drapeau générique de la carte partagée (`map_highlight_tone`).
 */
describe('planPlacesFromContent — niveaux de mise en avant', () => {
  const content = {
    zones: [
      { id: 'z1', name: 'n³', is_enov: true, enov_tier: 'primary' },
      { id: 'z2', name: 'Esplanade', is_enov: true, enov_tier: 'secondary' },
      { id: 'z3', name: 'Hall', is_enov: false, enov_tier: '' },
    ],
    markers: [{ id: 'm1', label: 'Point de tri', is_enov: true, enov_tier: 'secondary' }],
  };

  test('premier niveau : mis en avant, sans ton', () => {
    const z1 = planPlacesFromContent(content).find((p) => p.id === 'z1');
    expect(z1.map_highlight).toBe(true);
    expect(z1.map_highlight_tone).toBeUndefined();
    expect(isSecondaryHighlight(z1)).toBe(false);
  });

  test('second niveau : mis en avant, ton « secondary »', () => {
    const places = planPlacesFromContent(content);
    for (const id of ['z2', 'm1']) {
      const place = places.find((p) => p.id === id);
      expect(place.map_highlight).toBe(true);
      expect(place.map_highlight_tone).toBe('secondary');
      expect(isSecondaryHighlight(place)).toBe(true);
    }
  });

  test('lieu ordinaire : ni l’un ni l’autre', () => {
    const z3 = planPlacesFromContent(content).find((p) => p.id === 'z3');
    expect(z3.map_highlight).toBeUndefined();
    expect(isSecondaryHighlight(z3)).toBe(false);
  });

  test('charge d’un ancien serveur (sans enov_tier) : premier niveau', () => {
    const [place] = planPlacesFromContent({ zones: [{ id: 'z', name: 'Z', is_enov: true }] });
    expect(place.map_highlight).toBe(true);
    expect(isSecondaryHighlight(place)).toBe(false);
  });
});
