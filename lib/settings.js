const db = require('../database');
const { queryAll, queryOne, execute } = db;
const { castValue, metaOf } = require('./shared/settingsRegistryCore');
const { createSettingsStore, isNoSuchTableError } = require('./shared/settingsStore');
const { SETTINGS_DOMAINS, assembleSettingsRegistry } = require('./settings/domains');

/** Garde-fou de péremption : le cache est surtout invalidé par la version d'écriture (cf. store). */
const SETTINGS_CACHE_TTL_MS = 15000;
/**
 * Identifiant de mascotte de visite : forme seulement.
 *
 * Le serveur ne tient **aucune liste d'ids connus** : les mascottes livrées avec
 * l'application (catalogue statique) et les packs publiés au studio (`srv-…`) sont
 * traités à égalité, et la liste réelle est servie par `GET /api/visit/mascots`
 * (cf. `lib/visitMascotRegistry.js`). Un id devenu obsolète n'est donc jamais
 * réécrit en base : c'est le front qui retombe sur la mascotte par défaut au rendu.
 */
const VISIT_MASCOT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MAP_DEFAULT_KEY_BY_CONTEXT = Object.freeze({
  student: 'ui.map.default_map_student',
  teacher: 'ui.map.default_map_teacher',
  visit: 'ui.map.default_map_visit',
});

/**
 * Registre déclaratif des réglages ForetMap (`app_settings`). Descripteurs au format du
 * noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` : public / teacher / admin),
 * **déclarés par domaine** dans `lib/settings/<domaine>.js` et agrégés ici, dans l'ordre de
 * `lib/settings/domains.js` (qui fixe l'ordre des clés servies).
 */
const SETTINGS_REGISTRY = assembleSettingsRegistry(SETTINGS_DOMAINS);

const scopeRank = { public: 0, teacher: 1, admin: 2 };

/**
 * Magasin `app_settings` : cache plat versionné par écriture (`getDataWriteVersion()`),
 * TTL 15 s en garde-fou, écriture INSERT … ON DUPLICATE KEY UPDATE avec portée et acteur.
 */
const store = createSettingsStore({
  table: 'app_settings',
  registry: SETTINGS_REGISTRY,
  // Certains tests remplacent `database.js` par une base factice sans version d'écriture
  // (`require.cache`) : repli sur le seul TTL plutôt que d'échouer au chargement.
  writeVersion: typeof db.getDataWriteVersion === 'function' ? db.getDataWriteVersion : () => 0,
  queryAll,
  execute,
  ttlMs: SETTINGS_CACHE_TTL_MS,
});

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Descripteur d'une clé (propriété propre uniquement : `constructor` n'est pas un réglage). */
function getMeta(key) {
  return metaOf(SETTINGS_REGISTRY, key);
}

function setNested(target, dottedKey, value) {
  const parts = String(dottedKey || '')
    .split('.')
    .filter(Boolean);
  if (!parts.length) return;
  let ref = target;
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    if (i === parts.length - 1) {
      ref[p] = value;
      return;
    }
    if (!ref[p] || typeof ref[p] !== 'object' || Array.isArray(ref[p])) ref[p] = {};
    ref = ref[p];
  }
}

/** Un identifiant de mascotte est-il de forme valide ? (aucune liste blanche, cf. `VISIT_MASCOT_ID_RE`) */
function isValidVisitMascotId(raw) {
  return VISIT_MASCOT_ID_RE.test(String(raw || '').trim());
}

/**
 * L'ancien invariant « la mascotte par défaut est toujours proposée » vivait ici, parce que le
 * défaut pouvait tomber hors de la liste blanche. Cette liste n'existe plus : une mascotte est
 * proposée si sa ligne est publiée. Le cas subsiste — un administrateur peut retirer de la visite
 * la mascotte qu'il a désignée par défaut — mais il se **voit** désormais, signalé dans le
 * panneau de réglages, au lieu d'être rattrapé en silence.
 */
