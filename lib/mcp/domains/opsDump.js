'use strict';

/**
 * Sauvegarde de la base pour `foretmap_ops dump` (lot D4) : un fichier `.sql` dans
 * `uploads/mcp-exports/` (dossier privé, purgé après 24 h), servi par un lien signé d'une
 * heure, comme `foretmap_export`.
 *
 * Trois natures (décision du propriétaire, 05/11/2026) :
 * - `full` : **tout**, y compris les colonnes et tables secrètes (empreintes, jetons, TOTP,
 *   réglages). Le fichier n'est lisible que par le lien signé ; la réponse de l'outil ne
 *   contient que ce lien ;
 * - `anonymized` : même règle que `scripts/export-anonymized-dump.js` pour les élèves de
 *   `users` (prénom « Élève », nom `Anonyme-<id>`, e-mail vide, pseudo `anon_<id>`), plus le
 *   nom affiché, l'avatar et la description ; colonnes secrètes vidées ; tables secrètes
 *   réduites à leur structure. Les textes libres (messages, carnets) ne sont pas réécrits ;
 * - `structure` : DDL seulement (tables, vues).
 *
 * Moteur : `mysqldump` s'il est installé (`full`, `structure`), mot de passe passé par
 * l'environnement (`MYSQL_PWD`), jamais en argument ; sinon — ou s'il échoue, ou pour
 * `anonymized` — export en Node pur dans une transaction cohérente (`WITH CONSISTENT
 * SNAPSHOT`, lecture seule), lignes lues en flux.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { McpToolError } = require('../registry');

const LINK_TTL_SECONDS = 3600;
const INSERT_BATCH_ROWS = 200;
const INSERT_BATCH_BYTES = 512 * 1024;
const BINARY_TYPES = new Set([
  'binary',
  'varbinary',
  'tinyblob',
  'blob',
  'mediumblob',
  'longblob',
  'bit',
  'geometry',
  'point',
  'linestring',
  'polygon',
  'multipoint',
  'multilinestring',
  'multipolygon',
  'geometrycollection',
]);

function exportDir() {
  const { EXPORT_DIR_REL } = require('../tools/data');
  const { UPLOADS_DIR } = require('../../uploads');
  return path.join(UPLOADS_DIR, EXPORT_DIR_REL);
}

function qid(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

/** `mysqldump` présent dans le PATH ? (sans lancer de shell) */
function findMysqldump() {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, process.platform === 'win32' ? 'mysqldump.exe' : 'mysqldump');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* suivant */
    }
  }
  return null;
}

