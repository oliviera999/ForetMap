/**
 * Thème de marque — noyau pur partagé (lot 7 du plan de convergence,
 * `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §3.2 et §6).
 *
 * Extrait de `useGLBrandTheme` (Gnomes & Licornes), le seul produit qui savait se rhabiller :
 * huit couleurs validées, deux polices, un logo et un favicon. ForetMap n'avait aucun réglage
 * de couleur, et le Plan Lyautey doit porter l'identité de l'établissement.
 *
 * Ce module ne contient que du calcul : validation, valeurs par défaut, variables CSS. Les
 * effets de bord (injection des polices Google, favicon) vivent dans `useBrandTheme.js`.
 *
 * **Sécurité** : `logoUrl` et `faviconUrl` ne sont acceptés que sous `/uploads/` ou `/maps/`.
 * Un réglage d'apparence ne doit pas devenir un moyen d'appeler un domaine tiers depuis
 * toutes les pages du produit (exfiltration par URL d'image).
 */

/** Couleurs attendues, dans l'ordre où un éditeur les présente. */
export const BRAND_COLOR_KEYS = Object.freeze([
  'primary',
  'secondary',
  'tertiary',
  'text',
  'link',
  'linkHover',
  'topbar',
  'background',
]);

/** Préfixes d'URL autorisés pour un logo ou un favicon (voir la note de sécurité). */
export const BRAND_ASSET_PREFIXES = Object.freeze(['/uploads/', '/maps/']);

/** Nombre maximal de familles de polices Google chargées (une page n'en lit pas six). */
export const BRAND_MAX_GOOGLE_FAMILIES = 6;

/** Repli neutre quand un produit ne fournit pas ses propres valeurs. */
export const NEUTRAL_BRAND_DEFAULTS = Object.freeze({
  colors: Object.freeze({
    primary: '#1a4731',
    secondary: '#f0f4f0',
    tertiary: '#bdbfb4',
    text: '#1f2a22',
    link: '#2d6a4f',
    linkHover: '#1a4731',
    topbar: '#1a4731',
    background: '#f0f4f0',
  }),
  fonts: Object.freeze({ body: '', heading: '', googleFamilies: Object.freeze([]) }),
  logoUrl: '',
  faviconUrl: '',
});

/** URL d'illustration acceptée, ou chaîne vide (jamais un domaine tiers). */
export function normalizeBrandAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return BRAND_ASSET_PREFIXES.some((prefix) => raw.startsWith(prefix)) ? raw : '';
}

/** Couleur hexadécimale à six chiffres, ou le repli fourni. */
export function safeBrandColor(value, fallback) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function safeFontName(value, fallback) {
  const raw = String(value || '').trim();
  return raw || fallback;
}

/**
 * Normalise un thème brut (réglage `ui.<produit>.brand`) : couleurs validées, polices,
 * logo et favicon filtrés. Les champs absents retombent sur `defaults`.
 *
 * @param {object|null} rawBrand
 * @param {object} [defaults] valeurs par défaut du produit.
 * @returns {{ colors: object, fonts: object, logoUrl: string, faviconUrl: string }}
 */
export function normalizeBrandCore(rawBrand, defaults = NEUTRAL_BRAND_DEFAULTS) {
  const source = rawBrand && typeof rawBrand === 'object' ? rawBrand : {};
  const base = defaults && typeof defaults === 'object' ? defaults : NEUTRAL_BRAND_DEFAULTS;
  const sourceColors = source.colors && typeof source.colors === 'object' ? source.colors : {};
  const sourceFonts = source.fonts && typeof source.fonts === 'object' ? source.fonts : {};
  const googleFamilies = Array.isArray(sourceFonts.googleFamilies)
    ? sourceFonts.googleFamilies
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, BRAND_MAX_GOOGLE_FAMILIES)
    : [...(base.fonts?.googleFamilies || [])];
  const colors = {};
  for (const key of BRAND_COLOR_KEYS) {
    colors[key] = safeBrandColor(sourceColors[key], base.colors?.[key] ?? '');
  }
  return {
    colors,
    fonts: {
      body: safeFontName(sourceFonts.body, base.fonts?.body ?? ''),
      heading: safeFontName(sourceFonts.heading, base.fonts?.heading ?? ''),
      googleFamilies:
        googleFamilies.length > 0 ? googleFamilies : [...(base.fonts?.googleFamilies || [])],
    },
    logoUrl: normalizeBrandAssetUrl(source.logoUrl),
    faviconUrl: normalizeBrandAssetUrl(source.faviconUrl),
  };
}

/** Nom de police → pile CSS citée (une pile déjà composée est laissée telle quelle). */
export function toCssFontFamily(value, fallbackStack = 'serif') {
  const raw = String(value || '').trim();
  if (!raw) return fallbackStack;
  if (raw.includes(',')) return raw;
  return `"${raw}", ${fallbackStack}`;
}

/**
 * Variables CSS d'un thème, préfixées par produit (`--gl-color-primary`,
 * `--fm-color-primary`, `--plan-color-primary`…). Le préfixe permet à chaque produit de
 * garder ses noms de tokens historiques sans renommer ses feuilles.
 *
 * @param {object} brand thème normalisé.
 * @param {object} [options]
 * @param {string} [options.prefix='fm'] préfixe des variables.
 * @param {string} [options.fontFallback='serif'] pile de repli des polices.
 * @returns {Record<string, string>}
 */
export function brandCssVariables(brand, { prefix = 'fm', fontFallback = 'serif' } = {}) {
  const colors = brand?.colors || {};
  const style = {};
  for (const key of BRAND_COLOR_KEYS) {
    if (!colors[key]) continue;
    const cssKey = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    style[`--${prefix}-color-${cssKey}`] = colors[key];
  }
  if (brand?.fonts?.body) {
    style[`--${prefix}-font-body`] = toCssFontFamily(brand.fonts.body, fontFallback);
  }
  if (brand?.fonts?.heading) {
    style[`--${prefix}-font-heading`] = toCssFontFamily(brand.fonts.heading, fontFallback);
  }
  return style;
}

/**
 * URL de feuille Google Fonts pour une liste de familles, ou chaîne vide.
 * @param {string[]} families
 */
export function googleFontsHref(families) {
  const unique = [
    ...new Set((families || []).map((item) => String(item || '').trim()).filter(Boolean)),
  ].slice(0, BRAND_MAX_GOOGLE_FAMILIES);
  if (unique.length === 0) return '';
  const encoded = unique.map((item) => item.replace(/\s+/g, '+')).join('&family=');
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`;
}
