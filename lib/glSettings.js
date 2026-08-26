const { queryAll, execute } = require('../database');
const gatingCore = require('./shared/gatingSettingsCore');
const { normalizeMarkerBackgrounds } = require('./glMarkerBackgrounds');
const {
  DEFAULT_FEUILLET_PREVIEW_FIELDS,
  normalizeFeuilletPreviewFields,
} = require('./glLoreFeuilletPreview');
const {
  DEFAULT_ACQUISITION_CHANNELS,
  normalizeAcquisitionChannels,
} = require('./glFeuilletAcquisitionChannels');

const GAMEPLAY_KEYS = [
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
];

const MARKER_QUESTION_RETRIGGER_VALUES = new Set([
  'every_arrival',
  'once_per_team',
  'once_per_game',
]);
const LORE_SPOILER_LEVELS = new Set(['cle', 'recit', 'secret']);
const SPELL_CAST_CONTRIBUTION_MODES = new Set(['coordinator', 'self_only', 'both']);
const SPELL_CAST_TEAM_SCOPES = new Set(['any_team', 'own_team', 'mj_any']);
const SPELL_CAST_APPROVAL_MODES = new Set(['auto', 'mj_required', 'per_spell']);
const MASCOT_MOVE_ACTORS = new Set(['players', 'mj']);

const MODULE_KEYS = [
  'modules.mascot_packs_enabled',
  'modules.context_comments_enabled',
  'modules.forum_enabled',
  'modules.notifications_enabled',
  'modules.tutorials_enabled',
  'modules.help_enabled',
  'modules.journal_enabled',
  'modules.zone_music_enabled',
  'modules.market_enabled',
  'modules.spell_cast_enabled',
  'modules.virtual_dice_enabled',
  'modules.player_journal_enabled',
  'modules.lore_carnet_enabled',
  'modules.lore_glossary_enabled',
  'modules.intro_enabled',
];

const DEFAULT_GAMEPLAY = {
  turnsEnabled: false,
  narrationEnabled: false,
  playerActionsEnabled: false,
  scoringEnabled: false,
  markerQuestionRetrigger: 'every_arrival',
  zoneContentRetrigger: 'once_per_game',
  vitalityEnabled: false,
  defaultHealthPoints: 3,
  defaultPowerPoints: 3,
  // Plafonds de jeu — 0 = illimité (comportement historique). Tant qu'ils valent 0, les
  // cœurs s'accumulent sans redescendre et les sortilèges de vie n'ont pas de prise ;
  // les fixer (5 est la valeur discutée) rend le capital de nouveau tendu. Le plafond
  // bloque les gains mais ne confisque jamais un solde déjà supérieur (cf. glVitality).
  maxHealthPoints: 0,
  maxPowerPoints: 0,
  // G12 — défauts prudents pour une classe : un joueur ne renseigne que SA part et ne
  // vise que SON équipe. Dépenser la vitalité d'autrui reste possible, mais c'est un
  // choix explicite de l'admin (modes `coordinator` / `both`) — jamais l'état sorti d'usine.
  spellCastContributionMode: 'self_only',
  spellCastTeamScope: 'own_team',
  spellCastMjOnly: false,
  spellCastApprovalMode: 'per_spell',
  mascotMoveActor: 'mj',
  qcmMjOnly: false,
  // 0 = illimité (pas de plafond explicite). Le carnet personnel n'impose aucune
  // limite par défaut ; un MJ/admin peut éventuellement en définir une via les réglages.
  playerJournalMaxChars: 0,
  playerJournalMaxAssets: 0,
  loreFeuilletRetrigger: 'once_per_team',
  loreFeuilletPreviewFields: [...DEFAULT_FEUILLET_PREVIEW_FIELDS],
  // Acquisition ③ active par défaut (canaux : tous) ; reste pilotable par partie
  // via le toggle Réglages GL → Carnet de Sélène.
  loreFeuilletAcquisitionEnabled: true,
  loreFeuilletAcquisitionChannels: [...DEFAULT_ACQUISITION_CHANNELS],
  loreEffacementEnabled: true,
  loreGemmeCostsEnabled: true,
  loreHeartRewardsEnabled: true,
  loreSpoilerMaxLevel: 'recit',
  plateauMarkersVisible: true,
  plateauZonesVisible: false,
  plateauMarkerNumbersVisible: false,
  markerBackgrounds: normalizeMarkerBackgrounds(null),
  markerEffectAutoMoveEnabled: false,
  // Marché : les cœurs ne circulent pas par défaut. Dès lors qu'un cœur peut être
  // retiré pour un écart de conduite, le laisser s'échanger permettrait de racheter
  // — ou de se faire offrir — la sanction. Les gemmes, elles, restent échangeables.
  marketHeartsEnabled: false,
  // Marché : les feuillets s'échangent (copie — le donneur garde le sien).
  marketFeuilletsEnabled: true,
};

