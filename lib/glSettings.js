const { queryAll, queryOne } = require('../database');

const GAMEPLAY_KEYS = [
  'gameplay.turns_enabled',
  'gameplay.narration_enabled',
  'gameplay.player_actions_enabled',
  'gameplay.scoring_enabled',
];

const DEFAULT_GAMEPLAY = {
  turnsEnabled: false,
  narrationEnabled: false,
  playerActionsEnabled: false,
  scoringEnabled: false,
};

const CACHE_TTL_MS = 30_000;

let cache = null; // { value: {...}, expiresAt: number }

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
    default:
      return null;
  }
}

async function loadGameplayFromDb() {
  const rows = await queryAll(
    "SELECT `key`, value_json FROM gl_settings WHERE `key` IN (?, ?, ?, ?)",
    GAMEPLAY_KEYS
  );
  const out = { ...DEFAULT_GAMEPLAY };
  for (const row of rows) {
    const camel = camelKeyFor(row.key);
    if (!camel) continue;
    const value = safeJsonParse(row.value_json, false);
    out[camel] = value === true;
  }
  return out;
}

async function getGameplaySettings({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache && cache.expiresAt > now) {
    return cache.value;
  }
  const fresh = await loadGameplayFromDb();
  cache = { value: fresh, expiresAt: now + CACHE_TTL_MS };
  return fresh;
}

function invalidateGameplayCache() {
  cache = null;
}

/** Test helper : court-circuiter la lecture BDD en injectant un snapshot. */
function setGameplayCacheForTests(value, ttlMs = CACHE_TTL_MS) {
  if (value == null) {
    cache = null;
    return;
  }
  cache = { value: { ...DEFAULT_GAMEPLAY, ...value }, expiresAt: Date.now() + ttlMs };
}

module.exports = {
  GAMEPLAY_KEYS,
  DEFAULT_GAMEPLAY,
  camelKeyFor,
  settingKeyForCamel,
  getGameplaySettings,
  invalidateGameplayCache,
  setGameplayCacheForTests,
};
