'use strict';

/**
 * Second facteur (TOTP) d'un compte : enrôlement, vérification, codes de secours, limiteur
 * d'essais et réinitialisation, sur les tables de la migration 320.
 *
 * Invariants :
 * - le secret n'existe en clair qu'en mémoire, le temps d'un calcul ; en base il est chiffré
 *   (`lib/auth/totpCrypto.js`) ;
 * - un secret proposé n'est actif qu'après un premier code valide (`confirmEnrollment`) ;
 *   l'éventuel secret précédent reste valable jusque-là (changement d'appareil) ;
 * - **anti-rejeu** : `last_used_step` mémorise le pas du dernier code accepté ; l'écriture est
 *   conditionnelle (`last_used_step < ?`) et son `affectedRows` fait foi — deux soumissions
 *   simultanées du même code ne passent pas toutes les deux ;
 * - **limiteur** persistant par compte : 5 échecs → verrou 30 s, doublé à chaque échec suivant,
 *   plafonné à 15 min, remis à zéro au succès ; codes TOTP et codes de secours partagent ce
 *   budget, distinct de celui du mot de passe (`lib/loginThrottle.js`) ;
 * - toutes les comparaisons d'horodatage se font avec l'horloge de la base (`NOW()`), seule
 *   la génération des codes utilise l'horloge du serveur d'application.
 */

const { queryOne, queryAll, execute, withTransaction } = require('../../database');
const totp = require('./totp');
const { encryptTotpSecret, decryptTotpSecret, TotpCryptoError } = require('./totpCrypto');
const {
  generateBackupCodes,
  normalizeBackupCode,
  hashBackupCode,
  backupCodeMatches,
} = require('./totpBackupCodes');

const PENDING_TTL_SECONDS = 15 * 60;
const FAILURES_BEFORE_LOCK = 5;
const BASE_LOCK_SECONDS = 30;
const MAX_LOCK_SECONDS = 15 * 60;

function key(userId) {
  return String(userId ?? '').trim();
}

async function loadRow(userId) {
  return queryOne(
    `SELECT user_id, secret_enc, secret_key_id, enabled_at, pending_secret_enc, pending_key_id,
            pending_created_at, last_used_step, failed_attempts,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), locked_until)) AS lock_remaining,
            (pending_created_at IS NOT NULL
              AND pending_created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)) AS pending_fresh
       FROM user_totp WHERE user_id = ? LIMIT 1`,
    [PENDING_TTL_SECONDS, key(userId)],
  );
}

function lockedResult(row) {
  return {
    ok: false,
    reason: 'locked',
    retryAfterSeconds: Math.max(1, Number(row?.lock_remaining || 0)),
  };
}

/** Enregistre un échec ; pose le verrou au-delà du seuil. */
async function recordFailure(userId) {
  const row = await queryOne('SELECT failed_attempts FROM user_totp WHERE user_id = ? LIMIT 1', [
    key(userId),
  ]);
  if (!row) return { failures: 0, retryAfterSeconds: 0 };
  const failures = Number(row.failed_attempts || 0) + 1;
  const lockSeconds =
    failures >= FAILURES_BEFORE_LOCK
      ? Math.min(MAX_LOCK_SECONDS, BASE_LOCK_SECONDS * 2 ** (failures - FAILURES_BEFORE_LOCK))
      : 0;
  await execute(
    `UPDATE user_totp
        SET failed_attempts = ?,
            locked_until = IF(? > 0, DATE_ADD(NOW(), INTERVAL ? SECOND), locked_until)
      WHERE user_id = ?`,
    [failures, lockSeconds, lockSeconds, key(userId)],
  );
  return { failures, retryAfterSeconds: lockSeconds };
}

/**
 * Statut sans secret (vue `v_user_totp_status`).
 * @returns {Promise<{ enabled: boolean, enabledAt: Date|null, lastUsedAt: Date|null, locked: boolean, pendingSince: Date|null, backupCodesRemaining: number }>}
 */
async function getTotpStatus(userId) {
  const row = await queryOne(
    `SELECT enabled_at, last_used_at, pending_created_at, backup_codes_remaining,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
       FROM v_user_totp_status WHERE user_id = ? LIMIT 1`,
    [key(userId)],
  );
  return {
    enabled: !!row?.enabled_at,
    enabledAt: row?.enabled_at || null,
    lastUsedAt: row?.last_used_at || null,
    locked: !!Number(row?.is_locked || 0),
    pendingSince: row?.pending_created_at || null,
    backupCodesRemaining: row?.enabled_at ? Number(row.backup_codes_remaining || 0) : 0,
  };
}

async function isTotpEnabled(userId) {
  const row = await queryOne(
    'SELECT 1 AS x FROM user_totp WHERE user_id = ? AND enabled_at IS NOT NULL LIMIT 1',
    [key(userId)],
  );
  return !!row;
}

