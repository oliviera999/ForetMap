'use strict';

/**
 * Gnomes & Licornes — mesures des badges individuels, **bornées au joueur** : une requête
 * agrégée par mesure, mémorisée le temps d'une évaluation (même motif que
 * `lib/rewards/metrics.js`). Rien n'est écrit ici.
 *
 * « En sa présence » : le joueur est membre de l'équipe de l'évènement (`gl_team_members`) et
 * n'est pas marqué absent au tour de l'évènement (`gl_game_round_absences`, `roundNumber` du
 * payload). Un évènement sans tour (veillée, tour 0) compte pour tout membre.
 */

const { AIDE_SPELL_CODES } = require('./glSpellEffects');
const { longestWeeklyStreak } = require('./glTenirBadges');

/** Valeur JSON (dés-échappée) d'un champ du payload d'un évènement. */
function jsonField(alias, field) {
  return `JSON_UNQUOTE(JSON_EXTRACT(COALESCE(${alias}.payload_json, '{}'), '$.${field}'))`;
}

/**
 * Présence du joueur à un évènement `alias` (membre de l'équipe, non absent au tour).
 * Consomme deux paramètres `playerId`.
 */
function presenceSql(alias) {
  return `EXISTS (SELECT 1 FROM gl_team_members tm
            WHERE tm.game_id = ${alias}.game_id AND tm.team_id = ${alias}.team_id AND tm.player_id = ?)
      AND NOT EXISTS (SELECT 1 FROM gl_game_round_absences ab
            WHERE ab.game_id = ${alias}.game_id AND ab.player_id = ?
              AND ab.round_number = CAST(${jsonField(alias, 'roundNumber')} AS UNSIGNED))`;
}

async function count(db, sql, params) {
  const row = await db.queryOne(sql, params);
  return Number(row?.c) || 0;
}

