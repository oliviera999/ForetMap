export const GL_BRAND_COLOR_KEYS = Object.freeze([
  'primary',
  'secondary',
  'tertiary',
  'text',
  'link',
  'linkHover',
  'topbar',
  'background',
]);

export const GL_BRAND_COLOR_LABELS = Object.freeze({
  primary: 'Primaire',
  secondary: 'Secondaire',
  tertiary: 'Tertiaire',
  text: 'Texte',
  link: 'Liens',
  linkHover: 'Liens (survol)',
  topbar: 'Barre haute',
  background: 'Fond',
});

export const DEFAULT_GL_BRAND_COLORS = Object.freeze({
  primary: '#013a40',
  secondary: '#f2e8d5',
  tertiary: '#bdbfb4',
  text: '#262626',
  link: '#778c88',
  linkHover: '#2c5959',
  topbar: '#013a40',
  background: '#f4fff5',
});

function isValidHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function safeColor(value) {
  const raw = String(value || '').trim();
  return isValidHexColor(raw) ? raw.toLowerCase() : null;
}

/** Thème chapitre sparse : seules les couleurs renseignées sont conservées. */
export function normalizeChapterTheme(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const colorsSource = source.colors && typeof source.colors === 'object' && !Array.isArray(source.colors)
    ? source.colors
    : {};
  const colors = {};
  for (const key of GL_BRAND_COLOR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(colorsSource, key)) continue;
    const normalized = safeColor(colorsSource[key]);
    if (normalized) colors[key] = normalized;
  }
  return { colors };
}

export function mergeBrandColors(baseColors, chapterTheme) {
  const base = baseColors && typeof baseColors === 'object' ? baseColors : DEFAULT_GL_BRAND_COLORS;
  const overrides = normalizeChapterTheme(chapterTheme);
  return { ...DEFAULT_GL_BRAND_COLORS, ...base, ...overrides.colors };
}

export function mergeBrandWithChapterTheme(baseBrand, chapterTheme) {
  const brand = baseBrand && typeof baseBrand === 'object' ? baseBrand : {};
  const baseColors = brand.colors && typeof brand.colors === 'object' ? brand.colors : DEFAULT_GL_BRAND_COLORS;
  return {
    ...brand,
    colors: mergeBrandColors(baseColors, chapterTheme),
  };
}

export function brandToCssVars(brand) {
  const colors = brand?.colors && typeof brand.colors === 'object'
    ? brand.colors
    : DEFAULT_GL_BRAND_COLORS;
  return {
    '--gl-color-primary': colors.primary,
    '--gl-color-secondary': colors.secondary,
    '--gl-color-tertiary': colors.tertiary,
    '--gl-color-text': colors.text,
    '--gl-color-link': colors.link,
    '--gl-color-link-hover': colors.linkHover,
    '--gl-color-topbar': colors.topbar,
    '--gl-color-background': colors.background,
  };
}
