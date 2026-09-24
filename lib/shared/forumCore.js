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

/**
 * Noyau serveur du forum, commun à ForetMap (`routes/forum.js`) et G&L (`routes/gl/forum.js`).
 *
 * Ce qui varie d'un produit à l'autre est décrit par un **descripteur** ({@link FORETMAP_FORUM},
 * {@link GL_FORUM}) : noms de tables, préfixe d'upload, nature des identifiants (UUID tiré ici
 * contre AUTO_INCREMENT), bornes de saisie et calcul du nom d'auteur. Les gardes propres à
 * chaque produit (périmètre de groupe, profil lecture seule, invité G&L, permission RBAC)
 * restent dans les routeurs : elles ne se ressemblent pas.
 *
 * Les noms de tables et de colonnes interpolés viennent **exclusivement** des descripteurs
 * figés ci-dessous, jamais d'une entrée utilisateur.
 */

const AUTO_BODY_WITH_PHOTOS = '(Photo)';
const DELETED_POST_BODY = '[message supprimé]';
const REPORT_EXCERPT_LEN = 200;
const REPORTS_MAX_PAGE_SIZE = 100;

const REPORT_STATUSES = Object.freeze(['open', 'resolved', 'dismissed']);
const REPORT_RESOLUTION_STATUSES = Object.freeze(['resolved', 'dismissed']);

const FORUM_REPORT_LIMITS = Object.freeze({ MIN_REASON: 3, MAX_REASON: 500 });

/** Nom affiché d'un compte ForetMap : même repli que les commentaires contextuels. */
function foretmapDisplayName(prefix, typeExpr, idExpr) {
  const u = `${prefix}_u`;
  return {
    select: `COALESCE(
        NULLIF(${u}.display_name, ''),
        NULLIF(CONCAT(COALESCE(${u}.first_name, ''), ' ', COALESCE(${u}.last_name, '')), ''),
        NULLIF(${u}.pseudo, ''),
        NULLIF(${u}.email, ''),
        ${idExpr}
      )`,
    join: `LEFT JOIN users ${u} ON ${u}.id = ${idExpr} AND ${u}.user_type = ${typeExpr}`,
  };
}

/** Nom affiché G&L : pseudo du joueur ou nom du MJ — jamais l'e-mail du staff. */
function glDisplayName(prefix, typeExpr, idExpr) {
  const pl = `${prefix}_pl`;
  const ad = `${prefix}_ad`;
  return {
    select: `COALESCE(
        CASE ${typeExpr}
          WHEN 'gl_player' THEN NULLIF(${pl}.pseudo, '')
          WHEN 'gl_admin' THEN NULLIF(${ad}.display_name, '')
        END,
        CASE ${typeExpr} WHEN 'gl_admin' THEN 'Maître du jeu' ELSE 'Joueur' END
      )`,
    join: `LEFT JOIN gl_players ${pl}
            ON ${typeExpr} = 'gl_player' AND ${pl}.id = CAST(${idExpr} AS UNSIGNED)
          LEFT JOIN gl_admins ${ad}
            ON ${typeExpr} = 'gl_admin' AND ${ad}.id = CAST(${idExpr} AS UNSIGNED)`,
  };
}

const FORETMAP_FORUM = Object.freeze({
  key: 'foret',
  threadsTable: 'forum_threads',
  postsTable: 'forum_posts',
  reactionsTable: 'forum_post_reactions',
  reportsTable: 'forum_reports',
  uploadPrefix: 'forum-posts',
  idKind: 'uuid',
  postsHaveUpdatedAt: true,
  threadsSoftDeleted: false,
  limits: Object.freeze({ MIN_TITLE: 4, MAX_TITLE: 180, MIN_BODY: 3, MAX_BODY: 4000 }),
  displayName: foretmapDisplayName,
});

const GL_FORUM = Object.freeze({
  key: 'gl',
  threadsTable: 'gl_forum_threads',
  postsTable: 'gl_forum_posts',
  reactionsTable: 'gl_forum_post_reactions',
  reportsTable: 'gl_forum_reports',
  uploadPrefix: 'gl-forum-posts',
  idKind: 'auto',
  postsHaveUpdatedAt: false,
  threadsSoftDeleted: true,
  limits: Object.freeze({ MIN_TITLE: 3, MAX_TITLE: 200, MIN_BODY: 2, MAX_BODY: 4000 }),
  displayName: glDisplayName,
});