/** Lectures agrégées : une requête chacune. */
const LOADERS = {
  /** Fouilles faites par le joueur, ou par son équipe en sa présence, quel que soit le verdict. */
  fouilles: (db, p) =>
    count(
      db,
      `SELECT COUNT(*) AS c FROM gl_game_chasse_empreintes e
        WHERE (e.player_id = ?
           OR EXISTS (SELECT 1 FROM gl_team_members tm
                       WHERE tm.game_id = e.game_id AND tm.team_id = e.team_id AND tm.player_id = ?))
          AND NOT EXISTS (SELECT 1 FROM gl_game_round_absences ab
                           WHERE ab.game_id = e.game_id AND ab.player_id = ? AND ab.round_number = e.round_number)`,
      [p, p, p],
    ),
  /** Pages trouvées ou réparées par son équipe en sa présence. */
  pages_equipe: (db, p) =>
    count(
      db,
      `SELECT COUNT(*) AS c FROM gl_game_events ev
        WHERE ev.event_type IN ('page_trouvee', 'page_reparee') AND ${presenceSql('ev')}`,
      [p, p],
    ),
  /** Pages réparées par son équipe (gnome) en sa présence. */
  reparations: (db, p) =>
    count(
      db,
      `SELECT COUNT(*) AS c FROM gl_game_events ev
        WHERE ev.event_type = 'page_reparee' AND ${presenceSql('ev')}`,
      [p, p],
    ),
  /** Pages lues entièrement : carnet personnel (`read` / `held`) ∪ ouvertures du joueur. */
  pages_lues: (db, p) =>
    count(
      db,
      `SELECT COUNT(*) AS c FROM (
         SELECT s.feuillet_code AS k FROM gl_player_feuillet_states s
          WHERE s.player_id = ? AND s.status IN ('read', 'held')
         UNION
         SELECT z.feuillet_code FROM gl_game_chasse_ouvertures o
           INNER JOIN gl_chasse_zones z ON z.id = o.zone_id
          WHERE o.player_id = ?
       ) u`,
      [p, p],
    ),
  /** Pages tenues : par son équipe en sa présence (tour), ou par lui en veillée. */
  pages_tenues: (db, p) =>
    count(
      db,
      `SELECT COUNT(*) AS c FROM (
         SELECT ev.id AS k FROM gl_game_events ev
          WHERE ev.event_type = 'page_tenue'
            AND COALESCE(${jsonField('ev', 'via')}, 'tour') <> 'veillee'
            AND ${presenceSql('ev')}
         UNION
         SELECT -o.id FROM gl_game_chasse_ouvertures o
          WHERE o.player_id = ? AND o.via = 'veillee' AND o.reussie = 1
       ) u`,
      [p, p, p],
    ),
  /**
   * Réussites après un « pas encore » : zones, questions de lecture ou cases où l'équipe du
   * joueur (en sa présence) a d'abord répondu « pas encore », puis réussi ensuite.
   */
  pas_encore: (db, p) =>
    count(
      db,
      `SELECT COUNT(DISTINCT CONCAT(pe.game_id, ':', pe.team_id, ':', ${jsonField('pe', 'kind')}, ':',
                COALESCE(${jsonField('pe', 'zoneKey')}, ${jsonField('pe', 'markerId')}, ''))) AS c
         FROM gl_team_members tm
         INNER JOIN gl_game_events pe ON pe.game_id = tm.game_id AND pe.team_id = tm.team_id
        WHERE tm.player_id = ? AND pe.event_type = 'pas_encore'
          AND NOT EXISTS (SELECT 1 FROM gl_game_round_absences ab
                           WHERE ab.game_id = pe.game_id AND ab.player_id = ?
                             AND ab.round_number = CAST(${jsonField('pe', 'roundNumber')} AS UNSIGNED))
          AND EXISTS (
            SELECT 1 FROM gl_game_events s
             WHERE s.game_id = pe.game_id AND s.team_id = pe.team_id AND s.id > pe.id
               AND (
                 (${jsonField('pe', 'kind')} = 'chasse'
                   AND s.event_type IN ('page_trouvee', 'page_reparee')
                   AND ${jsonField('s', 'zoneKey')} = ${jsonField('pe', 'zoneKey')})
              OR (${jsonField('pe', 'kind')} = 'lecture'
                   AND s.event_type = 'page_tenue'
                   AND ${jsonField('s', 'zoneKey')} = ${jsonField('pe', 'zoneKey')})
              OR (${jsonField('pe', 'kind')} = 'case'
                   AND s.event_type = 'qcm_answer'
                   AND ${jsonField('s', 'correct')} = 'true'
                   AND ${jsonField('s', 'markerId')} = ${jsonField('pe', 'markerId')})
               )
          )`,
      [p, p],
    ),
  dons: (db, p) => count(db, 'SELECT COUNT(*) AS c FROM gl_market_dons WHERE donneur_id = ?', [p]),
  /** Sorts d'aide lancés (`cast`) : part au pot, ou équipe du joueur en sa présence au tour du lancer. */
  aide: (db, p) =>
    count(
      db,
      `SELECT COUNT(DISTINCT d.id) AS c FROM gl_spell_cast_drafts d
        WHERE d.status = 'cast' AND d.spell_code IN (${AIDE_SPELL_CODES.map(() => '?').join(', ')})
          AND (
            EXISTS (SELECT 1 FROM gl_spell_cast_contributions c
                     WHERE c.draft_id = d.id AND c.player_id = ? AND (c.gems > 0 OR c.hearts > 0))
            OR (
              EXISTS (SELECT 1 FROM gl_team_members tm
                       WHERE tm.game_id = d.game_id AND tm.team_id = d.team_id AND tm.player_id = ?)
              AND NOT EXISTS (SELECT 1 FROM gl_game_round_absences ab
                               WHERE ab.game_id = d.game_id AND ab.player_id = ?
                                 AND ab.round_number = d.cast_round_number)
            )
          )`,
      [...AIDE_SPELL_CODES, p, p, p],
    ),
  especes: (db, p) =>
    count(
      db,
      `SELECT COUNT(*) AS c FROM gl_learning_acknowledgements
        WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type = 'species'`,
      [String(p)],
    ),
  biomes: (db, p) =>
    count(
      db,
      `SELECT COUNT(*) AS c FROM gl_learning_acknowledgements
        WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND target_type IN ('biome', 'ecosystem')`,
      [String(p)],
    ),
  async veillee(db, p) {
    const rows = await db.queryAll(
      `SELECT DISTINCT semaine_iso FROM gl_game_chasse_ouvertures
        WHERE player_id = ? AND via = 'veillee' ORDER BY semaine_iso DESC`,
      [p],
    );
    return longestWeeklyStreak(rows.map((r) => String(r.semaine_iso)));
  },
  chapitres: (db, p) =>
    count(
      db,
      `SELECT COUNT(DISTINCT g.id) AS c FROM gl_team_members tm
         INNER JOIN gl_games g ON g.id = tm.game_id
        WHERE tm.player_id = ? AND g.status = 'ended'`,
      [p],
    ),
  /** 1 si le joueur a été membre d'une équipe gnome et d'une équipe licorne. */
  async deux_peuples(db, p) {
    const n = await count(
      db,
      `SELECT COUNT(DISTINCT t.type) AS c FROM gl_team_members tm
         INNER JOIN gl_teams t ON t.id = tm.team_id WHERE tm.player_id = ?`,
      [p],
    );
    return n >= 2 ? 1 : 0;
  },
};

/**
 * Contexte de mesure d'un joueur : `value(metric)` charge la lecture à la demande (une requête)
 * et la garde le temps de l'évaluation.
 */
function createMetricContext(db, playerId) {
  const id = Number(playerId);
  const cache = new Map();
  return {
    async value(metric) {
      const loader = LOADERS[String(metric)];
      if (!loader) throw new Error(`Mesure de badge G&L inconnue : ${metric}`);
      if (!cache.has(metric)) cache.set(metric, loader(db, id));
      return Number(await cache.get(metric)) || 0;
    },
  };
}

module.exports = { createMetricContext, LOADERS, presenceSql };
