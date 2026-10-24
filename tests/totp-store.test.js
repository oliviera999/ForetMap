'use strict';

/**
 * Stockage du second facteur (`lib/auth/totpStore.js`) sur la base de test : secret jamais
 * en clair, confirmation par un premier code avant activation, rejeu refusé, code de secours
 * à usage unique, limiteur d'essais persistant, réinitialisation, clé absente.
 */

require('./helpers/setup');
const crypto = require('node:crypto');
process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const test = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryOne, queryAll, execute, getSyncDomainVersions } = require('../database');
const totp = require('../lib/auth/totp');
const store = require('../lib/auth/totpStore');

const created = [];

async function createTeacher() {
  const id = crypto.randomUUID();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await execute(
    `INSERT INTO users (id, user_type, email, first_name, last_name, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, 'Totp', ?, ?, 'local', 1, NOW(), NOW())`,
    [id, `totp_${stamp}@example.com`, stamp, `Totp ${stamp}`],
  );
  created.push(id);
  return id;
}

/** Enrôle un compte et renvoie le secret en clair (connu du seul test) et les codes. */
async function enroll(userId, nowMs = Date.now()) {
  const started = await store.startEnrollment(userId);
  const code = totp.totpAt(started.secret, nowMs);
  const confirmed = await store.confirmEnrollment(userId, code, { nowMs });
  assert.equal(confirmed.ok, true, `confirmation : ${confirmed.reason}`);
  return { secret: started.secret, backupCodes: confirmed.backupCodes, confirmStep: nowMs };
}

function forms(secret) {
  return [
    secret.toString('hex'),
    secret.toString('base64'),
    secret.toString('base64url'),
    totp.base32Encode(secret),
  ];
}

test.before(async () => {
  await initSchema();
});

test.after(async () => {
  if (created.length) {
    await execute(`DELETE FROM users WHERE id IN (${created.map(() => '?').join(', ')})`, created);
  }
});

test('secret jamais en clair en base : ni en attente, ni une fois activé', async () => {
  const userId = await createTeacher();
  const started = await store.startEnrollment(userId);
  assert.equal(started.secret.length, 20);
  const pendingRow = await queryOne('SELECT * FROM user_totp WHERE user_id = ?', [userId]);
  const pendingDump = JSON.stringify(pendingRow);
  for (const form of forms(started.secret)) {
    assert.ok(!pendingDump.includes(form), `secret en clair (${form.slice(0, 6)}…) en attente`);
  }
  assert.match(pendingRow.pending_secret_enc, /^v1\./);
  assert.equal(pendingRow.enabled_at, null);

  const nowMs = Date.now();
  const confirmed = await store.confirmEnrollment(userId, totp.totpAt(started.secret, nowMs), {
    nowMs,
  });
  assert.equal(confirmed.ok, true);
  const activeRow = await queryOne('SELECT * FROM user_totp WHERE user_id = ?', [userId]);
  const activeDump = JSON.stringify(activeRow);
  for (const form of forms(started.secret)) {
    assert.ok(!activeDump.includes(form), 'secret en clair une fois activé');
  }
  assert.match(activeRow.secret_enc, /^v1\./);
  assert.ok(activeRow.enabled_at);
  assert.equal(activeRow.pending_secret_enc, null);
});

test('confirmation : un mauvais code n’active rien ; le bon active et produit 10 codes hachés', async () => {
  const userId = await createTeacher();
  const started = await store.startEnrollment(userId);
  const nowMs = Date.now();
  const wrong = String((Number(totp.totpAt(started.secret, nowMs)) + 1) % 1000000).padStart(6, '0');
  const refused = await store.confirmEnrollment(userId, wrong, { nowMs });
  assert.equal(refused.ok, false);
  assert.equal((await store.getTotpStatus(userId)).enabled, false);

  const confirmed = await store.confirmEnrollment(userId, totp.totpAt(started.secret, nowMs), {
    nowMs,
  });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.backupCodes.length, 10);
  const rows = await queryAll('SELECT code_hash FROM user_totp_backup_codes WHERE user_id = ?', [
    userId,
  ]);
  assert.equal(rows.length, 10);
  const dump = JSON.stringify(rows);
  for (const code of confirmed.backupCodes) {
    assert.ok(!dump.includes(code) && !dump.includes(code.replace('-', '')));
  }
  const status = await store.getTotpStatus(userId);
  assert.equal(status.enabled, true);
  assert.equal(status.backupCodesRemaining, 10);
});

test('enrôlement en attente expiré : refusé', async () => {
  const userId = await createTeacher();
  const started = await store.startEnrollment(userId);
  await execute(
    'UPDATE user_totp SET pending_created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE user_id = ?',
    [userId],
  );
  const nowMs = Date.now();
  const res = await store.confirmEnrollment(userId, totp.totpAt(started.secret, nowMs), { nowMs });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'pending_expired');
});

