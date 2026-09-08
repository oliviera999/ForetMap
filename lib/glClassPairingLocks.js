'use strict';

/**
 * Verrous MJ sur des paires de joueurs d'une classe (lot v3, docs/GL_EQUIPES_AUTO_CONCEPTION.md
 * § 6) — table `gl_class_pairing_locks` (migration 218).
 *
 *   together : les deux joueurs vont toujours dans la même équipe
 *   apart    : les deux joueurs ne sont jamais dans la même équipe
 *
 * Une paire est stockée ordonnée (`player_low_id < player_high_id`) : une seule ligne par paire,
 * remplacée si le MJ change de type. Réservé au staff (`gl.players.manage`) ; jamais exposé aux
 * joueurs. Le moteur les traite comme des contraintes dures (pénalité quasi infinie).
 */

const database = require('../database');

const LOCK_KINDS = Object.freeze(['together', 'apart']);

class GlPairingLockError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.name = 'GlPairingLockError';
    this.code = code;
    this.status = status;
  }
}

const MESSAGES = Object.freeze({
  CLASS_NOT_FOUND: 'Classe introuvable',
  INVALID_KIND: 'Type de verrou invalide (together ou apart)',
  INVALID_PLAYERS: 'Deux joueurs distincts de la classe sont requis',
  LOCK_NOT_FOUND: 'Verrou introuvable',
  LOCK_CONFLICT: 'Ces deux joueurs ont déjà un verrou de l’autre type',
});

function fail(code, status) {
  return new GlPairingLockError(code, status, MESSAGES[code] || code);
}

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Ordonne une paire ; `null` si invalide ou identique. */
function normalizePair(a, b) {
  const x = toId(a);
  const y = toId(b);
  if (!x || !y || x === y) return null;
  return x < y ? [x, y] : [y, x];
}

function mapRow(row) {
  return {
    id: Number(row.id),
    classId: Number(row.class_id),
    kind: String(row.kind),
    playerLowId: Number(row.player_low_id),
    playerHighId: Number(row.player_high_id),
    players: [
      {
        playerId: Number(row.player_low_id),
        pseudo: row.low_pseudo || null,
        firstName: row.low_first_name || '',
        lastName: row.low_last_name || '',
      },
      {
        playerId: Number(row.player_high_id),
        pseudo: row.high_pseudo || null,
        firstName: row.high_first_name || '',
        lastName: row.high_last_name || '',
      },
    ],
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: row.created_at,
  };
}

const SELECT_SQL = `
  SELECT l.id, l.class_id, l.kind, l.player_low_id, l.player_high_id, l.created_by, l.created_at,
         pl.pseudo AS low_pseudo, pl.first_name AS low_first_name, pl.last_name AS low_last_name,
         ph.pseudo AS high_pseudo, ph.first_name AS high_first_name, ph.last_name AS high_last_name
    FROM gl_class_pairing_locks l
    LEFT JOIN gl_players pl ON pl.id = l.player_low_id
    LEFT JOIN gl_players ph ON ph.id = l.player_high_id`;
const LIST_SQL = `${SELECT_SQL} WHERE l.class_id = ? ORDER BY l.kind ASC, l.id ASC`;
const BY_ID_SQL = `${SELECT_SQL} WHERE l.id = ? LIMIT 1`;