function actorOwns(row, actor, typeKey = 'author_user_type', idKey = 'author_user_id') {
  if (!row || !actor) return false;
  return (
    String(row[typeKey] || '') === String(actor.userType || '') &&
    String(row[idKey] || '') === String(actor.userId || '')
  );
}

/** Filtre SQL « sujet visible » (G&L supprime ses sujets en douceur, pas ForetMap). */
function threadVisibleSql(desc, alias) {
  return desc.threadsSoftDeleted ? `${alias}.is_deleted = 0` : '1 = 1';
}

/**
 * Valide le titre d'un nouveau sujet.
 * @returns {{ error?: string, title?: string }}
 */
function resolveThreadTitle(desc, rawTitle) {
  const { MIN_TITLE, MAX_TITLE } = desc.limits;
  const title = String(rawTitle ?? '').trim();
  if (!title || title.length < MIN_TITLE || title.length > MAX_TITLE) {
    return { error: `Titre invalide (${MIN_TITLE}-${MAX_TITLE} caractères)` };
  }
  return { title };
}

/**
 * Valide le couple texte + images d'un message. Un message peut n'être qu'une photo : le texte
 * est alors remplacé par {@link AUTO_BODY_WITH_PHOTOS}.
 * @returns {{ error?: string, body?: string, images?: Array }}
 */
function resolvePostPayload(desc, rawBody, rawImages) {
  const { MIN_BODY, MAX_BODY } = desc.limits;
  const imagesCheck = validateImagesPayload(rawImages);
  if (imagesCheck.error) return { error: imagesCheck.error };
  const images = imagesCheck.images || [];
  let body = String(rawBody ?? '').trim();
  if (images.length > 0 && !body) body = AUTO_BODY_WITH_PHOTOS;
  if (!body || body.length < MIN_BODY || body.length > MAX_BODY) {
    return {
      error:
        images.length === 0
          ? `Message invalide (${MIN_BODY}-${MAX_BODY} caractères), ou ajoute au moins une image`
          : `Message invalide (${MIN_BODY}-${MAX_BODY} caractères)`,
    };
  }
  return { body, images };
}

/**
 * Valide le nouveau texte d'un message modifié. Les images ne se modifient pas ; un message
 * qui en porte peut retomber sur {@link AUTO_BODY_WITH_PHOTOS} si on vide son texte.
 */
function resolveEditBody(desc, rawBody, { hasImages = false } = {}) {
  const { MIN_BODY, MAX_BODY } = desc.limits;
  let body = String(rawBody ?? '').trim();
  if (hasImages && !body) body = AUTO_BODY_WITH_PHOTOS;
  if (!body || body.length < MIN_BODY || body.length > MAX_BODY) {
    return { error: `Message invalide (${MIN_BODY}-${MAX_BODY} caractères)` };
  }
  return { body };
}

function resolveReportReason(rawReason) {
  const { MIN_REASON, MAX_REASON } = FORUM_REPORT_LIMITS;
  const reason = String(rawReason ?? '').trim();
  if (!reason || reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return { error: `Motif invalide (${MIN_REASON}-${MAX_REASON} caractères)` };
  }
  return { reason };
}

/**
 * Règles d'édition, identiques des deux côtés : seul l'auteur modifie son message, jamais un
 * message supprimé, et pas dans un sujet verrouillé — sauf pour un modérateur G&L, qui peut
 * déjà répondre dans un sujet verrouillé (`moderatorBypassLock`).
 * @returns {{ status: number, error: string } | null}
 */
function checkPostEditable({ post, threadLocked, actor, moderatorBypassLock = false }) {
  if (!post) return { status: 404, error: 'Message introuvable' };
  if (!actorOwns(post, actor)) {
    return { status: 403, error: 'Seul l’auteur peut modifier son message' };
  }
  if (Number(post.is_deleted)) return { status: 409, error: 'Message supprimé' };
  if (threadLocked && !moderatorBypassLock) return { status: 409, error: 'Sujet verrouillé' };
  return null;
}

/**
 * Colonnes calculées de la liste des sujets : nombre de messages **non supprimés** et date du
 * dernier message **d'autrui** (pastille « non lu » par sujet, sans s'allumer sur ses propres
 * messages). Renvoie le fragment SELECT et ses paramètres, à placer avant ceux du WHERE.
 */
