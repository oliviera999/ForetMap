'use strict';

/**
 * « Tenir à deux » v2 — réglages résolus par partie, profils, permissions, état de partie.
 * Spécification : docs/GL_TENIR_A_DEUX_REGLES.md ; architecture : docs/GL_TENIR_A_DEUX.md.
 *
 * Résolution : défauts du registre ← `gl_settings` ← profil de la partie (`prologue` =
 * écarts de data/gl/tenir/reglages-defaut.json) ← surcharges de la partie
 * (`gl_games.tenir_overrides_json`). Le client ne recalcule jamais : `GET /api/gl/games/:id/tenir`
 * sert les valeurs résolues.
 */

const crypto = require('node:crypto');
const { DEFAULT_GAMEPLAY, TENIR_SETTING_KEYS, camelKeyFor } = require('./glSettings');
const {
  resolveTenirPermissions,
  normalizeTenirSurface,
} = require('./shared/glTenirPermissionsCore');

const TENIR_PROFILS = Object.freeze(['complet', 'prologue']);

/** Écarts du profil `prologue` (miroir de `profils.prologue.ecarts` du fichier de réglages). */
const PROFIL_ECARTS = Object.freeze({
  complet: Object.freeze({}),
  prologue: Object.freeze({
    voile: false,
    marche: false,
    chapardeur: false,
    zones_par_plateau: Object.freeze({ 1: 8, 2: 8, 3: 8, 4: 8 }),
  }),
});

/** Clés (sans préfixe) qu'une partie peut surcharger. */
const OVERRIDABLE_KEYS = Object.freeze([
  'surface',
  'des_mode',
  'des_physiques_validation',
  'vent',
  'voile',
  'marche',
  'chapardeur',
  'peripeties',
  'zones_par_plateau',
  'lumiere',
  'cartes_vers_cases',
]);

const OVERRIDE_VALIDATORS = Object.freeze({
  surface: (v) => ['tableau', 'hybride', 'tablette'].includes(v),
  des_mode: (v) => ['serveur', 'physique'].includes(v),
  des_physiques_validation: (v) => ['prof', 'auto'].includes(v),
  vent: (v) => typeof v === 'boolean',
  voile: (v) => typeof v === 'boolean',
  marche: (v) => typeof v === 'boolean',
  chapardeur: (v) => typeof v === 'boolean',
  peripeties: (v) => typeof v === 'boolean',
  lumiere: (v) => typeof v === 'boolean',
  cartes_vers_cases: (v) => typeof v === 'boolean',
  zones_par_plateau: (v) =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    ['1', '2', '3', '4'].every((k) => Number.isInteger(Number(v[k])) && Number(v[k]) >= 0),
});

/** Clé plate (sans préfixe `tenir_`) → clé camel du snapshot gameplay. */
function flatKeyToCamel(flatKey) {
  return camelKeyFor(`gameplay.tenir_${flatKey}`);
}

function flatKeys() {
  return TENIR_SETTING_KEYS.map((k) => k.slice('gameplay.tenir_'.length));
}

function cloneValue(v) {
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneValue(x)]));
  }
  return v;
}

/** Le drapeau global est-il levé ? (le mode effectif d'une PARTIE passe par `isTenirGame`). */
function isTenirEnabled(settings) {
  return (settings || DEFAULT_GAMEPLAY).tenirEnabled === true;
}

/**
 * Une partie joue « Tenir à deux » si le drapeau global est levé ET qu'elle porte un profil
 * (`gl_games.tenir_profil`, posé à la création d'une partie quand le mode est actif, ou d'un
 * clic sur « Profil »). Une partie sans profil garde le jeu classique : c'est ce qui protège
 * les parties — et les tests — nées avant la mouture.
 */
function isTenirGame(settings, game) {
  if (!isTenirEnabled(settings)) return false;
  const profil = game?.tenir_profil ?? game?.tenirProfil ?? null;
  return profil != null && TENIR_PROFILS.includes(String(profil));
}

function parseOverrides(raw) {
  if (raw == null || raw === '') return {};
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out = {};
  for (const key of OVERRIDABLE_KEYS) {
    if (key in parsed && OVERRIDE_VALIDATORS[key](parsed[key])) out[key] = cloneValue(parsed[key]);
  }
  return out;
}

/**
 * Valide un objet de surcharges venu du client.
 * @returns {{ value: object } | { error: string }}
 */
function validateOverrides(raw) {
  if (raw == null) return { value: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'overrides doit être un objet' };
  }
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!OVERRIDABLE_KEYS.includes(key)) return { error: `Surcharge inconnue : ${key}` };
    if (value == null) continue;
    if (!OVERRIDE_VALIDATORS[key](value)) return { error: `Surcharge invalide : ${key}` };
    out[key] = cloneValue(value);
  }
  return { value: out };
}