/**
 * Tire un nouveau secret, le stocke chiffré **en attente** et le renvoie (en clair, pour
 * l'URI et le QR code de la seule réponse d'enrôlement). Lève `TotpCryptoError`
 * (`TOTP_KEY_MISSING`) si la clé de chiffrement est absente.
 * @returns {Promise<{ secret: Buffer }>}
 */
async function startEnrollment(userId) {
  const id = key(userId);
  const secret = totp.generateTotpSecret();
  const sealed = encryptTotpSecret(secret, id);
  await execute(
    `INSERT INTO user_totp (user_id, pending_secret_enc, pending_key_id, pending_created_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE pending_secret_enc = ?, pending_key_id = ?, pending_created_at = NOW()`,
    [id, sealed.ciphertext, sealed.keyId, sealed.ciphertext, sealed.keyId],
  );
  return { secret };
}

/** Remplace tout le lot de codes de secours ; renvoie les codes en clair (affichage unique). */
async function replaceBackupCodes(userId, txOrNull = null) {
  const codes = generateBackupCodes();
  const hashes = await Promise.all(codes.map((code) => hashBackupCode(code)));
  const write = async (db) => {
    await db.execute('DELETE FROM user_totp_backup_codes WHERE user_id = ?', [key(userId)]);
    for (const hash of hashes) {
      await db.execute('INSERT INTO user_totp_backup_codes (user_id, code_hash) VALUES (?, ?)', [
        key(userId),
        hash,
      ]);
    }
  };
  if (txOrNull) await write(txOrNull);
  else await withTransaction(write);
  return codes;
}

/**
 * Confirme l'enrôlement en attente par un premier code valide : le secret proposé devient le
 * secret actif, le pas du code est consommé, un lot de codes de secours est produit.
 * @returns {Promise<{ ok: true, backupCodes: string[], replacedPrevious: boolean } | { ok: false, reason: string, retryAfterSeconds?: number }>}
 */
async function confirmEnrollment(userId, code, { nowMs = Date.now() } = {}) {
  const id = key(userId);
  const row = await loadRow(id);
  if (!row?.pending_secret_enc) return { ok: false, reason: 'no_pending' };
  if (Number(row.is_locked)) return lockedResult(row);
  if (!Number(row.pending_fresh)) return { ok: false, reason: 'pending_expired' };
  let secret;
  try {
    secret = decryptTotpSecret(
      { ciphertext: row.pending_secret_enc, keyId: row.pending_key_id },
      id,
    );
  } catch (err) {
    if (err instanceof TotpCryptoError) return { ok: false, reason: 'key_unavailable' };
    throw err;
  }
  const verdict = totp.verifyTotp(secret, code, { nowMs });
  secret.fill(0);
  if (!verdict.ok) {
    const failure = await recordFailure(id);
    return { ok: false, reason: 'invalid', retryAfterSeconds: failure.retryAfterSeconds };
  }
  const codes = generateBackupCodes();
  const hashes = await Promise.all(codes.map((c) => hashBackupCode(c)));
  const activated = await withTransaction(async (tx) => {
    const res = await tx.execute(
      `UPDATE user_totp
          SET secret_enc = pending_secret_enc, secret_key_id = pending_key_id,
              enabled_at = NOW(), pending_secret_enc = NULL, pending_key_id = NULL,
              pending_created_at = NULL, last_used_step = ?, last_used_at = NOW(),
              failed_attempts = 0, locked_until = NULL
        WHERE user_id = ? AND pending_secret_enc = ?`,
      [verdict.step, id, row.pending_secret_enc],
    );
    if (res.affectedRows !== 1) return false;
    await tx.execute('DELETE FROM user_totp_backup_codes WHERE user_id = ?', [id]);
    for (const hash of hashes) {
      await tx.execute('INSERT INTO user_totp_backup_codes (user_id, code_hash) VALUES (?, ?)', [
        id,
        hash,
      ]);
    }
    return true;
  });
  if (!activated) return { ok: false, reason: 'no_pending' };
  return { ok: true, backupCodes: codes, replacedPrevious: !!row.enabled_at };
}

/**
 * Vérifie un code TOTP pour un compte enrôlé (anti-rejeu + limiteur).
 * @returns {Promise<{ ok: true, step: number } | { ok: false, reason: 'not_enrolled'|'locked'|'invalid'|'replay'|'key_unavailable', retryAfterSeconds?: number }>}
 */
