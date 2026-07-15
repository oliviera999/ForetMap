const { queryAll, queryOne, execute } = require('../database');

const SETTINGS_CACHE_TTL_MS = 15000;
const KNOWN_VISIT_MASCOT_IDS = Object.freeze([
  'sprout-rive',
  'scrap-rive',
  'gnome-foret-rive',
  'gnome-ambre-rive',
  'gnome-punk-rive',
  'spore-rive',
  'vine-rive',
  'moss-rive',
  'seed-rive',
  'swarm-rive',
  'sprite-template',
  'olu-spritesheet',
  'tan-bird-spritesheet',
  'fox-backpack-spritesheet',
  'renard2-cut-spritesheet',
]);
const DEFAULT_VISIT_MASCOT_ID = 'renard2-cut-spritesheet';
const DEFAULT_VISIT_MASCOT_ALLOWED_IDS = KNOWN_VISIT_MASCOT_IDS.join(',');
const MAP_DEFAULT_KEY_BY_CONTEXT = Object.freeze({
  student: 'ui.map.default_map_student',
  teacher: 'ui.map.default_map_teacher',
  visit: 'ui.map.default_map_visit',
});

const SETTINGS_REGISTRY = {
  'ui.auth.allow_register': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.allow_google_student': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.allow_google_teacher': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.allow_guest_visit': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.default_mode': {
    scope: 'public',
    type: 'enum',
    values: ['login', 'register'],
    default: 'login',
  },
  'ui.auth.welcome_message': { scope: 'public', type: 'string', maxLength: 160, default: '' },
  'content.auth.title': { scope: 'public', type: 'string', maxLength: 80, default: 'ForêtMap' },
  'content.auth.subtitle': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: 'ForetMap — Le terrain d’apprentissage vivant du lycée',
  },
  'content.auth.login_tab': {
    scope: 'public',
    type: 'string',
    maxLength: 40,
    default: 'Connexion',
  },
  'content.auth.register_tab': {
    scope: 'public',
    type: 'string',
    maxLength: 50,
    default: 'Créer un compte',
  },
  'content.auth.guest_visit_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 70,
    default: '🧭 Visiter sans compte',
  },

  'ui.map.default_map_student': {
    scope: 'public',
    type: 'string',
    maxLength: 32,
    default: 'foret',
  },
  'ui.map.default_map_teacher': {
    scope: 'public',
    type: 'string',
    maxLength: 32,
    default: 'foret',
  },
  'ui.map.default_map_visit': { scope: 'public', type: 'string', maxLength: 32, default: 'foret' },
  'ui.map.location_emojis': { scope: 'public', type: 'string', default: '' },
  /** Distance entre centres emoji et libellé sur la carte (zones SVG et repères). */
  'ui.map.emoji_label_center_gap': {
    scope: 'public',
    type: 'number',
    min: 6,
    max: 32,
    default: 14,
  },
  /** Échelle des emojis zones/repères (%), 100 = ratio repère/plateau à hauteur de référence (~480 px). */
  'ui.map.overlay_emoji_size_percent': {
    scope: 'public',
    type: 'number',
    min: 50,
    max: 200,
    default: 100,
  },
  /** Échelle des libellés sous les repères (% du ratio repère/plateau). */
  'ui.map.overlay_label_size_percent': {
    scope: 'public',
    type: 'number',
    min: 50,
    max: 200,
    default: 100,
  },
  /** Grossissement des étiquettes au zoom (% : 0 = taille apparente constante, 100 = linéaire). */
  'ui.map.overlay_zoom_growth_percent': {
    scope: 'public',
    type: 'number',
    min: 0,
    max: 100,
    default: 35,
  },
  /** Ratio repères / plateau GL et cartes (% ; source unique ForetMap + GL). */
  'ui.map.plateau_marker_size_percent': {
    scope: 'public',
    type: 'number',
    min: 50,
    max: 200,
    default: 100,
  },
  'content.app.loader': {
    scope: 'public',
    type: 'string',
    maxLength: 90,
    default: 'Chargement de la forêt...',
  },
  'content.app.server_down_notice': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: 'Serveur indisponible. Nouvel essai automatique toutes les 2 minutes.',
  },
  'content.app.retry_now': {
    scope: 'public',
    type: 'string',
    maxLength: 50,
    default: 'Réessayer maintenant',
  },
  'content.app.footer_version_prefix': {
    scope: 'public',
    type: 'string',
    maxLength: 20,
    default: 'Version',
  },

  'ui.modules.tutorials_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.visit_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.stats_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.observations_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.help_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.forum_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.context_comments_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Si false : pas de signalement sur forum ni commentaires contextuels (lecture/réactions inchangées). */
  'ui.modules.reports_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.help.show_context_hints': { scope: 'public', type: 'boolean', default: true },
  'ui.help.pulse_unseen_panels': { scope: 'public', type: 'boolean', default: true },
  /** 0 = pas de limite. Compte les tâches non validées où l'élève est inscrit (toutes cartes). */
  'tasks.student_max_active_assignments': {
    scope: 'teacher',
    type: 'number',
    min: 0,
    max: 99,
    default: 0,
  },
  /** Si false : la duplication automatique des tâches récurrentes (job quotidien) est suspendue. */
  'tasks.recurring_automation_enabled': { scope: 'teacher', type: 'boolean', default: true },
  'ui.reactions.allowed_emojis': {
    scope: 'public',
    type: 'string',
    maxLength: 160,
    default: '👍 ❤️ 😂 😮 😢 😡 🔥 👏',
  },
  'content.visit.title': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: '🧭 Visite de la carte',
  },
  'content.visit.subtitle': {
    scope: 'public',
    type: 'string',
    maxLength: 200,
    default: 'Explore les zones et repères, puis marque ce que tu as déjà vu.',
  },
  'content.visit.empty_selection': {
    scope: 'public',
    type: 'string',
    maxLength: 160,
    default: 'Sélectionne une zone ou un repère pour afficher les détails.',
  },
  'content.visit.tutorials_title': {
    scope: 'public',
    type: 'string',
    maxLength: 100,
    default: '📘 Tutoriels de la visite',
  },
  'content.visit.tutorials_empty': {
    scope: 'public',
    type: 'string',
    maxLength: 120,
    default: 'Aucun tutoriel sélectionné pour le moment.',
  },
  'content.visit.mascot_dialog.defaults': {
    scope: 'public',
    type: 'string',
    maxLength: 12000,
    default: '{}',
  },
  'content.visit.mascot_dialog.catalog_overrides': {
    scope: 'public',
    type: 'string',
    maxLength: 24000,
    default: '{}',
  },
  'ui.visit.mascot.allowed_ids': {
    scope: 'public',
    type: 'string',
    maxLength: 500,
    default: DEFAULT_VISIT_MASCOT_ALLOWED_IDS,
  },
  'ui.visit.mascot.default_id': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: DEFAULT_VISIT_MASCOT_ID,
  },
  'content.about.title': { scope: 'public', type: 'string', maxLength: 80, default: 'ℹ️ À propos' },
  'content.about.subtitle': {
    scope: 'public',
    type: 'string',
    maxLength: 120,
    default: 'Informations du projet ForetMap',
  },
  'content.about.purpose_title': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: "Objet de l'application",
  },
  'content.about.purpose_body': {
    scope: 'public',
    type: 'string',
    maxLength: 500,
    default:
      'ForetMap aide les n3beurs et les n3boss du Lycée Lyautey à organiser les activités de la forêt comestible: suivi des zones, de la biodiversité, des tâches et des observations.',
  },
  'content.about.docs_title': {
    scope: 'public',
    type: 'string',
    maxLength: 60,
    default: 'Documentation',
  },
  'content.about.help_title': {
    scope: 'public',
    type: 'string',
    maxLength: 60,
    default: 'Aide contextuelle',
  },
  'content.about.help_body': {
    scope: 'public',
    type: 'string',
    maxLength: 240,
    default: 'Si les bulles d aide ont ete masquées, tu peux les reactiver ici.',
  },
  'content.about.help_reenable_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 70,
    default: 'Reactiver toutes les aides',
  },
  'content.about.help_reset_metrics_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 90,
    default: 'Reinitialiser les compteurs d aide',
  },
  'content.help.hint_prefix': {
    scope: 'public',
    type: 'string',
    maxLength: 40,
    default: 'Astuce : ',
  },
  'content.help.panel_title_prefix': {
    scope: 'public',
    type: 'string',
    maxLength: 8,
    default: '💡',
  },
  'content.help.panel_close_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 40,
    default: 'Fermer',
  },
  'content.help.panel_dismiss_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 70,
    default: 'Ne plus afficher',
  },
  'content.help.map_quick_tip': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: 'Clique une zone ou un repère puis ouvre ? pour les actions guidées.',
  },
  'content.help.tasks_quick_tip': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: 'Filtre d abord par carte ou groupe, puis traite les retours en attente.',
  },
  'content.help.visit_quick_tip': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: 'Coche ce que tu vois déjà pour suivre ta progression sur la carte.',
  },
  // Conditionnement « marquer comme lu/appris » par reussite au quiz (backbone — OFF par defaut).
  'learning.gating.enabled': { scope: 'teacher', type: 'boolean', default: false },
  'learning.gating.auto_mark_on_correct': { scope: 'teacher', type: 'boolean', default: true },
  'learning.gating.default_mode': {
    scope: 'teacher',
    type: 'enum',
    values: ['off', 'any', 'all', 'threshold'],
    default: 'any',
  },
  'learning.gating.default_required_correct': {
    scope: 'teacher',
    type: 'number',
    min: 1,
    max: 50,
    default: 1,
  },
  /** Délai (jours) avant de pouvoir réessayer de valider une ressource après une erreur au QCM de validation (0 = désactivé). */
  'learning.gating.retry_cooldown_days': {
    scope: 'teacher',
    type: 'number',
    min: 0,
    max: 365,
    default: 3,
  },

  'security.password_min_length': { scope: 'teacher', type: 'number', min: 4, max: 32, default: 4 },
  /** Si false : pas de changement automatique de profil élève selon les tâches validées (attribution manuelle uniquement). */
  'rbac.progression_by_validated_tasks': { scope: 'teacher', type: 'boolean', default: true },
  /** Défaut 1 h 30 (5400 s) pour toutes les émissions JWT ; surcharge possible dans Réglages > Sécurité. */
  'security.jwt_ttl_base_seconds': {
    scope: 'teacher',
    type: 'number',
    min: 900,
    max: 604800,
    default: 5400,
  },

  'system.maintenance_mode': { scope: 'teacher', type: 'boolean', default: false },
  'system.maintenance_message': { scope: 'teacher', type: 'string', maxLength: 240, default: '' },

  'integration.google.enabled': { scope: 'admin', type: 'boolean', default: true },
  'ops.allow_remote_restart': { scope: 'admin', type: 'boolean', default: true },
  'ops.allow_remote_logs': { scope: 'admin', type: 'boolean', default: true },
};