const DEFAULT_MODULES = {
  mascotPacksEnabled: true,
  contextCommentsEnabled: true,
  forumEnabled: true,
  notificationsEnabled: true,
  tutorialsEnabled: true,
  helpEnabled: true,
  journalEnabled: true,
  zoneMusicEnabled: false,
  marketEnabled: false,
  spellCastEnabled: false,
  virtualDiceEnabled: false,
  playerJournalEnabled: true,
  loreCarnetEnabled: true,
  loreGlossaryEnabled: true,
  introEnabled: true,
};

// Conditionnement « marquer comme lu/appris » par reussite QCM (backbone GL — OFF par defaut).
// Cles et defauts DERIVES du catalogue commun (lib/shared/gatingSettingsCore.js),
// partage avec ForetMap. Ajouter un reglage la-bas l'ajoute ici : c'est ainsi que
// GL herite de la tolerance d'essais, du plafond par session et de l'annonce, nes
// cote ForetMap — et que ForetMap ne peut plus diverger a son tour.
const GATING_KEYS = gatingCore.gatingKeysFor('gl');
const DEFAULT_GATING = Object.freeze(gatingCore.buildGatingSettings({}, 'gl'));

const CACHE_TTL_MS = 30_000;

let gameplayCache = null; // { value: {...}, expiresAt: number }
let modulesCache = null; // { value: {...}, expiresAt: number }
let gatingCache = null; // { value: {...}, expiresAt: number }

function safeJsonParse(raw, fallback) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

