import { describe, expect, test } from 'vitest';

import {
  BRAND_COLOR_KEYS,
  NEUTRAL_BRAND_DEFAULTS,
  brandCssVariables,
  googleFontsHref,
  normalizeBrandAssetUrl,
  normalizeBrandCore,
  safeBrandColor,
  toCssFontFamily,
} from '../../src/shared/brand/brandThemeCore.js';

const DEFAULTS = {
  colors: {
    primary: '#111111',
    secondary: '#222222',
    tertiary: '#333333',
    text: '#444444',
    link: '#555555',
    linkHover: '#666666',
    topbar: '#777777',
    background: '#888888',
  },
  fonts: { body: 'Base', heading: 'Titre', googleFamilies: ['Base', 'Titre'] },
  logoUrl: '',
  faviconUrl: '',
};

describe('sécurité des URL de marque', () => {
  test('seuls /uploads/ et /maps/ sont acceptés (anti-exfiltration)', () => {
    expect(normalizeBrandAssetUrl('/uploads/logo.png')).toBe('/uploads/logo.png');
    expect(normalizeBrandAssetUrl('/maps/plan.svg')).toBe('/maps/plan.svg');
    expect(normalizeBrandAssetUrl('https://exemple.test/pixel.png')).toBe('');
    expect(normalizeBrandAssetUrl('//exemple.test/pixel.png')).toBe('');
    expect(normalizeBrandAssetUrl('javascript:alert(1)')).toBe('');
    expect(normalizeBrandAssetUrl(null)).toBe('');
  });
});

describe('safeBrandColor', () => {
  test('n’accepte qu’un hexadécimal à six chiffres', () => {
    expect(safeBrandColor('#AABBCC', '#000000')).toBe('#AABBCC');
    expect(safeBrandColor('#abc', '#000000')).toBe('#000000');
    expect(safeBrandColor('red', '#000000')).toBe('#000000');
    expect(safeBrandColor('', '#000000')).toBe('#000000');
  });
});

describe('normalizeBrandCore', () => {
  test('thème vide : les valeurs par défaut du produit, à l’identique', () => {
    const brand = normalizeBrandCore(null, DEFAULTS);
    expect(brand.colors).toEqual(DEFAULTS.colors);
    expect(brand.fonts.body).toBe('Base');
    expect(brand.fonts.googleFamilies).toEqual(['Base', 'Titre']);
    expect(brand.logoUrl).toBe('');
  });

  test('valeurs partielles : seules les couleurs valides remplacent le défaut', () => {
    const brand = normalizeBrandCore(
      { colors: { primary: '#00ff00', text: 'pas une couleur' } },
      DEFAULTS,
    );
    expect(brand.colors.primary).toBe('#00ff00');
    expect(brand.colors.text).toBe(DEFAULTS.colors.text);
    expect(Object.keys(brand.colors)).toEqual([...BRAND_COLOR_KEYS]);
  });

  test('polices Google : bornées à six familles, vides retirées', () => {
    const brand = normalizeBrandCore(
      { fonts: { googleFamilies: ['A', ' ', 'B', 'C', 'D', 'E', 'F', 'G'] } },
      DEFAULTS,
    );
    expect(brand.fonts.googleFamilies).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  test('sans valeurs par défaut fournies : repli neutre', () => {
    const brand = normalizeBrandCore({});
    expect(brand.colors.primary).toBe(NEUTRAL_BRAND_DEFAULTS.colors.primary);
  });
});

describe('brandCssVariables', () => {
  test('préfixe par produit et camelCase converti en tirets', () => {
    const style = brandCssVariables(normalizeBrandCore({}, DEFAULTS), { prefix: 'gl' });
    expect(style['--gl-color-primary']).toBe('#111111');
    expect(style['--gl-color-link-hover']).toBe('#666666');
    expect(style['--gl-font-body']).toBe('"Base", serif');
  });

  test('sans police définie, aucune variable de police n’est posée', () => {
    const style = brandCssVariables({ colors: { primary: '#123456' }, fonts: {} }, {});
    expect(style['--fm-color-primary']).toBe('#123456');
    expect(style['--fm-font-body']).toBeUndefined();
  });
});

describe('toCssFontFamily / googleFontsHref', () => {
  test('un nom simple est cité ; une pile déjà écrite passe telle quelle', () => {
    expect(toCssFontFamily('Cinzel')).toBe('"Cinzel", serif');
    expect(toCssFontFamily('Arial, sans-serif')).toBe('Arial, sans-serif');
    expect(toCssFontFamily('', 'sans-serif')).toBe('sans-serif');
  });

  test('URL Google Fonts dédoublonnée, vide quand il n’y a rien à charger', () => {
    expect(googleFontsHref(['DM Sans', 'DM Sans'])).toContain('family=DM+Sans');
    expect(googleFontsHref([])).toBe('');
    expect(googleFontsHref(['  '])).toBe('');
  });
});
