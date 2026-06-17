#!/usr/bin/env node
'use strict';

/**
 * Aligne AUTO_INCREMENT sur MAX(id)+1 pour tables ciblées.
 * Usage : node scripts/fix-auto-increment.js
 */

require('dotenv').config({ quiet: true });
const { initDatabase, pool } = require('../database');

const TABLES = ['roles', 'tutorials'];

async function run() {
  await initDatabase();
  const conn = await pool.getConnection();
  try {
    for (const table of TABLES) {
      const [rows] = await conn.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_ai FROM ${table}`);
      const next = Number(rows[0]?.next_ai || 1);
      await conn.query(`ALTER TABLE ${table} AUTO_INCREMENT = ${next}`);
      console.log(`${table} AUTO_INCREMENT = ${next}`);
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
