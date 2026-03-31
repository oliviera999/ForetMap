#!/usr/bin/env node
'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { queryAll, execute, pool } = require('../database');

function readPin() {
  const pin = String(process.env.TEACHER_PIN || '').trim();
  if (!pin) {
    throw new Error('TEACHER_PIN est requis pour réinitialiser role_pin_secrets.');
  }
  return pin;
}

async function main() {
  const pin = readPin();
  const hash = await bcrypt.hash(pin, 10);
  const roles = await queryAll('SELECT id, slug FROM roles ORDER BY id ASC');

  if (!roles.length) {
    console.log('Aucun rôle trouvé ; rien à réinitialiser.');
    return;
  }

  let updated = 0;
  for (const role of roles) {
    await execute(
      `INSERT INTO role_pin_secrets (role_id, pin_hash)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), updated_at = NOW()`,
      [role.id, hash]
    );
    updated += 1;
  }

  console.log(`PIN local réinitialisé pour ${updated} rôle(s).`);
}

(async () => {
  try {
    await main();
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
