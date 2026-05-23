'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeBrand,
  normalizeBrandSlots,
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
});

test('normalizeBrandSlots remplit les quatre emplacements', () => {
  const slots = normalizeBrandSlots({});
  assert.ok(slots.hero);
  assert.ok(slots.card_world.tab, 'world');
  assert.ok(slots.card_spells.tab, 'spells');
});
