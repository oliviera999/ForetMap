'use strict';

/**
 * Logique pure de `routes/gl/admin.js` (O10) : normalisations de chaînes
 * (slug de biome, pseudo, mot de passe, email joueur), parsing booléen permissif,
 * génération de mot de passe, regex et constantes (Sets de clés modules / gameplay
 * autorisées). Déplacement byte-identique depuis la route — aucune I/O directe,
 * aucun accès req/res/DB. `MODULE_KEYS` provient de `glSettings` ;
 * `normalizeOptionalString` de `shared/httpHelpers` (mêmes sources que la route).
 */

const crypto = require('node:crypto');
const { MODULE_KEYS } = require('../glSettings');
const { normalizeOptionalString } = require('../shared/httpHelpers');

function normalizeBiomeSlugFilter(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizePseudo(value) {
  const pseudo = normalizeOptionalString(value);
  return pseudo ? pseudo.toLowerCase() : null;
}

function normalizePassword(value) {
  const password = normalizeOptionalString(value);
  if (!password) return null;
  return password;
}

function parseOptionalBoolean(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return undefined;
}

/**
 * Mot de passe provisoire d'un joueur créé sans mot de passe : 10 caractères tirés d'un
 * alphabet sans ambiguïté (pas de 0/O, 1/l/I) — il est restitué une seule fois au staff pour
 * être distribué à l'élève, qui devra le changer à sa première connexion. Tirage `crypto`
 * (l'ancien `Math.random()` + horodatage était partiellement prédictible).
 */
const GENERATED_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const GENERATED_PASSWORD_LENGTH = 10;

function buildGeneratedPassword() {
  const bytes = crypto.randomBytes(GENERATED_PASSWORD_LENGTH);
  let out = '';
  for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i += 1) {
    out += GENERATED_PASSWORD_ALPHABET[bytes[i] % GENERATED_PASSWORD_ALPHABET.length];
  }
  return out;
}

const PLAYER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePlayerEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

const ALLOWED_MODULE_SETTINGS = new Set(MODULE_KEYS);
const ALLOWED_GAMEPLAY_SETTINGS = new Set([
  'gameplay.turns_enabled',
  'gameplay.narration_enabled',
  'gameplay.player_actions_enabled',
  'gameplay.scoring_enabled',
  'gameplay.marker_question_retrigger',
  'gameplay.zone_content_retrigger',
  'gameplay.vitality_enabled',
  'gameplay.default_health_points',
  'gameplay.default_power_points',
  'gameplay.max_health_points',
  'gameplay.max_power_points',
  'gameplay.spell_cast_contribution_mode',
  'gameplay.spell_cast_team_scope',
  'gameplay.spell_cast_mj_only',
  'gameplay.spell_cast_approval_mode',
  'gameplay.mascot_move_actor',
  'gameplay.qcm_mj_only',
  'gameplay.player_journal_max_chars',
  'gameplay.player_journal_max_assets',
  'gameplay.lore_feuillet_retrigger',
  'gameplay.lore_feuillet_preview_fields',
  'gameplay.lore_feuillet_acquisition_enabled',
  'gameplay.lore_feuillet_acquisition_channels',
  'gameplay.lore_effacement_enabled',
  'gameplay.lore_gemme_costs_enabled',
  'gameplay.lore_heart_rewards_enabled',
  'gameplay.lore_spoiler_max_level',
  'gameplay.plateau_markers_visible',
  'gameplay.plateau_zones_visible',
  'gameplay.plateau_marker_numbers_visible',
  'gameplay.marker_backgrounds',
  'gameplay.marker_effect_auto_move_enabled',
  'gameplay.market_hearts_enabled',
  'gameplay.market_feuillets_enabled',
  'gameplay.team_composition_profile_recipes_enabled',
]);

module.exports = {
  normalizeBiomeSlugFilter,
  normalizePseudo,
  normalizePassword,
  parseOptionalBoolean,
  buildGeneratedPassword,
  PLAYER_EMAIL_RE,
  normalizePlayerEmail,
  ALLOWED_MODULE_SETTINGS,
  ALLOWED_GAMEPLAY_SETTINGS,
};
