'use strict';

/**
 * Rapprochements en attente (section 8.1, règle 3 ; section 13) : décision d'un administrateur
 * sur un membre Moodle que les règles automatiques n'ont pas su rattacher (homonymes).
 *
 *  - `link`   : rattacher au compte choisi (identité `linked`, e-mail / nom complétés s'ils
 *               étaient vides) ;
 *  - `create` : créer un compte élève (identité `created`) ;
 *  - `ignore` : ne plus proposer ce membre (la ligne reste, résolue).
 *
 * L'appartenance au groupe n'est pas posée ici : l'exécution suivante la calculera, désormais
 * avec une identité connue (règle 1).
 */

const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { PROVIDER } = require('./config');
const { createUserFromMember, linkUserToMember } = require('./writers');

function parseJson(text, fallback = null) {
  if (text == null || text === '') return fallback;
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function serialize(row) {
  return {
    id: Number(row.id),
    externalId: String(row.external_id),
    member: parseJson(row.external_snapshot_json, null),
    cohort: row.cohort_idnumber || null,
    reason: row.reason,
    candidates: parseJson(row.candidates_json, []) || [],
    detectedRunId: row.detected_run_id == null ? null : Number(row.detected_run_id),
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
    resolvedByUserId: row.resolved_by_user_id || null,
    resolution: row.resolution || null,
    resolvedUserId: row.resolved_user_id || null,
  };
}

async function listPendingMatches({ issuer, includeResolved = false } = {}) {
  const rows = await queryAll(
    `SELECT * FROM sync_pending_matches
      WHERE provider = ? AND (? IS NULL OR issuer = ?) ${includeResolved ? '' : 'AND resolved_at IS NULL'}
      ORDER BY detected_at DESC, id DESC LIMIT 500`,
    [PROVIDER, issuer || null, issuer || null],
  );
  return rows.map(serialize);
}

/** Vue « membre Moodle » attendue par les écritures, depuis l'instantané persisté. */
function memberFromSnapshot(snapshot, externalId) {
  const s = snapshot || {};
  return {
    id: String(externalId),
    username: s.username || null,
    firstname: s.firstName || s.firstname || '',
    lastname: s.lastName || s.lastname || '',
    email: s.email || '',
    idnumber: s.idnumber || null,
  };
}

/**
 * @param {number} id
 * @param {{ resolution: 'link'|'create'|'ignore', userId?: string|null, actorUserId?: string|null }} decision
 */
async function resolvePendingMatch(id, { resolution, userId = null, actorUserId = null }) {
  const row = await queryOne('SELECT * FROM sync_pending_matches WHERE id = ? LIMIT 1', [
    Number(id),
  ]);
  if (!row) throw httpError(404, 'Rapprochement introuvable');
  if (row.resolved_at) throw httpError(409, 'Rapprochement déjà tranché');
  if (!['link', 'create', 'ignore'].includes(resolution))
    throw httpError(400, 'Décision invalide (link, create ou ignore)');

  const member = memberFromSnapshot(parseJson(row.external_snapshot_json, null), row.external_id);
  const existingIdentity = await queryOne(
    'SELECT user_id FROM external_identities WHERE provider = ? AND issuer = ? AND external_id = ? LIMIT 1',
    [PROVIDER, row.issuer, String(row.external_id)],
  );
  if (existingIdentity && resolution !== 'ignore') {
    throw httpError(409, 'Ce membre Moodle est déjà rattaché à un compte');
  }

  let resolvedUserId = null;
  if (resolution === 'link') {
    const target = String(userId || '').trim();
    if (!target) throw httpError(400, 'userId requis pour rattacher');
    const user = await queryOne('SELECT id, sync_exempt FROM users WHERE id = ? LIMIT 1', [target]);
    if (!user) throw httpError(404, 'Compte cible introuvable');
    if (Number(user.sync_exempt) === 1) throw httpError(409, 'Compte marqué hors synchronisation');
    const taken = await queryOne(
      'SELECT external_id FROM external_identities WHERE provider = ? AND issuer = ? AND user_id = ? LIMIT 1',
      [PROVIDER, row.issuer, target],
    );
    if (taken) throw httpError(409, 'Ce compte porte déjà une identité Moodle');
    await withTransaction(async (tx) => {
      await linkUserToMember(tx, { issuer: row.issuer, member, userId: target, rule: 'manual' });
    });
    resolvedUserId = target;
  } else if (resolution === 'create') {
    if (member.email) {
      const dup = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [
        member.email,
      ]);
      if (dup) throw httpError(409, 'Un compte porte déjà cet e-mail : rattacher plutôt que créer');
    }
    resolvedUserId = await withTransaction(async (tx) => {
      const { userId: created } = await createUserFromMember(tx, {
        issuer: row.issuer,
        member,
        cohort: row.cohort_idnumber,
      });
      return created;
    });
  }

  await execute(
    `UPDATE sync_pending_matches
        SET resolved_at = NOW(), resolved_by_user_id = ?, resolution = ?, resolved_user_id = ?
      WHERE id = ?`,
    [actorUserId || null, resolution, resolvedUserId, Number(id)],
  );
  const updated = await queryOne('SELECT * FROM sync_pending_matches WHERE id = ? LIMIT 1', [
    Number(id),
  ]);
  return serialize(updated);
}

module.exports = { listPendingMatches, resolvePendingMatch, serializePendingMatch: serialize };
