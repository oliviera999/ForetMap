const db = require('../database');
const { queryAll, execute } = db;
const gatingCore = require('./shared/gatingSettingsCore');
const { castValue, metaOf, gatingRegistryEntries } = require('./shared/settingsRegistryCore');
const { createSettingsStore } = require('./shared/settingsStore');
const { normalizeMarkerBackgrounds, validateMarkerBackgrounds } = require('./glMarkerBackgrounds');
const {
  DEFAULT_FEUILLET_PREVIEW_FIELDS,
  normalizeFeuilletPreviewFields,
} = require('./glLoreFeuilletPreview');
const {
  DEFAULT_ACQUISITION_CHANNELS,
  normalizeAcquisitionChannels,
} = require('./glFeuilletAcquisitionChannels');
const { DEFAULT_GL_BRAND, normalizeBrand } = require('./glBrand');

// =====================================================================
// Réglages GL (`gl_settings`) — registre déclaratif + un seul magasin.
//
// Historiquement : listes de clés + défauts ici, validateurs dans `routes/gl/admin.js`,
// trois caches TTL 30 s invalidés à la main par l'appelant. Désormais : un registre
// `GL_SETTINGS_REGISTRY` au format du noyau commun (`lib/shared/settingsRegistryCore.js`)
// qui porte types, défauts, bornes ET messages d'erreur historiques (`errorMessage`), et un
// magasin unique (`lib/shared/settingsStore.js`) au cache versionné par écriture.
// Les signatures publiques (`getGameplaySettings`, `getGlModulesSettings`,
// `getGlGatingSettings`, `invalidate*Cache`, `set*CacheForTests`, `upsertGlSetting`) et
// leurs formes de retour (camelCase) sont inchangées.
// =====================================================================

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

const DEFAULT_GAMEPLAY = {
  turnsEnabled: false,
  narrationEnabled: false,
  playerActionsEnabled: false,
  scoringEnabled: false,
  markerQuestionRetrigger: 'every_arrival',
  zoneContentRetrigger: 'once_per_game',
  vitalityEnabled: false,
  defaultHealthPoints: 3,
  defaultPowerPoints: 3,
  // Plafonds de jeu — 0 = illimité (comportement historique). Tant qu'ils valent 0, les
  // cœurs s'accumulent sans redescendre et les sortilèges de vie n'ont pas de prise ;
  // les fixer (5 est la valeur discutée) rend le capital de nouveau tendu. Le plafond
  // bloque les gains mais ne confisque jamais un solde déjà supérieur (cf. glVitality).
  maxHealthPoints: 0,
  maxPowerPoints: 0,
  // G12 — défauts prudents pour une classe : un joueur ne renseigne que SA part et ne
  // vise que SON équipe. Dépenser la vitalité d'autrui reste possible, mais c'est un
  // choix explicite de l'admin (modes `coordinator` / `both`) — jamais l'état sorti d'usine.
  spellCastContributionMode: 'self_only',
  spellCastTeamScope: 'own_team',
  spellCastMjOnly: false,
  spellCastApprovalMode: 'per_spell',
  mascotMoveActor: 'mj',
  qcmMjOnly: false,
  // 0 = illimité (pas de plafond explicite). Le carnet personnel n'impose aucune
  // limite par défaut ; un MJ/admin peut éventuellement en définir une via les réglages.
  playerJournalMaxChars: 0,
  playerJournalMaxAssets: 0,
  loreFeuilletRetrigger: 'once_per_team',
  loreFeuilletPreviewFields: [...DEFAULT_FEUILLET_PREVIEW_FIELDS],
  // Acquisition ③ active par défaut (canaux : tous) ; reste pilotable par partie
  // via le toggle Réglages GL → Carnet de Sélène.
  loreFeuilletAcquisitionEnabled: true,
  loreFeuilletAcquisitionChannels: [...DEFAULT_ACQUISITION_CHANNELS],
  loreEffacementEnabled: true,
  loreGemmeCostsEnabled: true,
  loreHeartRewardsEnabled: true,
  loreSpoilerMaxLevel: 'recit',
  plateauMarkersVisible: true,
  plateauZonesVisible: false,
  plateauMarkerNumbersVisible: false,
  markerBackgrounds: normalizeMarkerBackgrounds(null),
  markerEffectAutoMoveEnabled: false,
  // Marché : les cœurs ne circulent pas par défaut. Dès lors qu'un cœur peut être
  // retiré pour un écart de conduite, le laisser s'échanger permettrait de racheter
  // — ou de se faire offrir — la sanction. Les gemmes, elles, restent échangeables.
  marketHeartsEnabled: false,
  // Marché : les feuillets s'échangent (copie — le donneur garde le sien).
  marketFeuilletsEnabled: true,
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
    case 'gameplay.max_health_points':
      return 'maxHealthPoints';
    case 'gameplay.max_power_points':
      return 'maxPowerPoints';
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
    case 'gameplay.lore_feuillet_preview_fields':
      return 'loreFeuilletPreviewFields';
    case 'gameplay.lore_feuillet_acquisition_enabled':
      return 'loreFeuilletAcquisitionEnabled';
    case 'gameplay.lore_feuillet_acquisition_channels':
      return 'loreFeuilletAcquisitionChannels';
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
    case 'gameplay.market_hearts_enabled':
      return 'marketHeartsEnabled';
    case 'gameplay.market_feuillets_enabled':
      return 'marketFeuilletsEnabled';
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

// ---------------------------------------------------------------------
// Normaliseurs de lecture (inchangés : bornage tolérant, jamais d'exception).
// ---------------------------------------------------------------------

function parseVitalityDefaultSetting(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(99, Math.floor(n)));
}