/**
 * Réglages résolus d'une partie (clés plates sans préfixe).
 * @param {object} globalSettings snapshot `getGameplaySettings()`
 * @param {object|null} game ligne `gl_games` (`tenir_profil`, `tenir_overrides_json`)
 */
function resolveTenirSettings(globalSettings, game = null) {
  const settings = globalSettings || DEFAULT_GAMEPLAY;
  const resolved = {};
  for (const flat of flatKeys()) {
    const camel = flatKeyToCamel(flat);
    const value = settings[camel] !== undefined ? settings[camel] : DEFAULT_GAMEPLAY[camel];
    resolved[flat] = cloneValue(value);
  }
  const profil = TENIR_PROFILS.includes(String(game?.tenir_profil || ''))
    ? game.tenir_profil
    : null;
  const ecarts = PROFIL_ECARTS[profil] || {};
  for (const [k, v] of Object.entries(ecarts)) resolved[k] = cloneValue(v);
  const overrides = parseOverrides(game?.tenir_overrides_json ?? game?.tenirOverridesJson);
  for (const [k, v] of Object.entries(overrides)) resolved[k] = v;
  // Réglages existants repris tels quels (plafonds, Marché, lecture gratuite).
  resolved.max_power_points = Number(settings.maxPowerPoints) || 0;
  resolved.max_health_points = Number(settings.maxHealthPoints) || 0;
  resolved.market_hearts_enabled = settings.marketHeartsEnabled === true;
  resolved.lore_gemme_costs_enabled = settings.loreGemmeCostsEnabled === true;
  resolved.lore_heart_rewards_enabled = settings.loreHeartRewardsEnabled === true;
  resolved.feuillet_zone_traversal_enabled = settings.feuilletZoneTraversalEnabled === true;
  resolved.profil = profil;
  resolved.overrides = overrides;
  return resolved;
}

function resolveSurface(game, settings) {
  const resolved = resolveTenirSettings(settings, game);
  return normalizeTenirSurface(game?.tenir_surface || resolved.surface);
}

/** Mode de dés effectif : `des_mode_par_surface[surface]`, surcharge `des_mode` prioritaire. */
function resolveDesMode(resolved) {
  const surface = normalizeTenirSurface(resolved?.surface);
  if (resolved?.overrides?.des_mode) return resolved.overrides.des_mode;
  const parSurface = resolved?.des_mode_par_surface || {};
  const mode = parSurface[surface];
  if (mode === 'serveur' || mode === 'physique') return mode;
  return resolved?.des_mode === 'serveur' ? 'serveur' : 'physique';
}

function resolveFouillesParTour(resolved, teamType) {
  const map = resolved?.fouilles_par_tour || {};
  const type = String(teamType || '').toLowerCase() === 'unicorn' ? 'unicorn' : 'gnome';
  const n = Number(map[type]);
  return Number.isInteger(n) && n >= 0 ? n : type === 'unicorn' ? 2 : 1;
}

function resolveVoileBonus(resolved, plateauNumber) {
  const map = resolved?.voile_bonus_par_plateau || {};
  const n = Number(map[String(plateauNumber)]);
  return Number.isInteger(n) && n >= 0 ? n : 4;
}

function resolveZonesParPlateau(resolved, plateauNumber) {
  const map = resolved?.zones_par_plateau || {};
  const n = Number(map[String(plateauNumber)]);
  return Number.isInteger(n) && n >= 0 ? n : 8;
}

/** Ressource du peuple : `power` (gemmes) pour une licorne, `health` (cœurs) pour un gnome. */
function resourceOfPeople(teamType) {
  const t = String(teamType || '')
    .trim()
    .toLowerCase();
  return t === 'unicorn' || t === 'licorne' ? 'power' : 'health';
}

/** Deltas `{ healthDelta, powerDelta }` de +`n` dans la ressource du peuple. */
function peopleDelta(teamType, n = 1) {
  return resourceOfPeople(teamType) === 'power'
    ? { healthDelta: 0, powerDelta: n }
    : { healthDelta: n, powerDelta: 0 };
}

/** Trimestre (1–3) de `date` selon `resolved.trimestres` ; `null` hors bornes. */
function trimestreOf(date, resolved) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const trimestres = resolved?.trimestres || DEFAULT_GAMEPLAY.tenirTrimestres;
  for (const k of ['1', '2', '3']) {
    const range = trimestres[k];
    if (!Array.isArray(range) || range.length !== 2) continue;
    if (md >= String(range[0]) && md <= String(range[1])) return Number(k);
  }
  return null;
}

