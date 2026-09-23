'use strict';

const crypto = require('node:crypto');

const { queryAll, queryOne, execute } = require('../../database');
const { buildInClauseParams } = require('./httpHelpers');
const {
  attachPublicImageUrls,
  deleteUserContentImagesFromJson,
  persistUserContentImages,
  validateImagesPayload,
} = require('../userContentImages');
const { getAllowedReactionSet, normalizeEmoji } = require('./reactionEmojiCore');

const AUTO_BODY_WITH_PHOTOS = '(Photo)';

/**
 * Bornes de saisie, communes aux deux produits.
 *
 * Elles étaient écrites deux fois, avec des **noms différents pour les mêmes valeurs**
 * (`MIN_COMMENT_LEN`/`MAX_COMMENT_LEN` côté ForetMap, `MIN_BODY`/`MAX_BODY` côté G&L) — la
 * forme de duplication la plus coûteuse, parce qu'un `grep` sur l'un ne trouve pas l'autre :
 * relever le plafond d'un côté laissait l'autre en place sans que rien ne le signale.
 *
 * Ce ne sont pas des règles de produit mais des bornes de champ de saisie : un commentaire
 * contextuel est le même objet des deux côtés.
 */
const CONTEXT_COMMENT_LIMITS = Object.freeze({
  MIN_BODY: 2,
  MAX_BODY: 4000,
  MIN_REPORT_REASON: 3,
  MAX_REPORT_REASON: 500,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
});

/**
 * Fabrique le normaliseur de type de contexte.
 *
 * La fonction était identique des deux côtés ; **seul l'ensemble autorisé change** (ForetMap :
 * `task`, `project`, `zone`… ; G&L : `gl_chapter`, `gl_scene`…). C'est exactement le motif
 * « noyau partagé + adaptateur mince » du dépôt : ce qui varie devient un paramètre, ce qui
 * ne varie pas n'est plus écrit qu'une fois.
 *
 * Contrat conservé au caractère près : minuscules, espaces retirés, chaîne vide si le type
 * n'est pas autorisé — les handlers décident du 400, jamais ce normaliseur.
 */
function makeContextTypeNormalizer(allowedTypes) {
  const allowed = allowedTypes instanceof Set ? allowedTypes : new Set(allowedTypes || []);
  return function normalizeContextType(value) {
    const type = String(value || '')
      .trim()
      .toLowerCase();
    return allowed.has(type) ? type : '';
  };
}

/**
 * Traduit une demande de réaction en réponse HTTP.
 *
 * L'appariement erreur → statut était recopié dans les deux routeurs, avec les mêmes trois cas
 * (`emoji non supporté` → 400, `not_found` → 404, `deleted` → 409). L'acteur, lui, reste au
 * routeur : c'est la seule chose que les produits ne partagent pas (compte ForetMap contre
 * couple type/identifiant côté G&L).
 *
 * Le **corps de réponse** reste au routeur : les deux produits ne renvoient pas la même chose
 * (ForetMap enrichit et journalise, G&L répond `{ ok, reacted, emoji }`). Ce qui est mutualisé,
 * c'est la décision — pas la mise en forme.
 *
 * @returns {{status: number, error?: string, emoji?: string, comment?: object, reacted?: boolean}}
 */
async function resolveReactionToggle(commentId, actor, rawEmoji) {
  const allowedReactions = await getAllowedReactionSet();
  const emoji = normalizeEmoji(rawEmoji, allowedReactions);
  if (!emoji) return { status: 400, error: 'Emoji non supporté' };

  const toggle = await toggleContextCommentReaction(commentId, actor, emoji);
  if (toggle.error === 'not_found') return { status: 404, error: 'Commentaire introuvable' };
  if (toggle.error === 'deleted') return { status: 409, error: 'Commentaire supprimé' };
  return { status: 200, emoji, comment: toggle.comment, reacted: toggle.reacted };
}