function normalizeVisitMascotSettingsFlat(flat) {
  const defaultKey = 'ui.visit.mascot.default_id';
  const rawDefault = String(flat[defaultKey] || '').trim();
  flat[defaultKey] = isValidVisitMascotId(rawDefault) ? rawDefault : '';
}

async function parseMascotDialogSettingsModule() {
  try {
    return await import('./visit-pack/visitMascotDialogEvents.js');
  } catch (_) {
    try {
      return await import('../src/utils/visitMascotDialogEvents.js');
    } catch (_) {
      throw new Error('Module validation dialogues mascotte introuvable (sync visit-pack-lib).');
    }
  }
}

async function normalizeMascotDialogSettingValue(key, normalizedString) {
  const mod = await parseMascotDialogSettingsModule();
  if (key === 'content.visit.mascot_dialog.defaults') {
    const parsed = mod.parseDialogProfileJson(normalizedString);
    if (!parsed.ok) throw new Error(parsed.error);
    return mod.stringifyDialogProfile(parsed.profile);
  }
  if (key === 'content.visit.mascot_dialog.catalog_overrides') {
    const parsed = mod.parseCatalogDialogOverridesJson(normalizedString);
    if (!parsed.ok) throw new Error(parsed.error);
    return mod.stringifyCatalogDialogOverrides(parsed.overrides);
  }
  return normalizedString;
}

async function enrichVisitMascotDialogPublic(nested, flat) {
  try {
    const mod = await parseMascotDialogSettingsModule();
    const defaultsRaw = flat['content.visit.mascot_dialog.defaults'] ?? '{}';
    const catalogRaw = flat['content.visit.mascot_dialog.catalog_overrides'] ?? '{}';
    const defaultsParsed = mod.parseDialogProfileJson(defaultsRaw);
    const catalogParsed = mod.parseCatalogDialogOverridesJson(catalogRaw);
    if (!nested.visit) nested.visit = {};
    if (!nested.visit.mascot) nested.visit.mascot = {};
    nested.visit.mascot.dialog = {
      defaults: defaultsParsed.ok ? defaultsParsed.profile : {},
      catalogOverrides: catalogParsed.ok ? catalogParsed.overrides : {},
    };
  } catch (_) {
    if (!nested.visit) nested.visit = {};
    if (!nested.visit.mascot) nested.visit.mascot = {};
    nested.visit.mascot.dialog = { defaults: {}, catalogOverrides: {} };
  }
}

/**
 * Plat complet (défauts + lignes castées, table absente → défauts) : copie mutable.
 * Le cache vit dans le magasin ; la normalisation mascotte s'applique à la copie.
 */
async function loadFlatSettings() {
  const out = await store.loadFlat();
  normalizeVisitMascotSettingsFlat(out);
  return out;
}

function flattenByAudience(flat, audience = 'public') {
  const rank = scopeRank[audience] ?? 0;
  const filtered = {};
  for (const [key, meta] of Object.entries(SETTINGS_REGISTRY)) {
    if ((scopeRank[meta.scope] ?? 99) <= rank) filtered[key] = flat[key];
  }
  return filtered;
}

function nestFlat(flat) {
  const nested = {};
  for (const [key, value] of Object.entries(flat)) setNested(nested, key, value);
  return nested;
}

async function getSettings(audience = 'public') {
  const flat = await loadFlatSettings();
  const scopedFlat = flattenByAudience(flat, audience);
  const nested = nestFlat(scopedFlat);
  await enrichVisitMascotDialogPublic(nested, scopedFlat);
  await enrichHelpRegistryPublic(nested);
  await enrichHelpNarratorPublic(nested);
  await enrichTourRegistryPublic(nested);
  return {
    flat: scopedFlat,
    nested,
  };
}

async function enrichHelpRegistryPublic(nested) {
  try {
    const { getHelpConfigFromDb } = require('./helpContent');
    const registry = await getHelpConfigFromDb();
    if (!nested.content) nested.content = {};
    if (!nested.content.help) nested.content.help = {};
    nested.content.help.registry = registry;
  } catch (_) {
    if (!nested.content) nested.content = {};
    if (!nested.content.help) nested.content.help = {};
    nested.content.help.registry = null;
  }
}

