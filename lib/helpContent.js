const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { queryOne, execute } = require('../database');

const HELP_REGISTRY_KEY = 'content.help.registry';
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'data', 'help.default.json');

const PANEL_IDS = Object.freeze([
  'map',
  'tasks',
  'plants',
  'visit',
  'profiles',
  'groups',
  'groupFilters',
]);

const MAP_CANVAS_HINT_KEYS = Object.freeze([
  'drawZoneMin',
  'drawZoneReady',
  'addMarker',
  'editPoints',
  'pageScroll',
  'gesturesActive',
]);

const REALTIME_KEYS = Object.freeze(['live', 'polling', 'connecting', 'offline', 'noClient']);

const roleTextSchema = z.object({
  text: z.string().max(300).optional(),
  textTeacher: z.string().max(300).optional(),
});

const panelItemSchema = z.object({
  text: z.string().max(500).optional(),
  textTeacher: z.string().max(500).optional(),
});

const panelSchema = z.object({
  title: z.string().max(80),
  items: z.array(panelItemSchema).max(20),
});

const helpConfigSchema = z.object({
  tooltips: z.record(z.string(), roleTextSchema),
  panels: z.record(z.string(), panelSchema),
  quickTips: z.object({
    map: z.string().max(180),
    tasks: z.string().max(180),
    visit: z.string().max(180),
  }),
  chrome: z.object({
    hintPrefix: z.string().max(40),
    panelTitlePrefix: z.string().max(8),
    panelCloseCta: z.string().max(40),
    panelDismissCta: z.string().max(70),
  }),
  mapCanvasHints: z.record(z.enum(MAP_CANVAS_HINT_KEYS), z.string().max(200)),
  realtime: z.record(z.enum(REALTIME_KEYS), z.string().max(300)),
});

let defaultConfigCache = null;

function loadDefaultHelpConfig() {
  if (!defaultConfigCache) {
    defaultConfigCache = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
  }
  return JSON.parse(JSON.stringify(defaultConfigCache));
}

function normalizeOptionalString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeRoleText(raw, fallback = {}) {
  return {
    text: normalizeOptionalString(raw?.text ?? fallback.text),
    textTeacher: normalizeOptionalString(raw?.textTeacher ?? fallback.textTeacher),
  };
}

function normalizePanelItem(raw, fallback = {}) {
  return normalizeRoleText(raw, fallback);
}

function normalizePanel(raw, fallback = {}) {
  const itemsRaw = Array.isArray(raw?.items) ? raw.items : [];
  const fallbackItems = Array.isArray(fallback.items) ? fallback.items : [];
  const maxLen = Math.max(itemsRaw.length, fallbackItems.length);
  const items = [];
  for (let i = 0; i < maxLen; i += 1) {
    const merged = normalizePanelItem(itemsRaw[i] || {}, fallbackItems[i] || {});
    if (merged.text || merged.textTeacher) items.push(merged);
  }
  return {
    title: normalizeOptionalString(raw?.title ?? fallback.title) || 'Aide',
    items: items.length > 0 ? items : [{ text: '' }],
  };
}

function normalizeHelpConfig(raw) {
  const defaults = loadDefaultHelpConfig();
  const input = raw && typeof raw === 'object' ? raw : {};

  const tooltips = {};
  const defaultTooltips = defaults.tooltips || {};
  const inputTooltips = input.tooltips && typeof input.tooltips === 'object' ? input.tooltips : {};
  const tooltipKeys = new Set([...Object.keys(defaultTooltips), ...Object.keys(inputTooltips)]);
  for (const key of tooltipKeys) {
    tooltips[key] = normalizeRoleText(inputTooltips[key], defaultTooltips[key]);
  }

  const panels = {};
  for (const id of PANEL_IDS) {
    panels[id] = normalizePanel(input.panels?.[id], defaults.panels?.[id]);
  }

  const quickTips = {
    map: normalizeOptionalString(input.quickTips?.map ?? defaults.quickTips?.map),
    tasks: normalizeOptionalString(input.quickTips?.tasks ?? defaults.quickTips?.tasks),
    visit: normalizeOptionalString(input.quickTips?.visit ?? defaults.quickTips?.visit),
  };

  const chrome = {
    hintPrefix: normalizeOptionalString(input.chrome?.hintPrefix ?? defaults.chrome?.hintPrefix),
    panelTitlePrefix: normalizeOptionalString(
      input.chrome?.panelTitlePrefix ?? defaults.chrome?.panelTitlePrefix,
    ),
    panelCloseCta: normalizeOptionalString(
      input.chrome?.panelCloseCta ?? defaults.chrome?.panelCloseCta,
    ),
    panelDismissCta: normalizeOptionalString(
      input.chrome?.panelDismissCta ?? defaults.chrome?.panelDismissCta,
    ),
  };

  const mapCanvasHints = {};
  for (const key of MAP_CANVAS_HINT_KEYS) {
    mapCanvasHints[key] = normalizeOptionalString(
      input.mapCanvasHints?.[key] ?? defaults.mapCanvasHints?.[key],
    );
  }

  const realtime = {};
  for (const key of REALTIME_KEYS) {
    realtime[key] = normalizeOptionalString(input.realtime?.[key] ?? defaults.realtime?.[key]);
  }

  const normalized = { tooltips, panels, quickTips, chrome, mapCanvasHints, realtime };
  const parsed = helpConfigSchema.safeParse(normalized);
  if (!parsed.success) {
    return normalizeHelpConfig({});
  }
  return parsed.data;
}

function buildPublicHelpPayload(config) {
  return normalizeHelpConfig(config);
}

async function getHelpConfigFromDb() {
  const row = await queryOne('SELECT value_json FROM app_settings WHERE `key` = ? LIMIT 1', [
    HELP_REGISTRY_KEY,
  ]);
  if (!row?.value_json) return loadDefaultHelpConfig();
  try {
    const parsed = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    return normalizeHelpConfig(parsed);
  } catch (_) {
    return loadDefaultHelpConfig();
  }
}

async function saveHelpConfigToDb(config, actor = {}) {
  const normalized = normalizeHelpConfig(config);
  await execute(
    `INSERT INTO app_settings
      (\`key\`, scope, value_json, updated_by_user_type, updated_by_user_id, updated_at)
     VALUES (?, 'public', ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      value_json = VALUES(value_json),
      updated_by_user_type = VALUES(updated_by_user_type),
      updated_by_user_id = VALUES(updated_by_user_id),
      updated_at = NOW()`,
    [HELP_REGISTRY_KEY, JSON.stringify(normalized), actor.userType || null, actor.userId || null],
  );
  return normalized;
}

module.exports = {
  HELP_REGISTRY_KEY,
  PANEL_IDS,
  MAP_CANVAS_HINT_KEYS,
  REALTIME_KEYS,
  loadDefaultHelpConfig,
  normalizeHelpConfig,
  buildPublicHelpPayload,
  getHelpConfigFromDb,
  saveHelpConfigToDb,
  helpConfigSchema,
};
