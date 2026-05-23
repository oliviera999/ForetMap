/** Emplacements visuels calqués sur la page d’accueil yo.olution.info (hero + 3 cartes). */
const GL_BRAND_LAYOUT_SLOT_IDS = Object.freeze([
  'hero',
  'card_world',
  'card_rules',
  'card_spells',
]);

const DEFAULT_GL_BRAND_SLOTS = Object.freeze({
  hero: {
    imageUrl: '',
    title: '',
    subtitle: '',
  },
  card_world: {
    imageUrl: '',
    title: 'Un monde',
    tab: 'world',
  },
  card_rules: {
    imageUrl: '',
    title: 'Les règles du jeu',
    tab: 'rules',
  },
  card_spells: {
    imageUrl: '',
    title: 'Les sortilèges',
    tab: 'spells',
  },
});

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
  slots: DEFAULT_GL_BRAND_SLOTS,
});

function normalizeHexColor(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}

function normalizeRelativeAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/') || raw.startsWith('/maps/')) return raw;
  return '';
}

function normalizeBrandSlot(rawSlot, defaults) {
  const source = rawSlot && typeof rawSlot === 'object' ? rawSlot : {};
  const base = defaults && typeof defaults === 'object' ? defaults : {};
  const out = {
    imageUrl: normalizeRelativeAssetUrl(source.imageUrl),
    title: String(source.title || base.title || '').trim(),
  };
  if (base.tab) out.tab = String(source.tab || base.tab).trim();
  if ('subtitle' in base || 'subtitle' in source) {
    out.subtitle = String(source.subtitle || base.subtitle || '').trim();
  }
  return out;
}

function normalizeBrandSlots(rawSlots) {
  const source = rawSlots && typeof rawSlots === 'object' ? rawSlots : {};
  const out = {};
  for (const slotId of GL_BRAND_LAYOUT_SLOT_IDS) {
    out[slotId] = normalizeBrandSlot(source[slotId], DEFAULT_GL_BRAND_SLOTS[slotId]);
  }
  return out;
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
    slots: normalizeBrandSlots(source.slots),
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
  GL_BRAND_LAYOUT_SLOT_IDS,
  DEFAULT_GL_BRAND_SLOTS,
  normalizeBrand,
  normalizeBrandSlots,
  normalizeRelativeAssetUrl,
  parseBrandFromGlSettings,
};
