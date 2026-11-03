'use strict';

/**
 * Plan e-nov (`enov.*`, surface `enov`, migration 315) — règles pures propres au label :
 * texte e-nov des lieux et réglages de mise en avant. Aucune I/O ici hormis la lecture des
 * réglages (`loadEnovHighlightSettings`).
 *
 * Le plan e-nov est le Plan Lyautey (même écran, même charge `lib/planContent.js`) : ce module
 * ne porte que ce qui le distingue — quels lieux sont « innovants » (catégories de mise en
 * avant), comment ils ressortent (couleur, pastille), et le texte qui ouvre leur fiche.
 */

const { getSettingValue, SETTINGS_REGISTRY } = require('./settings');
const { parseCategoryIdsSetting } = require('./categoryIdsSetting');

/** Préfixe des réglages éditoriaux du plan e-nov (`lib/settings/plan.js`). */
const ENOV_PLAN_SETTINGS_PREFIX = 'ui.enov_plan.';

/** Longueur maximale du texte e-nov d'un lieu (colonne TEXT, mais on borne l'entrée). */
const ENOV_DESCRIPTION_MAX_LENGTH = 4000;

/** Couleur de mise en avant par défaut (jaune du logo e-nov, lisible sur les deux fonds du plan). */
const ENOV_DEFAULT_HIGHLIGHT_COLOR = '#faba38';

/**
 * Couleur du **second niveau** de mise en avant (bleu ciel du logo e-nov, relevé sur le
 * fichier `public/enov/logo-enov.png`) : clair, il garde lisibles les textes sombres posés
 * dessus (puce, pastille, numéros imprimés).
 */
const ENOV_DEFAULT_SECONDARY_COLOR = '#66a4d9';

/**
 * Niveaux de mise en avant d'un lieu du plan e-nov.
 *
 * - `primary` : les espaces que le dossier de labellisation **retient** (comptés dans la
 *   superficie transformée) — catégories `ui.enov_plan.highlight_category_ids` ;
 * - `secondary` : les autres lieux d'innovation, cités ailleurs dans le dossier ou simplement
 *   présents — catégories `ui.enov_plan.secondary_category_ids`. Même style, autre couleur.
 *
 * Un lieu qui porte les deux reste `primary` : le niveau le plus fort l'emporte.
 */
const ENOV_TIER_PRIMARY = 'primary';
const ENOV_TIER_SECONDARY = 'secondary';

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Types d'espace d'un lieu innovant (migration 323), dans l'ordre de la légende imprimée.
 *
 * Le cahier des charges du label (domaine 1, niveau 3) demande d'attester par un plan que
 * plusieurs espaces de **types différents** ont été aménagés : extérieur, pédagogique,
 * administratif, sportif, restauration… Le plan annoté (`/impression`) range ses lieux par
 * ce type. Miroir front : `src/shared/enov/enovSpaceTypes.js` (verrouillé par
 * `tests/enov-space-type.test.js`).
 */
const ENOV_SPACE_TYPES = Object.freeze([
  Object.freeze({ id: 'exterieur', label: 'Espace extérieur' }),
  Object.freeze({ id: 'pedagogique', label: 'Espace pédagogique' }),
  Object.freeze({ id: 'sportif', label: 'Espace sportif' }),
  Object.freeze({ id: 'vie-scolaire', label: 'Vie scolaire et bien-être' }),
  Object.freeze({ id: 'administratif', label: 'Espace administratif' }),
  Object.freeze({ id: 'restauration', label: 'Restauration' }),
  Object.freeze({ id: 'autre', label: 'Autre espace' }),
]);

const ENOV_SPACE_TYPE_IDS = new Set(ENOV_SPACE_TYPES.map((type) => type.id));

/**
 * Texte e-nov saisi → forme stockée : chaîne nettoyée des espaces de bord, bornée, ou `null`
 * si vide (colonne NULL = « pas de texte e-nov »).
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeEnovDescription(raw) {
  if (raw == null) return null;
  const text = String(raw).replace(/\r\n?/g, '\n').trim();
  if (!text) return null;
  return text.slice(0, ENOV_DESCRIPTION_MAX_LENGTH);
}

/**
 * Type d'espace saisi → forme stockée : identifiant connu, ou `null` (vide ou inconnu). Une
 * valeur inconnue n'est pas une erreur : la liste peut évoluer, et un client plus ancien ne
 * doit pas voir son enregistrement refusé pour ce seul champ.
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalizeEnovSpaceType(raw) {
  if (raw == null) return null;
  const id = String(raw).trim().toLowerCase();
  return ENOV_SPACE_TYPE_IDS.has(id) ? id : null;
}

/** Couleur `#rrggbb` valide, sinon la couleur par défaut (`fallback`, jaune du label par défaut). */
function normalizeEnovHighlightColor(value, fallback = ENOV_DEFAULT_HIGHLIGHT_COLOR) {
  const color = String(value ?? '').trim();
  return HEX_COLOR_RE.test(color) ? color.toLowerCase() : fallback;
}

