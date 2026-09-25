'use strict';

/**
 * Niveaux pédagogiques d'affichage biodiversité (Collège / Lycée / Université).
 * Résolution pure — aucune I/O. Miroir ESM : src/utils/biodivPedagoLevel.js
 */

const {
  visibleCurriculumNiveaux,
  etapeForCurriculumNiveau,
  normalizeCurriculumNiveauValue,
  sortCurriculumNiveaux,
} = require('./pedagoScales');

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

/**
 * Types d'interaction « scolaires » (niveau Collège).
 *
 * `detritivorie` en fait partie depuis la migration 295 : les vers, cloportes ou
 * collemboles portent la pastille « Détritivore » à tous les niveaux, et leur réseau
 * doit montrer ce qu'ils mangent. Ces liens étaient d'ailleurs des `decomposition`,
 * visibles au collège, avant que la migration 255 ne les retype.
 */
const COLLEGE_FOODWEB_TYPES = Object.freeze([
  'pollinisation',
  'herbivorie',
  'predation',
  'plante_hote',
  'decomposition',
  'detritivorie',
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

/**
 * Niveaux programme visibles en filtre, ou `null` pour tous. Règle portée par
 * `visibleCurriculumNiveaux` (lib/pedagoScales.js) : l'étape donne le plafond (collège =
 * cycles 3 et 4), le niveau du programme des classes de l'élève (`classNiveaux`) le resserre.
 */
function curriculumNiveauxForPedagoLevel(level, classNiveaux = []) {
  const lv = normalizePedagoLevel(level) || DEFAULT_SITE_LEVEL;
  return visibleCurriculumNiveaux({ level: lv, classNiveaux });
}

/**
 * Profil pédagogique d'un groupe, héritage compris : on remonte la chaîne des parents
 * jusqu'au premier groupe qui dit quelque chose (NULL = hériter). À chaque étage, un
 * affichage réglé explicitement (`pedago_level`) l'emporte sur l'étape qui découle du niveau
 * du programme (`curriculum_niveau` : cycles 3 et 4 → Collège, seconde et au-delà → Lycée).
 *
 * Pur : `groupsById` est une `Map` id → { parent_group_id, pedago_level, curriculum_niveau }.
 * Une parenté circulaire (refusée à l'écriture, mais on ne boucle jamais) s'arrête net.
 *
 * @returns {{ level: string|null, curriculumNiveau: string|null }}
 */
function resolveGroupPedagoProfile(groupId, groupsById) {
  let level = null;
  let curriculumNiveau = null;
  const visited = new Set();
  let cursor = groupId != null ? String(groupId) : '';
  while (cursor && !visited.has(cursor) && groupsById.has(cursor)) {
    visited.add(cursor);
    const row = groupsById.get(cursor);
    const ownNiveau = normalizeCurriculumNiveauValue(row.curriculum_niveau);
    if (!curriculumNiveau && ownNiveau) curriculumNiveau = ownNiveau;
    if (!level)
      level = normalizePedagoLevel(row.pedago_level) || etapeForCurriculumNiveau(ownNiveau);
    if (level && curriculumNiveau) break;
    cursor = row.parent_group_id != null ? String(row.parent_group_id) : '';
  }
  return { level, curriculumNiveau };
}

/**
 * Profil pédagogique des groupes dont l'utilisateur est membre actif : étapes d'affichage
 * (`levels`, entrée du socle de `resolveBiodivPedagoLevel`) et niveaux du programme de ses
 * classes (`curriculumNiveaux`, qui resserrent les notions proposées). Les groupes qui
 * n'expriment rien, même par leurs parents, sont ignorés. Tolère une base sans colonnes.
 */
async function loadUserGroupPedagoProfile(userId) {
  const empty = { levels: [], curriculumNiveaux: [] };
  const id = userId != null ? String(userId).trim() : '';
  if (!id) return empty;
  const { queryAll } = require('../database');
  let memberships;
  let groups;
  try {
    memberships = await queryAll(
      `SELECT g.id
         FROM group_members gm
         INNER JOIN \`groups\` g ON g.id = gm.group_id
        WHERE gm.user_id = ?
          AND g.is_active = 1`,
      [id],
    );
    if (memberships.length === 0) return empty;
    // Table courte (quelques dizaines de groupes) : la charger entière coûte moins qu'une
    // remontée de parents requête par requête.
    groups = await queryAll(
      'SELECT id, parent_group_id, pedago_level, curriculum_niveau FROM `groups`',
    );
  } catch (e) {
    if (e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR')) return empty;
    throw e;
  }
  const groupsById = new Map(groups.map((row) => [String(row.id), row]));
  const levels = [];
  const curriculumNiveaux = new Set();
  for (const membership of memberships) {
    const profile = resolveGroupPedagoProfile(membership.id, groupsById);
    if (profile.level) levels.push(profile.level);
    if (profile.curriculumNiveau) curriculumNiveaux.add(profile.curriculumNiveau);
  }
  return { levels, curriculumNiveaux: sortCurriculumNiveaux([...curriculumNiveaux]) };
}

/** Étapes d'affichage des groupes de l'utilisateur (forme historique de l'API). */
async function loadUserGroupPedagoLevels(userId) {
  const profile = await loadUserGroupPedagoProfile(userId);
  return profile.levels;
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
  resolveGroupPedagoProfile,
  loadUserGroupPedagoProfile,
  loadUserGroupPedagoLevels,
};
