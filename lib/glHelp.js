const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { queryOne, execute } = require('../database');

const GL_HELP_SETTINGS_KEY = 'content.help';
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'data', 'gl', 'help.default.json');

const HELP_ENTRY_KEYS = Object.freeze([
  'tab:discovery',
  'tab:maps',
  'tab:biotope',
  'tab:biocenose',
  'tab:glossary',
  'tab:lore-glossary',
  'tab:selene-carnet',
  'tab:history',
  'tab:world',
  'tab:spells',
  'tab:rules',
  'tab:tutorials',
  'tab:forum',
  'tab:market',
  'tab:journal',
  'tab:my-journal',
  'tab:stats',
  'tab:users',
  'tab:contents',
  'tab:settings',
  'tab:mascots',
  'tab:mj',
]);

const helpEntrySchema = z.object({
  title: z.string().max(80),
  body: z.string().max(2000),
});

const glHelpConfigSchema = z.object({
  entries: z.record(z.string(), helpEntrySchema),
});

let defaultConfigCache = null;

function loadDefaultGlHelpConfig() {
  if (!defaultConfigCache) {
    defaultConfigCache = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
  }
  return JSON.parse(JSON.stringify(defaultConfigCache));
}

function normalizeOptionalString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeHelpEntry(raw, fallback = {}) {
  return {
    title: normalizeOptionalString(raw?.title ?? fallback.title) || 'Aide GL',
    body: String(raw?.body ?? fallback.body ?? ''),
  };
}

function normalizeGlHelpConfig(raw) {
  const defaults = loadDefaultGlHelpConfig();
  const input = raw && typeof raw === 'object' ? raw : {};
  const defaultEntries = defaults.entries || {};
  const inputEntries = input.entries && typeof input.entries === 'object' ? input.entries : {};

  const entries = {};
  for (const key of HELP_ENTRY_KEYS) {
    entries[key] = normalizeHelpEntry(inputEntries[key], defaultEntries[key]);
  }

  const normalized = { entries };
  const parsed = glHelpConfigSchema.safeParse(normalized);
  if (!parsed.success) {
    return normalizeGlHelpConfig({});
  }
  return parsed.data;
}

function buildPublicGlHelpPayload(config) {
  return normalizeGlHelpConfig(config);
}

async function getGlHelpConfigFromDb() {
  const row = await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ? LIMIT 1', [
    GL_HELP_SETTINGS_KEY,
  ]);
  if (!row?.value_json) return loadDefaultGlHelpConfig();
  try {
    const parsed = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    return normalizeGlHelpConfig(parsed);
  } catch (_) {
    return loadDefaultGlHelpConfig();
  }
}

async function saveGlHelpConfigToDb(config, updatedBy = null) {
  const normalized = normalizeGlHelpConfig(config);
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [GL_HELP_SETTINGS_KEY, JSON.stringify(normalized), updatedBy],
  );
  return normalized;
}

module.exports = {
  GL_HELP_SETTINGS_KEY,
  HELP_ENTRY_KEYS,
  loadDefaultGlHelpConfig,
  normalizeGlHelpConfig,
  buildPublicGlHelpPayload,
  getGlHelpConfigFromDb,
  saveGlHelpConfigToDb,
  glHelpConfigSchema,
};
