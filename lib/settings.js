const { queryAll, queryOne, execute } = require('../database');

const SETTINGS_CACHE_TTL_MS = 15000;

const SETTINGS_REGISTRY = {
  'ui.auth.allow_register': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.allow_google_student': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.allow_google_teacher': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.allow_guest_visit': { scope: 'public', type: 'boolean', default: true },
  'ui.auth.default_mode': { scope: 'public', type: 'enum', values: ['login', 'register'], default: 'login' },
  'ui.auth.welcome_message': { scope: 'public', type: 'string', maxLength: 160, default: '' },
  'content.auth.title': { scope: 'public', type: 'string', maxLength: 80, default: 'ForêtMap' },
  'content.auth.subtitle': { scope: 'public', type: 'string', maxLength: 180, default: 'ForetMap — Le terrain d’apprentissage vivant du lycée' },
  'content.auth.login_tab': { scope: 'public', type: 'string', maxLength: 40, default: 'Connexion' },
  'content.auth.register_tab': { scope: 'public', type: 'string', maxLength: 50, default: 'Créer un compte' },
  'content.auth.guest_visit_cta': { scope: 'public', type: 'string', maxLength: 70, default: '🧭 Visiter sans connexion' },

  'ui.map.default_map_student': { scope: 'public', type: 'string', maxLength: 32, default: 'foret' },
  'ui.map.default_map_teacher': { scope: 'public', type: 'string', maxLength: 32, default: 'foret' },
  'ui.map.default_map_visit': { scope: 'public', type: 'string', maxLength: 32, default: 'foret' },
  'ui.map.location_emojis': { scope: 'public', type: 'string', default: '' },
  'content.app.loader': { scope: 'public', type: 'string', maxLength: 90, default: 'Chargement de la forêt...' },
  'content.app.server_down_notice': { scope: 'public', type: 'string', maxLength: 180, default: 'Serveur indisponible. Nouvel essai automatique toutes les 2 minutes.' },
  'content.app.retry_now': { scope: 'public', type: 'string', maxLength: 50, default: 'Réessayer maintenant' },
  'content.app.footer_version_prefix': { scope: 'public', type: 'string', maxLength: 20, default: 'Version' },

  'ui.modules.tutorials_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.visit_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.stats_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.observations_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.help_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.reactions.allowed_emojis': { scope: 'public', type: 'string', maxLength: 160, default: '👍 ❤️ 😂 😮 😢 😡 🔥 👏' },
  'content.visit.title': { scope: 'public', type: 'string', maxLength: 80, default: '🧭 Visite de la carte' },
  'content.visit.subtitle': { scope: 'public', type: 'string', maxLength: 200, default: 'Explore les zones et repères, puis marque ce que tu as déjà vu.' },
  'content.visit.empty_selection': { scope: 'public', type: 'string', maxLength: 160, default: 'Sélectionne une zone ou un repère pour afficher les détails.' },
  'content.visit.tutorials_title': { scope: 'public', type: 'string', maxLength: 100, default: '📘 Tutoriels de la visite' },
  'content.visit.tutorials_empty': { scope: 'public', type: 'string', maxLength: 120, default: 'Aucun tutoriel sélectionné pour le moment.' },
  'content.about.title': { scope: 'public', type: 'string', maxLength: 80, default: 'ℹ️ À propos' },
  'content.about.subtitle': { scope: 'public', type: 'string', maxLength: 120, default: 'Informations du projet ForetMap' },
  'content.about.purpose_title': { scope: 'public', type: 'string', maxLength: 80, default: "Objet de l'application" },
  'content.about.purpose_body': { scope: 'public', type: 'string', maxLength: 500, default: 'ForetMap aide les élèves et les enseignants du Lycée Lyautey à organiser les activités de la forêt comestible: suivi des zones, de la biodiversité, des tâches et des observations.' },
  'content.about.docs_title': { scope: 'public', type: 'string', maxLength: 60, default: 'Documentation' },
  'content.about.repo_title': { scope: 'public', type: 'string', maxLength: 60, default: 'Dépôt GitHub' },
  'content.about.help_title': { scope: 'public', type: 'string', maxLength: 60, default: 'Aide contextuelle' },
  'content.about.help_body': { scope: 'public', type: 'string', maxLength: 240, default: 'Si les bulles d aide ont ete masquées, tu peux les reactiver ici.' },
  'content.about.help_reenable_cta': { scope: 'public', type: 'string', maxLength: 70, default: 'Reactiver toutes les aides' },
  'content.about.help_reset_metrics_cta': { scope: 'public', type: 'string', maxLength: 90, default: 'Reinitialiser les compteurs d aide' },
  'security.password_min_length': { scope: 'teacher', type: 'number', min: 4, max: 32, default: 4 },
  'security.allow_pin_elevation': { scope: 'teacher', type: 'boolean', default: true },
  'security.jwt_ttl_base_seconds': { scope: 'teacher', type: 'number', min: 900, max: 604800, default: 86400 },
  'security.jwt_ttl_elevated_seconds': { scope: 'teacher', type: 'number', min: 300, max: 604800, default: 21600 },

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
  const parts = String(dottedKey || '').split('.').filter(Boolean);
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

async function loadFlatSettings() {
  const now = Date.now();
  if (cache.flat && (now - cache.loadedAt) < SETTINGS_CACHE_TTL_MS) {
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
  return {
    flat: flattenByAudience(flat, audience),
    nested: nestFlat(flattenByAudience(flat, audience)),
  };
}

async function getSettingValue(key, fallback) {
  const flat = await loadFlatSettings();
  if (!Object.prototype.hasOwnProperty.call(flat, key)) return fallback;
  return flat[key];
}

async function setSetting(key, value, actor = {}) {
  const meta = SETTINGS_REGISTRY[key];
  if (!meta) throw new Error('Clé de réglage inconnue');
  const normalized = castValue(meta, value);
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
    [
      key,
      meta.scope,
      json,
      actor.userType || null,
      actor.userId || null,
    ]
  );
  cache.loadedAt = 0;
  return normalized;
}

async function listAdminSettings() {
  const flat = await loadFlatSettings();
  let rows = [];
  try {
    rows = await queryAll('SELECT `key`, scope, updated_by_user_type, updated_by_user_id, updated_at FROM app_settings');
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

async function validateCrossSettings(flat) {
  const keys = ['ui.map.default_map_student', 'ui.map.default_map_teacher', 'ui.map.default_map_visit'];
  for (const key of keys) {
    const value = flat[key];
    if (value && !(await ensureMapExists(value))) {
      throw new Error(`Carte introuvable pour ${key}`);
    }
  }
}

module.exports = {
  SETTINGS_REGISTRY,
  getSettings,
  getSettingValue,
  setSetting,
  listAdminSettings,
  validateCrossSettings,
};