test('rejeu refusé : un code accepté ne sert pas deux fois (ni le code de confirmation)', async () => {
  const userId = await createTeacher();
  const nowMs = Date.now();
  const { secret } = await enroll(userId, nowMs);
  // Le code de la confirmation est déjà consommé.
  const sameAsConfirm = await store.verifyTotpForUser(userId, totp.totpAt(secret, nowMs), {
    nowMs,
  });
  assert.equal(sameAsConfirm.ok, false);
  assert.equal(sameAsConfirm.reason, 'replay');

  const later = nowMs + 30000;
  const code = totp.totpAt(secret, later);
  const first = await store.verifyTotpForUser(userId, code, { nowMs: later });
  assert.equal(first.ok, true);
  const replay = await store.verifyTotpForUser(userId, code, { nowMs: later });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'replay');
});

test('rejeu concurrent : deux vérifications simultanées du même code, une seule passe', async () => {
  const userId = await createTeacher();
  const nowMs = Date.now();
  const { secret } = await enroll(userId, nowMs);
  const later = nowMs + 60000;
  const code = totp.totpAt(secret, later);
  const results = await Promise.all([
    store.verifyTotpForUser(userId, code, { nowMs: later }),
    store.verifyTotpForUser(userId, code, { nowMs: later }),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
});

test('code de secours : accepté une fois, refusé ensuite ; le compteur baisse', async () => {
  const userId = await createTeacher();
  const { backupCodes } = await enroll(userId);
  const first = await store.consumeBackupCode(userId, backupCodes[3]);
  assert.equal(first.ok, true);
  assert.equal(first.remaining, 9);
  const again = await store.consumeBackupCode(userId, backupCodes[3]);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'invalid');
  // Saisie tolérante (majuscules, sans tiret).
  const other = await store.consumeBackupCode(
    userId,
    backupCodes[4].replace('-', '').toUpperCase(),
  );
  assert.equal(other.ok, true);
  assert.equal((await store.getTotpStatus(userId)).backupCodesRemaining, 8);
});

test('régénération : l’ancien lot ne vaut plus rien, le nouveau compte 10 codes', async () => {
  const userId = await createTeacher();
  const { backupCodes } = await enroll(userId);
  const fresh = await store.regenerateBackupCodes(userId);
  assert.equal(fresh.length, 10);
  assert.equal((await store.consumeBackupCode(userId, backupCodes[0])).ok, false);
  assert.equal((await store.consumeBackupCode(userId, fresh[0])).ok, true);
});

test('limiteur : 5 échecs verrouillent le compte, même le bon code est alors refusé', async () => {
  const userId = await createTeacher();
  const nowMs = Date.now();
  const { secret } = await enroll(userId, nowMs);
  for (let i = 0; i < 5; i += 1) {
    const res = await store.verifyTotpForUser(userId, '000000', { nowMs });
    assert.equal(res.ok, false);
  }
  const later = nowMs + 30000;
  const locked = await store.verifyTotpForUser(userId, totp.totpAt(secret, later), {
    nowMs: later,
  });
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, 'locked');
  assert.ok(locked.retryAfterSeconds > 0);
  // Les codes de secours partagent le même budget.
  const backup = await store.consumeBackupCode(userId, 'aaaaa-aaaaa');
  assert.equal(backup.reason, 'locked');

  // Verrou levé : le bon code passe et remet le compteur à zéro.
  await execute('UPDATE user_totp SET locked_until = NULL WHERE user_id = ?', [userId]);
  const ok = await store.verifyTotpForUser(userId, totp.totpAt(secret, later), { nowMs: later });
  assert.equal(ok.ok, true);
  const row = await queryOne('SELECT failed_attempts FROM user_totp WHERE user_id = ?', [userId]);
  assert.equal(Number(row.failed_attempts), 0);
});

test('compte non enrôlé : vérification refusée (not_enrolled)', async () => {
  const userId = await createTeacher();
  const res = await store.verifyTotpForUser(userId, '123456');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_enrolled');
});

test('réinitialisation : secret et codes supprimés', async () => {
  const userId = await createTeacher();
  await enroll(userId);
  const res = await store.resetTotp(userId);
  assert.equal(res.hadTotp, true);
  assert.ok(!(await queryOne('SELECT 1 AS x FROM user_totp WHERE user_id = ?', [userId])));
  const left = await queryOne(
    'SELECT COUNT(*) AS c FROM user_totp_backup_codes WHERE user_id = ?',
    [userId],
  );
  assert.equal(Number(left.c), 0);
  assert.equal((await store.getTotpStatus(userId)).enabled, false);
});

test('clé absente : l’enrôlement est refusé avec un code explicite', async () => {
  const userId = await createTeacher();
  const saved = process.env.TOTP_ENCRYPTION_KEY;
  delete process.env.TOTP_ENCRYPTION_KEY;
  try {
    await assert.rejects(
      () => store.startEnrollment(userId),
      (err) => err.code === 'TOTP_KEY_MISSING',
    );
  } finally {
    process.env.TOTP_ENCRYPTION_KEY = saved;
  }
});

test('une écriture du second facteur ne fait recharger aucun domaine du cycle de données', async () => {
  const userId = await createTeacher();
  const before = getSyncDomainVersions();
  await store.startEnrollment(userId);
  const after = getSyncDomainVersions();
  assert.deepEqual(after, before);
});