async function loadLockById(queryAll, lockId) {
  const rows = await queryAll(BY_ID_SQL, [lockId]);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function assertClass(queryOne, classId) {
  const id = toId(classId);
  if (!id) throw fail('CLASS_NOT_FOUND', 404);
  const row = await queryOne('SELECT id FROM gl_classes WHERE id = ? LIMIT 1', [id]);
  if (!row) throw fail('CLASS_NOT_FOUND', 404);
  return id;
}

async function listPairingLocks(classId, deps = {}) {
  const queryOne = deps.queryOne || database.queryOne;
  const queryAll = deps.queryAll || database.queryAll;
  const id = await assertClass(queryOne, classId);
  const rows = await queryAll(LIST_SQL, [id]);
  return rows.map(mapRow);
}

/**
 * Crée (ou remplace) un verrou. Refuse deux joueurs identiques, hors classe, ou un type inconnu.
 * `replace` (défaut `true`) : un verrou existant de l'autre type sur la même paire est remplacé ;
 * à `false`, conflit 409.
 */
async function upsertPairingLock(
  { classId, playerAId, playerBId, kind, actorId = null, replace = true },
  deps = {},
) {
  const queryOne = deps.queryOne || database.queryOne;
  const queryAll = deps.queryAll || database.queryAll;
  const execute = deps.execute || database.execute;
  const id = await assertClass(queryOne, classId);
  const k = String(kind || '').toLowerCase();
  if (!LOCK_KINDS.includes(k)) throw fail('INVALID_KIND', 400);
  const pair = normalizePair(playerAId, playerBId);
  if (!pair) throw fail('INVALID_PLAYERS', 400);
  const members = await queryAll('SELECT id FROM gl_players WHERE class_id = ? AND id IN (?, ?)', [
    id,
    pair[0],
    pair[1],
  ]);
  if (members.length !== 2) throw fail('INVALID_PLAYERS', 400);

  const existing = await queryOne(
    `SELECT id, kind FROM gl_class_pairing_locks
      WHERE class_id = ? AND player_low_id = ? AND player_high_id = ? LIMIT 1`,
    [id, pair[0], pair[1]],
  );
  if (existing) {
    if (String(existing.kind) !== k) {
      if (!replace) throw fail('LOCK_CONFLICT', 409);
      await execute('UPDATE gl_class_pairing_locks SET kind = ?, created_by = ? WHERE id = ?', [
        k,
        actorId,
        existing.id,
      ]);
    }
    return { lock: await loadLockById(queryAll, existing.id), created: false };
  }

  const insert = await execute(
    `INSERT INTO gl_class_pairing_locks (class_id, player_low_id, player_high_id, kind, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [id, pair[0], pair[1], k, actorId],
  );
  return { lock: await loadLockById(queryAll, insert.insertId), created: true };
}

/** Supprime un verrou de la classe donnée (refus cross-classe : 404). */
async function deletePairingLock({ classId, lockId }, deps = {}) {
  const queryOne = deps.queryOne || database.queryOne;
  const execute = deps.execute || database.execute;
  const id = await assertClass(queryOne, classId);
  const lid = toId(lockId);
  if (!lid) throw fail('LOCK_NOT_FOUND', 404);
  const row = await queryOne(
    'SELECT id FROM gl_class_pairing_locks WHERE id = ? AND class_id = ? LIMIT 1',
    [lid, id],
  );
  if (!row) throw fail('LOCK_NOT_FOUND', 404);
  await execute('DELETE FROM gl_class_pairing_locks WHERE id = ?', [lid]);
  return { ok: true };
}

/**
 * Verrous au format du moteur, restreints aux joueurs du pool (un verrou dont un membre est
 * absent — inactif, exclu — est ignoré et signalé).
 * @returns {{ together: Array<[number, number]>, apart: Array<[number, number]>, ignored: number, total: number }}
 */
async function loadLocksForEngine({ classId, poolIds }, deps = {}) {
  const queryAll = deps.queryAll || database.queryAll;
  const rows = await queryAll(
    'SELECT kind, player_low_id, player_high_id FROM gl_class_pairing_locks WHERE class_id = ?',
    [toId(classId)],
  );
  const pool = new Set((poolIds || []).map(Number));
  const out = { together: [], apart: [], ignored: 0, total: rows.length };
  for (const row of rows) {
    const a = Number(row.player_low_id);
    const b = Number(row.player_high_id);
    if (!pool.has(a) || !pool.has(b)) {
      out.ignored += 1;
      continue;
    }
    (row.kind === 'together' ? out.together : out.apart).push([a, b]);
  }
  return out;
}

module.exports = {
  LOCK_KINDS,
  MESSAGES,
  GlPairingLockError,
  normalizePair,
  listPairingLocks,
  upsertPairingLock,
  deletePairingLock,
  loadLocksForEngine,
};