function threadListStatsSql(desc, alias, actor) {
  const p = desc.postsTable;
  return {
    select: `(SELECT COUNT(*) FROM ${p} sp WHERE sp.thread_id = ${alias}.id AND sp.is_deleted = 0) AS posts_count,
            (SELECT MAX(op.created_at) FROM ${p} op
              WHERE op.thread_id = ${alias}.id AND op.is_deleted = 0
                AND NOT (op.author_user_type = ? AND op.author_user_id = ?)) AS last_other_post_at`,
    params: [String(actor?.userType || ''), String(actor?.userId || '')],
  };
}

/** Normalise une ligne de message pour l'API (message supprimé : ni texte ni images). */
function sanitizePostRow(desc, row) {
  const item = { ...row, body: Number(row.is_deleted) ? '' : row.body };
  if (Number(row.is_deleted)) {
    delete item.image_paths_json;
    item.image_urls = [];
  } else {
    attachPublicImageUrls(item, desc.uploadPrefix);
  }
  return item;
}

async function loadPostReactions(desc, postIds = [], actor = null) {
  if (!Array.isArray(postIds) || postIds.length === 0) return new Map();
  const inClause = buildInClauseParams(postIds);
  const rows = await queryAll(
    `SELECT r.post_id, r.emoji, COUNT(*) AS c,
            SUM(CASE WHEN r.reactor_user_type = ? AND r.reactor_user_id = ? THEN 1 ELSE 0 END) AS mine
       FROM ${desc.reactionsTable} r
      WHERE r.post_id IN ${inClause.clause}
      GROUP BY r.post_id, r.emoji
      ORDER BY r.post_id ASC, MIN(r.created_at) ASC, r.emoji ASC`,
    [String(actor?.userType || ''), String(actor?.userId || ''), ...inClause.params],
  );
  const map = new Map();
  for (const row of rows) {
    const key = String(row.post_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      emoji: row.emoji,
      count: Number(row.c || 0),
      reacted_by_me: Number(row.mine || 0) > 0,
    });
  }
  return map;
}

/**
 * Charge une page de messages d'un sujet, nettoyés et enrichis de leurs réactions.
 * @returns {Promise<{ posts: object[], total: number }>}
 */
async function listThreadPosts(desc, threadId, { actor, limit, offset }) {
  const author = desc.displayName('pa', 'p.author_user_type', 'p.author_user_id');
  const updatedCol = desc.postsHaveUpdatedAt ? ', p.updated_at' : '';
  const countRow = await queryOne(
    `SELECT COUNT(*) AS c FROM ${desc.postsTable} WHERE thread_id = ?`,
    [threadId],
  );
  const rows = await queryAll(
    `SELECT p.id, p.thread_id, p.body, p.image_paths_json, p.author_user_type, p.author_user_id,
            p.is_deleted, p.edited_at, p.created_at${updatedCol},
            ${author.select} AS author_display_name
       FROM ${desc.postsTable} p
       ${author.join}
      WHERE p.thread_id = ?
      ORDER BY p.created_at ASC, p.id ASC
      LIMIT ? OFFSET ?`,
    // En chaîne : le protocole préparé de mysql2 encoderait un nombre JS en DOUBLE, refusé
    // par MySQL pour LIMIT.
    [threadId, String(limit), String(offset)],
  );
  const sanitized = rows.map((row) => sanitizePostRow(desc, row));
  const reactions = await loadPostReactions(
    desc,
    sanitized.map((p) => p.id),
    actor,
  );
  return {
    posts: sanitized.map((p) => ({ ...p, reactions: reactions.get(String(p.id)) || [] })),
    total: Number(countRow?.c || 0),
  };
}

/** Recharge un message (nom d'auteur, URL d'images, réactions). */
async function loadPostForApi(desc, postId, actor = null) {
  const author = desc.displayName('pa', 'p.author_user_type', 'p.author_user_id');
  const updatedCol = desc.postsHaveUpdatedAt ? ', p.updated_at' : '';
  const row = await queryOne(
    `SELECT p.id, p.thread_id, p.body, p.image_paths_json, p.author_user_type, p.author_user_id,
            p.is_deleted, p.edited_at, p.created_at${updatedCol},
            ${author.select} AS author_display_name
       FROM ${desc.postsTable} p
       ${author.join}
      WHERE p.id = ?
      LIMIT 1`,
    [postId],
  );
  if (!row) return null;
  const item = sanitizePostRow(desc, row);
  const reactions = await loadPostReactions(desc, [item.id], actor);
  item.reactions = reactions.get(String(item.id)) || [];
  return item;
}

