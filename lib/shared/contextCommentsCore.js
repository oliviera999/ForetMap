'use strict';

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
    ? `, COALESCE(
        NULLIF(u.display_name, ''),
        NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''),
        NULLIF(u.pseudo, ''),
        NULLIF(u.email, ''),
        c.author_user_id
      ) AS author_display_name`
    : '';
  const authorJoin = includeAuthorDisplayName
    ? 'LEFT JOIN users u ON u.id = c.author_user_id AND u.user_type = c.author_user_type'
    : '';
  const rows = await queryAll(
    `SELECT c.id, c.context_type, c.context_id, c.body, c.image_paths_json,
            c.author_user_type, c.author_user_id, c.is_deleted, c.created_at, c.updated_at
            ${authorSelect}
       FROM context_comments c
       ${authorJoin}
      WHERE c.context_type = ?
        AND c.context_id = ?
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${pageSize} OFFSET ${offset}`,
    [contextType, contextId],
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
  CONTEXT_COMMENT_LIMITS,
  makeContextTypeNormalizer,
  resolveReactionToggle,
  getAllowedReactionSet,
  normalizeEmoji,
  validateImagesPayload,
  persistUserContentImages,
  loadContextCommentReactions,
  listContextComments,
  toggleContextCommentReaction,
  softDeleteContextComment,
};
