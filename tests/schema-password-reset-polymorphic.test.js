'use strict';

// `password_reset_tokens` est POLYMORPHE : (user_type, user_id) désigne `users.id` pour
// 'student' et 'teacher', mais `gl_players.id` pour 'gl_player' (routes/gl/auth.js).
//
// La migration 185 y avait posé une clé étrangère vers `users` — une erreur : elle rendait
// impossible toute réinitialisation de mot de passe côté GL (ER_NO_REFERENCED_ROW_2 à
// l'insertion), attrapée par la CI sur gl-auth-forgot-password. La 189 l'a retirée.
// Ce fichier interdit qu'elle revienne, par le schéma ET par le comportement.
// Voir docs/AUDIT_BDD_2026-08.md §4.2 et §8. Tests BDD partagée = exécution séquentielle.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, queryAll, execute } = require('../database');

before(async () => {
  await initSchema();
});

test('aucune clé étrangère ne pèse sur password_reset_tokens.user_id', async () => {
  const rows = await queryAll(
    `SELECT constraint_name AS name, referenced_table_name AS target
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = 'password_reset_tokens'
        AND referenced_table_name IS NOT NULL`,
  );
  assert.deepStrictEqual(
    rows.map((r) => `${r.name} → ${r.target}`),
    [],
    'table polymorphe : une FK y exclurait mécaniquement une des trois populations ' +
      '— rejouer migrations/189_password_reset_drop_users_fk.sql',
  );
});

test('un jeton gl_player s’insère alors que son identifiant est absent de users', async () => {
  // Reproduction directe de la panne : l'identifiant vient de `gl_players`, pas de `users`.
  const tokenId = `test-poly-${crypto.randomUUID()}`;
  const absentUserId = `gl-player-absent-${Date.now()}`;
  try {
    await execute(
      `INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at)
       VALUES (?, 'gl_player', ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)`,
      [tokenId, absentUserId, crypto.randomBytes(32).toString('hex')],
    );
  } finally {
    await execute('DELETE FROM password_reset_tokens WHERE id = ?', [tokenId]);
  }
});

test('user_roles, lui, garde sa clé étrangère vers users', async () => {
  // Contre-exemple utile : la correction de la 189 ne doit pas être lue comme
  // « pas de FK sur les tables RBAC ». `user_roles` ne connaît que 'student' et
  // 'teacher', tous deux dans `users` — sa clé étrangère reste justifiée.
  const rows = await queryAll(
    `SELECT constraint_name AS name
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = 'user_roles'
        AND column_name = 'user_id'
        AND referenced_table_name = 'users'`,
  );
  assert.ok(rows.length > 0, 'fk_user_roles_user doit rester en place (migration 185)');
});
