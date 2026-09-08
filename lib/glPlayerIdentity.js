'use strict';

/**
 * Identité d'un joueur Gnomes & Licornes après unification (migration 211).
 *
 * Le joueur (`gl_players`) porte le gameplay ; son compte `users` lié porte les secrets et
 * l'état de compte. Ce module est le SEUL endroit qui lit ou écrit un mot de passe joueur :
 * routes d'auth, admin et import passent par lui, ce qui ferme la divergence des trois
 * magasins de l'audit (`docs/AUDIT_COMPTES_2026-09.md`, C3).
 *
 * Transition : un joueur historique peut encore porter `legacy_password_hash` (hash GL non
 * repris par la migration parce que le compte ForetMap lié avait son propre mot de passe).
 * `verifyGlPlayerPassword` l'accepte une dernière fois et l'ADOPTE comme mot de passe unique :
 * l'élève vient de prouver qu'il le connaît, c'est celui-là qui vaut désormais partout.
 */

const bcrypt = require('bcryptjs');
const { queryOne, execute } = require('../database');
const { bumpUserTokenEpoch } = require('./auth/tokenEpoch');
const { ACTIVE_TEAM_ID_SUBQUERY_SQL } = require('./glPlayerMembership');

// `active_team_id` = équipe de la partie active du joueur (gl_team_members), jamais le
// pointeur global `gl_players.team_id` (cf. lib/glPlayerMembership.js).
const PLAYER_USER_SELECT = `
  SELECT p.id, p.class_id, ${ACTIVE_TEAM_ID_SUBQUERY_SQL} AS active_team_id,
         p.pseudo, p.first_name, p.last_name, p.description,
         p.avatar_path, p.is_active, p.health_points, p.power_points, p.last_seen,
         p.linked_foretmap_user_id, p.legacy_password_hash, p.legacy_email,
         u.id AS user_id, u.email, u.pseudo AS user_pseudo, u.password_hash AS user_password_hash,
         u.password_must_reset, u.is_active AS user_is_active, u.token_epoch,
         u.auth_provider AS user_auth_provider, u.google_sub
    FROM gl_players p
    LEFT JOIN users u ON u.id = p.linked_foretmap_user_id AND u.user_type = 'student'`;

async function findGlPlayerById(playerId) {
  const id = Number(playerId);
  if (!Number.isFinite(id)) return null;
  return queryOne(`${PLAYER_USER_SELECT} WHERE p.id = ? LIMIT 1`, [id]);
}

/**
 * Joueur par identifiant de connexion : pseudo de jeu, ou e-mail / pseudo du compte lié.
 * Le pseudo de jeu prime (c'est l'identifiant affiché au joueur).
 */
async function findGlPlayerByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  return queryOne(
    `${PLAYER_USER_SELECT}
      WHERE LOWER(p.pseudo) = LOWER(?) OR LOWER(u.email) = LOWER(?) OR LOWER(u.pseudo) = LOWER(?)
      ORDER BY CASE WHEN LOWER(p.pseudo) = LOWER(?) THEN 0 ELSE 1 END, p.id ASC
      LIMIT 1`,
    [value, value, value, value],
  );
}

async function findGlPlayerByEmail(email) {
  const value = String(email || '')
    .trim()
    .toLowerCase();
  if (!value) return null;
  return queryOne(`${PLAYER_USER_SELECT} WHERE LOWER(u.email) = LOWER(?) LIMIT 1`, [value]);
}

async function findGlPlayerByGoogleSub(googleSub) {
  const value = String(googleSub || '').trim();
  if (!value) return null;
  return queryOne(`${PLAYER_USER_SELECT} WHERE u.google_sub = ? LIMIT 1`, [value]);
}

/** Actif pour se connecter : profil de jeu actif ET compte ForetMap actif (s'il existe). */
function isGlPlayerLoginActive(row) {
  if (!row || !Number(row.is_active)) return false;
  if (row.user_id && !Number(row.user_is_active)) return false;
  return true;
}

