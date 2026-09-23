/**
 * Niveaux pédagogiques d'affichage biodiversité — miroir ESM de lib/biodivPedagoLevel.js.
 */

export const PEDAGO_LEVELS = Object.freeze(['college', 'lycee', 'universite']);

export const PEDAGO_LEVEL_LABELS = Object.freeze({
  college: 'Collège',
  lycee: 'Lycée',
  universite: 'Université',
});

const PEDAGO_RANK = Object.freeze({
  college: 0,
  lycee: 1,
  universite: 2,
});

export const DEFAULT_SITE_LEVEL = 'college';

export const COLLEGE_FOODWEB_TYPES = Object.freeze([
  'pollinisation',
  'herbivorie',
  'predation',
  'plante_hote',
  'decomposition',
  'parasitisme',
  'competition',
  'symbiose',
]);

export function normalizePedagoLevel(value) {
  if (value == null || value === '') return null;
  const key = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (key === 'college' || key === 'lycee' || key === 'universite') return key;
  return null;
}

export function pedagoLevelLabel(value) {
  const n = normalizePedagoLevel(value);
  return n ? PEDAGO_LEVEL_LABELS[n] : '';
}

export function minPedagoLevel(levels, fallback = DEFAULT_SITE_LEVEL) {
  let best = null;
  let bestRank = Infinity;
  for (const raw of levels || []) {
    const n = normalizePedagoLevel(raw);
    if (!n) continue;
    const r = PEDAGO_RANK[n];
    if (r < bestRank) {
      bestRank = r;
      best = n;
    }
  }
  return best || normalizePedagoLevel(fallback) || DEFAULT_SITE_LEVEL;
}

export function resolveBiodivPedagoLevel(input = {}) {
  if (input.isGuestVisit) return 'college';

  const preview = normalizePedagoLevel(input.teacherPreview);
  if (preview) return preview;

  const siteDefault = normalizePedagoLevel(input.siteDefault) || DEFAULT_SITE_LEVEL;
  const candidates = [...(input.groupLevels || []), input.mapLevel, siteDefault];
  const base = minPedagoLevel(candidates, siteDefault);

  const pref = normalizePedagoLevel(input.userPreference);
  if (!pref) return base;

  if (input.prefCanRaise) return pref;
  return minPedagoLevel([pref, base], base);
}

export function biodivFeatureVisibility(feature, level) {
  const lv = normalizePedagoLevel(level) || DEFAULT_SITE_LEVEL;
  switch (feature) {
    case 'accepted_name_gbif_latin':
      if (lv === 'college') return 'hide';
      if (lv === 'lycee') return 'collapsed';
      return 'open';
    case 'clade_breadcrumb':
    case 'nested_groups_tab':
    case 'foodweb_advanced':
    case 'pollination_efficacy':
    case 'individuals_tab':
      return lv === 'college' ? 'hide' : 'show';
    case 'biomass_estimates':
      if (lv === 'college') return 'hide';
      if (lv === 'lycee') return 'collapsed';
      return 'open';
    case 'curriculum_notions_lycee_plus':
      return lv === 'college' ? 'hide' : 'show';
    default:
      return 'show';
  }
}

export function canShowBiodivFeature(feature, level) {
  return biodivFeatureVisibility(feature, level) !== 'hide';
}

export function foodWebTypesForPedagoLevel(level, allTypes) {
  const lv = normalizePedagoLevel(level) || DEFAULT_SITE_LEVEL;
  const list = Array.isArray(allTypes) ? allTypes : [];
  if (lv !== 'college') return list;
  const allowed = new Set(COLLEGE_FOODWEB_TYPES);
  return list.filter((t) => allowed.has(String(t || '').trim()));
}

export function curriculumNiveauxForPedagoLevel(level) {
  const lv = normalizePedagoLevel(level) || DEFAULT_SITE_LEVEL;
  if (lv === 'college') return ['cycle3', 'cycle4'];
  return null;
}
