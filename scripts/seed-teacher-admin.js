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

  const existing = await queryOne('SELECT id FROM teachers WHERE LOWER(email)=LOWER(?) LIMIT 1', [email]);
  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  if (existing) {
    await execute(
      'UPDATE teachers SET password_hash = ?, display_name = ?, is_active = 1, updated_at = ? WHERE id = ?',
      [hash, displayName, now, existing.id]
    );
    console.log(`Compte prof mis à jour: ${email}`);
    return;
  }

  await execute(
    'INSERT INTO teachers (id, email, password_hash, display_name, is_active, last_seen, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    [uuidv4(), email, hash, displayName, now, now, now]
  );
  console.log(`Compte prof créé: ${email}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
