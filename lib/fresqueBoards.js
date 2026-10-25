'use strict';

/**
 * Plateaux de fresque (migration 321) : création idempotente du plateau actif d'un propriétaire
 * (élève ou équipe), lecture avec droits, enregistrement strict avec verrou optimiste, journal
 * des gestes calculé côté serveur, détection de la fin et badge, vue prof en lecture seule.
 *
 * Toute la logique métier (validation, classement, résumé, journal) vient du cœur partagé
 * `lib/shared/fresqueCore.js` ; ce module ne fait que la persistance et les droits.
 *
 * Droits (cahier des charges § 4.9–4.10) :
 *  - propriétaire (`user:<id>`) ou membre de l'équipe (`team:<groupId>`, groupe `kind = 'team'`)
 *    → lecture et écriture ;
 *  - prof dans son périmètre (`stats.read.group` + élève ou équipe dans ses groupes, ou
 *    `stats.read.all` / profil global) → lecture seule ;
 *  - tout autre compte → 403, sans révéler l'existence du plateau (404 si introuvable).
 */

const crypto = require('node:crypto');
const { queryAll, queryOne, execute } = require('../database');
const core = require('./shared/fresqueCore');
const { getFresqueDeck, getFresqueDeckModel } = require('./fresqueDecks');
const { claimEditRevision, releaseEditRevision } = require('./editRevision');
const { awardReward, describeReward, announceableRewards } = require('./rewards');
const {
  canBypassGroupScope,
  canAccessStudentId,
  isGroupInManageScope,
  getScopedStudentIds,
  getUserAccessibleGroupIds,
} = require('./groupScope');
const { hasPermission } = require('../middleware/requireTeacher');

/** Badge attribué à la fin, par jeu (aucun badge pour un jeu absent d'ici). */
const DECK_REWARD_KEYS = Object.freeze({
  'climat-junior-fr-v7-5': 'fresque_climat_junior',
});

const BOARD_STATUSES = Object.freeze(['in_progress', 'completed', 'archived']);
const MAX_EVENTS_PER_SAVE = 200;
const MAX_EVENTS_PAGE = 200;

const BOARD_COLS = `b.id, b.deck_id, b.owner_type, b.owner_user_id, b.owner_group_id, b.owner_key,
  b.active_owner_key, b.level, b.step, b.lot_reached, b.cards_placed, b.links_count,
  b.links_found, b.hints_used, b.status, b.edit_revision, b.created_at, b.updated_at,
  b.completed_at`;
const OWNER_JOINS = `LEFT JOIN users u ON u.id = b.owner_user_id
  LEFT JOIN \`groups\` g ON g.id = b.owner_group_id`;
const OWNER_LABEL_COLS = `u.first_name AS owner_first_name, u.last_name AS owner_last_name,
  u.display_name AS owner_display_name, u.pseudo AS owner_pseudo, g.name AS owner_group_name`;

class FresqueError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'FresqueError';
    this.status = status;
    this.extra = extra;
  }
}

function ownerKeyFor(ownerType, id) {
  return `${ownerType}:${id}`;
}