/** Message + état de son sujet, pour les gardes des routeurs. */
async function loadPostWithThread(desc, postId) {
  return queryOne(
    `SELECT p.id, p.thread_id, p.author_user_type, p.author_user_id, p.is_deleted,
            p.image_paths_json, t.is_locked AS thread_is_locked, t.title AS thread_title
            ${desc.key === 'foret' ? ', t.group_id' : ''}
       FROM ${desc.postsTable} p
       JOIN ${desc.threadsTable} t ON t.id = p.thread_id
      WHERE p.id = ? AND ${threadVisibleSql(desc, 't')}
      LIMIT 1`,
    [postId],
  );
}

/**
 * Insère un message et range ses images. ForetMap tire l'UUID d'abord (les images sont rangées
 * sous l'identifiant avant l'INSERT) ; G&L insère d'abord pour obtenir l'AUTO_INCREMENT, puis
 * range les images et complète la ligne.
 * @returns {Promise<{ error?: string, postId?: string|number }>}
 */
async function insertPost(desc, { threadId, body, images = [], actor }) {
  if (desc.idKind === 'uuid') {
    const postId = crypto.randomUUID();
    let pathsJson = null;
    if (images.length > 0) {
      const persisted = await persistUserContentImages(desc.uploadPrefix, postId, images);
      if (persisted.error) return { error: persisted.error };
      pathsJson = persisted.pathsJson;
    }
    await execute(
      `INSERT INTO ${desc.postsTable}
        (id, thread_id, body, image_paths_json, author_user_type, author_user_id, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [postId, threadId, body, pathsJson, actor.userType, actor.userId],
    );
    return { postId };
  }
  const result = await execute(
    `INSERT INTO ${desc.postsTable}
      (thread_id, body, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, ?, 0)`,
    [threadId, body, actor.userType, actor.userId],
  );
  const postId = Number(result.insertId);
  if (images.length > 0) {
    const persisted = await persistUserContentImages(desc.uploadPrefix, postId, images);
    if (persisted.error) {
      await execute(`DELETE FROM ${desc.postsTable} WHERE id = ?`, [postId]);
      return { error: persisted.error };
    }
    await execute(`UPDATE ${desc.postsTable} SET image_paths_json = ? WHERE id = ?`, [
      persisted.pathsJson,
      postId,
    ]);
  }
  return { postId };
}

/**
 * Crée un sujet et son premier message.
 * @param {{ title: string, body: string, images?: Array, actor: object, groupId?: string|null }} params
 * @returns {Promise<{ error?: string, threadId?: string|number, postId?: string|number }>}
 */
async function insertThreadWithFirstPost(
  desc,
  { title, body, images = [], actor, groupId = null },
) {
  let threadId;
  if (desc.idKind === 'uuid') {
    threadId = crypto.randomUUID();
    await execute(
      `INSERT INTO ${desc.threadsTable}
        (id, group_id, title, author_user_type, author_user_id, is_locked, is_pinned, last_post_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, NOW())`,
      [threadId, groupId, title, actor.userType, actor.userId],
    );
  } else {
    const result = await execute(
      `INSERT INTO ${desc.threadsTable}
        (title, author_user_type, author_user_id, is_locked, is_pinned, last_post_at)
       VALUES (?, ?, ?, 0, 0, NOW())`,
      [title, actor.userType, actor.userId],
    );
    threadId = Number(result.insertId);
  }
  const post = await insertPost(desc, { threadId, body, images, actor });
  if (post.error) {
    await execute(`DELETE FROM ${desc.threadsTable} WHERE id = ?`, [threadId]);
    return { error: post.error };
  }
  return { threadId, postId: post.postId };
}

async function touchThreadLastPost(desc, threadId) {
  await execute(
    `UPDATE ${desc.threadsTable} SET last_post_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [threadId],
  );
}

async function editPostBody(desc, postId, body) {
  const updatedSql = desc.postsHaveUpdatedAt ? ', updated_at = NOW()' : '';
  await execute(
    `UPDATE ${desc.postsTable} SET body = ?, edited_at = NOW()${updatedSql} WHERE id = ?`,
    [body, postId],
  );
}

async function setThreadFlag(desc, threadId, column, value) {
  if (column !== 'is_locked' && column !== 'is_pinned') {
    throw new Error(`Colonne de sujet non modifiable : ${column}`);
  }
  await execute(`UPDATE ${desc.threadsTable} SET ${column} = ?, updated_at = NOW() WHERE id = ?`, [
    value ? 1 : 0,
    threadId,
  ]);
}

/**
 * Suppression douce d'un message : texte remplacé, images effacées du disque, date du dernier
 * message du sujet recalculée, et signalements encore ouverts sur ce message classés
 * « traités » (le contenu signalé n'existe plus).
 */
async function softDeletePost(desc, post, actor) {
  deleteUserContentImagesFromJson(post.image_paths_json, desc.uploadPrefix);
  const updatedSql = desc.postsHaveUpdatedAt ? ', updated_at = NOW()' : '';
  await execute(
    `UPDATE ${desc.postsTable}
        SET is_deleted = 1, body = ?, image_paths_json = NULL${updatedSql}
      WHERE id = ?`,
    [DELETED_POST_BODY, post.id],
  );
  await execute(
    `UPDATE ${desc.threadsTable}
        SET last_post_at = COALESCE(
              (SELECT MAX(created_at) FROM ${desc.postsTable} WHERE thread_id = ? AND is_deleted = 0),
              created_at
            ),
            updated_at = NOW()
      WHERE id = ?`,
    [post.thread_id, post.thread_id],
  );
  await execute(
    `UPDATE ${desc.reportsTable}
        SET status = 'resolved', resolved_at = NOW(), resolved_by_user_type = ?, resolved_by_user_id = ?
      WHERE post_id = ? AND status = 'open'`,
    [actor?.userType || null, actor?.userId || null, post.id],
  );
}

/**
 * Bascule une réaction (ajout si absente, retrait sinon). Le message doit avoir été chargé et
 * contrôlé par l'appelant (existence, périmètre, suppression).
 * @returns {Promise<{ status: number, error?: string, emoji?: string, reacted?: boolean }>}
 */
async function togglePostReaction(desc, postId, actor, rawEmoji) {
  const allowed = await getAllowedReactionSet();
  const emoji = normalizeEmoji(rawEmoji, allowed);
  if (!emoji) return { status: 400, error: 'Emoji non supporté' };
  const params = [postId, actor.userType, actor.userId, emoji];
  const existing = await queryOne(
    `SELECT post_id FROM ${desc.reactionsTable}
      WHERE post_id = ? AND reactor_user_type = ? AND reactor_user_id = ? AND emoji = ?
      LIMIT 1`,
    params,
  );
  if (existing) {
    await execute(
      `DELETE FROM ${desc.reactionsTable}
        WHERE post_id = ? AND reactor_user_type = ? AND reactor_user_id = ? AND emoji = ?`,
      params,
    );
    return { status: 200, emoji, reacted: false };
  }
  await execute(
    `INSERT INTO ${desc.reactionsTable} (post_id, reactor_user_type, reactor_user_id, emoji)
     VALUES (?, ?, ?, ?)`,
    params,
  );
  return { status: 200, emoji, reacted: true };
}

/**
 * Enregistre un signalement (un seul signalement ouvert par personne et par message).
 * @returns {Promise<{ status: number, error?: string, reportId?: number }>}
 */
async function createPostReport(desc, postId, actor, reason) {
  const duplicate = await queryOne(
    `SELECT id FROM ${desc.reportsTable}
      WHERE post_id = ? AND reporter_user_type = ? AND reporter_user_id = ? AND status = 'open'
      LIMIT 1`,
    [postId, actor.userType, actor.userId],
  );
  if (duplicate) return { status: 409, error: 'Signalement déjà envoyé pour ce message' };
  const insert = await execute(
    `INSERT INTO ${desc.reportsTable} (post_id, reporter_user_type, reporter_user_id, reason, status)
     VALUES (?, ?, ?, ?, 'open')`,
    [postId, actor.userType, actor.userId, reason],
  );
  return { status: 201, reportId: Number(insert.insertId) };
}

function normalizeReportStatusFilter(value) {
  const status = String(value ?? 'open')
    .trim()
    .toLowerCase();
  if (status === 'all') return 'all';
  return REPORT_STATUSES.includes(status) ? status : 'open';
}

/**
 * Liste des signalements pour le panneau de modération : motif, extrait du message, sujet,
 * auteur du message et personne qui a signalé.
 * @param {{ status?: string, groupIds?: string[]|null, limit?: number, offset?: number }} opts
 *   `groupIds` (ForetMap) restreint au périmètre de groupe du modérateur ; `null` = sans filtre.
 */
async function listPostReports(desc, opts = {}) {
  const status = normalizeReportStatusFilter(opts.status);
  const limit = Math.min(REPORTS_MAX_PAGE_SIZE, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const where = [threadVisibleSql(desc, 't')];
  const params = [];
  if (status !== 'all') {
    where.push('r.status = ?');
    params.push(status);
  }
  if (Array.isArray(opts.groupIds)) {
    if (opts.groupIds.length === 0) return { items: [], total: 0, status };
    const inClause = buildInClauseParams(opts.groupIds);
    where.push(`t.group_id IN ${inClause.clause}`);
    params.push(...inClause.params);
  }
  const whereSql = where.join(' AND ');
  const fromSql = `FROM ${desc.reportsTable} r
       JOIN ${desc.postsTable} p ON p.id = r.post_id
       JOIN ${desc.threadsTable} t ON t.id = p.thread_id`;
  const totalRow = await queryOne(`SELECT COUNT(*) AS c ${fromSql} WHERE ${whereSql}`, params);
  const author = desc.displayName('ra', 'p.author_user_type', 'p.author_user_id');
  const reporter = desc.displayName('rr', 'r.reporter_user_type', 'r.reporter_user_id');
  const rows = await queryAll(
    `SELECT r.id, r.post_id, r.reason, r.status, r.created_at, r.resolved_at,
            r.reporter_user_type, r.reporter_user_id,
            p.thread_id, p.is_deleted AS post_is_deleted,
            p.author_user_type AS post_author_user_type, p.author_user_id AS post_author_user_id,
            LEFT(p.body, ${REPORT_EXCERPT_LEN}) AS post_excerpt,
            t.title AS thread_title,
            ${author.select} AS post_author_display_name,
            ${reporter.select} AS reporter_display_name
       ${fromSql}
       ${author.join}
       ${reporter.join}
      WHERE ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)],
  );
  return {
    items: rows.map((row) => ({
      ...row,
      post_excerpt: Number(row.post_is_deleted) ? '' : row.post_excerpt,
    })),
    total: Number(totalRow?.c || 0),
    status,
  };
}

/** Signalement + sujet (pour le contrôle de périmètre de groupe ForetMap). */
async function loadReport(desc, reportId) {
  return queryOne(
    `SELECT r.id, r.post_id, r.status, p.thread_id
            ${desc.key === 'foret' ? ', t.group_id' : ''}
       FROM ${desc.reportsTable} r
       JOIN ${desc.postsTable} p ON p.id = r.post_id
       JOIN ${desc.threadsTable} t ON t.id = p.thread_id
      WHERE r.id = ?
      LIMIT 1`,
    [reportId],
  );
}

/**
 * Tranche un signalement : `resolved` (traité) ou `dismissed` (classé sans suite). Rouvrir
 * (`open`) efface la trace de décision.
 * @returns {Promise<{ status: number, error?: string }>}
 */
async function resolvePostReport(desc, reportId, rawStatus, actor) {
  const status = String(rawStatus ?? '')
    .trim()
    .toLowerCase();
  if (!REPORT_STATUSES.includes(status)) {
    return { status: 400, error: 'Statut invalide (open, resolved ou dismissed)' };
  }
  if (status === 'open') {
    await execute(
      `UPDATE ${desc.reportsTable}
          SET status = 'open', resolved_at = NULL, resolved_by_user_type = NULL, resolved_by_user_id = NULL
        WHERE id = ?`,
      [reportId],
    );
  } else {
    await execute(
      `UPDATE ${desc.reportsTable}
          SET status = ?, resolved_at = NOW(), resolved_by_user_type = ?, resolved_by_user_id = ?
        WHERE id = ?`,
      [status, actor.userType, actor.userId, reportId],
    );
  }
  return { status: 200 };
}

module.exports = {
  AUTO_BODY_WITH_PHOTOS,
  DELETED_POST_BODY,
  FORETMAP_FORUM,
  GL_FORUM,
  FORUM_REPORT_LIMITS,
  REPORT_STATUSES,
  REPORT_RESOLUTION_STATUSES,
  actorOwns,
  checkPostEditable,
  createPostReport,
  editPostBody,
  insertPost,
  insertThreadWithFirstPost,
  listPostReports,
  listThreadPosts,
  loadPostForApi,
  loadPostReactions,
  loadPostWithThread,
  loadReport,
  normalizeReportStatusFilter,
  resolveEditBody,
  resolvePostPayload,
  resolveReportReason,
  resolveThreadTitle,
  resolvePostReport,
  sanitizePostRow,
  setThreadFlag,
  softDeletePost,
  threadListStatsSql,
  threadVisibleSql,
  togglePostReaction,
  touchThreadLastPost,
};
