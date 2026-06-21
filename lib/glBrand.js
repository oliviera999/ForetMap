/** Emplacements visuels calqués sur la page d’accueil yo.olution.info (hero + 3 cartes). */
const { normalizeGlImageFrame } = require('./glImageFrame');

const GL_BRAND_LAYOUT_SLOT_IDS = Object.freeze(['hero', 'card_world', 'card_rules', 'card_spells']);

const DEFAULT_GL_BRAND_SLOTS = Object.freeze({
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
});

const GL_BRAND_COLOR_KEYS = Object.freeze([
  'primary',
  'secondary',
  'tertiary',
  'text',
  'link',
  'linkHover',
  'topbar',
  'background',
]);

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
  const slotContext = base?.tab ? 'brand-card' : 'brand-hero';
  const out = {
    imageUrl: normalizeRelativeAssetUrl(source.imageUrl),
    title: String(source.title || base.title || '').trim(),
    frame: normalizeGlImageFrame(source.frame || base.frame || null, slotContext),
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
      body:
        String(fontsSource.body || DEFAULT_GL_BRAND.fonts.body).trim() ||
        DEFAULT_GL_BRAND.fonts.body,
      heading:
        String(fontsSource.heading || DEFAULT_GL_BRAND.fonts.heading).trim() ||
        DEFAULT_GL_BRAND.fonts.heading,
      googleFamilies: normalizeFontFamilies(
        fontsSource.googleFamilies,
        DEFAULT_GL_BRAND.fonts.googleFamilies,
      ),
    },
    logoUrl: normalizeRelativeAssetUrl(source.logoUrl),
    faviconUrl: normalizeRelativeAssetUrl(source.faviconUrl || ''),
    slots: normalizeBrandSlots(source.slots),
  };
}

function isValidHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

/** Thème chapitre sparse : seules les couleurs renseignées sont conservées. */
function normalizeChapterTheme(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const colorsSource =
    source.colors && typeof source.colors === 'object' && !Array.isArray(source.colors)
      ? source.colors
      : {};
  const colors = {};
  for (const key of GL_BRAND_COLOR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(colorsSource, key)) continue;
    const val = colorsSource[key];
    if (val == null || String(val).trim() === '') continue;
    const normalized = normalizeHexColor(val, null);
    if (normalized) colors[key] = normalized;
  }
  return { colors };
}

/** Valide theme en écriture ; rejette les hex invalides explicitement fournis. */
function validateChapterThemeInput(raw) {
  if (raw == null) return { theme: null, error: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { theme: null, error: 'theme invalide' };
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'colors')) {
    return { theme: normalizeChapterTheme(raw), error: null };
  }
  const colors = raw.colors;
  if (colors == null) return { theme: { colors: {} }, error: null };
  if (typeof colors !== 'object' || Array.isArray(colors)) {
    return { theme: null, error: 'theme.colors invalide' };
  }
  for (const key of GL_BRAND_COLOR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(colors, key)) continue;
    const val = colors[key];
    if (val == null || String(val).trim() === '') continue;
    if (!isValidHexColor(val)) {
      return { theme: null, error: `Couleur theme invalide: ${key}` };
    }
  }
  return { theme: normalizeChapterTheme(raw), error: null };
}

function parseChapterThemeJson(value) {
  if (!value) return { colors: {} };
  try {
    return normalizeChapterTheme(JSON.parse(String(value)));
  } catch (_) {
    return { colors: {} };
  }
}

function serializeChapterTheme(theme) {
  const normalized = normalizeChapterTheme(theme);
  if (Object.keys(normalized.colors).length === 0) return null;
  return JSON.stringify(normalized);
}

function mergeBrandWithChapterTheme(baseBrand, chapterTheme) {
  const brand = normalizeBrand(baseBrand);
  const overrides = normalizeChapterTheme(chapterTheme);
  if (Object.keys(overrides.colors).length === 0) return brand;
  const mergedColors = { ...brand.colors };
  for (const [key, value] of Object.entries(overrides.colors)) {
    mergedColors[key] = value;
  }
  return { ...brand, colors: mergedColors };
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
  GL_BRAND_COLOR_KEYS,
  GL_BRAND_LAYOUT_SLOT_IDS,
  DEFAULT_GL_BRAND_SLOTS,
  normalizeBrand,
  normalizeBrandSlots,
  normalizeChapterTheme,
  validateChapterThemeInput,
  parseChapterThemeJson,
  serializeChapterTheme,
  mergeBrandWithChapterTheme,
  normalizeRelativeAssetUrl,
  parseBrandFromGlSettings,
};