const scopeRank = { public: 0, teacher: 1, admin: 2 };

let cache = {
  loadedAt: 0,
  flat: null,
};

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isNoSuchTableError(error) {
  return !!(error && (error.errno === 1146 || error.code === 'ER_NO_SUCH_TABLE'));
}

function parseStoredJson(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

function castValue(meta, value) {
  if (!meta) throw new Error('Clé de réglage inconnue');
  if (meta.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
    throw new Error('Valeur booléenne attendue');
  }
  if (meta.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('Valeur numérique attendue');
    const i = Math.round(n);
    if (meta.min != null && i < meta.min) throw new Error(`Valeur trop petite (min ${meta.min})`);
    if (meta.max != null && i > meta.max) throw new Error(`Valeur trop grande (max ${meta.max})`);
    return i;
  }
  if (meta.type === 'enum') {
    const s = normalizeString(value);
    if (!meta.values.includes(s)) throw new Error(`Valeur invalide: ${s}`);
    return s;
  }
  if (meta.type === 'string') {
    const s = normalizeString(value);
    if (meta.maxLength != null && s.length > meta.maxLength) {
      throw new Error(`Texte trop long (max ${meta.maxLength} caractères)`);
    }
    return s;
  }
  throw new Error('Type de réglage non supporté');
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

function buildDefaults() {
  const out = {};
  for (const [key, meta] of Object.entries(SETTINGS_REGISTRY)) {
    out[key] = meta.default;
  }
  return out;
}

function parseVisitMascotAllowedIds(raw) {
  const source = String(raw || '');
  const candidates = source
    .split(/[,\n;]+/g)
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  const out = [];
  for (const id of candidates) {
    if (!KNOWN_VISIT_MASCOT_IDS.includes(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function normalizeVisitMascotSettingsFlat(flat) {
  const allowedKey = 'ui.visit.mascot.allowed_ids';
  const defaultKey = 'ui.visit.mascot.default_id';
  const fallbackAllowed = parseVisitMascotAllowedIds(DEFAULT_VISIT_MASCOT_ALLOWED_IDS);
  const allowedIds = parseVisitMascotAllowedIds(flat[allowedKey]);
  const safeAllowedIds = allowedIds.length > 0 ? allowedIds : fallbackAllowed;
  let defaultId = String(flat[defaultKey] || '').trim();
  if (!safeAllowedIds.includes(defaultId)) {
    defaultId = safeAllowedIds.includes(DEFAULT_VISIT_MASCOT_ID)
      ? DEFAULT_VISIT_MASCOT_ID
      : safeAllowedIds[0] || '';
  }
  flat[allowedKey] = safeAllowedIds.join(',');
  flat[defaultKey] = defaultId;
}

async function parseMascotDialogSettingsModule() {
  try {
    return await import('./visit-pack/visitMascotDialogEvents.js');
  } catch (_) {
    try {
      return await import('../src/utils/visitMascotDialogEvents.js');
    } catch (err) {
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

async function loadFlatSettings() {
  const now = Date.now();
  if (cache.flat && now - cache.loadedAt < SETTINGS_CACHE_TTL_MS) {
    return { ...cache.flat };
  }
  const out = buildDefaults();
  let rows = [];
  try {
    rows = await queryAll('SELECT `key`, value_json FROM app_settings');
  } catch (e) {
    if (!(e && (e.errno === 1146 || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
    cache = { loadedAt: now, flat: out };
    return { ...out };
  }
  for (const row of rows) {
    const key = String(row.key || '');
    const meta = SETTINGS_REGISTRY[key];
    if (!meta) continue;
    const parsed = parseStoredJson(row.value_json);
    try {
      out[key] = castValue(meta, parsed);
    } catch (_) {
      out[key] = meta.default;
    }
  }
  normalizeVisitMascotSettingsFlat(out);
  cache = { loadedAt: now, flat: out };
  return { ...out };
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
  if (
    nested?.ui?.visit?.mascot &&
    Object.prototype.hasOwnProperty.call(scopedFlat, 'ui.visit.mascot.allowed_ids')
  ) {
    nested.ui.visit.mascot.allowed_ids = parseVisitMascotAllowedIds(
      scopedFlat['ui.visit.mascot.allowed_ids'],
    );
  }
  await enrichVisitMascotDialogPublic(nested, scopedFlat);
  await enrichHelpRegistryPublic(nested);
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

function invalidateSettingsCache() {
  cache.loadedAt = 0;
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
  const meta = SETTINGS_REGISTRY[key];
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
  const meta = SETTINGS_REGISTRY[key];
  if (!meta) throw new Error('Clé de réglage inconnue');
  const normalized = await normalizeSettingValue(key, value);
  const json = JSON.stringify(normalized);
  await execute(
    `INSERT INTO app_settings
      (\`key\`, scope, value_json, updated_by_user_type, updated_by_user_id, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      scope = VALUES(scope),
      value_json = VALUES(value_json),
      updated_by_user_type = VALUES(updated_by_user_type),
      updated_by_user_id = VALUES(updated_by_user_id),
      updated_at = NOW()`,
    [key, meta.scope, json, actor.userType || null, actor.userId || null],
  );
  cache.loadedAt = 0;
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
    if (!(e && (e.errno === 1146 || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
  }
  const map = new Map(rows.map((row) => [String(row.key), row]));
  return Object.keys(SETTINGS_REGISTRY)
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

async function getVisitMascotSettings() {
  const flat = await loadFlatSettings();
  const allowedIds = parseVisitMascotAllowedIds(flat['ui.visit.mascot.allowed_ids']);
  const defaultId = String(flat['ui.visit.mascot.default_id'] || '').trim();
  return {
    allowedIds,
    defaultId,
  };
}

/** Durées JWT (secondes) pour l’émission des jetons — lues depuis `app_settings` avec défauts du registre. */
async function getAuthJwtTtls() {
  const flat = await loadFlatSettings();
  const baseKey = 'security.jwt_ttl_base_seconds';
  const baseMeta = SETTINGS_REGISTRY[baseKey];
  return {
    baseSeconds: flat[baseKey] ?? baseMeta.default,
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
  parseVisitMascotAllowedIds,
  invalidateSettingsCache,
};