async function verifyTotpForUser(userId, code, { nowMs = Date.now() } = {}) {
  const id = key(userId);
  const row = await loadRow(id);
  if (!row?.enabled_at || !row.secret_enc) return { ok: false, reason: 'not_enrolled' };
  if (Number(row.is_locked)) return lockedResult(row);
  let secret;
  try {
    secret = decryptTotpSecret({ ciphertext: row.secret_enc, keyId: row.secret_key_id }, id);
  } catch (err) {
    if (err instanceof TotpCryptoError) return { ok: false, reason: 'key_unavailable' };
    throw err;
  }
  const verdict = totp.verifyTotp(secret, code, {
    nowMs,
    afterStep: row.last_used_step == null ? null : Number(row.last_used_step),
  });
  secret.fill(0);
  if (!verdict.ok) {
    const failure = await recordFailure(id);
    return {
      ok: false,
      reason: verdict.reason === 'replay' ? 'replay' : 'invalid',
      retryAfterSeconds: failure.retryAfterSeconds,
    };
  }
  const res = await execute(
    `UPDATE user_totp
        SET last_used_step = ?, last_used_at = NOW(), failed_attempts = 0, locked_until = NULL
      WHERE user_id = ? AND enabled_at IS NOT NULL
        AND (last_used_step IS NULL OR last_used_step < ?)`,
    [verdict.step, id, verdict.step],
  );
  if (res.affectedRows !== 1) {
    // Une autre requête a consommé ce pas entre la lecture et l'écriture.
    await recordFailure(id);
    return { ok: false, reason: 'replay' };
  }
  return { ok: true, step: verdict.step };
}

/**
 * Consomme un code de secours (usage unique, limiteur partagé avec les codes TOTP).
 * @returns {Promise<{ ok: true, remaining: number } | { ok: false, reason: 'not_enrolled'|'locked'|'invalid', retryAfterSeconds?: number }>}
 */
async function consumeBackupCode(userId, input) {
  const id = key(userId);
  const row = await loadRow(id);
  if (!row?.enabled_at) return { ok: false, reason: 'not_enrolled' };
  if (Number(row.is_locked)) return lockedResult(row);
  const fail = async () => {
    const failure = await recordFailure(id);
    return { ok: false, reason: 'invalid', retryAfterSeconds: failure.retryAfterSeconds };
  };
  if (!normalizeBackupCode(input)) return fail();
  const candidates = await queryAll(
    'SELECT id, code_hash FROM user_totp_backup_codes WHERE user_id = ? AND used_at IS NULL',
    [id],
  );
  let matchedId = null;
  for (const candidate of candidates) {
    if (await backupCodeMatches(input, candidate.code_hash)) {
      matchedId = candidate.id;
      break;
    }
  }
  if (matchedId == null) return fail();
  const res = await execute(
    'UPDATE user_totp_backup_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
    [matchedId],
  );
  if (res.affectedRows !== 1) return fail();
  await execute(
    'UPDATE user_totp SET failed_attempts = 0, locked_until = NULL, last_used_at = NOW() WHERE user_id = ?',
    [id],
  );
  const left = await queryOne(
    'SELECT COUNT(*) AS c FROM user_totp_backup_codes WHERE user_id = ? AND used_at IS NULL',
    [id],
  );
  return { ok: true, remaining: Number(left?.c || 0) };
}

/**
 * Second facteur présenté à la connexion : code TOTP **ou** code de secours.
 * @returns {Promise<{ ok: boolean, method: 'totp'|'backup_code', reason?: string, retryAfterSeconds?: number, remaining?: number }>}
 */
async function verifySecondFactor(userId, { code, backupCode } = {}, options = {}) {
  if (backupCode != null && String(backupCode).trim() !== '') {
    const res = await consumeBackupCode(userId, backupCode);
    return { ...res, method: 'backup_code' };
  }
  const res = await verifyTotpForUser(userId, code, options);
  return { ...res, method: 'totp' };
}

/** Nouveau lot de codes de secours pour un compte enrôlé. */
async function regenerateBackupCodes(userId) {
  if (!(await isTotpEnabled(userId))) {
    const err = new Error('Double authentification non activée');
    err.code = 'TOTP_NOT_ENROLLED';
    throw err;
  }
  return replaceBackupCodes(userId);
}

/** Supprime le second facteur d'un compte (secret, enrôlement en attente, codes). */
async function resetTotp(userId) {
  const id = key(userId);
  const existing = await queryOne('SELECT enabled_at FROM user_totp WHERE user_id = ? LIMIT 1', [
    id,
  ]);
  await withTransaction(async (tx) => {
    await tx.execute('DELETE FROM user_totp_backup_codes WHERE user_id = ?', [id]);
    await tx.execute('DELETE FROM user_totp WHERE user_id = ?', [id]);
  });
  return { hadTotp: !!existing, wasEnabled: !!existing?.enabled_at };
}

module.exports = {
  PENDING_TTL_SECONDS,
  FAILURES_BEFORE_LOCK,
  getTotpStatus,
  isTotpEnabled,
  startEnrollment,
  confirmEnrollment,
  verifyTotpForUser,
  consumeBackupCode,
  verifySecondFactor,
  regenerateBackupCodes,
  resetTotp,
};
