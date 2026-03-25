#!/usr/bin/env node
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { queryOne, execute } = require('../database');

function normalizeEmail(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s || null;
}

async function main() {
  const email = normalizeEmail(process.env.TEACHER_ADMIN_EMAIL);
  const password = process.env.TEACHER_ADMIN_PASSWORD ? String(process.env.TEACHER_ADMIN_PASSWORD) : '';
  const displayName = (process.env.TEACHER_ADMIN_DISPLAY_NAME || 'Professeur').trim() || 'Professeur';

  if (!email || !password) {
    throw new Error('TEACHER_ADMIN_EMAIL et TEACHER_ADMIN_PASSWORD sont requis.');
  }
  if (password.length < 4) {
    throw new Error('TEACHER_ADMIN_PASSWORD doit contenir au moins 4 caractères.');
  }

  const existing = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email)=LOWER(?) LIMIT 1",
    [email]
  );
  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  if (existing) {
    await execute(
      "UPDATE users SET password_hash = ?, display_name = ?, is_active = 1, updated_at = NOW(), last_seen = ? WHERE id = ? AND user_type = 'teacher'",
      [hash, displayName, now, existing.id]
    );
    console.log(`Compte prof mis à jour: ${email}`);
    return;
  }

  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
     VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
    [uuidv4(), email, email.split('@')[0] || null, displayName, hash, now]
  );
  console.log(`Compte prof créé: ${email}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