// 0 = pas de plafond de jeu ; sinon un entier borné par le plafond technique.
function parseVitalityCapSetting(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  if (floored <= 0) return 0;
  return Math.max(1, Math.min(99, floored));
}

function parsePlayerJournalLimitSetting(raw, fallback, { min = 100, max = 200000 } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  // 0 (ou valeur négative) = illimité : aucun plafond explicite n'est appliqué.
  if (floored <= 0) return 0;
  return Math.max(min, Math.min(max, floored));
}

// ---------------------------------------------------------------------
// Registre GL. Chaque descripteur : `group` (gameplay / modules / gating / platform),
// type, défaut (repris de DEFAULT_GAMEPLAY / DEFAULT_MODULES via camelKeyFor), bornes,
// et `errorMessage` = message historique du validateur de route correspondant.
// ---------------------------------------------------------------------

/** Un entier strict (la route refusait 3.5 alors que `castValue` arrondit). */
const requireInteger = (_casted, raw) => (Number.isInteger(Number(raw)) ? null : 'Entier attendu');
/** Un booléen JSON strict : la route refusait `'true'`, `1`… (contrairement à `castValue`). */
const requireBoolean = (_casted, raw) =>
  typeof raw === 'boolean' ? null : 'Valeur booléenne attendue';

function gameplayDefault(key) {
  return DEFAULT_GAMEPLAY[camelKeyFor(key)];
}

function glBoolean(key, errorMessage) {
  return {
    group: 'gameplay',
    type: 'boolean',
    default: gameplayDefault(key),
    validate: requireBoolean,
    errorMessage,
  };
}

function glEnum(key, valuesSet, errorMessage) {
  return {
    group: 'gameplay',
    type: 'enum',
    values: [...valuesSet],
    default: gameplayDefault(key),
    errorMessage,
  };
}

const GENERIC_BOOLEAN_MESSAGE = 'La valeur doit être booléenne';

