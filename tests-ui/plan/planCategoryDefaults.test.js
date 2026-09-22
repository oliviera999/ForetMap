import { describe, expect, it } from 'vitest';
import { fingerprintCategoryDefaults } from '../../src/plan/utils/planCategoryDefaults.js';

describe('fingerprintCategoryDefaults', () => {
  it('ordonne et normalise les ids', () => {
    expect(fingerprintCategoryDefaults(['b', 'a'])).toBe('["a","b"]');
    expect(fingerprintCategoryDefaults([2, 1])).toBe('["1","2"]');
  });

  it('vide → []', () => {
    expect(fingerprintCategoryDefaults([])).toBe('[]');
    expect(fingerprintCategoryDefaults(null)).toBe('[]');
  });
});