function runMysqldump(bin, file, kind) {
  const args = [
    `--host=${process.env.DB_HOST || 'localhost'}`,
    `--port=${Number.parseInt(process.env.DB_PORT, 10) || 3306}`,
    `--user=${process.env.DB_USER || ''}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--hex-blob',
    '--no-tablespaces',
    '--default-character-set=utf8mb4',
  ];
  if (kind === 'structure') args.push('--no-data');
  args.push(String(process.env.DB_NAME || ''));
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    const child = spawn(bin, args, {
      env: { ...process.env, MYSQL_PWD: process.env.DB_PASS || '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr = `${stderr}${d}`.slice(-2000);
    });
    child.stdout.pipe(out);
    child.on('error', reject);
    child.on('close', (code) => {
      out.end(() => {
        if (code === 0) resolve();
        else {
          const { maskSecrets } = require('../secretMask');
          reject(new Error(`mysqldump code ${code} : ${maskSecrets(stderr).slice(0, 300)}`));
        }
      });
    });
  });
}

/** Écriture tamponnée qui respecte la contre-pression du flux. */
function fileWriter(file) {
  const stream = fs.createWriteStream(file);
  let failure = null;
  stream.on('error', (err) => {
    failure = err;
  });
  return {
    async write(text) {
      if (failure) throw failure;
      if (!stream.write(text)) await new Promise((r) => stream.once('drain', r));
    },
    close: () =>
      new Promise((resolve, reject) => {
        if (failure) return reject(failure);
        return stream.end(resolve);
      }),
  };
}

/** Anonymisation d'une ligne d'élève de `users` (règle de `scripts/export-anonymized-dump.js`). */
function anonymizeStudentRow(row) {
  const id = row.id;
  return {
    ...row,
    first_name: 'Élève',
    last_name: `Anonyme-${id}`,
    display_name: `Élève Anonyme-${id}`,
    email: null,
    pseudo: `anon_${id}`,
    avatar_path: null,
    description: null,
  };
}

async function dumpTableRows(conn, writer, table, columns, kind) {
  const { escape } = require('mysql2');
  const { isSecretColumn } = require('../secretGuard');
  const cols = columns.filter((c) => !c.generated);
  if (!cols.length) return 0;
  const binary = new Set(cols.filter((c) => c.binary).map((c) => c.name));
  const nullable = new Map(cols.map((c) => [c.name, c.nullable]));
  const typeCast = (field, next) => {
    if (binary.has(field.name)) return field.buffer();
    if (field.type === 'NULL') return next();
    return field.string();
  };
  const head = `INSERT INTO ${qid(table)} (${cols.map((c) => qid(c.name)).join(', ')}) VALUES\n`;
  let batch = [];
  let batchBytes = 0;
  let count = 0;
  const flush = async () => {
    if (!batch.length) return;
    await writer.write(`${head}${batch.join(',\n')};\n`);
    batch = [];
    batchBytes = 0;
  };
  const query = conn.connection.query({
    sql: `SELECT ${cols.map((c) => qid(c.name)).join(', ')} FROM ${qid(table)}`,
    typeCast,
  });
  for await (let row of query.stream({ highWaterMark: 100 })) {
    if (kind === 'anonymized') {
      if (table === 'users' && row.user_type === 'student') row = anonymizeStudentRow(row);
      for (const c of cols) {
        if (isSecretColumn(c.name) && row[c.name] != null)
          row[c.name] = nullable.get(c.name) ? null : '';
      }
    }
    const tuple = `(${cols.map((c) => escape(row[c.name] ?? null)).join(', ')})`;
    batch.push(tuple);
    batchBytes += tuple.length;
    count += 1;
    if (batch.length >= INSERT_BATCH_ROWS || batchBytes >= INSERT_BATCH_BYTES) await flush();
  }
  await flush();
  return count;
}

/** Export en Node pur (tables puis vues). */
async function nodeDump(file, kind) {
  const { pool } = require('../../../database');
  const { isSecretTable } = require('../secretGuard');
  const writer = fileWriter(file);
  const conn = await pool.getConnection();
  const stats = { tables: 0, views: 0, rows: 0, skipped_data: [] };
  try {
    await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');
    const [list] = await conn.query('SHOW FULL TABLES');
    const nameKey = Object.keys(list[0] || {}).find((k) => k.startsWith('Tables_in_'));
    const tables = list
      .filter((r) => r.Table_type === 'BASE TABLE')
      .map((r) => r[nameKey])
      .sort();
    const views = list
      .filter((r) => r.Table_type === 'VIEW')
      .map((r) => r[nameKey])
      .sort();
    const [colRows] = await conn.query(
      `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS dt, IS_NULLABLE AS n, EXTRA AS x
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [db],
    );
    const columnsOf = new Map();
    for (const r of colRows) {
      if (!columnsOf.has(r.t)) columnsOf.set(r.t, []);
      columnsOf.get(r.t).push({
        name: r.c,
        binary: BINARY_TYPES.has(String(r.dt).toLowerCase()),
        nullable: r.n === 'YES',
        generated: /GENERATED|PERSISTENT/i.test(String(r.x || '')),
      });
    }
    await writer.write(
      [
        `-- Sauvegarde ${kind} de la base ${db} (connecteur MCP, export Node)`,
        `-- générée le ${new Date().toISOString()}`,
        'SET NAMES utf8mb4;',
        'SET FOREIGN_KEY_CHECKS=0;',
        'SET UNIQUE_CHECKS=0;',
        "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';",
        '',
      ].join('\n'),
    );
    for (const t of tables) {
      const [[create]] = await conn.query(`SHOW CREATE TABLE ${qid(t)}`);
      await writer.write(`\nDROP TABLE IF EXISTS ${qid(t)};\n${create['Create Table']};\n`);
      stats.tables += 1;
      if (kind === 'structure') continue;
      if (kind === 'anonymized' && isSecretTable(t)) {
        stats.skipped_data.push(t);
        continue;
      }
      stats.rows += await dumpTableRows(conn, writer, t, columnsOf.get(t) || [], kind);
    }
    for (const v of views) {
      const [[create]] = await conn.query(`SHOW CREATE VIEW ${qid(v)}`);
      await writer.write(`\nDROP VIEW IF EXISTS ${qid(v)};\n${create['Create View']};\n`);
      stats.views += 1;
    }
    await writer.write('\nSET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n');
  } finally {
    try {
      await conn.query('COMMIT');
    } catch {
      /* lecture seule */
    }
    conn.release();
    await writer.close().catch(() => {});
  }
  return stats;
}