function settingDefault(key) {
  return SETTINGS_REGISTRY[key]?.default ?? '';
}

async function readSetting(suffix) {
  const key = `${ENOV_PLAN_SETTINGS_PREFIX}${suffix}`;
  const value = await getSettingValue(key, settingDefault(key));
  return value == null ? settingDefault(key) : value;
}

/**
 * Réglages de mise en avant du plan e-nov, publics (ils partent dans la charge).
 *
 * Les catégories du second niveau sont débarrassées de celles du premier : une même
 * catégorie ne peut pas valoir les deux niveaux à la fois.
 *
 * @returns {Promise<{ highlight_category_ids: string[], highlight_color: string,
 *   secondary_category_ids: string[], secondary_color: string, primary_label: string,
 *   secondary_label: string, badge_enabled: boolean, innovations_label: string }>}
 */
async function loadEnovHighlightSettings() {
  const [
    categoryIds,
    color,
    secondaryIds,
    secondaryColor,
    primaryLabel,
    secondaryLabel,
    badge,
    label,
  ] = await Promise.all([
    readSetting('highlight_category_ids'),
    readSetting('highlight_color'),
    readSetting('secondary_category_ids'),
    readSetting('secondary_color'),
    readSetting('primary_label'),
    readSetting('secondary_label'),
    readSetting('badge_enabled'),
    readSetting('innovations_label'),
  ]);
  const primaryIds = parseCategoryIdsSetting(categoryIds);
  const primarySet = new Set(primaryIds);
  return {
    highlight_category_ids: primaryIds,
    highlight_color: normalizeEnovHighlightColor(color),
    secondary_category_ids: parseCategoryIdsSetting(secondaryIds).filter(
      (id) => !primarySet.has(id),
    ),
    secondary_color: normalizeEnovHighlightColor(secondaryColor, ENOV_DEFAULT_SECONDARY_COLOR),
    primary_label: String(primaryLabel || '').trim() || 'Espaces retenus',
    secondary_label: String(secondaryLabel || '').trim() || 'Autres lieux d’innovation',
    badge_enabled: badge === true || badge === 1 || badge === '1' || badge === 'true',
    innovations_label: String(label || '').trim() || 'Innovations',
  };
}

/**
 * Le lieu est-il mis en avant (porte-t-il une catégorie de mise en avant) ?
 * @param {string[]} categoryIds catégories du lieu **avant** masquage par réglage : masquer la
 *   puce « e-nov » de la rangée ne doit pas éteindre la mise en avant.
 * @param {Set<string>} highlightIds
 */
function isHighlightedPlace(categoryIds, highlightIds) {
  if (!highlightIds || highlightIds.size === 0) return false;
  return (categoryIds || []).some((id) => highlightIds.has(String(id)));
}

/**
 * Niveau de mise en avant d'un lieu, d'après ses catégories (**avant** masquage par réglage).
 * @param {string[]} categoryIds
 * @param {Set<string>} primaryIds
 * @param {Set<string>} [secondaryIds]
 * @returns {'primary'|'secondary'|''}
 */
function enovPlaceTier(categoryIds, primaryIds, secondaryIds = null) {
  if (isHighlightedPlace(categoryIds, primaryIds)) return ENOV_TIER_PRIMARY;
  if (isHighlightedPlace(categoryIds, secondaryIds)) return ENOV_TIER_SECONDARY;
  return '';
}

module.exports = {
  ENOV_PLAN_SETTINGS_PREFIX,
  ENOV_DEFAULT_SECONDARY_COLOR,
  ENOV_TIER_PRIMARY,
  ENOV_TIER_SECONDARY,
  enovPlaceTier,
  ENOV_DESCRIPTION_MAX_LENGTH,
  ENOV_DEFAULT_HIGHLIGHT_COLOR,
  ENOV_SPACE_TYPES,
  normalizeEnovDescription,
  normalizeEnovSpaceType,
  normalizeEnovHighlightColor,
  loadEnovHighlightSettings,
  isHighlightedPlace,
};
