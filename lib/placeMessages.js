'use strict';

/**
 * Journal des **messages reçus sur les lieux** — les commentaires de contexte portant sur une
 * zone ou un repère, tous lieux confondus.
 *
 * Pourquoi une lecture transverse alors que `GET /api/context-comments` existe déjà : cette
 * dernière exige un contexte précis (`contextType` + `contextId`). Elle répond à « que dit-on
 * de CE lieu ? », jamais à « qu'a-t-on reçu depuis hier ? ». Sans cette seconde question, un
 * message déposé depuis le plan des personnels n'était découvert qu'en rouvrant le repère
 * concerné — c'est-à-dire par hasard.
 *
 * Périmètre volontairement restreint aux deux contextes « lieu » : les commentaires de tâche,
 * de projet, de plante ou de tutoriel se lisent là où on les traite déjà.
 */

const { queryAll, queryOne } = require('../database');
const { AUTHOR_DISPLAY_NAME_SQL, AUTHOR_JOIN_SQL } = require('./shared/contextCommentsCore');
const { attachPublicImageUrls } = require('./userContentImages');

/** Contextes considérés comme un « lieu » de la carte. */
const PLACE_CONTEXT_TYPES = Object.freeze(['zone', 'marker']);

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const PLACE_MESSAGES_SQL = `SELECT c.id, c.context_type, c.context_id, c.body, c.image_paths_json,
        c.author_user_type, c.author_user_id, c.created_at,
        ${AUTHOR_DISPLAY_NAME_SQL} AS author_display_name,
        COALESCE(z.name, m.label) AS place_label,
        COALESCE(z.emoji, m.emoji) AS place_emoji,
        COALESCE(z.map_id, m.map_id) AS map_id
   FROM context_comments c
   ${AUTHOR_JOIN_SQL}
   LEFT JOIN zones z ON c.context_type = 'zone' AND z.id = c.context_id
   LEFT JOIN map_markers m ON c.context_type = 'marker' AND m.id = c.context_id
  WHERE c.is_deleted = 0
    AND c.context_type IN ('zone', 'marker')
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT ?`;

const PLACE_MESSAGES_COUNT_SQL = `SELECT COUNT(*) AS c
   FROM context_comments
  WHERE is_deleted = 0
    AND context_type IN ('zone', 'marker')`;

/** Borne la taille de page demandée : `limit` absent ou hors bornes retombe sur le défaut. */
function normalizeLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Derniers messages déposés sur des lieux, du plus récent au plus ancien.
 *
 * Un message dont le lieu a été supprimé **reste** dans la liste, sans libellé : il a été
 * écrit, quelqu'un l'a lu ou non, l'effacer d'office réécrirait l'histoire. Le front affiche
 * alors « Lieu supprimé ».
 *
 * @param {{ limit?: number|string }} [options]
 * @returns {Promise<{ items: object[], total: number }>}
 */
async function listRecentPlaceMessages({ limit } = {}) {
  const pageSize = normalizeLimit(limit);
  // Valeur passée en CHAÎNE : le protocole préparé de mysql2 encode un nombre JS en DOUBLE,
  // que MySQL refuse pour LIMIT (même convention que `listContextComments`).
  const rows = await queryAll(PLACE_MESSAGES_SQL, [String(pageSize)]);
  const totalRow = await queryOne(PLACE_MESSAGES_COUNT_SQL);
  const items = rows.map((row) => {
    // `attachPublicImageUrls` retire `image_paths_json` et pose `image_urls` : les chemins
    // bruts ne sortent jamais de l'API, ici comme sur la liste d'un contexte.
    attachPublicImageUrls(row, 'context-comments');
    return {
      ...row,
      context_id: String(row.context_id),
      place_label: row.place_label == null ? '' : String(row.place_label),
      place_emoji: row.place_emoji == null ? '' : String(row.place_emoji),
      map_id: row.map_id == null ? '' : String(row.map_id),
    };
  });
  return { items, total: Number(totalRow?.c || 0) };
}

module.exports = {
  PLACE_CONTEXT_TYPES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeLimit,
  listRecentPlaceMessages,
};
