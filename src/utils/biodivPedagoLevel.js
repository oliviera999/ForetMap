/**
 * Niveaux pédagogiques d'affichage biodiversité — miroir ESM de lib/biodivPedagoLevel.js.
 */

import { visibleCurriculumNiveaux } from './pedagoScales.js';
import { PEDAGO_ETAPE_ENUM } from '../shared/enums/pedagoEnums.js';
import { COLLEGE_INTERACTION_TYPE_ENUM } from '../shared/enums/biodivEnums.js';
import {
  visibilityFor,
  canShowFor,
  palierRuleFor,
  visibilityProfileFor,
} from '../shared/pedagoVisibilityCore.js';

/** Étapes d'affichage et libellés : référentiel partagé (`src/shared/enums/pedagoEnums.js`). */
export const PEDAGO_LEVELS = PEDAGO_ETAPE_ENUM.values;

export const PEDAGO_LEVEL_LABELS = PEDAGO_ETAPE_ENUM.labels;

/** Rang d'une étape : sa position dans l'ENUM (`college` = 0 … `universite` = 2). */
const PEDAGO_RANK = Object.freeze(
  Object.fromEntries(PEDAGO_LEVELS.map((level, index) => [level, index])),
);

export const DEFAULT_SITE_LEVEL = 'college';

/** Miroir de lib/biodivPedagoLevel.js — `detritivorie` ajouté avec la migration 295. */
export const COLLEGE_FOODWEB_TYPES = COLLEGE_INTERACTION_TYPE_ENUM.values;

export function normalizePedagoLevel(value) {
  if (value == null || value === '') return null;
  const key = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return PEDAGO_LEVELS.includes(key) ? key : null;
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

/**
 * Le défaut établissement n'est le socle que si ni la carte ni les groupes ne
 * fixent de niveau. Sinon le plus simple des niveaux explicites l'emporte.
 */
export function resolveBiodivPedagoLevel(input = {}) {
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
 * Visibilité d'une brique UI. Accepte une étape (`'college'`…) ou l'objet `learner` complet.
 * Valeurs : table unique `src/shared/pedagoVisibilityCore.js` (plus de `switch` ici).
 */
export function biodivFeatureVisibility(feature, levelOrLearner) {
  return visibilityFor(feature, levelOrLearner);
}

export function canShowBiodivFeature(feature, levelOrLearner) {
  return canShowFor(feature, levelOrLearner);
}

/**
 * Types d'interaction montrés dans le réseau trophique. Accepte une étape (`'college'`…) ou
 * l'objet `learner` complet. Au collège : types « scolaires » (`COLLEGE_FOODWEB_TYPES`), moins
 * ceux que la règle de palier `foodweb_types_cycle4_only` réserve au cycle 4 (symbiose,
 * compétition masquées en cycle 3, et pour un collégien sans classe connue). Au-delà : tout.
 */
export function foodWebTypesForPedagoLevel(levelOrLearner, allTypes) {
  const list = Array.isArray(allTypes) ? allTypes : [];
  if (visibilityProfileFor(levelOrLearner) !== 'college') return list;
  const hidden = new Set(palierRuleFor('foodweb_types_cycle4_only', levelOrLearner) || []);
  const allowed = new Set(COLLEGE_FOODWEB_TYPES.filter((type) => !hidden.has(type)));
  return list.filter((t) => allowed.has(String(t || '').trim()));
}

/**
 * Niveaux programme visibles en filtre, ou `null` pour tous. Règle portée par
 * `visibleCurriculumNiveaux` (pedagoScales) : l'étape donne le plafond, le niveau du
 * programme des classes de l'élève (`classNiveaux`) le resserre.
 */
export function curriculumNiveauxForPedagoLevel(level, classNiveaux = []) {
  const lv = normalizePedagoLevel(level) || DEFAULT_SITE_LEVEL;
  return visibleCurriculumNiveaux({ level: lv, classNiveaux });
}
