import { describe, test, expect } from 'vitest';
import { channelLabel, isOrphanChannel } from '../../src/gl/utils/glFeuilletChannelLabels.js';

describe('glFeuilletChannelLabels', () => {
  test('channelLabel : libellés statiques connus', () => {
    expect(channelLabel('zone')).toBe('Zone carte');
    expect(channelLabel('biome-pool')).toBe('Pool biome');
    expect(channelLabel('lien:espece_pays')).toBe('Lien espèce (pays)');
    expect(channelLabel('orphan')).toBe('Orphelin');
  });

  test('channelLabel : lien inconnu → « Lien <canal> »', () => {
    expect(channelLabel('lien:autre')).toBe('Lien autre');
  });

  test('channelLabel : vide → tiret', () => {
    expect(channelLabel('')).toBe('—');
    expect(channelLabel(null)).toBe('—');
  });

  test('isOrphanChannel', () => {
    expect(isOrphanChannel('orphan')).toBe(true);
    expect(isOrphanChannel('zone')).toBe(false);
  });
});
