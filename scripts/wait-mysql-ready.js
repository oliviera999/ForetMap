#!/usr/bin/env node
require('dotenv').config();

const mysql = require('mysql2/promise');

function parseIntSafe(value, fallback) {
  const n = parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

const host = process.env.DB_HOST || '127.0.0.1';
const port = parseIntSafe(process.env.DB_PORT, 3306);
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASS || '';
const timeoutMs = parseIntSafe(process.env.LOCAL_DB_WAIT_TIMEOUT_MS, 120000);
const retryMs = parseIntSafe(process.env.LOCAL_DB_WAIT_RETRY_MS, 2000);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canPing() {
  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 3000,
    });
    await conn.ping();
    return true;
  } catch (_) {
    return false;
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch (_) {}
    }
  }
}

async function main() {
  const started = Date.now();
  process.stdout.write(`Attente MySQL ${host}:${port}...`);
  while (Date.now() - started < timeoutMs) {
    if (await canPing()) {
      process.stdout.write(' OK\n');
      return;
    }
    process.stdout.write('.');
    await sleep(retryMs);
  }
  process.stdout.write('\n');
  throw new Error(`MySQL indisponible après ${timeoutMs}ms`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
