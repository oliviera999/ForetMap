#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function safePort(raw, fallback) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : fallback;
}

function parseArgs(argv) {
  const out = {
    dumpPath: process.env.FORETMAP_DUMP_PATH ? String(process.env.FORETMAP_DUMP_PATH).trim() : '',
    dbName: process.env.DB_NAME ? String(process.env.DB_NAME).trim() : 'foretmap_local',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (!arg) continue;

    if (arg === '--file' && argv[i + 1]) {
      out.dumpPath = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--file=')) {
      out.dumpPath = arg.slice('--file='.length).trim();
      continue;
    }
    if (arg === '--db' && argv[i + 1]) {
      out.dbName = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--db=')) {
      out.dbName = arg.slice('--db='.length).trim();
      continue;
    }

    if (!arg.startsWith('--') && !out.dumpPath) {
      out.dumpPath = arg;
    }
  }

  return out;
}

function normalizeDbName(dbName) {
  const value = String(dbName || '').trim();
  if (!value) throw new Error('Nom de base vide. Fournissez --db ou DB_NAME.');
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Nom de base invalide: "${value}" (caractères autorisés: A-Z, a-z, 0-9, _)`);
  }
  return value;
}

function resolveDumpPath(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('Chemin du dump manquant. Utilisez --file <chemin.sql> ou FORETMAP_DUMP_PATH.');
  }
  return path.resolve(raw);
}

async function recreateDatabase(adminConn, dbName) {
  await adminConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await adminConn.query(
    `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbName = normalizeDbName(args.dbName);
  const dumpPath = resolveDumpPath(args.dumpPath);

  if (!fs.existsSync(dumpPath)) {
    throw new Error(`Fichier introuvable: ${dumpPath}`);
  }

  const dumpSql = fs.readFileSync(dumpPath, 'utf8');
  if (!dumpSql.trim()) {
    throw new Error(`Le fichier SQL est vide: ${dumpPath}`);
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = safePort(process.env.DB_PORT, 3306);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASS || '';

  console.log(`[import-dump] Source: ${dumpPath}`);
  console.log(`[import-dump] Cible : ${dbName} sur ${host}:${port} (user=${user})`);

  let adminConn;
  let targetConn;
  try {
    adminConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
      charset: 'utf8mb4',
    });
    await recreateDatabase(adminConn, dbName);
    console.log('[import-dump] Base recréée (DROP/CREATE).');

    targetConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database: dbName,
      multipleStatements: true,
      charset: 'utf8mb4',
    });

    await targetConn.query(dumpSql);
    console.log('[import-dump] Import SQL terminé.');
  } finally {
    if (targetConn) await targetConn.end();
    if (adminConn) await adminConn.end();
  }
}

main().catch((err) => {
  console.error(`[import-dump] Erreur: ${err.message || err}`);
  process.exit(1);
});
