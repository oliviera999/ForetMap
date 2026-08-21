const path = require('path');
const { z } = require('zod');
const { queryOne, execute } = require('../database');
const {
  buildStoredOverride,
  createDefaultsLoader,
  resolveStoredConfig,
} = require('./shared/jsonDefaultsStore');

const GL_HELP_SETTINGS_KEY = 'content.help';
const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'data', 'gl', 'help.default.json');

const HELP_ENTRY_KEYS = Object.freeze([
  'tab:discovery',
  'tab:maps',
  'tab:nature',
  'tab:adventure',
  'tab:monde-gl',
  'tab:joueurs',
  'tab:ecosystemes',
  'tab:biodiversite',
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

const loadDefaultGlHelpConfig = createDefaultsLoader(DEFAULT_CONFIG_PATH);

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

  const legacyHelpAliases = {
    'tab:ecosystemes': 'tab:biotope',
    'tab:biodiversite': 'tab:biocenose',
  };

  const entries = {};
  for (const key of HELP_ENTRY_KEYS) {
    const legacyKey = legacyHelpAliases[key];
    entries[key] = normalizeHelpEntry(
      inputEntries[key] ?? (legacyKey ? inputEntries[legacyKey] : undefined),
      defaultEntries[key] ?? (legacyKey ? defaultEntries[legacyKey] : undefined),
    );
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
  return resolveStoredConfig(row?.value_json, {
    loadDefaults: loadDefaultGlHelpConfig,
    normalize: normalizeGlHelpConfig,
  });
}

function loadNormalizedGlHelpDefaults() {
  return normalizeGlHelpConfig(loadDefaultGlHelpConfig());
}

/**
 * Surcharge à persister pour une configuration donnée : uniquement ce qui s'écarte des
 * défauts versionnés.
 *
 * Exposé pour le script de compactage (`scripts/compact-gl-help-registry.js`) et pour les
 * tests — la règle de réduction, elle, vit dans le noyau partagé.
 */
function buildGlHelpOverride(config) {
  return buildStoredOverride(normalizeGlHelpConfig(config), loadNormalizedGlHelpDefaults());
}

/**
 * Enregistre les bulles d'aide GL en ne stockant **que la surcharge**.
 *
 * Dégel de la dette symétrique signalée au §11.2 de `docs/MASCOT_NARRATEUR_OLU.md` : ce
 * module persistait l'objet **dense** (les 26 entrées, y compris celles que personne n'avait
 * touchées). La première sauvegarde d'un MJ gelait donc tout le corpus, et améliorer un texte
 * dans `data/gl/help.default.json` n'avait plus le moindre effet à l'écran — ce qui aurait
 * rendu la réécriture du lot 6b invisible en production.
 *
 * L'API ne change pas : la valeur retournée (donc la réponse des routes) reste la
 * configuration dense normalisée. Seule la représentation en base change, et avec elle la
 * propriété qui manquait : une amélioration des défauts reste visible partout où un MJ n'a
 * rien réécrit. La lecture, elle, retombait déjà sur les défauts pour toute valeur absente.
 */
async function saveGlHelpConfigToDb(config, updatedBy = null) {
  const normalized = normalizeGlHelpConfig(config);
  const override = buildGlHelpOverride(normalized);
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [GL_HELP_SETTINGS_KEY, JSON.stringify(override), updatedBy],
  );
  return normalized;
}

module.exports = {
  GL_HELP_SETTINGS_KEY,
  HELP_ENTRY_KEYS,
  loadDefaultGlHelpConfig,
  loadNormalizedGlHelpDefaults,
  buildGlHelpOverride,
  normalizeGlHelpConfig,
  buildPublicGlHelpPayload,
  getGlHelpConfigFromDb,
  saveGlHelpConfigToDb,
  glHelpConfigSchema,
};
