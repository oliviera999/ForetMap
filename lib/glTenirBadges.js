'use strict';

/**
 * « Tenir à deux » v2 — badges individuels (spec § 12) : calculés par l'app d'après
 * `gl_tenir_badges` (`regle_type` + `source` + `seuil`), **jamais de ressource**, aucun
 * classement. `evaluateBadges(db, playerId)` est idempotent (INSERT IGNORE) ; les badges
 * `saisie_prof` passent par `awardBadgeProfTx` ; les badges `reserve` ne sont jamais attribués.
 */

const { isoWeekOf } = require('./glTenir');

/** Compteurs par `source` (une requête chacun, bornée au joueur). */
const TENIR_BADGE_SOURCES = Object.freeze({
  carnet_personnel_pages: async (db, playerId) =>
    count(db, 'SELECT COUNT(*) AS c FROM gl_player_feuillet_states WHERE player_id = ?', [
      playerId,
    ]),
  feuillets_lus: async (db, playerId) =>
    count(
      db,
      "SELECT COUNT(*) AS c FROM gl_player_feuillet_states WHERE player_id = ? AND status IN ('read', 'held')",
      [playerId],
    ),
  fouilles_chaudes: async (db, playerId) =>
    count(
      db,
      "SELECT COUNT(*) AS c FROM gl_game_chasse_empreintes WHERE player_id = ? AND verdict = 'chaud'",
      [playerId],
    ),
  pages_trouvees_operateur: async (db, playerId) => {
    // Pages trouvées pendant un tour où le joueur était Opérateur de son équipe.
    const rows = await db.queryAll(
      `SELECT e.game_id, e.team_id, e.payload_json FROM gl_game_events e
         INNER JOIN gl_team_members tm ON tm.game_id = e.game_id AND tm.team_id = e.team_id AND tm.player_id = ?
        WHERE e.event_type = 'page_trouvee'`,
      [playerId],
    );
    let n = 0;
    for (const r of rows) {
      let roundNumber = 0;
      try {
        roundNumber = Number(JSON.parse(r.payload_json || '{}').roundNumber) || 0;
      } catch (_) {
        roundNumber = 0;
      }
      if (!roundNumber) continue;
      const round = await db.queryOne(
        'SELECT operateurs_json FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1',
        [r.game_id, roundNumber],
      );
      let ops = {};
      try {
        ops = JSON.parse(round?.operateurs_json || '{}') || {};
      } catch (_) {
        ops = {};
      }
      if (Number(ops[String(r.team_id)]?.playerId) === Number(playerId)) n += 1;
    }
    return n;
  },
  dons: async (db, playerId) =>
    count(db, 'SELECT COUNT(*) AS c FROM gl_market_dons WHERE donneur_id = ?', [playerId]),
  veillee_semaines: async (db, playerId) => {
    const rows = await db.queryAll(
      "SELECT DISTINCT semaine_iso FROM gl_game_chasse_ouvertures WHERE player_id = ? AND via = 'veillee' ORDER BY semaine_iso DESC",
      [playerId],
    );
    return longestWeeklyStreak(rows.map((r) => String(r.semaine_iso)));
  },
  especes_etudiees: async (db, playerId) =>
    count(
      db,
      "SELECT COUNT(*) AS c FROM gl_learning_acknowledgements WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type = 'species'",
      [String(playerId)],
    ),
  biomes_etudies: async (db, playerId) =>
    count(
      db,
      "SELECT COUNT(*) AS c FROM gl_learning_acknowledgements WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type IN ('biome', 'ecosystem')",
      [String(playerId)],
    ),
  chapitres_clos: async (db, playerId) =>
    count(
      db,
      "SELECT COUNT(DISTINCT g.id) AS c FROM gl_team_members tm INNER JOIN gl_games g ON g.id = tm.game_id WHERE tm.player_id = ? AND g.status = 'ended'",
      [playerId],
    ),
  missions_reussies: async (db, playerId) =>
    count(
      db,
      "SELECT COUNT(*) AS c FROM gl_player_titres WHERE player_id = ? AND famille = 'mission'",
      [playerId],
    ),
  olu_corrections: async () => 0,
  defis_trame: async () => 0,
});

async function count(db, sql, params) {
  const row = await db.queryOne(sql, params);
  return Number(row?.c) || 0;
}

