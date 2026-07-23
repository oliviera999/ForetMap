import { describe, test, expect } from 'vitest';
import { feuilletProgressLabel } from '../../src/gl/utils/glFeuilletProgressLabels.js';

describe('feuilletProgressLabel', () => {
  test('mappe les états de jeu vers des libellés français lisibles', () => {
    expect(feuilletProgressLabel('locked')).toEqual({ icon: '🔒', label: 'Non trouvé' });
    expect(feuilletProgressLabel('discovered')).toEqual({ icon: '🗺️', label: 'Trouvé' });
    expect(feuilletProgressLabel('read')).toEqual({ icon: '📖', label: 'Lu' });
    expect(feuilletProgressLabel('held')).toEqual({ icon: '✋', label: 'Tenu' });
    expect(feuilletProgressLabel('effaced')).toEqual({ icon: '🌫️', label: 'Effacé' });
    expect(feuilletProgressLabel('revealed')).toEqual({ icon: '👁️', label: 'Révélé' });
  });

  test('retourne null pour un statut inconnu ou absent (jamais de valeur brute)', () => {
    expect(feuilletProgressLabel(null)).toBeNull();
    expect(feuilletProgressLabel(undefined)).toBeNull();
    expect(feuilletProgressLabel('')).toBeNull();
    expect(feuilletProgressLabel('bidon')).toBeNull();
  });
});
