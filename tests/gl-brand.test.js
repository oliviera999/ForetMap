'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeBrand,
  normalizeBrandSlots,
  normalizeChapterTheme,
  mergeBrandWithChapterTheme,
  DEFAULT_GL_BRAND,
  DEFAULT_GL_BRAND_SLOTS,
} = require('../lib/glBrand');

test('normalizeBrand conserve les slots et filtre les URLs locales', () => {
  const brand = normalizeBrand({
    logoUrl: 'https://yo.olution.info/logo.png',
    slots: {
      hero: {
        imageUrl: '/uploads/gl_brand/hero.png',
        title: 'Gnomes & Licornes',
        subtitle: "L'aventure commence ici",
      },
      card_world: {
        imageUrl: 'https://yo.olution.info/wp-content/uploads/world.png',
        title: 'Un monde',
        tab: 'world',
      },
    },
  });
  assert.strictEqual(brand.logoUrl, '');
  assert.strictEqual(brand.slots.hero.imageUrl, '/uploads/gl_brand/hero.png');
  assert.strictEqual(brand.slots.card_world.imageUrl, '');
  assert.strictEqual(brand.slots.card_rules.title, DEFAULT_GL_BRAND_SLOTS.card_rules.title);
  assert.strictEqual(brand.slots.hero.frame.aspectRatio, '21/9');
  assert.strictEqual(brand.slots.card_world.frame.aspectRatio, '4/3');
});

test('normalizeBrandSlots remplit les quatre emplacements', () => {
  const slots = normalizeBrandSlots({});
  assert.ok(slots.hero);
  assert.ok(slots.card_world.tab, 'world');
  assert.ok(slots.card_spells.tab, 'spells');
  assert.strictEqual(slots.card_rules.frame.objectFit, 'cover');
});

test('normalizeChapterTheme conserve uniquement les couleurs hex valides', () => {
  const theme = normalizeChapterTheme({
    colors: {
      primary: '#1a4d2e',
      secondary: 'invalid',
      background: '',
      text: '#262626',
    },
  });
  assert.deepStrictEqual(theme.colors, {
    primary: '#1a4d2e',
    text: '#262626',
  });
});

test('mergeBrandWithChapterTheme surcharge partiellement la charte plateforme', () => {
  const merged = mergeBrandWithChapterTheme(DEFAULT_GL_BRAND, {
    colors: { primary: '#112233', background: '#aabbcc' },
  });
  assert.strictEqual(merged.colors.primary, '#112233');
  assert.strictEqual(merged.colors.background, '#aabbcc');
  assert.strictEqual(merged.colors.secondary, DEFAULT_GL_BRAND.colors.secondary);
});
