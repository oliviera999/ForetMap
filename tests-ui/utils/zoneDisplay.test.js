import { describe, it, expect } from 'vitest';
import { zoneEmojiOf, zoneTitleOf } from '../../src/utils/zoneDisplay.js';

describe('zoneDisplay — colonne emoji en priorité, repli sur le préfixe du nom', () => {
  it('colonne renseignée : elle gagne', () => {
    expect(zoneEmojiOf({ emoji: '💧', name: '🌳 Verger' })).toBe('💧');
  });
  it('colonne vide : repli sur le préfixe détecté', () => {
    expect(zoneEmojiOf({ emoji: '', name: '🌳 Verger' })).toBe('🌳');
    expect(zoneEmojiOf({ name: 'Verger' })).toBe('');
  });
  it('titre : nom sans préfixe, nom brut si rien à retirer', () => {
    expect(zoneTitleOf({ name: '🌳 Verger' })).toBe('Verger');
    expect(zoneTitleOf({ name: 'Verger' })).toBe('Verger');
    expect(zoneTitleOf({})).toBe('');
  });
});
