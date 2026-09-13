import { describe, expect, test } from 'vitest';
import { PLAN_BRAND_DEFAULTS, PLAN_SCHOOL_LOGO_URL } from '../../src/plan/utils/planBrand.js';

describe('planBrand — charte Lycée Lyautey', () => {
  test('défauts marine (logo officiel), pas le vert forêt ForetMap', () => {
    expect(PLAN_BRAND_DEFAULTS.colors.primary).toBe('#183058');
    expect(PLAN_BRAND_DEFAULTS.colors.topbar).toBe('#183058');
    expect(PLAN_BRAND_DEFAULTS.colors.background).toBe('#eef1f6');
    expect(PLAN_BRAND_DEFAULTS.colors.link).toBe('#406088');
    expect(PLAN_SCHOOL_LOGO_URL).toBe('/plan/logo-lyautey.png');
  });
});
