import { useEffect, useMemo } from 'react';
import { normalizeGlImageFrame } from '../../shared/image-frame/glImageFrame.js';
import { mergeBrandWithChapterTheme } from '../utils/glBrandTheme.js';
import {
  brandCssVariables,
  googleFontsHref,
  normalizeBrandAssetUrl as normalizeAssetUrl,
  normalizeBrandCore,
} from '../../shared/brand/brandThemeCore.js';

export const GL_CONTENT_PAGE_SLOT_BY_SLUG = {
  world: 'card_world',
  rules: 'card_rules',
  spells: 'card_spells',
};

export const DEFAULT_GL_BRAND = {
  colors: {
    primary: '#013a40',
    secondary: '#f2e8d5',
    tertiary: '#bdbfb4',
    text: '#262626',
    link: '#778c88',
    linkHover: '#2c5959',
    topbar: '#013a40',
    background: '#f4fff5',
  },
  fonts: {
    body: 'Caudex',
    heading: 'Cinzel',
    googleFamilies: ['Caudex', 'Cinzel'],
  },
  logoUrl: '',
  faviconUrl: '',
  slots: {
    hero: {
      imageUrl: '',
      title: '',
      subtitle: '',
      frame: normalizeGlImageFrame(null, 'brand-hero'),
    },
    card_world: {
      imageUrl: '',
      title: 'Un monde',
      tab: 'world',
      frame: normalizeGlImageFrame(null, 'brand-card'),
    },
    card_rules: {
      imageUrl: '',
      title: 'Les règles du jeu',
      tab: 'rules',
      frame: normalizeGlImageFrame(null, 'brand-card'),
    },
    card_spells: {
      imageUrl: '',
      title: 'Les sortilèges',
      tab: 'spells',
      frame: normalizeGlImageFrame(null, 'brand-card'),
    },
  },
};

function normalizeSlot(rawSlot, defaults) {
  const source = rawSlot && typeof rawSlot === 'object' ? rawSlot : {};
  const base = defaults && typeof defaults === 'object' ? defaults : {};
  const slotContext = base?.tab ? 'brand-card' : 'brand-hero';
  const out = {
    imageUrl: normalizeAssetUrl(source.imageUrl),
    title: String(source.title || base.title || '').trim(),
    frame: normalizeGlImageFrame(source.frame || base.frame || null, slotContext),
  };
  if (base.tab) out.tab = String(source.tab || base.tab).trim();
  if ('subtitle' in base || 'subtitle' in source) {
    out.subtitle = String(source.subtitle || base.subtitle || '').trim();
  }
  return out;
}

function normalizeSlots(rawSlots) {
  const source = rawSlots && typeof rawSlots === 'object' ? rawSlots : {};
  const defaults = DEFAULT_GL_BRAND.slots;
  return {
    hero: normalizeSlot(source.hero, defaults.hero),
    card_world: normalizeSlot(source.card_world, defaults.card_world),
    card_rules: normalizeSlot(source.card_rules, defaults.card_rules),
    card_spells: normalizeSlot(source.card_spells, defaults.card_spells),
  };
}

/**
 * Couleurs, polices, logo et favicon viennent du noyau partagé
 * (`src/shared/brand/brandThemeCore.js`, lot 7) ; les **emplacements d'images** (héros,
 * cartes de contenu) restent propres à G&L, aucun autre produit n'en a.
 */
export function normalizeBrand(rawBrand) {
  const source = rawBrand && typeof rawBrand === 'object' ? rawBrand : {};
  return {
    ...normalizeBrandCore(source, DEFAULT_GL_BRAND),
    slots: normalizeSlots(source.slots),
  };
}

function upsertBrandFaviconLink(href) {
  if (typeof document === 'undefined') return;
  const url = String(href || '').trim();
  if (!url) return;
  let node = document.getElementById('gl-brand-favicon');
  if (!node) {
    node = document.createElement('link');
    node.id = 'gl-brand-favicon';
    node.rel = 'icon';
    document.head.appendChild(node);
  }
  const lower = url.toLowerCase();
  node.type = lower.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  node.href = url;
}

function upsertFontLink(families) {
  if (typeof document === 'undefined') return;
  const href = googleFontsHref(families);
  if (!href) return;
  let node = document.getElementById('gl-brand-fonts');
  if (!node) {
    node = document.createElement('link');
    node.id = 'gl-brand-fonts';
    node.rel = 'stylesheet';
    document.head.appendChild(node);
  }
  node.href = href;
}

export function useGLBrandTheme(rawBrand, chapterTheme) {
  const brand = useMemo(
    () => mergeBrandWithChapterTheme(normalizeBrand(rawBrand), chapterTheme),
    [rawBrand, chapterTheme],
  );
  useEffect(() => {
    upsertFontLink(brand.fonts.googleFamilies);
  }, [brand]);

  useEffect(() => {
    if (brand.faviconUrl) upsertBrandFaviconLink(brand.faviconUrl);
  }, [brand.faviconUrl]);

  // Mêmes variables qu'avant (`--gl-color-*`, `--gl-font-*`) : le préfixe est celui du produit.
  const style = useMemo(() => brandCssVariables(brand, { prefix: 'gl' }), [brand]);

  return { brand, style };
}
