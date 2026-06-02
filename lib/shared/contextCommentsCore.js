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
  getAllowedReactionSet,
  normalizeEmoji,
  validateImagesPayload,
  persistUserContentImages,
  loadContextCommentReactions,
  listContextComments,
  toggleContextCommentReaction,
  softDeleteContextComment,
};
