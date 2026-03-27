#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { queryAll, execute, ping, pool } = require('../database');

const COLLECTIVE_TABLES_DROP_ORDER = [
  'collective_session_absences',
  'collective_session_tasks',
  'collective_session_students',
  'collective_sessions',
];

function parseArgs(argv) {
  const out = {
    dryRun: false,
    skipDrop: false,
    strictExtra: false,
  };
  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (!arg) continue;
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--skip-drop') out.skipDrop = true;
    else if (arg === '--strict-extra') out.strictExtra = true;
  }
  return out;
}

function printSection(title) {
  process.stdout.write(`\n=== ${title} ===\n`);
}

function printCheck(state, label, details = '') {
  const icon = state === 'ok' ? 'OK' : state === 'warn' ? 'WARN' : 'FAIL';
  const suffix = details ? ` — ${details}` : '';
  process.stdout.write(`${icon} ${label}${suffix}\n`);
}

function splitSqlStatements(sqlRaw) {
  return String(sqlRaw || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripSqlComments(fragment) {
  let s = String(fragment || '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/--[^\r\n]*/g, '');
  return s.trim();
}

function extractExpectedSchema() {
  const schemaPath = path.join(__dirname, '..', 'sql', 'schema_foretmap.sql');
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSqlStatements(raw).map(stripSqlComments).filter(Boolean);
  const expected = new Map();

  for (const stmt of statements) {
    const tableMatch = stmt.match(/CREATE TABLE IF NOT EXISTS\s+`?([a-zA-Z0-9_]+)`?\s*\(/i);
    if (!tableMatch) continue;
    const tableName = tableMatch[1];
    const openIdx = stmt.indexOf('(');
    const closeIdx = stmt.lastIndexOf(')');
    if (openIdx < 0 || closeIdx <= openIdx) continue;
    const inner = stmt.slice(openIdx + 1, closeIdx);
    const lines = inner.split('\n').map((l) => l.trim()).filter(Boolean);
    const columns = [];

    for (const lineRaw of lines) {
      const line = lineRaw.replace(/,$/, '').trim();
      if (!line) continue;
      if (/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN)\b/i.test(line)) continue;
      const m = line.match(/^`?([a-zA-Z0-9_]+)`?\s+/);
      if (m) columns.push(m[1]);
    }
    expected.set(tableName, new Set(columns));
  }

  return expected;
}

async function getDbTables(dbName) {
  const rows = await queryAll(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = ?
      ORDER BY table_name ASC`,
    [dbName]
  );
  return rows.map((r) => String(r.table_name));
}

async function getDbColumns(dbName, tableName) {
  const rows = await queryAll(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
      ORDER BY ordinal_position ASC`,
    [dbName, tableName]
  );
  return rows.map((r) => String(r.column_name));
}

async function dropCollectiveTables({ dryRun, skipDrop }) {
  const actions = [];
  if (skipDrop) {
    for (const tableName of COLLECTIVE_TABLES_DROP_ORDER) {
      actions.push({ tableName, action: 'skipped' });
    }
    return actions;
  }

  for (const tableName of COLLECTIVE_TABLES_DROP_ORDER) {
    if (dryRun) {
      actions.push({ tableName, action: 'would_drop' });
      continue;
    }
    await execute(`DROP TABLE IF EXISTS ${tableName}`);
    actions.push({ tableName, action: 'dropped' });
  }
  return actions;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbName = String(process.env.DB_NAME || '').trim();
  if (!dbName) throw new Error('DB_NAME manquant dans l’environnement');

  let exitCode = 0;
  const markWarn = () => { if (exitCode < 1) exitCode = 1; };
  const markFail = () => { exitCode = 2; };

  printSection('Connexion BDD');
  await ping();
  printCheck('ok', 'MySQL accessible', `base ${dbName}`);

  printSection('Suppression tables collectif');
  const actions = await dropCollectiveTables(args);
  for (const row of actions) {
    if (row.action === 'dropped') printCheck('ok', `DROP ${row.tableName}`);
    else if (row.action === 'would_drop') printCheck('warn', `DROP ${row.tableName}`, 'dry-run');
    else printCheck('warn', `DROP ${row.tableName}`, 'ignoré (--skip-drop)');
  }
  if (args.dryRun || args.skipDrop) markWarn();

  printSection('Vérification structure BDD');
  const expectedSchema = extractExpectedSchema();
  const expectedTables = [...expectedSchema.keys()].sort();
  const dbTables = await getDbTables(dbName);
  const dbTableSet = new Set(dbTables);

  for (const collectiveTable of COLLECTIVE_TABLES_DROP_ORDER) {
    if (dbTableSet.has(collectiveTable)) {
      printCheck('fail', `Table ${collectiveTable}`, 'encore présente');
      markFail();
    } else {
      printCheck('ok', `Table ${collectiveTable}`, 'absente');
    }
  }

  const missingTables = expectedTables.filter((t) => !dbTableSet.has(t));
  const extraTables = dbTables.filter((t) => !expectedSchema.has(t) && !['schema_version'].includes(t));

  if (missingTables.length === 0) {
    printCheck('ok', 'Tables attendues', `${expectedTables.length} présentes`);
  } else {
    printCheck('fail', 'Tables attendues', `${missingTables.length} manquante(s): ${missingTables.join(', ')}`);
    markFail();
  }

  if (extraTables.length === 0) {
    printCheck('ok', 'Tables supplémentaires', 'aucune');
  } else if (args.strictExtra) {
    printCheck('fail', 'Tables supplémentaires', extraTables.join(', '));
    markFail();
  } else {
    printCheck('warn', 'Tables supplémentaires', extraTables.join(', '));
    markWarn();
  }

  for (const tableName of expectedTables) {
    if (!dbTableSet.has(tableName)) continue;
    const expectedCols = expectedSchema.get(tableName) || new Set();
    const dbCols = await getDbColumns(dbName, tableName);
    const dbColSet = new Set(dbCols);
    const missingCols = [...expectedCols].filter((c) => !dbColSet.has(c));
    const extraCols = dbCols.filter((c) => !expectedCols.has(c));

    if (missingCols.length > 0) {
      printCheck('fail', `Colonnes ${tableName}`, `manquantes: ${missingCols.join(', ')}`);
      markFail();
      continue;
    }
    if (extraCols.length > 0) {
      printCheck('warn', `Colonnes ${tableName}`, `extras: ${extraCols.join(', ')}`);
      markWarn();
      continue;
    }
    printCheck('ok', `Colonnes ${tableName}`, `${dbCols.length} colonne(s)`);
  }

  printSection('Résultat');
  if (exitCode === 0) printCheck('ok', 'Structure BDD conforme');
  else if (exitCode === 1) printCheck('warn', 'Structure BDD conforme avec warnings');
  else printCheck('fail', 'Structure BDD non conforme');

  process.exitCode = exitCode;
}

main()
  .catch((err) => {
    process.stderr.write(`\nFAIL Script: ${err.message || err}\n`);
    process.exitCode = 2;
  })
  .finally(async () => {
    try { await pool.end(); } catch (_) {}
  });