function camelKeyFor(settingKey) {
  switch (settingKey) {
    case 'gameplay.turns_enabled':
      return 'turnsEnabled';
    case 'gameplay.narration_enabled':
      return 'narrationEnabled';
    case 'gameplay.player_actions_enabled':
      return 'playerActionsEnabled';
    case 'gameplay.scoring_enabled':
      return 'scoringEnabled';
    case 'gameplay.marker_question_retrigger':
      return 'markerQuestionRetrigger';
    case 'gameplay.zone_content_retrigger':
      return 'zoneContentRetrigger';
    case 'gameplay.vitality_enabled':
      return 'vitalityEnabled';
    case 'gameplay.default_health_points':
      return 'defaultHealthPoints';
    case 'gameplay.default_power_points':
      return 'defaultPowerPoints';
    case 'gameplay.max_health_points':
      return 'maxHealthPoints';
    case 'gameplay.max_power_points':
      return 'maxPowerPoints';
    case 'gameplay.spell_cast_contribution_mode':
      return 'spellCastContributionMode';
    case 'gameplay.spell_cast_team_scope':
      return 'spellCastTeamScope';
    case 'gameplay.spell_cast_mj_only':
      return 'spellCastMjOnly';
    case 'gameplay.spell_cast_approval_mode':
      return 'spellCastApprovalMode';
    case 'gameplay.mascot_move_actor':
      return 'mascotMoveActor';
    case 'gameplay.qcm_mj_only':
      return 'qcmMjOnly';
    case 'gameplay.player_journal_max_chars':
      return 'playerJournalMaxChars';
    case 'gameplay.player_journal_max_assets':
      return 'playerJournalMaxAssets';
    case 'gameplay.lore_feuillet_retrigger':
      return 'loreFeuilletRetrigger';
    case 'gameplay.lore_feuillet_preview_fields':
      return 'loreFeuilletPreviewFields';
    case 'gameplay.lore_feuillet_acquisition_enabled':
      return 'loreFeuilletAcquisitionEnabled';
    case 'gameplay.lore_feuillet_acquisition_channels':
      return 'loreFeuilletAcquisitionChannels';
    case 'gameplay.lore_effacement_enabled':
      return 'loreEffacementEnabled';
    case 'gameplay.lore_gemme_costs_enabled':
      return 'loreGemmeCostsEnabled';
    case 'gameplay.lore_heart_rewards_enabled':
      return 'loreHeartRewardsEnabled';
    case 'gameplay.lore_spoiler_max_level':
      return 'loreSpoilerMaxLevel';
    case 'gameplay.plateau_markers_visible':
      return 'plateauMarkersVisible';
    case 'gameplay.plateau_zones_visible':
      return 'plateauZonesVisible';
    case 'gameplay.plateau_marker_numbers_visible':
      return 'plateauMarkerNumbersVisible';
    case 'gameplay.marker_backgrounds':
      return 'markerBackgrounds';
    case 'gameplay.marker_effect_auto_move_enabled':
      return 'markerEffectAutoMoveEnabled';
    case 'gameplay.market_hearts_enabled':
      return 'marketHeartsEnabled';
    case 'gameplay.market_feuillets_enabled':
      return 'marketFeuilletsEnabled';
    default:
      return null;
  }
}

function moduleCamelKeyFor(settingKey) {
  switch (settingKey) {
    case 'modules.mascot_packs_enabled':
      return 'mascotPacksEnabled';
    case 'modules.context_comments_enabled':
      return 'contextCommentsEnabled';
    case 'modules.forum_enabled':
      return 'forumEnabled';
    case 'modules.notifications_enabled':
      return 'notificationsEnabled';
    case 'modules.tutorials_enabled':
      return 'tutorialsEnabled';
    case 'modules.help_enabled':
      return 'helpEnabled';
    case 'modules.journal_enabled':
      return 'journalEnabled';
    case 'modules.zone_music_enabled':
      return 'zoneMusicEnabled';
    case 'modules.market_enabled':
      return 'marketEnabled';
    case 'modules.spell_cast_enabled':
      return 'spellCastEnabled';
    case 'modules.virtual_dice_enabled':
      return 'virtualDiceEnabled';
    case 'modules.player_journal_enabled':
      return 'playerJournalEnabled';
    case 'modules.lore_carnet_enabled':
      return 'loreCarnetEnabled';
    case 'modules.lore_glossary_enabled':
      return 'loreGlossaryEnabled';
    case 'modules.intro_enabled':
      return 'introEnabled';
    default:
      return null;
  }
}

// Correspondance inverse dérivée de camelKeyFor (G10) : plus de liste manuelle à
// maintenir — toute clé gameplay/module connue est couverte automatiquement.
let settingKeyByCamelCache = null;
function settingKeyForCamel(camel) {
  if (!settingKeyByCamelCache) {
    settingKeyByCamelCache = new Map();
    for (const key of GAMEPLAY_KEYS) {
      const camelKey = camelKeyFor(key);
      if (camelKey) settingKeyByCamelCache.set(camelKey, key);
    }
    for (const key of MODULE_KEYS) {
      const camelKey = moduleCamelKeyFor(key);
      if (camelKey) settingKeyByCamelCache.set(camelKey, key);
    }
  }
  return settingKeyByCamelCache.get(camel) || null;
}

function parseVitalityDefaultSetting(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(99, Math.floor(n)));
}

// 0 = pas de plafond de jeu ; sinon un entier borné par le plafond technique.
function parseVitalityCapSetting(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  if (floored <= 0) return 0;
  return Math.max(1, Math.min(99, floored));
}