/**
 * Vérifie un mot de passe joueur. Adopte le hash hérité s'il est encore le seul à correspondre.
 * @returns {Promise<{ ok: boolean, adoptedLegacy: boolean }>}
 */
async function verifyGlPlayerPassword(row, password) {
  const plain = String(password || '');
  if (!row || !plain) return { ok: false, adoptedLegacy: false };
  if (row.user_password_hash && (await bcrypt.compare(plain, String(row.user_password_hash)))) {
    return { ok: true, adoptedLegacy: false };
  }
  if (row.legacy_password_hash && (await bcrypt.compare(plain, String(row.legacy_password_hash)))) {
    if (row.user_id) {
      await execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [
        row.legacy_password_hash,
        row.user_id,
      ]);
      await execute(
        'UPDATE gl_players SET legacy_password_hash = NULL, updated_at = NOW() WHERE id = ?',
        [row.id],
      );
    }
    return { ok: true, adoptedLegacy: true };
  }
  return { ok: false, adoptedLegacy: false };
}

/** Garantit le compte lié d'un joueur (lazy : évite le cycle glGroupBridge ↔ ce module). */
async function ensureGlPlayerUser(playerId) {
  const current = await findGlPlayerById(playerId);
  if (current?.user_id) return current;
  const { syncForetmapUserForGlPlayer } = require('./glGroupBridge');
  const sync = await syncForetmapUserForGlPlayer(playerId);
  if (!sync.ok) throw new Error(sync.error || 'Compte ForetMap du joueur introuvable');
  return findGlPlayerById(playerId);
}

/**
 * Écrit le mot de passe d'un joueur (source unique `users`) et révoque ses sessions.
 * @param {number} playerId
 * @param {{ password?: string, passwordHash?: string, mustReset?: boolean }} options
 */
async function setGlPlayerPassword(playerId, { password, passwordHash, mustReset = false }) {
  const row = await ensureGlPlayerUser(playerId);
  if (!row?.user_id) throw new Error('Compte ForetMap du joueur introuvable');
  const hash = passwordHash || (await bcrypt.hash(String(password), 10));
  await execute(
    'UPDATE users SET password_hash = ?, password_must_reset = ?, updated_at = NOW() WHERE id = ?',
    [hash, mustReset ? 1 : 0, row.user_id],
  );
  await execute(
    'UPDATE gl_players SET legacy_password_hash = NULL, updated_at = NOW() WHERE id = ?',
    [row.id],
  );
  await bumpUserTokenEpoch(row.user_id);
  return row.user_id;
}

async function setGlPlayerMustReset(playerId, flag) {
  const row = await ensureGlPlayerUser(playerId);
  if (!row?.user_id) return;
  await execute('UPDATE users SET password_must_reset = ?, updated_at = NOW() WHERE id = ?', [
    flag ? 1 : 0,
    row.user_id,
  ]);
}

/** Forme « profil » exposée par les routes (colonnes historiques conservées). */
function toGlPlayerProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    class_id: row.class_id,
    team_id: row.active_team_id != null ? Number(row.active_team_id) : null,
    pseudo: row.pseudo,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email || null,
    description: row.description || null,
    avatar_path: row.avatar_path || null,
    password_must_reset: Number(row.password_must_reset || 0),
    is_active: Number(row.is_active || 0),
    linked_foretmap_user_id: row.linked_foretmap_user_id || null,
    google_sub: row.google_sub || null,
    health_points: row.health_points,
    power_points: row.power_points,
  };
}

module.exports = {
  PLAYER_USER_SELECT,
  findGlPlayerById,
  findGlPlayerByIdentifier,
  findGlPlayerByEmail,
  findGlPlayerByGoogleSub,
  isGlPlayerLoginActive,
  verifyGlPlayerPassword,
  ensureGlPlayerUser,
  setGlPlayerPassword,
  setGlPlayerMustReset,
  toGlPlayerProfile,
};