/**
 * Expose les surcharges de visites guidées (`content.tour.registry`).
 *
 * Seule la surcharge circule : le corpus par défaut est dans le bundle client, donc
 * un registre vide ne coûte rien au réseau et l'aide fonctionne à l'identique si la
 * lecture échoue.
 */
async function enrichTourRegistryPublic(nested) {
  if (!nested.content) nested.content = {};
  if (!nested.content.tour) nested.content.tour = {};
  try {
    const { getTourRegistryFromDb } = require('./tourContent');
    nested.content.tour.registry = await getTourRegistryFromDb();
  } catch (_) {
    nested.content.tour.registry = {};
  }
}

async function enrichHelpNarratorPublic(nested) {
  try {
    const { getHelpNarratorFromDb } = require('./helpNarrator');
    const narrator = await getHelpNarratorFromDb();
    if (!nested.content) nested.content = {};
    if (!nested.content.help) nested.content.help = {};
    nested.content.help.narrator = narrator;
  } catch (_) {
    if (!nested.content) nested.content = {};
    if (!nested.content.help) nested.content.help = {};
    nested.content.help.narrator = null;
  }
}

function invalidateSettingsCache() {
  store.invalidate();
}

async function getSettingValue(key, fallback) {
  const flat = await loadFlatSettings();
  if (!Object.prototype.hasOwnProperty.call(flat, key)) return fallback;
  return flat[key];
}

async function isReportsEnabled() {
  return !!(await getSettingValue('ui.modules.reports_enabled', true));
}

async function normalizeSettingValue(key, value) {
  const meta = getMeta(key);
  if (!meta) throw new Error('Clé de réglage inconnue');
  let normalized = castValue(meta, value);
  if (
    key === 'content.visit.mascot_dialog.defaults' ||
    key === 'content.visit.mascot_dialog.catalog_overrides'
  ) {
    normalized = await normalizeMascotDialogSettingValue(key, normalized);
  }
  return normalized;
}

/**
 * Valide une valeur candidate (normalisation + cohérence croisée) SANS persister.
 * Lève une erreur de validation le cas échéant ; retourne la valeur normalisée.
 */
async function validateSettingCandidate(key, value) {
  const normalized = await normalizeSettingValue(key, value);
  const flat = { ...(await loadFlatSettings()), [key]: normalized };
  await validateCrossSettings(flat);
  return normalized;
}

async function setSetting(key, value, actor = {}) {
  const meta = getMeta(key);
  if (!meta) throw new Error('Clé de réglage inconnue');
  const normalized = await normalizeSettingValue(key, value);
  // `validate: false` : la valeur vient d'être castée ET normalisée (dialogues mascotte en
  // asynchrone) — la repasser par `castValue` pourrait rejeter une forme sérialisée plus
  // longue que la saisie. Le magasin écrit puis invalide son cache.
  await store.upsert(key, normalized, {
    validate: false,
    extraColumns: {
      scope: meta.scope,
      updated_by_user_type: actor.userType || null,
      updated_by_user_id: actor.userId || null,
    },
  });
  if (String(key).startsWith('learning.gating.')) {
    // Sévérité ou interrupteur global : le cache des questions réservées au tirage est périmé.
    require('./learningGatingLockMode').invalidateStrictCodesCache();
  }
  return normalized;
}

async function listAdminSettings() {
  const flat = await loadFlatSettings();
  let rows = [];
  try {
    rows = await queryAll(
      'SELECT `key`, scope, updated_by_user_type, updated_by_user_id, updated_at FROM app_settings',
    );
  } catch (e) {
    if (!isNoSuchTableError(e)) throw e;
  }
  const map = new Map(rows.map((row) => [String(row.key), row]));
  return Object.keys(SETTINGS_REGISTRY)
    .filter((key) => !SETTINGS_REGISTRY[key]?.adminHidden)
    .sort()
    .map((key) => {
      const meta = SETTINGS_REGISTRY[key];
      const info = map.get(key) || null;
      return {
        key,
        scope: meta.scope,
        type: meta.type,
        value: flat[key],
        default_value: meta.default,
        constraints: {
          min: meta.min ?? null,
          max: meta.max ?? null,
          maxLength: meta.maxLength ?? null,
          values: meta.values ?? null,
        },
        updated_at: info?.updated_at || null,
        updated_by_user_type: info?.updated_by_user_type || null,
        updated_by_user_id: info?.updated_by_user_id || null,
      };
    });
}