function parsePlayerJournalLimitSetting(raw, fallback, { min = 100, max = 200000 } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  // 0 (ou valeur négative) = illimité : aucun plafond explicite n'est appliqué.
  if (floored <= 0) return 0;
  return Math.max(min, Math.min(max, floored));
}

async function loadGameplayFromDb() {
  const rows = await queryAll(
    `SELECT \`key\`, value_json FROM gl_settings WHERE \`key\` IN (${GAMEPLAY_KEYS.map(() => '?').join(', ')})`,
    GAMEPLAY_KEYS,
  );
  const out = { ...DEFAULT_GAMEPLAY };
  for (const row of rows) {
    const camel = camelKeyFor(row.key);
    if (!camel) continue;
    if (row.key === 'gameplay.marker_question_retrigger') {
      const raw = safeJsonParse(row.value_json, 'every_arrival');
      const value = typeof raw === 'string' ? raw : String(raw || '');
      out.markerQuestionRetrigger = MARKER_QUESTION_RETRIGGER_VALUES.has(value)
        ? value
        : DEFAULT_GAMEPLAY.markerQuestionRetrigger;
      continue;
    }
    if (row.key === 'gameplay.zone_content_retrigger') {
      const raw = safeJsonParse(row.value_json, 'once_per_game');
      const value = typeof raw === 'string' ? raw : String(raw || '');
      out.zoneContentRetrigger = MARKER_QUESTION_RETRIGGER_VALUES.has(value)
        ? value
        : DEFAULT_GAMEPLAY.zoneContentRetrigger;
      continue;
    }
    if (row.key === 'gameplay.default_health_points') {
      out.defaultHealthPoints = parseVitalityDefaultSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.defaultHealthPoints),
        DEFAULT_GAMEPLAY.defaultHealthPoints,
      );
      continue;
    }
    if (row.key === 'gameplay.default_power_points') {
      out.defaultPowerPoints = parseVitalityDefaultSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.defaultPowerPoints),
        DEFAULT_GAMEPLAY.defaultPowerPoints,
      );
      continue;
    }
    if (row.key === 'gameplay.max_health_points') {
      out.maxHealthPoints = parseVitalityCapSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.maxHealthPoints),
        DEFAULT_GAMEPLAY.maxHealthPoints,
      );
      continue;
    }
    if (row.key === 'gameplay.max_power_points') {
      out.maxPowerPoints = parseVitalityCapSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.maxPowerPoints),
        DEFAULT_GAMEPLAY.maxPowerPoints,
      );
      continue;
    }
    if (row.key === 'gameplay.spell_cast_contribution_mode') {
      const raw = safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.spellCastContributionMode);
      const mode = typeof raw === 'string' ? raw.trim() : String(raw || '');
      out.spellCastContributionMode = SPELL_CAST_CONTRIBUTION_MODES.has(mode)
        ? mode
        : DEFAULT_GAMEPLAY.spellCastContributionMode;
      continue;
    }
    if (row.key === 'gameplay.spell_cast_team_scope') {
      const raw = safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.spellCastTeamScope);
      const scope = typeof raw === 'string' ? raw.trim() : String(raw || '');
      out.spellCastTeamScope = SPELL_CAST_TEAM_SCOPES.has(scope)
        ? scope
        : DEFAULT_GAMEPLAY.spellCastTeamScope;
      continue;
    }
    if (row.key === 'gameplay.spell_cast_mj_only') {
      const value = safeJsonParse(row.value_json, false);
      out.spellCastMjOnly = value === true;
      continue;
    }
    if (row.key === 'gameplay.spell_cast_approval_mode') {
      const raw = safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.spellCastApprovalMode);
      const mode = typeof raw === 'string' ? raw.trim() : String(raw || '');
      out.spellCastApprovalMode = SPELL_CAST_APPROVAL_MODES.has(mode)
        ? mode
        : DEFAULT_GAMEPLAY.spellCastApprovalMode;
      continue;
    }
    if (row.key === 'gameplay.mascot_move_actor') {
      const raw = safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.mascotMoveActor);
      const actor = typeof raw === 'string' ? raw.trim() : String(raw || '');
      out.mascotMoveActor = MASCOT_MOVE_ACTORS.has(actor)
        ? actor
        : DEFAULT_GAMEPLAY.mascotMoveActor;
      continue;
    }
    if (row.key === 'gameplay.player_journal_max_chars') {
      out.playerJournalMaxChars = parsePlayerJournalLimitSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.playerJournalMaxChars),
        DEFAULT_GAMEPLAY.playerJournalMaxChars,
        { min: 500, max: 200000 },
      );
      continue;
    }
    if (row.key === 'gameplay.player_journal_max_assets') {
      out.playerJournalMaxAssets = parsePlayerJournalLimitSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.playerJournalMaxAssets),
        DEFAULT_GAMEPLAY.playerJournalMaxAssets,
        { min: 1, max: 200 },
      );
      continue;
    }
    if (row.key === 'gameplay.lore_feuillet_retrigger') {
      const raw = safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.loreFeuilletRetrigger);
      const value = typeof raw === 'string' ? raw : String(raw || '');
      out.loreFeuilletRetrigger = MARKER_QUESTION_RETRIGGER_VALUES.has(value)
        ? value
        : DEFAULT_GAMEPLAY.loreFeuilletRetrigger;
      continue;
    }
    if (row.key === 'gameplay.lore_feuillet_preview_fields') {
      out.loreFeuilletPreviewFields = normalizeFeuilletPreviewFields(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.loreFeuilletPreviewFields),
      );
      continue;
    }
    if (row.key === 'gameplay.lore_feuillet_acquisition_channels') {
      out.loreFeuilletAcquisitionChannels = normalizeAcquisitionChannels(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.loreFeuilletAcquisitionChannels),
      );
      continue;
    }
    if (row.key === 'gameplay.lore_spoiler_max_level') {
      const raw = safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.loreSpoilerMaxLevel);
      const level = typeof raw === 'string' ? raw.trim() : String(raw || '');
      out.loreSpoilerMaxLevel = LORE_SPOILER_LEVELS.has(level)
        ? level
        : DEFAULT_GAMEPLAY.loreSpoilerMaxLevel;
      continue;
    }
    if (row.key === 'gameplay.marker_backgrounds') {
      out.markerBackgrounds = normalizeMarkerBackgrounds(safeJsonParse(row.value_json, null));
      continue;
    }
    const value = safeJsonParse(row.value_json, false);
    out[camel] = value === true;
  }
  return out;
}