const GL_GAMEPLAY_REGISTRY = {
  // Ces cinq interrupteurs n'avaient pas de validateur de route (valeur persistée telle
  // quelle, relue comme `=== true`) ; ils rejoignent la règle commune : un booléen JSON.
  'gameplay.turns_enabled': glBoolean('gameplay.turns_enabled', GENERIC_BOOLEAN_MESSAGE),
  'gameplay.narration_enabled': glBoolean('gameplay.narration_enabled', GENERIC_BOOLEAN_MESSAGE),
  'gameplay.player_actions_enabled': glBoolean(
    'gameplay.player_actions_enabled',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  'gameplay.scoring_enabled': glBoolean('gameplay.scoring_enabled', GENERIC_BOOLEAN_MESSAGE),
  'gameplay.marker_question_retrigger': glEnum(
    'gameplay.marker_question_retrigger',
    MARKER_QUESTION_RETRIGGER_VALUES,
    'Valeur marker_question_retrigger invalide',
  ),
  'gameplay.zone_content_retrigger': glEnum(
    'gameplay.zone_content_retrigger',
    MARKER_QUESTION_RETRIGGER_VALUES,
    'Valeur zone_content_retrigger invalide',
  ),
  'gameplay.vitality_enabled': glBoolean(
    'gameplay.vitality_enabled',
    'La valeur de vitality_enabled doit être booléenne',
  ),
  // Vitalité : entier 0..99 ; le clamp historique reste en `normalize` (sans effet sur une
  // valeur déjà valide, filet pour une lecture hors bornes).
  'gameplay.default_health_points': {
    group: 'gameplay',
    type: 'number',
    min: 0,
    max: 99,
    default: DEFAULT_GAMEPLAY.defaultHealthPoints,
    validate: requireInteger,
    normalize: (n) => parseVitalityDefaultSetting(n, DEFAULT_GAMEPLAY.defaultHealthPoints),
    errorMessage: 'La valeur doit être un entier entre 0 et 99',
  },
  'gameplay.default_power_points': {
    group: 'gameplay',
    type: 'number',
    min: 0,
    max: 99,
    default: DEFAULT_GAMEPLAY.defaultPowerPoints,
    validate: requireInteger,
    normalize: (n) => parseVitalityDefaultSetting(n, DEFAULT_GAMEPLAY.defaultPowerPoints),
    errorMessage: 'La valeur doit être un entier entre 0 et 99',
  },
  // Plafond de jeu : 0 = illimité (défaut historique), sinon 1..99. Le plafond technique
  // de la colonne reste 99 quoi qu'il arrive.
  'gameplay.max_health_points': {
    group: 'gameplay',
    type: 'number',
    min: 0,
    max: 99,
    default: DEFAULT_GAMEPLAY.maxHealthPoints,
    validate: requireInteger,
    normalize: (n) => parseVitalityCapSetting(n, DEFAULT_GAMEPLAY.maxHealthPoints),
    errorMessage: 'La valeur doit être 0 (illimité) ou un entier entre 1 et 99',
  },
  'gameplay.max_power_points': {
    group: 'gameplay',
    type: 'number',
    min: 0,
    max: 99,
    default: DEFAULT_GAMEPLAY.maxPowerPoints,
    validate: requireInteger,
    normalize: (n) => parseVitalityCapSetting(n, DEFAULT_GAMEPLAY.maxPowerPoints),
    errorMessage: 'La valeur doit être 0 (illimité) ou un entier entre 1 et 99',
  },
  'gameplay.spell_cast_contribution_mode': glEnum(
    'gameplay.spell_cast_contribution_mode',
    SPELL_CAST_CONTRIBUTION_MODES,
    'Mode de contribution invalide (coordinator, self_only, both)',
  ),
  'gameplay.spell_cast_team_scope': glEnum(
    'gameplay.spell_cast_team_scope',
    SPELL_CAST_TEAM_SCOPES,
    'Périmètre équipe invalide (any_team, own_team, mj_any)',
  ),
  'gameplay.spell_cast_mj_only': glBoolean(
    'gameplay.spell_cast_mj_only',
    'La valeur de spell_cast_mj_only doit être booléenne',
  ),
  'gameplay.spell_cast_approval_mode': glEnum(
    'gameplay.spell_cast_approval_mode',
    SPELL_CAST_APPROVAL_MODES,
    'Mode d’approbation invalide (auto, mj_required, per_spell)',
  ),
  'gameplay.mascot_move_actor': glEnum(
    'gameplay.mascot_move_actor',
    MASCOT_MOVE_ACTORS,
    'Acteur de déplacement invalide (players, mj)',
  ),
  'gameplay.qcm_mj_only': glBoolean(
    'gameplay.qcm_mj_only',
    'La valeur de qcm_mj_only doit être booléenne',
  ),
  // Carnet personnel : 0 = illimité ; sinon entier dans [500, 200000] (resp. [1, 200]).
  'gameplay.player_journal_max_chars': {
    group: 'gameplay',
    type: 'number',
    min: 0,
    max: 200000,
    default: DEFAULT_GAMEPLAY.playerJournalMaxChars,
    validate: (n, raw) => requireInteger(n, raw) || (n > 0 && n < 500 ? 'Hors plage' : null),
    normalize: (n) =>
      parsePlayerJournalLimitSetting(n, DEFAULT_GAMEPLAY.playerJournalMaxChars, {
        min: 500,
        max: 200000,
      }),
    errorMessage: 'La valeur doit être 0 (illimité) ou un entier entre 500 et 200000',
  },
  'gameplay.player_journal_max_assets': {
    group: 'gameplay',
    type: 'number',
    min: 0,
    max: 200,
    default: DEFAULT_GAMEPLAY.playerJournalMaxAssets,
    validate: requireInteger,
    normalize: (n) =>
      parsePlayerJournalLimitSetting(n, DEFAULT_GAMEPLAY.playerJournalMaxAssets, {
        min: 1,
        max: 200,
      }),
    errorMessage: 'La valeur doit être 0 (illimité) ou un entier entre 1 et 200',
  },
  'gameplay.lore_feuillet_retrigger': glEnum(
    'gameplay.lore_feuillet_retrigger',
    MARKER_QUESTION_RETRIGGER_VALUES,
    'Valeur lore_feuillet_retrigger invalide',
  ),
  'gameplay.lore_feuillet_preview_fields': {
    group: 'gameplay',
    type: 'json',
    shape: 'array',
    default: DEFAULT_GAMEPLAY.loreFeuilletPreviewFields,
    normalize: normalizeFeuilletPreviewFields,
    errorMessage: 'La valeur de lore_feuillet_preview_fields doit être une liste',
  },
  'gameplay.lore_feuillet_acquisition_enabled': glBoolean(
    'gameplay.lore_feuillet_acquisition_enabled',
    'La valeur de lore_feuillet_acquisition_enabled doit être booléenne',
  ),
  'gameplay.lore_feuillet_acquisition_channels': {
    group: 'gameplay',
    type: 'json',
    shape: 'array',
    default: DEFAULT_GAMEPLAY.loreFeuilletAcquisitionChannels,
    normalize: normalizeAcquisitionChannels,
    errorMessage: 'La valeur de lore_feuillet_acquisition_channels doit être une liste',
  },
  'gameplay.lore_effacement_enabled': glBoolean(
    'gameplay.lore_effacement_enabled',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  'gameplay.lore_gemme_costs_enabled': glBoolean(
    'gameplay.lore_gemme_costs_enabled',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  'gameplay.lore_heart_rewards_enabled': glBoolean(
    'gameplay.lore_heart_rewards_enabled',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  'gameplay.lore_spoiler_max_level': glEnum(
    'gameplay.lore_spoiler_max_level',
    LORE_SPOILER_LEVELS,
    'Niveau spoiler lore invalide (cle, recit, secret)',
  ),
  'gameplay.plateau_markers_visible': glBoolean(
    'gameplay.plateau_markers_visible',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  'gameplay.plateau_zones_visible': glBoolean(
    'gameplay.plateau_zones_visible',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  'gameplay.plateau_marker_numbers_visible': glBoolean(
    'gameplay.plateau_marker_numbers_visible',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  // Fonds de repères : deux messages distincts (objet attendu / valeur d'un mode) — la
  // forme est donc laissée à `validate` (`shape: 'any'`), sans `errorMessage` unique.
  'gameplay.marker_backgrounds': {
    group: 'gameplay',
    type: 'json',
    shape: 'any',
    default: DEFAULT_GAMEPLAY.markerBackgrounds,
    validate: (value) => validateMarkerBackgrounds(value).error,
    normalize: normalizeMarkerBackgrounds,
  },
  'gameplay.marker_effect_auto_move_enabled': glBoolean(
    'gameplay.marker_effect_auto_move_enabled',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  'gameplay.market_hearts_enabled': glBoolean(
    'gameplay.market_hearts_enabled',
    GENERIC_BOOLEAN_MESSAGE,
  ),
  'gameplay.market_feuillets_enabled': glBoolean(
    'gameplay.market_feuillets_enabled',
    GENERIC_BOOLEAN_MESSAGE,
  ),
};

const GL_MODULES_REGISTRY = {};
for (const camel of Object.keys(DEFAULT_MODULES)) {
  // Clé SQL reconstruite depuis le nom camel (mascotPacksEnabled → modules.mascot_packs_enabled).
  const key = `modules.${camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`;
  GL_MODULES_REGISTRY[key] = {
    group: 'modules',
    type: 'boolean',
    default: DEFAULT_MODULES[camel],
    validate: requireBoolean,
    errorMessage: 'La valeur d’un module doit être booléenne',
  };
}

const GL_SETTINGS_REGISTRY = Object.freeze({
  ...GL_GAMEPLAY_REGISTRY,
  ...GL_MODULES_REGISTRY,
  // Conditionnement « marquer comme lu/appris » par reussite QCM (backbone GL — OFF par defaut).
  // Cles et defauts DERIVES du catalogue commun (lib/shared/gatingSettingsCore.js),
  // partage avec ForetMap. Ajouter un reglage la-bas l'ajoute ici : c'est ainsi que
  // GL herite de la tolerance d'essais, du plafond par session et de l'annonce, nes
  // cote ForetMap — et que ForetMap ne peut plus diverger a son tour.
  ...gatingRegistryEntries('gl', { group: 'gating' }),
  // Identité visuelle : objet JSON normalisé par `glBrand` (lu par `routes/gl/auth.js`).
  'platform.brand': {
    group: 'platform',
    type: 'json',
    shape: 'object',
    default: normalizeBrand(DEFAULT_GL_BRAND),
    normalize: normalizeBrand,
    errorMessage: 'La valeur de platform.brand doit etre un objet JSON',
  },
});

function keysOfGroup(group) {
  return Object.keys(GL_SETTINGS_REGISTRY).filter(
    (key) => GL_SETTINGS_REGISTRY[key].group === group,
  );
}

const GAMEPLAY_KEYS = keysOfGroup('gameplay');
const MODULE_KEYS = keysOfGroup('modules');
const GATING_KEYS = gatingCore.gatingKeysFor('gl');
const DEFAULT_GATING = Object.freeze(gatingCore.buildGatingSettings({}, 'gl'));

const CACHE_TTL_MS = 30_000;

/**
 * Magasin unique `gl_settings` : cache plat versionné par écriture (toute écriture SQL du
 * process le périme), TTL 30 s en garde-fou. `allowUnknownKeys` : la table porte aussi des
 * clés libres (`platform.title`, intro, aide…) que le registre ne décrit pas.
 */
const store = createSettingsStore({
  table: 'gl_settings',
  registry: GL_SETTINGS_REGISTRY,
  // Certains tests remplacent `database.js` par une base factice sans version d'écriture
  // (`require.cache`) : repli sur le seul TTL plutôt que d'échouer au chargement.
  writeVersion: typeof db.getDataWriteVersion === 'function' ? db.getDataWriteVersion : () => 0,
  queryAll,
  execute,
  ttlMs: CACHE_TTL_MS,
  allowUnknownKeys: true,
});

// Correspondance inverse dérivée de camelKeyFor (G10) : plus de liste manuelle à
// maintenir — toute clé gameplay/module connue est couverte automatiquement.
let settingKeyByCamelCache = null;
function settingKeyForCamel(camel) {
  if (!settingKeyByCamelCache) {
    settingKeyByCamelCache = new Map();
    for (const key of GAMEPLAY_KEYS) {
      const camelKey = camelKeyFor(key);
      if (camelKey) settingKeyByCamelCache.set(camelKey, key);
    }
    for (const key of MODULE_KEYS) {
      const camelKey = moduleCamelKeyFor(key);
      if (camelKey) settingKeyByCamelCache.set(camelKey, key);
    }
  }
  return settingKeyByCamelCache.get(camel) || null;
}

// ---------------------------------------------------------------------
// Dérivés par domaine (camelCase), mémoïsés par identité du plat partagé du magasin :
// un plat frais = les trois objets reconstruits une fois, puis resservis tels quels.
// ---------------------------------------------------------------------

let derived = { flat: null, gameplay: null, modules: null, gating: null };

/**
 * Snapshots de test par domaine (`set*CacheForTests`) : ils court-circuitent la base et
 * — comme les anciens caches — ne tombent que sur leur TTL, un `invalidate*Cache()` ou
 * une écriture du même domaine via `upsertGlSetting`.
 */
const testSnapshots = { gameplay: null, modules: null, gating: null };

function buildGameplayFromFlat(flat) {
  const out = {};
  for (const key of GAMEPLAY_KEYS) out[camelKeyFor(key)] = flat[key];
  return out;
}

function buildModulesFromFlat(flat) {
  const out = {};
  for (const key of MODULE_KEYS) out[moduleCamelKeyFor(key)] = flat[key];
  return out;
}

function buildGatingFromFlat(flat) {
  const raw = {};
  for (const key of GATING_KEYS) {
    const name = gatingCore.gatingNameForKey('gl', key);
    if (name) raw[name] = flat[key];
  }
  // La normalisation (bornage, enums, booleens tolerants) est celle du coeur commun :
  // une valeur illisible retombe sur le defaut plutot que de casser une lecture.
  return gatingCore.buildGatingSettings(raw, 'gl');
}

const DOMAIN_BUILDERS = {
  gameplay: buildGameplayFromFlat,
  modules: buildModulesFromFlat,
  gating: buildGatingFromFlat,
};

async function readDomain(domain, forceRefresh) {
  if (forceRefresh) {
    testSnapshots[domain] = null;
    store.invalidate();
  }
  const snapshot = testSnapshots[domain];
  if (snapshot) {
    if (snapshot.expiresAt > Date.now()) return snapshot.value;
    testSnapshots[domain] = null;
  }
  const flat = await store.loadFlatShared();
  if (derived.flat !== flat) derived = { flat, gameplay: null, modules: null, gating: null };
  if (!derived[domain]) derived[domain] = DOMAIN_BUILDERS[domain](flat);
  return derived[domain];
}

function setDomainSnapshotForTests(domain, defaults, value, ttlMs) {
  if (value == null) {
    testSnapshots[domain] = null;
    return;
  }
  testSnapshots[domain] = { value: { ...defaults, ...value }, expiresAt: Date.now() + ttlMs };
}

function domainOfKey(key) {
  const meta = metaOf(GL_SETTINGS_REGISTRY, key);
  if (meta && DOMAIN_BUILDERS[meta.group]) return meta.group;
  return null;
}

async function getGameplaySettings({ forceRefresh = false } = {}) {
  return readDomain('gameplay', forceRefresh);
}

async function getGlModulesSettings({ forceRefresh = false } = {}) {
  return readDomain('modules', forceRefresh);
}

async function getGlGatingSettings({ forceRefresh = false } = {}) {
  return readDomain('gating', forceRefresh);
}

function invalidateGameplayCache() {
  testSnapshots.gameplay = null;
  store.invalidate();
}

function invalidateModulesCache() {
  testSnapshots.modules = null;
  store.invalidate();
}

function invalidateGatingCache() {
  testSnapshots.gating = null;
  store.invalidate();
}

/** Test helper : court-circuiter la lecture BDD en injectant un snapshot. */
function setGameplayCacheForTests(value, ttlMs = CACHE_TTL_MS) {
  setDomainSnapshotForTests('gameplay', DEFAULT_GAMEPLAY, value, ttlMs);
}

function setModulesCacheForTests(value, ttlMs = CACHE_TTL_MS) {
  setDomainSnapshotForTests('modules', DEFAULT_MODULES, value, ttlMs);
}

/** Test helper : injecter un snapshot de reglages gating (court-circuite la BDD). */
function setGatingCacheForTests(value, ttlMs = CACHE_TTL_MS) {
  setDomainSnapshotForTests('gating', DEFAULT_GATING, value, ttlMs);
}

/**
 * Valide une valeur candidate pour une clé GL via le registre (`castValue`, messages
 * historiques par `errorMessage`). Une clé hors registre (`platform.title`, …) est rendue
 * telle quelle : le contrat « clé sans validateur persistée en l'état » est conservé.
 * @returns {{ value: any } | { error: string }}
 */
function validateGlSettingValue(key, value) {
  const meta = metaOf(GL_SETTINGS_REGISTRY, key);
  if (!meta) return { value };
  try {
    return { value: castValue(meta, value) };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Upsert d'un reglage GL dans gl_settings (valeur serialisee en JSON).
 *
 * **Invalide désormais le cache** (et le snapshot de test du domaine concerné, comme le
 * faisait la route après chaque PUT) : l'appelant n'a plus rien à faire. La valeur est
 * écrite telle quelle — la validation (route via `validateGlSettingValue`, cœur de
 * conditionnement via `setGlGatingSetting`) a lieu en amont.
 */
async function upsertGlSetting(key, value, userId = null) {
  await store.upsert(key, value, { validate: false, extraColumns: { updated_by: userId } });
  const domain = domainOfKey(key);
  if (domain) testSnapshots[domain] = null;
}

/**
 * Ecrit un reglage de gating GL (valide, persiste dans gl_settings, invalide le cache).
 * @returns {{ ok: true, key: string, value: any } | { ok: false, error: string }}
 */
async function setGlGatingSetting(key, value, updatedBy = null) {
  const name = gatingCore.gatingNameForKey('gl', key);
  if (!name) return { ok: false, error: 'Cle de reglage gating inconnue' };
  // Refus explicite hors bornes plutot que bornage silencieux : borner sans le dire
  // ferait croire au MJ que sa valeur a ete prise en compte.
  const checked = gatingCore.validateGatingSetting(name, value);
  if (!checked.ok) return { ok: false, error: checked.error };
  await upsertGlSetting(key, checked.value, updatedBy == null ? null : String(updatedBy));
  invalidateGatingCache();
  return { ok: true, key, value: checked.value };
}

module.exports = {
  GL_SETTINGS_REGISTRY,
  GAMEPLAY_KEYS,
  MODULE_KEYS,
  GATING_KEYS,
  DEFAULT_GATING,
  getGlGatingSettings,
  invalidateGatingCache,
  setGatingCacheForTests,
  setGlGatingSetting,
  upsertGlSetting,
  validateGlSettingValue,
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