async function ensureMapExists(mapId) {
  if (!mapId) return false;
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

async function mapIsActive(mapId) {
  if (!mapId) return false;
  const row = await queryOne('SELECT id FROM maps WHERE id = ? AND is_active = 1 LIMIT 1', [mapId]);
  return !!row;
}

async function findFirstActiveMapId() {
  const row = await queryOne(
    `SELECT id
     FROM maps
     WHERE is_active = 1
     ORDER BY sort_order IS NULL ASC, sort_order ASC, id ASC
     LIMIT 1`,
  );
  if (row?.id) return String(row.id).trim();
  const fallback = await queryOne(
    `SELECT id
     FROM maps
     ORDER BY sort_order IS NULL ASC, sort_order ASC, id ASC
     LIMIT 1`,
  );
  return String(fallback?.id || '').trim();
}

async function resolveDefaultMapId(context = 'student', legacyFallback = 'foret') {
  const normalizedContext = MAP_DEFAULT_KEY_BY_CONTEXT[context] ? context : 'student';
  const settingsKey = MAP_DEFAULT_KEY_BY_CONTEXT[normalizedContext];
  let preferred = '';
  try {
    const flat = await loadFlatSettings();
    preferred = normalizeString(flat[settingsKey]);
  } catch (error) {
    if (!isNoSuchTableError(error)) throw error;
  }

  try {
    if (preferred && (await mapIsActive(preferred))) return preferred;
    const firstActive = await findFirstActiveMapId();
    if (firstActive) return firstActive;
    if (preferred && (await ensureMapExists(preferred))) return preferred;
    if (legacyFallback && (await ensureMapExists(legacyFallback))) return legacyFallback;
  } catch (error) {
    if (!isNoSuchTableError(error)) throw error;
  }
  return normalizeString(legacyFallback);
}

async function validateCrossSettings(flat) {
  const keys = [
    'ui.map.default_map_student',
    'ui.map.default_map_teacher',
    'ui.map.default_map_visit',
  ];
  for (const key of keys) {
    const value = flat[key];
    if (value && !(await ensureMapExists(value))) {
      throw new Error(`Carte introuvable pour ${key}`);
    }
  }
  normalizeVisitMascotSettingsFlat(flat);
}

/**
 * Réglages mascotte restants : **la mascotte par défaut**, et rien d'autre. La liste des
 * mascottes proposées n'est plus un réglage — elle se lit dans `visit_mascot_packs`
 * (`lib/visitMascotRegistry.js`).
 */
async function getVisitMascotSettings() {
  const flat = await loadFlatSettings();
  return { defaultId: String(flat['ui.visit.mascot.default_id'] || '').trim() };
}

/** Durées JWT (secondes) pour l’émission des jetons — lues depuis `app_settings` avec défauts du registre. */
async function getAuthJwtTtls() {
  const flat = await loadFlatSettings();
  const baseKey = 'security.jwt_ttl_base_seconds';
  const baseMeta = SETTINGS_REGISTRY[baseKey];
  const slidingKey = 'security.jwt_sliding_max_seconds';
  const slidingMeta = SETTINGS_REGISTRY[slidingKey];
  return {
    baseSeconds: flat[baseKey] ?? baseMeta.default,
    slidingMaxSeconds: flat[slidingKey] ?? slidingMeta.default,
  };
}

module.exports = {
  SETTINGS_REGISTRY,
  getSettings,
  getSettingValue,
  isReportsEnabled,
  setSetting,
  validateSettingCandidate,
  listAdminSettings,
  validateCrossSettings,
  resolveDefaultMapId,
  getAuthJwtTtls,
  getVisitMascotSettings,
  isValidVisitMascotId,
  invalidateSettingsCache,
};