async function loadModulesFromDb() {
  const rows = await queryAll(
    `SELECT \`key\`, value_json FROM gl_settings WHERE \`key\` IN (${MODULE_KEYS.map(() => '?').join(', ')})`,
    MODULE_KEYS,
  );
  const out = { ...DEFAULT_MODULES };
  for (const row of rows) {
    const camel = moduleCamelKeyFor(row.key);
    if (!camel) continue;
    const value = safeJsonParse(row.value_json, false);
    out[camel] = value === true;
  }
  return out;
}

async function getGameplaySettings({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && gameplayCache && gameplayCache.expiresAt > now) {
    return gameplayCache.value;
  }
  const fresh = await loadGameplayFromDb();
  gameplayCache = { value: fresh, expiresAt: now + CACHE_TTL_MS };
  return fresh;
}

async function getGlModulesSettings({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && modulesCache && modulesCache.expiresAt > now) {
    return modulesCache.value;
  }
  const fresh = await loadModulesFromDb();
  modulesCache = { value: fresh, expiresAt: now + CACHE_TTL_MS };
  return fresh;
}

function invalidateGameplayCache() {
  gameplayCache = null;
}

function invalidateModulesCache() {
  modulesCache = null;
}

/** Test helper : court-circuiter la lecture BDD en injectant un snapshot. */
function setGameplayCacheForTests(value, ttlMs = CACHE_TTL_MS) {
  if (value == null) {
    gameplayCache = null;
    return;
  }
  gameplayCache = { value: { ...DEFAULT_GAMEPLAY, ...value }, expiresAt: Date.now() + ttlMs };
}