async function loadContextCommentReactions(commentIds = [], actor = null) {
  if (!Array.isArray(commentIds) || commentIds.length === 0) return new Map();
  const inClause = buildInClauseParams(commentIds);
  const rows = await queryAll(
    `SELECT r.comment_id, r.emoji, COUNT(*) AS c,
            SUM(CASE WHEN r.reactor_user_type = ? AND r.reactor_user_id = ? THEN 1 ELSE 0 END) AS mine
       FROM context_comment_reactions r
      WHERE r.comment_id IN ${inClause.clause}
      GROUP BY r.comment_id, r.emoji
      ORDER BY r.comment_id ASC, MIN(r.created_at) ASC, r.emoji ASC`,
    [actor?.userType || '', actor?.userId || '', ...inClause.params],
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.comment_id)) map.set(row.comment_id, []);
    map.get(row.comment_id).push({
      emoji: row.emoji,
      count: Number(row.c || 0),
      reacted_by_me: Number(row.mine || 0) > 0,
    });
  }
  return map;
}

/**
 * Nom d'auteur affichable, calculé en SQL et non en JavaScript : les trois requêtes qui
 * ramènent un commentaire (liste d'un contexte, création, journal des lieux) doivent tomber
 * d'accord sur le même repli — sinon le même message change de signature selon l'écran.
 * Repli dans l'ordre : nom affiché, prénom + nom, pseudo, e-mail, identifiant brut.
 */
const AUTHOR_DISPLAY_NAME_SQL = `COALESCE(
        NULLIF(u.display_name, ''),
        NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''),
        NULLIF(u.pseudo, ''),
        NULLIF(u.email, ''),
        c.author_user_id
      )`;

/** Jointure d'auteur associée à {@link AUTHOR_DISPLAY_NAME_SQL}. */
const AUTHOR_JOIN_SQL =
  'LEFT JOIN users u ON u.id = c.author_user_id AND u.user_type = c.author_user_type';

/**
 * Insère un commentaire de contexte et renvoie la ligne créée, enrichie du nom d'auteur et
 * des URL publiques d'images.
 *
 * Écrit une seule fois pour les deux points d'entrée ForetMap : le formulaire de commentaire
 * de la console (`routes/context-comments.js`) et le « Signaler ou proposer » du plan des
 * personnels (`routes/staff-plan.js`). Les gardes (droits, module, existence du contexte,
 * anti-rafale) restent chez l'appelant : elles ne sont pas les mêmes d'une surface à l'autre.
 *
 * @param {{ contextType: string, contextId: string, body: string,
 *   actor: { userType: string, userId: string }, imagePathsJson?: string|null,
 *   commentId?: string }} params `commentId` est fourni par l'appelant qui a déjà rangé des
 *   images sous cet identifiant ; sinon il est tiré ici.
 * @returns {Promise<object>} la ligne créée
 */