/** Semaine ISO `AAAA-Www` (ex. `2026-W45`). */
function isoWeekOf(date = new Date()) {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Année scolaire (`2026-2027`) : bascule au 1er août. */
function anneeScolaireOf(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

function parseJsonColumn(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

function formatTenirState(row) {
  if (!row) return null;
  return {
    voilePosition: Number(row.voile_position ?? -1),
    voileLastRollRound: Number(row.voile_last_roll_round) || 0,
    carnetCompletAt: row.carnet_complet_at || null,
    premiereArriveeTeamId:
      row.premiere_arrivee_team_id != null ? Number(row.premiere_arrivee_team_id) : null,
    chapardeurRound: row.chapardeur_round != null ? Number(row.chapardeur_round) : null,
    nid: parseJsonColumn(row.nid_json, null),
    kraa: parseJsonColumn(row.kraa_json, null),
  };
}

/** Tour du chapardeur : tiré entre 2 et 4 à la création de l'état. */
function drawChapardeurRound(randomInt = crypto.randomInt) {
  return randomInt(2, 5);
}

/**
 * Lit, ou crée (tour du chapardeur tiré 2–4), l'état « tenir » d'une partie.
 * `db` : exécuteur `{ queryOne, execute }` (module database ou transaction).
 */
async function loadOrCreateTenirState(db, gameId, { randomInt } = {}) {
  const existing = await db.queryOne(
    'SELECT * FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1',
    [gameId],
  );
  if (existing) return formatTenirState(existing);
  await db.execute(
    `INSERT INTO gl_game_tenir_state (game_id, voile_position, voile_last_roll_round, chapardeur_round, updated_at)
     VALUES (?, -1, 0, ?, NOW())
     ON DUPLICATE KEY UPDATE updated_at = updated_at`,
    [gameId, drawChapardeurRound(randomInt)],
  );
  const row = await db.queryOne('SELECT * FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1', [
    gameId,
  ]);
  return formatTenirState(row);
}

async function isPlayerEnRetrait(db, gameId, playerId) {
  const row = await db.queryOne(
    `SELECT id FROM gl_game_retraits
      WHERE game_id = ? AND player_id = ? AND sortie_at IS NULL
      LIMIT 1`,
    [gameId, playerId],
  );
  return !!row;
}

async function listRetraitsOuverts(db, gameId) {
  const rows = await db.queryAll(
    `SELECT player_id, motif, entree_at FROM gl_game_retraits
      WHERE game_id = ? AND sortie_at IS NULL ORDER BY id ASC`,
    [gameId],
  );
  return rows.map((r) => ({
    playerId: Number(r.player_id),
    motif: r.motif || null,
    entreeAt: r.entree_at || null,
  }));
}

/**
 * Membres d'une équipe présents au tour : exclut les absents du tour
 * (`gl_game_round_absences`, migration 331 — tolérée absente) ET les retraits ouverts.
 * @returns {Promise<number[]>} identifiants de joueurs
 */
async function listPresentMembers(db, gameId, teamId, roundNumber) {
  const members = await db.queryAll(
    'SELECT player_id FROM gl_team_members WHERE game_id = ? AND team_id = ? ORDER BY player_id ASC',
    [gameId, teamId],
  );
  const ids = members.map((m) => Number(m.player_id));
  if (!ids.length) return [];
  const retraits = await db.queryAll(
    `SELECT player_id FROM gl_game_retraits WHERE game_id = ? AND sortie_at IS NULL`,
    [gameId],
  );
  const excluded = new Set(retraits.map((r) => Number(r.player_id)));
  const round = Number(roundNumber) || 0;
  if (round > 0) {
    try {
      const absences = await db.queryAll(
        'SELECT player_id FROM gl_game_round_absences WHERE game_id = ? AND round_number = ?',
        [gameId, round],
      );
      for (const a of absences) excluded.add(Number(a.player_id));
    } catch (err) {
      if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }
  return ids.filter((id) => !excluded.has(id));
}

/** Hachage d'un jeton de projection (stocké, révocable). */
function hashProjectionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = {
  TENIR_PROFILS,
  PROFIL_ECARTS,
  OVERRIDABLE_KEYS,
  isTenirEnabled,
  isTenirGame,
  parseOverrides,
  validateOverrides,
  resolveTenirSettings,
  resolveSurface,
  resolveDesMode,
  resolveFouillesParTour,
  resolveVoileBonus,
  resolveZonesParPlateau,
  resourceOfPeople,
  peopleDelta,
  trimestreOf,
  isoWeekOf,
  anneeScolaireOf,
  parseJsonColumn,
  formatTenirState,
  drawChapardeurRound,
  loadOrCreateTenirState,
  isPlayerEnRetrait,
  listRetraitsOuverts,
  listPresentMembers,
  hashProjectionToken,
  resolveTenirPermissions,
};
