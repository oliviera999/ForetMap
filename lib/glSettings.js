const { queryAll, queryOne } = require('../database');

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
  'gameplay.qcm_mj_only',
  'gameplay.player_journal_max_chars',
  'gameplay.player_journal_max_assets',
  'gameplay.lore_feuillet_retrigger',
  'gameplay.lore_effacement_enabled',
  'gameplay.lore_gemme_costs_enabled',
  'gameplay.lore_heart_rewards_enabled',
  'gameplay.lore_spoiler_max_level',
];

const MARKER_QUESTION_RETRIGGER_VALUES = new Set(['every_arrival', 'once_per_team', 'once_per_game']);
const LORE_SPOILER_LEVELS = new Set(['cle', 'recit', 'secret']);
const SPELL_CAST_CONTRIBUTION_MODES = new Set(['coordinator', 'self_only', 'both']);
const SPELL_CAST_TEAM_SCOPES = new Set(['any_team', 'own_team', 'mj_any']);

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
  qcmMjOnly: false,
  playerJournalMaxChars: 20000,
  playerJournalMaxAssets: 30,
  loreFeuilletRetrigger: 'once_per_team',
  loreEffacementEnabled: true,
  loreGemmeCostsEnabled: true,
  loreHeartRewardsEnabled: true,
  loreSpoilerMaxLevel: 'recit',
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

const CACHE_TTL_MS = 30_000;

let gameplayCache = null; // { value: {...}, expiresAt: number }
let modulesCache = null; // { value: {...}, expiresAt: number }

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
    GAMEPLAY_KEYS
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
        DEFAULT_GAMEPLAY.defaultHealthPoints
      );
      continue;
    }
    if (row.key === 'gameplay.default_power_points') {
      out.defaultPowerPoints = parseVitalityDefaultSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.defaultPowerPoints),
        DEFAULT_GAMEPLAY.defaultPowerPoints
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
    if (row.key === 'gameplay.player_journal_max_chars') {
      out.playerJournalMaxChars = parsePlayerJournalLimitSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.playerJournalMaxChars),
        DEFAULT_GAMEPLAY.playerJournalMaxChars,
        { min: 500, max: 200000 }
      );
      continue;
    }
    if (row.key === 'gameplay.player_journal_max_assets') {
      out.playerJournalMaxAssets = parsePlayerJournalLimitSetting(
        safeJsonParse(row.value_json, DEFAULT_GAMEPLAY.playerJournalMaxAssets),
        DEFAULT_GAMEPLAY.playerJournalMaxAssets,
        { min: 1, max: 200 }
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
    const value = safeJsonParse(row.value_json, false);
    out[camel] = value === true;
  }
  return out;
}

async function loadModulesFromDb() {
  const rows = await queryAll(
    `SELECT \`key\`, value_json FROM gl_settings WHERE \`key\` IN (${MODULE_KEYS.map(() => '?').join(', ')})`,
    MODULE_KEYS
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

module.exports = {
  GAMEPLAY_KEYS,
  MODULE_KEYS,
  MARKER_QUESTION_RETRIGGER_VALUES,
  LORE_SPOILER_LEVELS,
  SPELL_CAST_CONTRIBUTION_MODES,
  SPELL_CAST_TEAM_SCOPES,
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