/** Semaines ISO consécutives (`AAAA-Www`) : plus longue série, en partant de la plus récente. */
function longestWeeklyStreak(weeks) {
  const sorted = [...new Set(weeks)].sort().reverse();
  if (!sorted.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (isPreviousWeek(sorted[i], sorted[i - 1])) {
      run += 1;
      best = Math.max(best, run);
    } else run = 1;
  }
  return best;
}

function weekToDate(week) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(week || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7);
  return monday;
}

function isPreviousWeek(earlier, later) {
  const a = weekToDate(earlier);
  const b = weekToDate(later);
  if (!a || !b) return false;
  return Math.round((b - a) / (7 * 86400000)) === 1;
}

async function loadBadgeRules(db) {
  return db.queryAll(
    'SELECT code, nom, critere, regle_type, seuil, source, icone FROM gl_tenir_badges WHERE actif = 1 ORDER BY code ASC',
  );
}

/**
 * Évalue et attribue les badges `compteur` / `serie_hebdo` d'un joueur. Idempotent.
 * @returns {Promise<Array<{ code, nom, awarded: boolean, valeur }>>}
 */
async function evaluateBadges(db, playerId, { gameId = null } = {}) {
  const rules = await loadBadgeRules(db);
  const out = [];
  for (const rule of rules) {
    const type = String(rule.regle_type);
    if (type === 'reserve' || type === 'saisie_prof') continue;
    const counter = TENIR_BADGE_SOURCES[String(rule.source)];
    if (!counter) continue;
    const valeur = await counter(db, Number(playerId));
    const seuil = Number(rule.seuil) || 1;
    if (valeur < seuil) {
      out.push({ code: rule.code, nom: rule.nom, awarded: false, valeur, seuil });
      continue;
    }
    const r = await db.execute(
      `INSERT IGNORE INTO gl_player_badges (player_id, badge_code, game_id, source, valeur, awarded_by, awarded_at) VALUES (?, ?, ?, ?, ?, 'app', NOW())`,
      [playerId, rule.code, gameId, rule.source, valeur],
    );
    out.push({ code: rule.code, nom: rule.nom, awarded: !!r.affectedRows, valeur, seuil });
  }
  return out;
}

/** Badge à la main du prof (`saisie_prof`) ; un badge `reserve` est refusé. */
async function awardBadgeProfTx(tx, { playerId, badgeCode, gameId = null, actorId }) {
  const rule = await tx.queryOne(
    'SELECT code, nom, regle_type, source FROM gl_tenir_badges WHERE code = ? AND actif = 1 LIMIT 1',
    [badgeCode],
  );
  if (!rule) {
    const err = new Error('BADGE_INTROUVABLE');
    err.status = 404;
    throw err;
  }
  if (String(rule.regle_type) === 'reserve') {
    const err = new Error('BADGE_RESERVE');
    err.status = 409;
    throw err;
  }
  const r = await tx.execute(
    `INSERT IGNORE INTO gl_player_badges (player_id, badge_code, game_id, source, valeur, awarded_by, awarded_at) VALUES (?, ?, ?, ?, 1, ?, NOW())`,
    [playerId, rule.code, gameId, rule.source, String(actorId)],
  );
  return { code: rule.code, nom: rule.nom, awarded: !!r.affectedRows };
}

async function listPlayerBadges(db, playerId) {
  return db.queryAll(
    `SELECT b.badge_code AS code, r.nom, r.icone, b.awarded_at, b.source FROM gl_player_badges b
       LEFT JOIN gl_tenir_badges r ON r.code = b.badge_code WHERE b.player_id = ? ORDER BY b.awarded_at ASC`,
    [playerId],
  );
}

async function listPlayerTitres(db, playerId) {
  return db.queryAll(
    'SELECT titre_code AS code, famille, libelle, game_id AS gameId, created_at AS createdAt FROM gl_player_titres WHERE player_id = ? ORDER BY id ASC',
    [playerId],
  );
}

module.exports = {
  TENIR_BADGE_SOURCES,
  evaluateBadges,
  awardBadgeProfTx,
  listPlayerBadges,
  listPlayerTitres,
  longestWeeklyStreak,
  isoWeekOf,
};
