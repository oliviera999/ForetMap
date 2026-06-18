#!/usr/bin/env node
'use strict';

/**
 * Export SQL anonymisé (PII élèves masquées) pour environnements de dev.
 * Usage : node scripts/export-anonymized-dump.js [--out=tmp/foretmap-anon.sql]
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { initDatabase, pool } = require('../database');

async function run() {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outPath = path.resolve(
    outArg ? outArg.slice('--out='.length) : path.join('tmp', 'foretmap-anon.sql'),
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  await initDatabase();
  const conn = await pool.getConnection();
  try {
    await conn.query('SET NAMES utf8mb4');
    const [rows] = await conn.query(
      `SELECT id, first_name, last_name, email, pseudo FROM users WHERE user_type = 'student'`,
    );
    const lines = [
      '-- ForetMap dump anonymisé (élèves)',
      `-- généré ${new Date().toISOString()}`,
      'SET NAMES utf8mb4;',
      '',
    ];
    for (const row of rows) {
      const id = row.id;
      lines.push(
        `UPDATE users SET first_name='Élève', last_name=CONCAT('Anonyme-', ${id}), email=NULL, pseudo=CONCAT('anon_', ${id}) WHERE id=${id};`,
      );
    }
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    console.log(`Export anonymisé : ${outPath} (${rows.length} élèves)`);
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
