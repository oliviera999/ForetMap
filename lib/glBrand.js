const DEFAULT_GL_BRAND = Object.freeze({
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
  faviconUrl: null,
});

function normalizeHexColor(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}

function normalizeRelativeAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('/uploads/') ? raw : '';
}

function normalizeFontFamilies(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  const out = value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  return out.length > 0 ? out : [...fallback];
}

function normalizeBrand(input) {
  const source = input && typeof input === 'object' ? input : {};
  const colorsSource = source.colors && typeof source.colors === 'object' ? source.colors : {};
  const fontsSource = source.fonts && typeof source.fonts === 'object' ? source.fonts : {};
  return {
    colors: {
      primary: normalizeHexColor(colorsSource.primary, DEFAULT_GL_BRAND.colors.primary),
      secondary: normalizeHexColor(colorsSource.secondary, DEFAULT_GL_BRAND.colors.secondary),
      tertiary: normalizeHexColor(colorsSource.tertiary, DEFAULT_GL_BRAND.colors.tertiary),
      text: normalizeHexColor(colorsSource.text, DEFAULT_GL_BRAND.colors.text),
      link: normalizeHexColor(colorsSource.link, DEFAULT_GL_BRAND.colors.link),
      linkHover: normalizeHexColor(colorsSource.linkHover, DEFAULT_GL_BRAND.colors.linkHover),
      topbar: normalizeHexColor(colorsSource.topbar, DEFAULT_GL_BRAND.colors.topbar),
      background: normalizeHexColor(colorsSource.background, DEFAULT_GL_BRAND.colors.background),
    },
    fonts: {
      body: String(fontsSource.body || DEFAULT_GL_BRAND.fonts.body).trim() || DEFAULT_GL_BRAND.fonts.body,
      heading: String(fontsSource.heading || DEFAULT_GL_BRAND.fonts.heading).trim() || DEFAULT_GL_BRAND.fonts.heading,
      googleFamilies: normalizeFontFamilies(fontsSource.googleFamilies, DEFAULT_GL_BRAND.fonts.googleFamilies),
    },
    logoUrl: normalizeRelativeAssetUrl(source.logoUrl),
    faviconUrl: normalizeRelativeAssetUrl(source.faviconUrl || ''),
  };
}

function parseBrandFromGlSettings(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.key || '').trim();
    if (!key) continue;
    map.set(key, row?.value_json);
  }
  const raw = map.get('platform.brand');
  if (!raw) return normalizeBrand(DEFAULT_GL_BRAND);
  try {
    const parsed = JSON.parse(String(raw));
    return normalizeBrand(parsed);
  } catch (_) {
    return normalizeBrand(DEFAULT_GL_BRAND);
  }
}

module.exports = {
  DEFAULT_GL_BRAND,
  normalizeBrand,
  parseBrandFromGlSettings,
};
