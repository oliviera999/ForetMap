const { queryAll, execute } = require('../database');
const { normalizeMarkerBackgrounds } = require('./glMarkerBackgrounds');
const { GATING_MODES, GATING_GRANULARITIES } = require('./shared/resourceQuestionGatingCore');

const GAMEPLAY_KEYS = [
  'gameplay.turns_enabled',
  'gameplay.narration_enabled',
  'gameplay.player_actions_enabled',
  'gameplay.scoring_enabled',
  'gameplay.marker_question_retrigger',
  'gameplay.zone_content_retrigger',
  'gameplay.zone_content_retrigger',
  'gameplay.vitality_enabled',
  'gameplay.default_health_points',
  'gameplay.default_power_points',
  'gameplay.spell_cast_contribution_mode',
  'gameplay.spell_cast_team_scope',
  'gameplay.spell_cast_mj_only',
  'gameplay.spell_cast_approval_mode',
  'gameplay.mascot_move_actor',
  'gameplay.qcm_mj_only',
  'gameplay.player_journal_max_chars',
  'gameplay.player_journal_max_assets',
  'gameplay.lore_feuillet_retrigger',
  'gameplay.lore_effacement_enabled',
  'gameplay.lore_gemme_costs_enabled',
  'gameplay.lore_heart_rewards_enabled',
  'gameplay.lore_spoiler_max_level',
  'gameplay.plateau_markers_visible',
  'gameplay.plateau_zones_visible',
  'gameplay.plateau_marker_numbers_visible',
  'gameplay.marker_backgrounds',
  'gameplay.marker_effect_auto_move_enabled',
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
  zoneContentRetrigger: 'once_per_game',
  vitalityEnabled: false,
  defaultHealthPoints: 3,
  defaultPowerPoints: 3,
  spellCastContributionMode: 'both',
  spellCastTeamScope: 'any_team',
  spellCastMjOnly: false,
  spellCastApprovalMode: 'per_spell',
  mascotMoveActor: 'mj',
  qcmMjOnly: false,
  playerJournalMaxChars: 20000,
  playerJournalMaxAssets: 30,
  loreFeuilletRetrigger: 'once_per_team',
  loreEffacementEnabled: true,
  loreGemmeCostsEnabled: true,
  loreHeartRewardsEnabled: true,
  loreSpoilerMaxLevel: 'recit',
  plateauMarkersVisible: true,
  plateauZonesVisible: false,
  plateauMarkerNumbersVisible: false,
  markerBackgrounds: normalizeMarkerBackgrounds(null),
  markerEffectAutoMoveEnabled: false,
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
const GATING_KEYS = [
  'gating.enabled',
  'gating.granularity',
  'gating.auto_mark_on_correct',
  'gating.default_mode',
  'gating.default_required_correct',
];
const GATING_MODE_VALUES = new Set(GATING_MODES.filter((m) => m !== 'inherit'));
const GATING_GRANULARITY_VALUES = new Set(GATING_GRANULARITIES);
const DEFAULT_GATING = {
  enabled: false,
  granularity: 'player',
  autoMarkOnCorrect: true,
  defaultMode: 'any',
  defaultRequiredCorrect: 1,
};

function clampGatingRequired(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

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

function settingKeyForCamel(camel) {
  switch (camel) {
    case 'turnsEnabled':
      return 'gameplay.turns_enabled';
    case 'narrationEnabled':
      return 'gameplay.narration_enabled';
    case 'playerActionsEnabled':
      return 'gameplay.player_actions_enabled';
    case 'scoringEnabled':
      return 'gameplay.scoring_enabled';
    case 'vitalityEnabled':
      return 'gameplay.vitality_enabled';
    case 'defaultHealthPoints':
      return 'gameplay.default_health_points';
    case 'defaultPowerPoints':
      return 'gameplay.default_power_points';
    default:
      return null;
  }
}

function parseVitalityDefaultSetting(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(99, Math.floor(n)));
}

function parsePlayerJournalLimitSetting(raw, fallback, { min = 100, max = 200000 } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
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
  const out = { ...DEFAULT_GATING };
  for (const row of rows) {
    switch (row.key) {
      case 'gating.enabled':
        out.enabled = safeJsonParse(row.value_json, false) === true;
        break;
      case 'gating.auto_mark_on_correct':
        out.autoMarkOnCorrect = safeJsonParse(row.value_json, true) === true;
        break;
      case 'gating.granularity': {
        const raw = safeJsonParse(row.value_json, DEFAULT_GATING.granularity);
        const v = typeof raw === 'string' ? raw.trim() : '';
        out.granularity = GATING_GRANULARITY_VALUES.has(v) ? v : DEFAULT_GATING.granularity;
        break;
      }
      case 'gating.default_mode': {
        const raw = safeJsonParse(row.value_json, DEFAULT_GATING.defaultMode);
        const v = typeof raw === 'string' ? raw.trim() : '';
        out.defaultMode = GATING_MODE_VALUES.has(v) ? v : DEFAULT_GATING.defaultMode;
        break;
      }
      case 'gating.default_required_correct':
        out.defaultRequiredCorrect = clampGatingRequired(
          safeJsonParse(row.value_json, DEFAULT_GATING.defaultRequiredCorrect),
          DEFAULT_GATING.defaultRequiredCorrect,
        );
        break;
      default:
        break;
    }
  }
  return out;
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
 * Ecrit un reglage de gating GL (valide, persiste dans gl_settings, invalide le cache).
 * @returns {{ ok: true, key: string, value: any } | { ok: false, error: string }}
 */
async function setGlGatingSetting(key, value, updatedBy = null) {
  if (!GATING_KEYS.includes(key)) return { ok: false, error: 'Cle de reglage gating inconnue' };
  let normalized;
  if (key === 'gating.enabled' || key === 'gating.auto_mark_on_correct') {
    if (typeof value === 'boolean') normalized = value;
    else if (value === 'true' || value === 1 || value === '1') normalized = true;
    else if (value === 'false' || value === 0 || value === '0') normalized = false;
    else return { ok: false, error: 'Valeur booleenne attendue' };
  } else if (key === 'gating.granularity') {
    const v = String(value || '').trim();
    if (!GATING_GRANULARITY_VALUES.has(v)) return { ok: false, error: 'Granularite invalide' };
    normalized = v;
  } else if (key === 'gating.default_mode') {
    const v = String(value || '').trim();
    if (!GATING_MODE_VALUES.has(v)) return { ok: false, error: 'Mode invalide' };
    normalized = v;
  } else {
    const n = Number(value);
    if (!Number.isFinite(n)) return { ok: false, error: 'Valeur numerique attendue' };
    normalized = clampGatingRequired(n, DEFAULT_GATING.defaultRequiredCorrect);
  }
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [key, JSON.stringify(normalized), updatedBy == null ? null : String(updatedBy)],
  );
  invalidateGatingCache();
  return { ok: true, key, value: normalized };
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