function toIso(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseState(raw) {
  try {
    return core.migrateState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function ownerLabelOf(row) {
  if (row.owner_type === 'team') return row.owner_group_name || 'Équipe';
  const display = String(row.owner_display_name || '').trim();
  if (display) return display;
  const full = `${row.owner_first_name || ''} ${row.owner_last_name || ''}`.trim();
  return full || row.owner_pseudo || 'Élève';
}

function serializeBoard(row, { state = null, access = null } = {}) {
  return {
    id: row.id,
    deckId: row.deck_id,
    ownerType: row.owner_type,
    ownerUserId: row.owner_user_id || null,
    ownerGroupId: row.owner_group_id || null,
    ownerLabel: ownerLabelOf(row),
    level: row.level,
    step: row.step,
    lotReached: Number(row.lot_reached) || 1,
    cardsPlaced: Number(row.cards_placed) || 0,
    linksCount: Number(row.links_count) || 0,
    linksFound: Number(row.links_found) || 0,
    hintsUsed: Number(row.hints_used) || 0,
    status: row.status,
    active: row.active_owner_key != null,
    revision: Number(row.edit_revision) || 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: toIso(row.completed_at),
    ...(state ? { state } : {}),
    ...(access ? { readOnly: !access.canWrite } : {}),
  };
}

async function loadBoardRow(boardId, { withState = false } = {}) {
  const id = String(boardId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const cols = withState ? `${BOARD_COLS}, b.state_json` : BOARD_COLS;
  return queryOne(
    `SELECT ${cols}, ${OWNER_LABEL_COLS} FROM fresque_boards b ${OWNER_JOINS} WHERE b.id = ? LIMIT 1`,
    [id],
  );
}

/** Groupe « équipe » actif dont le compte est membre. */
async function isTeamMember(userId, groupId) {
  const row = await queryOne(
    `SELECT 1 AS ok FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
      WHERE gm.group_id = ? AND gm.user_id = ? AND g.kind = 'team' AND g.is_active = 1
      LIMIT 1`,
    [String(groupId || ''), String(userId || '')],
  );
  return !!row;
}

async function listTeamGroupIds(userId) {
  const rows = await queryAll(
    `SELECT g.id FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
      WHERE gm.user_id = ? AND g.kind = 'team' AND g.is_active = 1
      ORDER BY g.name ASC`,
    [String(userId || '')],
  );
  return rows.map((r) => r.id);
}

function authUserId(auth) {
  return String(auth?.userId || '').trim();
}

/**
 * Droits d'un compte sur un plateau.
 * @returns {Promise<{ canRead: boolean, canWrite: boolean, reason: string }>}
 */
async function resolveBoardAccess(auth, row) {
  const userId = authUserId(auth);
  if (!userId || !row) return { canRead: false, canWrite: false, reason: 'anonymous' };
  if (row.owner_type === 'user' && row.owner_user_id === userId) {
    return { canRead: true, canWrite: true, reason: 'owner' };
  }
  if (row.owner_type === 'team' && (await isTeamMember(userId, row.owner_group_id))) {
    return { canRead: true, canWrite: true, reason: 'team_member' };
  }
  const readsAll = hasPermission(auth, 'stats.read.all') || canBypassGroupScope(auth);
  if (readsAll) return { canRead: true, canWrite: false, reason: 'teacher_all' };
  if (hasPermission(auth, 'stats.read.group')) {
    const inScope =
      row.owner_type === 'user'
        ? await canAccessStudentId(auth, row.owner_user_id)
        : await isGroupInManageScope(auth, row.owner_group_id);
    if (inScope) return { canRead: true, canWrite: false, reason: 'teacher_scope' };
  }
  return { canRead: false, canWrite: false, reason: 'forbidden' };
}

/** Lecture seule côté socket : le même contrôle que `GET /boards/:id`. */
async function canReadBoard(auth, boardId) {
  const row = await loadBoardRow(boardId);
  if (!row) return false;
  return (await resolveBoardAccess(auth, row)).canRead;
}

function summaryColumns(model, state) {
  const s = core.summarize(model, state);
  return {
    level: s.level,
    step: s.step,
    lot_reached: s.lotReached,
    cards_placed: s.cardsPlaced,
    links_count: s.linksCount,
    links_found: s.linksFound,
    hints_used: s.hintsUsed,
  };
}

async function findActiveBoard(deckId, ownerKey, { withState = false } = {}) {
  const cols = withState ? `${BOARD_COLS}, b.state_json` : BOARD_COLS;
  return queryOne(
    `SELECT ${cols}, ${OWNER_LABEL_COLS} FROM fresque_boards b ${OWNER_JOINS}
      WHERE b.deck_id = ? AND b.active_owner_key = ? LIMIT 1`,
    [deckId, ownerKey],
  );
}

async function insertBoard({ deckId, ownerType, ownerUserId, ownerGroupId, level }) {
  const model = getFresqueDeckModel(deckId);
  const state = core.createInitialState(model, { level });
  const id = crypto.randomUUID();
  const ownerKey = ownerKeyFor(ownerType, ownerType === 'user' ? ownerUserId : ownerGroupId);
  const cols = summaryColumns(model, state);
  await execute(
    `INSERT INTO fresque_boards
      (id, deck_id, owner_type, owner_user_id, owner_group_id, owner_key, active_owner_key,
       level, step, lot_reached, state_json, cards_placed, links_count, links_found, hints_used,
       status, edit_revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 0)`,
    [
      id,
      deckId,
      ownerType,
      ownerType === 'user' ? ownerUserId : null,
      ownerType === 'team' ? ownerGroupId : null,
      ownerKey,
      ownerKey,
      cols.level,
      cols.step,
      cols.lot_reached,
      JSON.stringify(state),
      cols.cards_placed,
      cols.links_count,
      cols.links_found,
      cols.hints_used,
    ],
  );
  return id;
}

/**
 * Crée ou renvoie le plateau actif du propriétaire pour ce jeu (idempotent).
 * @returns {Promise<{ row: object, created: boolean }>}
 */
async function getOrCreateActiveBoard(auth, { deckId, ownerType = 'user', groupId = null, level }) {
  const userId = authUserId(auth);
  if (!userId) throw new FresqueError(403, 'Profil utilisateur invalide');
  if (!getFresqueDeck(deckId)) throw new FresqueError(404, 'Jeu de fresque introuvable');
  if (ownerType !== 'user' && ownerType !== 'team')
    throw new FresqueError(400, 'ownerType invalide');
  let ownerKey;
  if (ownerType === 'team') {
    if (!groupId) throw new FresqueError(400, 'groupId requis pour un plateau d’équipe');
    if (!(await isTeamMember(userId, groupId))) {
      throw new FresqueError(403, 'Tu ne fais pas partie de cette équipe');
    }
    ownerKey = ownerKeyFor('team', groupId);
  } else {
    ownerKey = ownerKeyFor('user', userId);
  }
  const existing = await findActiveBoard(deckId, ownerKey, { withState: true });
  if (existing) return { row: existing, created: false };
  try {
    const id = await insertBoard({
      deckId,
      ownerType,
      ownerUserId: userId,
      ownerGroupId: groupId,
      level: core.FRESQUE_LEVELS.includes(level) ? level : core.FRESQUE_DEFAULT_LEVEL,
    });
    return { row: await loadBoardRow(id, { withState: true }), created: true };
  } catch (err) {
    // Deux créations simultanées : l'unicité (deck_id, active_owner_key) tranche, on relit.
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      const row = await findActiveBoard(deckId, ownerKey, { withState: true });
      if (row) return { row, created: false };
    }
    throw err;
  }
}

/** Plateaux actifs du compte : le sien et ceux de ses équipes (un jeu ou tous). */
async function listMyBoards(auth, { deckId = null } = {}) {
  const userId = authUserId(auth);
  if (!userId) return [];
  const teamIds = await listTeamGroupIds(userId);
  const where = ['b.active_owner_key IS NOT NULL'];
  const params = [];
  if (deckId) {
    where.push('b.deck_id = ?');
    params.push(deckId);
  }
  const ownerClauses = ['(b.owner_type = ? AND b.owner_user_id = ?)'];
  params.push('user', userId);
  if (teamIds.length) {
    ownerClauses.push(
      `(b.owner_type = 'team' AND b.owner_group_id IN (${teamIds.map(() => '?').join(',')}))`,
    );
    params.push(...teamIds);
  }
  where.push(`(${ownerClauses.join(' OR ')})`);
  const rows = await queryAll(
    `SELECT ${BOARD_COLS}, ${OWNER_LABEL_COLS} FROM fresque_boards b ${OWNER_JOINS}
      WHERE ${where.join(' AND ')} ORDER BY b.owner_type ASC, b.updated_at DESC`,
    params,
  );
  return rows.map((r) => serializeBoard(r));
}

/** Équipes (groupes `kind = 'team'`) du compte, pour le sélecteur « Ma fresque / Fresque de l'équipe ». */
async function listMyTeams(auth) {
  const userId = authUserId(auth);
  if (!userId) return [];
  const rows = await queryAll(
    `SELECT g.id, g.name FROM group_members gm
       INNER JOIN \`groups\` g ON g.id = gm.group_id
      WHERE gm.user_id = ? AND g.kind = 'team' AND g.is_active = 1
      ORDER BY g.name ASC`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function insertEvents(boardId, actorUserId, events) {
  const rows = events.slice(0, MAX_EVENTS_PER_SAVE);
  if (!rows.length) return 0;
  const values = rows.map(() => '(?, ?, ?, ?)').join(',');
  const params = [];
  for (const ev of rows) {
    params.push(
      boardId,
      actorUserId || null,
      String(ev.type).slice(0, 32),
      JSON.stringify(ev.payload || {}),
    );
  }
  await execute(
    `INSERT INTO fresque_board_events (board_id, actor_user_id, type, payload_json) VALUES ${values}`,
    params,
  );
  return rows.length;
}

async function contributors(boardId) {
  const rows = await queryAll(
    `SELECT DISTINCT actor_user_id FROM fresque_board_events WHERE board_id = ? AND actor_user_id IS NOT NULL`,
    [boardId],
  );
  return rows.map((r) => r.actor_user_id);
}

/**
 * Attribue le badge du jeu à la fin, de façon idempotente : au propriétaire, ou à chaque membre
 * de l'équipe ayant contribué au journal. Rend les badges nouvellement obtenus par `userId`
 * (ceux à annoncer).
 */
async function awardCompletionRewards(row, userId) {
  const key = DECK_REWARD_KEYS[row.deck_id];
  if (!key) return [];
  const recipients = new Set();
  if (row.owner_type === 'user') recipients.add(row.owner_user_id);
  else {
    for (const id of await contributors(row.id)) recipients.add(id);
    recipients.add(userId);
  }
  const mine = [];
  for (const recipient of recipients) {
    if (!recipient) continue;
    const fresh = await awardReward(recipient, key, { type: 'fresque_board', ref: row.id });
    if (fresh && recipient === userId) mine.push(describeReward(key, new Date()));
  }
  return mine;
}

/**
 * Enregistrement strict d'un état (PUT). Valide, réécrit `by`, calcule résumé et journal,
 * détecte la fin, attribue le badge. 409 `edit_conflict` si la révision attendue est dépassée.
 * @returns {Promise<{ status: number, body: object }>}
 */
async function saveBoardState(auth, row, { state: rawState, expected_revision, clientSeq } = {}) {
  const userId = authUserId(auth);
  const model = getFresqueDeckModel(row.deck_id);
  if (!model) return { status: 404, body: { error: 'Jeu de fresque introuvable' } };
  if (row.status === 'archived')
    return { status: 409, body: { error: 'Plateau archivé', code: 'board_archived' } };

  const prevState = parseState(row.state_json);
  const migrated = core.migrateState(rawState);
  if (!migrated) return { status: 400, body: { error: 'state manquant' } };
  const stamped = core.stampAuthor(prevState, { ...migrated, deckId: row.deck_id }, userId);
  const seq = Number.isInteger(clientSeq) && clientSeq >= 0 ? clientSeq : stamped.clientSeq;
  const nextState = { ...stamped, clientSeq: seq, updatedAt: new Date().toISOString() };
  const check = core.validateState(model, nextState);
  if (!check.ok)
    return {
      status: 400,
      body: { error: `État invalide : ${check.errors[0]}`, details: check.errors },
    };

  const claim = await claimEditRevision('fresque_boards', row.id, { expected_revision });
  if (claim.error) return claim.error;
  if (claim.revision === null) return { status: 404, body: { error: 'Plateau introuvable' } };

  try {
    const events = prevState ? core.diffStates(model, prevState, nextState) : [];
    const completedNow = core.isComplete(model, nextState) && row.status !== 'completed';
    const cols = summaryColumns(model, nextState);
    const status = row.status === 'completed' || completedNow ? 'completed' : 'in_progress';
    await execute(
      `UPDATE fresque_boards
          SET state_json = ?, level = ?, step = ?, lot_reached = ?, cards_placed = ?,
              links_count = ?, links_found = ?, hints_used = ?, status = ?,
              completed_at = ${completedNow ? 'NOW(3)' : 'completed_at'}
        WHERE id = ?`,
      [
        JSON.stringify(nextState),
        cols.level,
        cols.step,
        cols.lot_reached,
        cols.cards_placed,
        cols.links_count,
        cols.links_found,
        cols.hints_used,
        status,
        row.id,
      ],
    );
    const written = await insertEvents(row.id, userId, events);
    let rewards = [];
    if (completedNow)
      rewards = await announceableRewards(await awardCompletionRewards(row, userId));
    const fresh = await loadBoardRow(row.id);
    return {
      status: 200,
      body: {
        board: serializeBoard(fresh, { access: { canWrite: true } }),
        revision: claim.revision,
        clientSeq: seq,
        events: written,
        completed: core.isComplete(model, nextState),
        rewards,
      },
    };
  } catch (err) {
    await releaseEditRevision('fresque_boards', row.id, claim).catch(() => {});
    throw err;
  }
}

/** « Recommencer » : archive le plateau actif et en crée un neuf (même propriétaire, même niveau). */
async function restartBoard(auth, row) {
  if (row.active_owner_key == null) throw new FresqueError(409, 'Ce plateau est déjà archivé');
  await execute(
    `UPDATE fresque_boards SET active_owner_key = NULL, status = 'archived' WHERE id = ? AND active_owner_key IS NOT NULL`,
    [row.id],
  );
  const id = await insertBoard({
    deckId: row.deck_id,
    ownerType: row.owner_type,
    ownerUserId: row.owner_user_id,
    ownerGroupId: row.owner_group_id,
    level: row.level,
  });
  await insertEvents(id, authUserId(auth), [
    { type: 'restarted', payload: { previousBoardId: row.id } },
  ]);
  return loadBoardRow(id, { withState: true });
}

async function listEvents(boardId, { after = 0, limit = MAX_EVENTS_PAGE } = {}) {
  const cap = Math.min(MAX_EVENTS_PAGE, Math.max(1, Number(limit) || MAX_EVENTS_PAGE));
  const rows = await queryAll(
    `SELECT id, actor_user_id, type, payload_json, created_at
       FROM fresque_board_events WHERE board_id = ? AND id > ? ORDER BY id ASC LIMIT ${cap}`,
    [boardId, Math.max(0, Number(after) || 0)],
  );
  return rows.map((r) => {
    let payload = {};
    try {
      payload = r.payload_json ? JSON.parse(r.payload_json) : {};
    } catch {
      payload = {};
    }
    return {
      id: Number(r.id),
      by: r.actor_user_id || null,
      type: r.type,
      payload,
      at: toIso(r.created_at),
    };
  });
}

/**
 * Vue prof : un plateau par ligne, filtré par le périmètre de groupes du prof (et un groupe
 * précis à la demande). Tri par nom, jamais par score.
 * @returns {Promise<{ unauthorizedGroup?: boolean, boards: object[] }>}
 */
async function overview(auth, { deckId = null, groupId = null } = {}) {
  const scope = await getScopedStudentIds(auth, { groupId });
  if (scope.unauthorizedGroup) return { unauthorizedGroup: true, boards: [] };
  const where = [];
  const params = [];
  if (deckId) {
    where.push('b.deck_id = ?');
    params.push(deckId);
  }
  if (!scope.all) {
    const groupIds = groupId
      ? scope.groupIds
      : await getUserAccessibleGroupIds(auth, { includeDescendants: true });
    const clauses = [];
    if (scope.studentIds.length) {
      clauses.push(
        `(b.owner_type = 'user' AND b.owner_user_id IN (${scope.studentIds.map(() => '?').join(',')}))`,
      );
      params.push(...scope.studentIds);
    }
    if (groupIds.length) {
      clauses.push(
        `(b.owner_type = 'team' AND b.owner_group_id IN (${groupIds.map(() => '?').join(',')}))`,
      );
      params.push(...groupIds);
    }
    if (!clauses.length) return { boards: [] };
    where.push(`(${clauses.join(' OR ')})`);
  } else if (groupId && scope.groupIds.length) {
    where.push(
      `(b.owner_type = 'user' OR b.owner_group_id IN (${scope.groupIds.map(() => '?').join(',')}))`,
    );
    params.push(...scope.groupIds);
  }
  const rows = await queryAll(
    `SELECT ${BOARD_COLS}, ${OWNER_LABEL_COLS} FROM fresque_boards b ${OWNER_JOINS}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY b.owner_type ASC, COALESCE(u.last_name, g.name) ASC, u.first_name ASC, b.created_at DESC
      LIMIT 1000`,
    params,
  );
  return { boards: rows.map((r) => serializeBoard(r)) };
}

module.exports = {
  DECK_REWARD_KEYS,
  BOARD_STATUSES,
  FresqueError,
  ownerKeyFor,
  parseState,
  serializeBoard,
  loadBoardRow,
  isTeamMember,
  resolveBoardAccess,
  canReadBoard,
  getOrCreateActiveBoard,
  listMyBoards,
  listMyTeams,
  saveBoardState,
  restartBoard,
  listEvents,
  overview,
};
