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

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

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

/** Couleur `#rrggbb` valide, sinon la couleur par défaut. */
function normalizeEnovHighlightColor(value) {
  const color = String(value ?? '').trim();
  return HEX_COLOR_RE.test(color) ? color.toLowerCase() : ENOV_DEFAULT_HIGHLIGHT_COLOR;
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
 * @returns {Promise<{ highlight_category_ids: string[], highlight_color: string,
 *   badge_enabled: boolean, innovations_label: string }>}
 */
async function loadEnovHighlightSettings() {
  const [categoryIds, color, badge, label] = await Promise.all([
    readSetting('highlight_category_ids'),
    readSetting('highlight_color'),
    readSetting('badge_enabled'),
    readSetting('innovations_label'),
  ]);
  return {
    highlight_category_ids: parseCategoryIdsSetting(categoryIds),
    highlight_color: normalizeEnovHighlightColor(color),
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

module.exports = {
  ENOV_PLAN_SETTINGS_PREFIX,
  ENOV_DESCRIPTION_MAX_LENGTH,
  ENOV_DEFAULT_HIGHLIGHT_COLOR,
  normalizeEnovDescription,
  normalizeEnovHighlightColor,
  loadEnovHighlightSettings,
  isHighlightedPlace,
};