async function insertContextComment({
  contextType,
  contextId,
  body,
  actor,
  imagePathsJson = null,
  commentId = '',
}) {
  const id = String(commentId || '') || crypto.randomUUID();
  await execute(
    `INSERT INTO context_comments
      (id, context_type, context_id, body, image_paths_json, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, contextType, contextId, body, imagePathsJson, actor.userType, actor.userId],
  );
  const created = await queryOne(
    `SELECT c.id, c.context_type, c.context_id, c.body, c.image_paths_json,
            c.author_user_type, c.author_user_id, c.is_deleted, c.created_at, c.updated_at,
            ${AUTHOR_DISPLAY_NAME_SQL} AS author_display_name
       FROM context_comments c
       ${AUTHOR_JOIN_SQL}
      WHERE c.id = ?
      LIMIT 1`,
    [id],
  );
  attachPublicImageUrls(created, 'context-comments');
  return created;
}

/**
 * @param {string} contextType
 * @param {string} contextId
 * @param {{ includeAuthorDisplayName?: boolean, pageSize: number, offset: number }} opts
 */
async function listContextComments(contextType, contextId, opts) {
  const { includeAuthorDisplayName = false, pageSize, offset } = opts;
  const totalRow = await queryOne(
    'SELECT COUNT(*) AS c FROM context_comments WHERE context_type = ? AND context_id = ?',
    [contextType, contextId],
  );
  const total = Number(totalRow?.c || 0);
  const authorSelect = includeAuthorDisplayName
    ? `, ${AUTHOR_DISPLAY_NAME_SQL} AS author_display_name`
    : '';
  const authorJoin = includeAuthorDisplayName ? AUTHOR_JOIN_SQL : '';
  const rows = await queryAll(
    `SELECT c.id, c.context_type, c.context_id, c.body, c.image_paths_json,
            c.author_user_type, c.author_user_id, c.is_deleted, c.created_at, c.updated_at
            ${authorSelect}
       FROM context_comments c
       ${authorJoin}
      WHERE c.context_type = ?
        AND c.context_id = ?
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?`,
    // Bornes deja validees en amont (`parsePageQuery`) : aucune injection n'etait
    // atteignable. C'est la convention « SQL toujours parametre » qui manquait, comme pour
    // le journal G&L (audit 2026-09, G5 / audit biodiversite, P8). Valeurs passees en
    // CHAINE : le protocole prepare de mysql2 encode un nombre JS en DOUBLE, que MySQL
    // refuse pour LIMIT.
    [contextType, contextId, String(pageSize), String(offset)],
  );
  const items = rows.map((row) => {
    const item = { ...row, body: Number(row.is_deleted) ? '' : row.body };
    if (Number(row.is_deleted)) {
      delete item.image_paths_json;
      item.image_urls = [];
    } else {
      attachPublicImageUrls(item, 'context-comments');
    }
    return item;
  });
  return { items, total };
}

/** Plafond d'identifiants pour le résumé groupé (badge + non-lus sans ouvrir la section). */
const CONTEXT_COMMENT_COUNTS_MAX_IDS = 100;

/**
 * Totaux et dernier commentaire par contexte — une seule requête GROUP BY pour une liste
 * (tâches, tutoriels…). Les contextes sans commentaire n'apparaissent pas dans la Map
 * (le client traite l'absence comme `{ total: 0, newestId: '' }`).
 *
 * **`newestId` est une chaîne opaque, et le tri se fait sur la date.** `context_comments.id`
 * porte un UUID (`varchar(64)`) : `MAX(id)` rendait le plus grand identifiant *au sens
 * alphabétique*, sans rapport avec le plus récent, et `Number(uuid)` valait `NaN` — replié en
 * `0` par le `||`. Le résumé annonçait donc toujours `newestId: 0`, et la détection des
 * non-lus, qui compare cette valeur au curseur de lecture, ne se déclenchait jamais.
 *
 * Le client n'a pas besoin d'un ordre : il lui suffit de savoir si le dernier commentaire a
 * **changé** depuis sa dernière lecture. La valeur est donc traitée comme un marqueur opaque,
 * comparé par égalité (`src/utils/contextCommentsHelpers.js`).
 *
 * Le tri suppose un `created_at` à la **milliseconde** (migration 278). Il était à la seconde,
 * et le départage retombait alors sur `id DESC`, c'est-à-dire sur un UUID tiré au hasard : dans
 * un échange vif, le marqueur pouvait désigner l'avant-dernier message et ne pas bouger à
 * l'arrivée du dernier. Mesuré : quatre exécutions sur six du test de cette route.
 *
 * `id DESC` reste en second critère pour les lignes **antérieures** à la migration, toutes
 * horodatées `.000` : leur ordre relatif est arbitraire mais au moins stable d'un appel à
 * l'autre.
 *
 * @param {string} contextType
 * @param {Array<string|number>} contextIds
 * @returns {Promise<Map<string, { total: number, newestId: string }>>}
 */
async function countContextCommentsByContextIds(contextType, contextIds = []) {
  const unique = [
    ...new Set(
      (Array.isArray(contextIds) ? contextIds : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    ),
  ].slice(0, CONTEXT_COMMENT_COUNTS_MAX_IDS);
  const map = new Map();
  if (!contextType || unique.length === 0) return map;
  const inClause = buildInClauseParams(unique);
  // `SUBSTRING_INDEX(GROUP_CONCAT(... ORDER BY ...), ',', 1)` = « le premier de la liste
  // triée », c'est-à-dire l'id du commentaire le plus récent. La troncature éventuelle de
  // `GROUP_CONCAT` (group_concat_max_len) porte sur la fin de la liste : le premier élément,
  // le seul qu'on lise, est toujours présent.
  const rows = await queryAll(
    `SELECT context_id, COUNT(*) AS total,
            SUBSTRING_INDEX(
              GROUP_CONCAT(id ORDER BY created_at DESC, id DESC SEPARATOR ','), ',', 1
            ) AS newest_id
       FROM context_comments
      WHERE context_type = ?
        AND context_id IN ${inClause.clause}
      GROUP BY context_id`,
    [contextType, ...inClause.params],
  );
  for (const row of rows) {
    const key = String(row.context_id ?? '');
    if (!key) continue;
    map.set(key, {
      total: Number(row.total || 0),
      newestId: String(row.newest_id ?? ''),
    });
  }
  return map;
}

/**
 * @param {string} commentId
 * @param {{ userType: string, userId: string }} actor
 * @param {string} emoji
 */
async function toggleContextCommentReaction(commentId, actor, emoji) {
  const comment = await queryOne(
    'SELECT id, context_type, context_id, is_deleted FROM context_comments WHERE id = ? LIMIT 1',
    [commentId],
  );
  if (!comment) return { error: 'not_found', status: 404 };
  if (Number(comment.is_deleted)) return { error: 'deleted', status: 409 };

  const existing = await queryOne(
    `SELECT comment_id FROM context_comment_reactions
      WHERE comment_id = ? AND reactor_user_type = ? AND reactor_user_id = ? AND emoji = ? LIMIT 1`,
    [comment.id, actor.userType, actor.userId, emoji],
  );

  let reacted = false;
  if (existing) {
    await execute(
      `DELETE FROM context_comment_reactions
        WHERE comment_id = ? AND reactor_user_type = ? AND reactor_user_id = ? AND emoji = ?`,
      [comment.id, actor.userType, actor.userId, emoji],
    );
  } else {
    await execute(
      `INSERT INTO context_comment_reactions (comment_id, reactor_user_type, reactor_user_id, emoji)
       VALUES (?, ?, ?, ?)`,
      [comment.id, actor.userType, actor.userId, emoji],
    );
    reacted = true;
  }
  return {
    ok: true,
    reacted,
    emoji,
    comment,
  };
}

async function softDeleteContextComment(commentId) {
  const comment = await queryOne(
    'SELECT id, context_type, context_id, author_user_type, author_user_id, is_deleted, image_paths_json FROM context_comments WHERE id = ? LIMIT 1',
    [commentId],
  );
  if (!comment) return { error: 'not_found', status: 404 };
  if (Number(comment.is_deleted)) return { ok: true, already_deleted: true, comment };
  deleteUserContentImagesFromJson(comment.image_paths_json, 'context-comments');
  await execute(
    'UPDATE context_comments SET is_deleted = 1, body = ?, image_paths_json = NULL, updated_at = NOW() WHERE id = ?',
    ['[commentaire supprimé]', comment.id],
  );
  return { ok: true, comment };
}

module.exports = {
  AUTO_BODY_WITH_PHOTOS,
  AUTHOR_DISPLAY_NAME_SQL,
  AUTHOR_JOIN_SQL,
  CONTEXT_COMMENT_COUNTS_MAX_IDS,
  CONTEXT_COMMENT_LIMITS,
  insertContextComment,
  makeContextTypeNormalizer,
  resolveReactionToggle,
  getAllowedReactionSet,
  normalizeEmoji,
  validateImagesPayload,
  persistUserContentImages,
  loadContextCommentReactions,
  listContextComments,
  countContextCommentsByContextIds,
  toggleContextCommentReaction,
  softDeleteContextComment,
};
