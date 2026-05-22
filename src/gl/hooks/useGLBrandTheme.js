import { useEffect, useMemo } from 'react';

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
};

function safeColor(value, fallback) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function safeFontName(value, fallback) {
  const raw = String(value || '').trim();
  return raw || fallback;
}

function normalizeBrand(rawBrand) {
  const source = rawBrand && typeof rawBrand === 'object' ? rawBrand : {};
  const sourceColors = source.colors && typeof source.colors === 'object' ? source.colors : {};
  const sourceFonts = source.fonts && typeof source.fonts === 'object' ? source.fonts : {};
  const googleFamilies = Array.isArray(sourceFonts.googleFamilies)
    ? sourceFonts.googleFamilies.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
    : DEFAULT_GL_BRAND.fonts.googleFamilies;
  return {
    colors: {
      primary: safeColor(sourceColors.primary, DEFAULT_GL_BRAND.colors.primary),
      secondary: safeColor(sourceColors.secondary, DEFAULT_GL_BRAND.colors.secondary),
      tertiary: safeColor(sourceColors.tertiary, DEFAULT_GL_BRAND.colors.tertiary),
      text: safeColor(sourceColors.text, DEFAULT_GL_BRAND.colors.text),
      link: safeColor(sourceColors.link, DEFAULT_GL_BRAND.colors.link),
      linkHover: safeColor(sourceColors.linkHover, DEFAULT_GL_BRAND.colors.linkHover),
      topbar: safeColor(sourceColors.topbar, DEFAULT_GL_BRAND.colors.topbar),
      background: safeColor(sourceColors.background, DEFAULT_GL_BRAND.colors.background),
    },
    fonts: {
      body: safeFontName(sourceFonts.body, DEFAULT_GL_BRAND.fonts.body),
      heading: safeFontName(sourceFonts.heading, DEFAULT_GL_BRAND.fonts.heading),
      googleFamilies: googleFamilies.length > 0 ? googleFamilies : DEFAULT_GL_BRAND.fonts.googleFamilies,
    },
    logoUrl: String(source.logoUrl || '').trim(),
    faviconUrl: String(source.faviconUrl || '').trim(),
  };
}

function toCssFontFamily(value, fallbackStack = 'serif') {
  const raw = String(value || '').trim();
  if (!raw) return fallbackStack;
  if (raw.includes(',')) return raw;
  return `"${raw}", ${fallbackStack}`;
}

function upsertFontLink(families) {
  if (typeof document === 'undefined') return;
  const uniqueFamilies = [...new Set((families || []).map((item) => String(item || '').trim()).filter(Boolean))];
  if (uniqueFamilies.length === 0) return;
  const encoded = uniqueFamilies.map((item) => item.replace(/\s+/g, '+')).join('&family=');
  const href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`;
  let node = document.getElementById('gl-brand-fonts');
  if (!node) {
    node = document.createElement('link');
    node.id = 'gl-brand-fonts';
    node.rel = 'stylesheet';
    document.head.appendChild(node);
  }
  node.href = href;
}

export function useGLBrandTheme(rawBrand) {
  const brand = useMemo(() => normalizeBrand(rawBrand), [rawBrand]);
  useEffect(() => {
    upsertFontLink(brand.fonts.googleFamilies);
  }, [brand]);

  const style = useMemo(() => ({
    '--gl-color-primary': brand.colors.primary,
    '--gl-color-secondary': brand.colors.secondary,
    '--gl-color-tertiary': brand.colors.tertiary,
    '--gl-color-text': brand.colors.text,
    '--gl-color-link': brand.colors.link,
    '--gl-color-link-hover': brand.colors.linkHover,
    '--gl-color-topbar': brand.colors.topbar,
    '--gl-color-background': brand.colors.background,
    '--gl-font-body': toCssFontFamily(brand.fonts.body, 'serif'),
    '--gl-font-heading': toCssFontFamily(brand.fonts.heading, 'serif'),
  }), [brand]);

  return { brand, style };
}