/**
 * Écrit la sauvegarde et renvoie son lien signé.
 * @param {{ kind: 'full'|'anonymized'|'structure', engine?: 'auto'|'node', baseUrl?: string }} opts
 */
async function writeDump({ kind, engine = 'auto', baseUrl }) {
  if (!['full', 'anonymized', 'structure'].includes(kind)) {
    throw new McpToolError('Nature de sauvegarde inconnue', 'MCP_INVALID_ARGS');
  }
  const dir = exportDir();
  fs.mkdirSync(dir, { recursive: true });
  require('../tools/data').purgeOldExports();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `dump-${kind}-${stamp}-${crypto.randomBytes(6).toString('hex')}.sql`;
  const file = path.join(dir, name);
  const warnings = [];
  let used = 'node';
  let stats = null;
  const bin = kind !== 'anonymized' && engine !== 'node' ? findMysqldump() : null;
  if (bin) {
    try {
      await runMysqldump(bin, file, kind);
      used = 'mysqldump';
    } catch (err) {
      warnings.push(`mysqldump en échec, repli Node : ${err.message}`);
    }
  }
  if (used === 'node') {
    try {
      stats = await nodeDump(file, kind);
    } catch (err) {
      fs.rmSync(file, { force: true });
      throw new McpToolError(`Sauvegarde impossible : ${err?.message || err}`, 'MCP_DUMP');
    }
  }
  const bytes = fs.statSync(file).size;
  const { signUploadRelativePathFor } = require('../../uploadsSignedUrls');
  const { EXPORT_DIR_REL } = require('../tools/data');
  const signed = signUploadRelativePathFor(`${EXPORT_DIR_REL}/${name}`, LINK_TTL_SECONDS);
  if (!signed) {
    fs.rmSync(file, { force: true });
    throw new McpToolError('Signature de lien indisponible (secret absent)', 'MCP_EXPORT');
  }
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return {
    kind,
    engine: used,
    file: name,
    bytes,
    mb: Math.round((bytes / 1024 / 1024) * 100) / 100,
    ...(stats ? { tables: stats.tables, views: stats.views, rows: stats.rows } : {}),
    ...(stats?.skipped_data?.length ? { structure_only_tables: stats.skipped_data } : {}),
    url: `${base}/uploads/${signed}`,
    expires_at: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString(),
    purge_after_hours: 24,
    ...(warnings.length ? { warnings } : {}),
    ...(kind === 'full'
      ? {
          attention: 'Contient TOUT, secrets compris (empreintes, jetons, TOTP) : ne pas partager.',
        }
      : {}),
  };
}

module.exports = { anonymizeStudentRow, exportDir, findMysqldump, nodeDump, writeDump };
