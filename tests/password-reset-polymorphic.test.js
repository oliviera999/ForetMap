'use strict';

// `password_reset_tokens` est polymorphe : `user_id` désigne un compte de `users`
// (student / teacher) OU un joueur GL de `gl_players`. Aucune clé étrangère ne peut
// exprimer ce « OU » — la migration 189 retire celle posée par la 185, qui cassait
// « mot de passe oublié » côté joueur GL.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { createPasswordResetToken } = require('../lib/passwordReset');

const stamp = Date.now();
const playerPseudo = `reset-poly-${stamp}`;
let playerId = null;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_classes (name, school, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', 1, NOW(), NOW())`,
    [`Classe Reset Poly ${stamp}`],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe Reset Poly ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, '', 1, NOW(), NOW())`,
    [cls.id, playerPseudo],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    playerPseudo,
  ]);
  playerId = Number(player.id);
});

after(async () => {
  await execute("DELETE FROM password_reset_tokens WHERE user_type = 'gl_player' AND user_id = ?", [
    String(playerId),
  ]);
  await execute('DELETE FROM gl_players WHERE pseudo = ?', [playerPseudo]);
  await execute('DELETE FROM gl_classes WHERE name = ?', [`Classe Reset Poly ${stamp}`]);
});

test('un joueur GL (absent de `users`) peut obtenir un jeton de réinitialisation', async () => {
  const token = await createPasswordResetToken('gl_player', playerId);
  assert.ok(token, 'le jeton doit être créé');
  const row = await queryOne(
    "SELECT user_type, user_id FROM password_reset_tokens WHERE user_type = 'gl_player' AND user_id = ? LIMIT 1",
    [String(playerId)],
  );
  assert.ok(row, 'la ligne doit exister en base');
});

test('aucune clé étrangère ne contraint password_reset_tokens à `users`', async () => {
  const rows = await queryAll(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'password_reset_tokens'`,
  );
  assert.deepStrictEqual(
    rows.map((r) => String(r.CONSTRAINT_NAME)),
    [],
    'la table est polymorphe : une FK y interdirait les jetons de joueurs GL',
  );
});
