const { queryAll, queryOne, execute } = require('../database');
const gatingCore = require('./shared/gatingSettingsCore');

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
 * Entrées `app_settings` dérivées du catalogue commun de conditionnement.
 * Portée `teacher` pour toutes : ce sont des réglages pédagogiques, pas système.
 */
function buildFmGatingSettingDefs() {
  const out = {};
  for (const name of gatingCore.GATING_SETTING_NAMES) {
    const def = gatingCore.GATING_SETTING_DEFS[name];
    if (!def.fmKey) continue;
    const entry = { scope: 'teacher', type: def.type, default: def.default };
    if (def.type === 'number') {
      entry.min = def.min;
      entry.max = def.max;
    } else if (def.type === 'enum') {
      entry.values = [...def.values];
    }
    out[def.fmKey] = entry;
  }
  return out;
}

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
  /** Si true : le job quotidien archive automatiquement les tâches validées et projets validés
   *  inactifs depuis `tasks.auto_archive_after_days` (référence : date de validation). */
  'tasks.auto_archive_enabled': { scope: 'teacher', type: 'boolean', default: true },
  /** Délai (jours) avant archivage automatique d'un élément validé. Défaut 120 (~4 mois).
   *  Min 7 (garde-fou anti-archivage prématuré), max 3650 (~10 ans). */
  'tasks.auto_archive_after_days': {
    scope: 'teacher',
    type: 'number',
    min: 7,
    max: 3650,
    default: 120,
  },
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
  // `ui.visit.mascot.allowed_ids` **a été retiré** (étape 3 de la fusion catalogue / packs).
  // C'était une liste blanche d'identifiants : dès qu'un administrateur en décochait une, la
  // liste se figeait sur les mascottes existant ce jour-là, et toute mascotte ajoutée ensuite —
  // un pack importé — en était absente donc invisible, sans que rien ne le signale.
  //
  // « Proposée aux visiteurs » est désormais `is_published` sur la ligne de la mascotte. Retirer
  // la clé du registre est ce qui **ferme la classe de défaut** : sans clé, `setSetting` la
  // refuse, `loadFlatSettings` ignore une éventuelle ligne résiduelle, et la charge publique ne
  // la porte plus — côté client, `allowed_ids` retombe donc sur `[]`, c'est-à-dire « aucune
  // restriction », partout et par construction. La bascule des installations existantes est
  // faite au démarrage par `lib/visitMascotVisibility.js`.
  // Vide = mascotte par défaut livrée avec l'application (résolue par le catalogue front).
  'ui.visit.mascot.default_id': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: '',
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
  // Conditionnement « marquer comme lu/appris » par réussite au quiz.
  //
  // Le catalogue fait autorité dans `lib/shared/gatingSettingsCore.js` — un seul
  // descripteur par réglage, partagé avec Gnomes & Licornes. Les entrées ci-dessous
  // en sont DÉRIVÉES : ajouter un réglage là-bas l'ajoute ici et côté GL, avec les
  // mêmes bornes. Seul le stockage reste propre à chaque produit (`app_settings`
  // ici, `gl_settings` là-bas).
  ...buildFmGatingSettingDefs(),

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
  // Marque de passage de l'alignement unique décrit dans `lib/visitMascotBuiltinSeed.js` :
  // les mascottes livrées dont le fichier d'animation n'existe pas sont retirées de la visite,
  // **une seule fois**. Sans cette marque, l'alignement se rejouerait à chaque démarrage et
  // reprendrait la main sur un administrateur qui aurait délibérément republié l'une d'elles.
  'ops.visit_mascot_unrenderable_aligned_at': {
    scope: 'admin',
    type: 'string',
    maxLength: 40,
    default: '',
  },
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
  isValidVisitMascotId,
  invalidateSettingsCache,
};
