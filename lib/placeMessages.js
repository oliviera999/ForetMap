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

const { queryAll, queryOne, execute } = require('../database');
const { AUTHOR_DISPLAY_NAME_SQL, AUTHOR_JOIN_SQL } = require('./shared/contextCommentsCore');
const { attachPublicImageUrls } = require('./userContentImages');

/** Contextes considérés comme un « lieu » de la carte. */
const PLACE_CONTEXT_TYPES = Object.freeze(['zone', 'marker']);

/**
 * Cycle de vie d'un message reçu sur un lieu (migration 264).
 *
 * `''` est le point de départ — « nouveau » — et non un statut posé : c'est l'état de tout
 * message tant que personne ne l'a regardé, y compris les milliers écrits avant ce lot. Les
 * trois autres valeurs se posent à la main depuis la console.
 *
 * `sans_suite` n'est pas un rejet honteux : dire « non, et c'est vu » vaut mieux que laisser
 * un message ouvert pour l'éternité, et c'est la seule alternative à la suppression, qui
 * efface l'information au lieu de la clore.
 */
const PLACE_STATUSES = Object.freeze(['', 'pris_en_compte', 'traite', 'sans_suite']);

/** Statuts qu'un traitant peut poser (tous sauf le point de départ). */
const SETTABLE_PLACE_STATUSES = Object.freeze(PLACE_STATUSES.filter((status) => status !== ''));

/** Message encore à traiter : ni pris en compte, ni traité, ni écarté. */
function isOpenPlaceStatus(status) {
  return String(status || '') === '';
}

/** Normalise un statut reçu du client ; chaîne vide si la valeur n'est pas au catalogue. */
function normalizePlaceStatus(value) {
  const status = String(value == null ? '' : value)
    .trim()
    .toLowerCase();
  return PLACE_STATUSES.includes(status) ? status : '';
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const PLACE_MESSAGES_SQL = `SELECT c.id, c.context_type, c.context_id, c.body, c.image_paths_json,
        c.author_user_type, c.author_user_id, c.created_at,
        c.place_status, c.place_status_at,
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

const PLACE_MESSAGES_COUNT_SQL = `SELECT COUNT(*) AS c,
        SUM(CASE WHEN place_status = '' THEN 1 ELSE 0 END) AS open_c
   FROM context_comments
  WHERE is_deleted = 0
    AND context_type IN ('zone', 'marker')`;

/**
 * Mes propres messages sur les lieux, avec leur statut — la moitié « retour à l'auteur ».
 *
 * Servie au plan des personnels, où l'auteur n'a autrement aucun moyen de relire ce qu'il a
 * écrit : la fiche de lieu n'affiche pas les commentaires, et le routeur de la console refuse
 * son profil. Le nom du traitant n'est **pas** projeté ici : l'auteur apprend que c'est traité,
 * pas par qui.
 */
const MY_PLACE_REPORTS_SQL = `SELECT c.id, c.context_type, c.context_id, c.body, c.created_at,
        c.place_status, c.place_status_at,
        COALESCE(z.name, m.label) AS place_label
   FROM context_comments c
   LEFT JOIN zones z ON c.context_type = 'zone' AND z.id = c.context_id
   LEFT JOIN map_markers m ON c.context_type = 'marker' AND m.id = c.context_id
  WHERE c.is_deleted = 0
    AND c.context_type IN ('zone', 'marker')
    AND c.author_user_type = ?
    AND c.author_user_id = ?
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT ?`;

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
  return {
    items,
    total: Number(totalRow?.c || 0),
    open_total: Number(totalRow?.open_c || 0),
  };
}

/**
 * Messages déposés par un compte donné, du plus récent au plus ancien.
 *
 * @param {{ actor: { userType: string, userId: string }, limit?: number|string }} params
 */
async function listMyPlaceReports({ actor, limit } = {}) {
  if (!actor?.userType || !actor?.userId) return { items: [] };
  const pageSize = normalizeLimit(limit);
  const rows = await queryAll(MY_PLACE_REPORTS_SQL, [
    actor.userType,
    actor.userId,
    String(pageSize),
  ]);
  return { items: rows.map(serializeMyReport) };
}

/** Projection d'un message pour son auteur : ni identité du traitant, ni chemins d'images. */
function serializeMyReport(row) {
  return {
    id: String(row.id),
    context_type: String(row.context_type),
    context_id: String(row.context_id),
    body: String(row.body || ''),
    created_at: row.created_at,
    place_status: String(row.place_status || ''),
    place_status_at: row.place_status_at || null,
    place_label: row.place_label == null ? '' : String(row.place_label),
  };
}

/**
 * Pose le statut de traitement d'un message de lieu.
 *
 * Refuse tout ce qui n'est pas un message de lieu encore vivant : un commentaire de tâche, de
 * chapitre G&L ou déjà supprimé n'a pas ce cycle de vie. Le statut est **remplacé**, jamais
 * accumulé : « traité » puis « sans suite » est une correction, pas un historique — celui-ci
 * vit dans le journal d'audit, que l'appelant écrit.
 *
 * @param {{ commentId: string, status: string, actor: { userType: string, userId: string } }} params
 * @returns {Promise<{ error: string, status: number }|{ comment: object, previousStatus: string }>}
 */
async function setPlaceMessageStatus({ commentId, status, actor }) {
  const id = String(commentId || '').trim();
  if (!id) return { error: 'Commentaire introuvable', status: 404 };
  const nextStatus = normalizePlaceStatus(status);
  if (!SETTABLE_PLACE_STATUSES.includes(nextStatus)) {
    return {
      error: `Statut invalide (${SETTABLE_PLACE_STATUSES.join(' | ')})`,
      status: 400,
    };
  }
  const comment = await queryOne(
    `SELECT id, context_type, context_id, is_deleted, place_status
       FROM context_comments
      WHERE id = ?
      LIMIT 1`,
    [id],
  );
  if (!comment) return { error: 'Commentaire introuvable', status: 404 };
  if (!PLACE_CONTEXT_TYPES.includes(String(comment.context_type))) {
    return { error: 'Ce commentaire ne porte pas sur un lieu', status: 400 };
  }
  if (Number(comment.is_deleted)) return { error: 'Commentaire supprimé', status: 409 };

  await execute(
    `UPDATE context_comments
        SET place_status = ?, place_status_at = NOW(),
            place_status_by_user_type = ?, place_status_by_user_id = ?
      WHERE id = ?`,
    [nextStatus, actor.userType, actor.userId, comment.id],
  );
  return {
    comment: { ...comment, place_status: nextStatus },
    previousStatus: String(comment.place_status || ''),
  };
}

module.exports = {
  PLACE_CONTEXT_TYPES,
  PLACE_STATUSES,
  SETTABLE_PLACE_STATUSES,
  isOpenPlaceStatus,
  normalizePlaceStatus,
  listMyPlaceReports,
  setPlaceMessageStatus,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeLimit,
  listRecentPlaceMessages,
};
