'use strict';

/**
 * Niveaux pédagogiques d'affichage biodiversité (Collège / Lycée / Université).
 * Résolution pure — aucune I/O. Miroir ESM : src/utils/biodivPedagoLevel.js
 */

const PEDAGO_LEVELS = Object.freeze(['college', 'lycee', 'universite']);

const PEDAGO_LEVEL_LABELS = Object.freeze({
  college: 'Collège',
  lycee: 'Lycée',
  universite: 'Université',
});

const PEDAGO_RANK = Object.freeze({
  college: 0,
  lycee: 1,
  universite: 2,
});

const DEFAULT_SITE_LEVEL = 'college';

/** Types d'interaction « scolaires » (niveau Collège). */
const COLLEGE_FOODWEB_TYPES = Object.freeze([
  'pollinisation',
  'herbivorie',
  'predation',
  'plante_hote',
  'decomposition',
  'parasitisme',
  'competition',
  'symbiose',
]);

function normalizePedagoLevel(value) {
  if (value == null || value === '') return null;
  const key = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (key === 'college' || key === 'lycee' || key === 'universite') return key;
  return null;
}

function pedagoLevelLabel(value) {
  const n = normalizePedagoLevel(value);
  return n ? PEDAGO_LEVEL_LABELS[n] : '';
}

function pedagoRank(value) {
  const n = normalizePedagoLevel(value);
  return n == null ? null : PEDAGO_RANK[n];
}

/** Plus simple (restrictif) parmi une liste ; ignore null/invalide. */
function minPedagoLevel(levels, fallback = DEFAULT_SITE_LEVEL) {
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

/**
 * Résout le niveau effectif.
 *
 * Le défaut établissement n'est le socle que si ni la carte ni les groupes ne
 * fixent de niveau. Sinon le plus simple des niveaux explicites l'emporte :
 * un défaut Collège ne doit pas annuler une carte ou un groupe Lycée / Université.
 *
 * @param {{
 *   isGuestVisit?: boolean,
 *   siteDefault?: string|null,
 *   mapLevel?: string|null,
 *   groupLevels?: Array<string|null>,
 *   userPreference?: string|null,
 *   prefCanRaise?: boolean,
 *   teacherPreview?: string|null,
 * }} input
 */
function resolveBiodivPedagoLevel(input = {}) {
  if (input.isGuestVisit) return 'college';

  const preview = normalizePedagoLevel(input.teacherPreview);
  if (preview) return preview;

  const siteDefault = normalizePedagoLevel(input.siteDefault) || DEFAULT_SITE_LEVEL;
  const explicit = [];
  for (const raw of input.groupLevels || []) {
    const n = normalizePedagoLevel(raw);
    if (n) explicit.push(n);
  }
  const mapLevel = normalizePedagoLevel(input.mapLevel);
  if (mapLevel) explicit.push(mapLevel);
  const base = explicit.length > 0 ? minPedagoLevel(explicit, siteDefault) : siteDefault;

  const pref = normalizePedagoLevel(input.userPreference);
  if (!pref) return base;

  if (input.prefCanRaise) return pref;
  return minPedagoLevel([pref, base], base);
}

/**
 * Visibilité d'une brique UI.
 * @returns {'hide'|'show'|'collapsed'|'open'}
 */
function biodivFeatureVisibility(feature, level) {
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

function canShowBiodivFeature(feature, level) {
  const v = biodivFeatureVisibility(feature, level);
  return v !== 'hide';
}

function foodWebTypesForPedagoLevel(level, allTypes) {
  const lv = normalizePedagoLevel(level) || DEFAULT_SITE_LEVEL;
  const list = Array.isArray(allTypes) ? allTypes : [];
  if (lv !== 'college') return list;
  const allowed = new Set(COLLEGE_FOODWEB_TYPES);
  return list.filter((t) => allowed.has(String(t || '').trim()));
}

/** Niveaux programme curriculum visibles en filtre (college = cycle3/cycle4). */
function curriculumNiveauxForPedagoLevel(level) {
  const lv = normalizePedagoLevel(level) || DEFAULT_SITE_LEVEL;
  if (lv === 'college') return ['cycle3', 'cycle4'];
  return null; // tous
}

/**
 * Niveaux pédagogiques des groupes dont l'utilisateur est membre actif.
 * Ignore les groupes sans niveau (NULL = hériter). Tolère l'absence de colonne.
 */
async function loadUserGroupPedagoLevels(userId) {
  const id = userId != null ? String(userId).trim() : '';
  if (!id) return [];
  const { queryAll } = require('../database');
  try {
    const rows = await queryAll(
      `SELECT g.pedago_level
         FROM group_members gm
         INNER JOIN \`groups\` g ON g.id = gm.group_id
        WHERE gm.user_id = ?
          AND g.is_active = 1
          AND g.pedago_level IS NOT NULL`,
      [id],
    );
    return rows.map((r) => normalizePedagoLevel(r.pedago_level)).filter(Boolean);
  } catch (e) {
    if (e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR')) return [];
    throw e;
  }
}

module.exports = {
  PEDAGO_LEVELS,
  PEDAGO_LEVEL_LABELS,
  PEDAGO_RANK,
  DEFAULT_SITE_LEVEL,
  COLLEGE_FOODWEB_TYPES,
  normalizePedagoLevel,
  pedagoLevelLabel,
  pedagoRank,
  minPedagoLevel,
  resolveBiodivPedagoLevel,
  biodivFeatureVisibility,
  canShowBiodivFeature,
  foodWebTypesForPedagoLevel,
  curriculumNiveauxForPedagoLevel,
  loadUserGroupPedagoLevels,
};