function setModulesCacheForTests(value, ttlMs = CACHE_TTL_MS) {
  if (value == null) {
    modulesCache = null;
    return;
  }
  modulesCache = { value: { ...DEFAULT_MODULES, ...value }, expiresAt: Date.now() + ttlMs };
}

async function loadGatingFromDb() {
  const rows = await queryAll(
    `SELECT \`key\`, value_json FROM gl_settings WHERE \`key\` IN (${GATING_KEYS.map(() => '?').join(', ')})`,
    GATING_KEYS,
  );
  const raw = {};
  for (const row of rows) {
    const name = gatingCore.gatingNameForKey('gl', row.key);
    if (!name) continue;
    raw[name] = safeJsonParse(row.value_json, undefined);
  }
  // La normalisation (bornage, enums, booleens tolerants) est celle du coeur commun :
  // une valeur illisible retombe sur le defaut plutot que de casser une lecture.
  return gatingCore.buildGatingSettings(raw, 'gl');
}

async function getGlGatingSettings({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && gatingCache && gatingCache.expiresAt > now) {
    return gatingCache.value;
  }
  const fresh = await loadGatingFromDb();
  gatingCache = { value: fresh, expiresAt: now + CACHE_TTL_MS };
  return fresh;
}

function invalidateGatingCache() {
  gatingCache = null;
}

/** Test helper : injecter un snapshot de reglages gating (court-circuite la BDD). */
function setGatingCacheForTests(value, ttlMs = CACHE_TTL_MS) {
  if (value == null) {
    gatingCache = null;
    return;
  }
  gatingCache = { value: { ...DEFAULT_GATING, ...value }, expiresAt: Date.now() + ttlMs };
}

/**
 * Upsert d'un reglage GL dans gl_settings (valeur serialisee en JSON).
 * N'invalide aucun cache : la responsabilite reste a l'appelant.
 */
async function upsertGlSetting(key, value, userId = null) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [key, JSON.stringify(value), userId],
  );
}

/**
 * Ecrit un reglage de gating GL (valide, persiste dans gl_settings, invalide le cache).
 * @returns {{ ok: true, key: string, value: any } | { ok: false, error: string }}
 */
async function setGlGatingSetting(key, value, updatedBy = null) {
  const name = gatingCore.gatingNameForKey('gl', key);
  if (!name) return { ok: false, error: 'Cle de reglage gating inconnue' };
  // Refus explicite hors bornes plutot que bornage silencieux : borner sans le dire
  // ferait croire au MJ que sa valeur a ete prise en compte.
  const checked = gatingCore.validateGatingSetting(name, value);
  if (!checked.ok) return { ok: false, error: checked.error };
  await upsertGlSetting(key, checked.value, updatedBy == null ? null : String(updatedBy));
  invalidateGatingCache();
  return { ok: true, key, value: checked.value };
}

module.exports = {
  GAMEPLAY_KEYS,
  MODULE_KEYS,
  GATING_KEYS,
  DEFAULT_GATING,
  getGlGatingSettings,
  invalidateGatingCache,
  setGatingCacheForTests,
  setGlGatingSetting,
  upsertGlSetting,
  MARKER_QUESTION_RETRIGGER_VALUES,
  LORE_SPOILER_LEVELS,
  SPELL_CAST_CONTRIBUTION_MODES,
  SPELL_CAST_TEAM_SCOPES,
  SPELL_CAST_APPROVAL_MODES,
  MASCOT_MOVE_ACTORS,
  DEFAULT_GAMEPLAY,
  DEFAULT_MODULES,
  camelKeyFor,
  settingKeyForCamel,
  moduleCamelKeyFor,
  getGameplaySettings,
  getGlModulesSettings,
  invalidateGameplayCache,
  invalidateModulesCache,
  setGameplayCacheForTests,
  setModulesCacheForTests,
};
