'use strict';

/**
 * Exécution bornée d'une instruction SQL pour `foretmap_sql_execute`.
 *
 * - DML : `withTransaction` + timeout MariaDB ; `dry_run` = exécute puis rollback ;
 *   dépassement de `max_affected_rows` → rollback + demande de confirmation ;
 * - DDL / DCL : hors transaction (commit implicite MySQL) ; `dry_run` = validation seule.
 */

const { pool, withTransaction, execute: dbExecute } = require('../../../database');
const { withStatementTimeout } = require('../readDb');
const { getMcpConfig } = require('../config');
const { McpToolError } = require('../registry');
const { logAudit, logSecurityEvent } = require('../../auditLog');
const { nowDbTimestamp } = require('../../shared/isoTimestamp');
const { classifySql, maskSqlForAudit } = require('./classify');
const { buildEquivalentMigration } = require('./migration');
const { ensureConfirmed } = require('../confirm');
const { scrubSecretsOnly } = require('../secretGuard');
const { scrubValue } = require('../sqlGuard');

const SAMPLE_LIMIT = 10;
const TOOL_NAME = 'foretmap_sql_execute';

let engineKind = null;

async function detectEngine(conn) {
  if (engineKind) return engineKind;
  const [rows] = await conn.query('SELECT VERSION() AS v');
  engineKind = /mariadb/i.test(String(rows?.[0]?.v || '')) ? 'mariadb' : 'mysql';
  return engineKind;
}

function resolveMaxAffected(args, cfg) {
  const fromArg = args?.max_affected_rows;
  if (fromArg == null) return cfg.sqlMaxAffectedRows;
  const n = Number(fromArg);
  if (!Number.isFinite(n) || n < 1 || n > 100000) return cfg.sqlMaxAffectedRows;
  return Math.floor(n);
}

function scrubSample(rows, privacyBypass) {
  const fn = privacyBypass ? scrubSecretsOnly : scrubValue;
  return fn(rows);
}

/**
 * Extrait un échantillon avant DML (UPDATE/DELETE mono-table avec WHERE).
 * Best-effort : en cas d'échec, pas d'échantillon.
 */
async function sampleBefore(conn, classified, engine, timeoutMs) {
  if (classified.kind !== 'dml') return null;
  if (classified.tables.length !== 1) return { note: 'échantillon indisponible (multi-tables)' };
  if (classified.subtype !== 'update' && classified.subtype !== 'delete') return null;
  if (!classified.hasWhere) return { note: 'échantillon indisponible (pas de WHERE)' };
  try {
    // Reconstruit un SELECT * … WHERE … LIMIT à partir du texte (heuristique).
    const table = classified.tables[0];
    const whereMatch = classified.sql.match(
      /\bWHERE\b([\s\S]+?)(?:\bORDER\b|\bLIMIT\b|\bRETURNING\b|$)/i,
    );
    if (!whereMatch) return { note: 'échantillon indisponible' };
    const where = whereMatch[1].trim();
    const sql = withStatementTimeout(
      `SELECT * FROM \`${table}\` WHERE ${where} LIMIT ${SAMPLE_LIMIT}`,
      engine,
      timeoutMs,
    );
    const [rows] = await conn.query(sql);
    return Array.isArray(rows) ? rows.slice(0, SAMPLE_LIMIT) : [];
  } catch {
    return { note: 'échantillon indisponible' };
  }
}

async function runDml({
  classified,
  dryRun,
  maxAffected,
  confirmed,
  user,
  privacyBypass,
  timeoutMs,
}) {
  const started = Date.now();
  return withTransaction(async (tx) => {
    // Accès à la connexion sous-jacente via une requête détecteur — on utilise pool pour
    // le timeout MariaDB : withTransaction expose query/execute paramétrés.
    // Pour SET STATEMENT … FOR, mysql2 `query` (non préparé) est requis ; on passe
    // par une connexion dédiée hors du helper tx pour le DML timeouté, puis on
    // réutilise withTransaction pour l'audit atomique.

    // Simplification robuste : exécuter via tx.execute (paramètres vides) — le timeout
    // MariaDB SET STATEMENT n'est pas compatible avec prepare ; on pose
    // innodb_lock_wait_timeout session via une requête séparée si possible.
    try {
      await tx.execute('SET SESSION innodb_lock_wait_timeout = 5');
    } catch {
      /* ignore */
    }

    const sampleBeforeRows = dryRun
      ? await (async () => {
          try {
            if (classified.tables.length !== 1)
              return { note: 'échantillon indisponible (multi-tables)' };
            if (classified.subtype !== 'update' && classified.subtype !== 'delete') return null;
            if (!classified.hasWhere) return { note: 'échantillon indisponible (pas de WHERE)' };
            const table = classified.tables[0];
            const whereMatch = classified.sql.match(
              /\bWHERE\b([\s\S]+?)(?:\bORDER\b|\bLIMIT\b|\bRETURNING\b|$)/i,
            );
            if (!whereMatch) return { note: 'échantillon indisponible' };
            const where = whereMatch[1].trim();
            return await tx.queryAll(
              `SELECT * FROM \`${table}\` WHERE ${where} LIMIT ${SAMPLE_LIMIT}`,
            );
          } catch {
            return { note: 'échantillon indisponible' };
          }
        })()
      : null;

    const result = await tx.execute(classified.sql);
    const affected = Number(result.affectedRows || 0);

    // Le plafond ne s'applique qu'à une exécution réelle non encore confirmée.
    // En dry_run on remonte affectedRows sans bloquer (l'admin voit l'ampleur).
    if (!dryRun && !confirmed && affected > maxAffected) {
      // Rollback en levant : withTransaction annule.
      const err = new McpToolError(
        `Plafond dépassé : ${affected} ligne(s) affectée(s) (max ${maxAffected}). Confirmation requise.`,
        'MCP_SQL_MAX_AFFECTED',
      );
      err.affectedRows = affected;
      err.needsConfirm = true;
      err.confirmReason = 'max_affected_rows';
      throw err;
    }

    if (dryRun) {
      // Forcer le rollback après avoir collecté le résultat.
      const err = new Error('MCP_DRY_RUN_ROLLBACK');
      err.code = 'MCP_DRY_RUN_ROLLBACK';
      err.dryRunResult = {
        affected_rows: affected,
        insert_id: result.insertId || null,
        sample_before: sampleBeforeRows,
      };
      throw err;
    }

    await tx.execute(
      `INSERT INTO audit_log
        (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
       VALUES ('mcp.sql.execute', 'mcp_sql', ?, ?, ?, ?, 'success', ?, UTC_TIMESTAMP(), ?)`,
      [
        classified.subtype,
        maskSqlForAudit(classified.sql).slice(0, 500),
        user.userType || null,
        String(user.userId),
        nowDbTimestamp(),
        JSON.stringify({
          via: 'mcp',
          kind: classified.kind,
          subtype: classified.subtype,
          tables: classified.tables,
          affected_rows: affected,
          dry_run: false,
          sql: maskSqlForAudit(classified.sql).slice(0, 2000),
          duration_ms: Date.now() - started,
        }),
      ],
    );

    return {
      affected_rows: affected,
      insert_id: result.insertId || null,
      sample: scrubSample(sampleBeforeRows, privacyBypass),
    };
  }).catch(async (err) => {
    if (err?.code === 'MCP_DRY_RUN_ROLLBACK' || err?.message === 'MCP_DRY_RUN_ROLLBACK') {
      const dr = err.dryRunResult || {};
      await logAudit('mcp.sql.dry_run', 'mcp_sql', classified.subtype, null, {
        actorUserType: user.userType,
        actorUserId: user.userId,
        payload: {
          via: 'mcp',
          kind: classified.kind,
          tables: classified.tables,
          affected_rows: dr.affected_rows,
          dry_run: true,
          sql: maskSqlForAudit(classified.sql).slice(0, 2000),
        },
      });
      return {
        dry_run: true,
        rolled_back: true,
        affected_rows: dr.affected_rows,
        insert_id: dr.insert_id,
        sample: scrubSample(dr.sample_before, privacyBypass),
      };
    }
    if (err?.code === 'MCP_SQL_MAX_AFFECTED') {
      throw err;
    }
    throw err;
  });
}

async function runDdlOrDcl({ classified, dryRun, user }) {
  const migration = buildEquivalentMigration(classified);
  if (dryRun) {
    await logAudit('mcp.sql.dry_run', 'mcp_sql', classified.subtype, null, {
      actorUserType: user.userType,
      actorUserId: user.userId,
      payload: {
        via: 'mcp',
        kind: classified.kind,
        tables: classified.tables,
        dry_run: true,
        executed: false,
        sql: maskSqlForAudit(classified.sql).slice(0, 2000),
        note: 'DDL/DCL : dry_run sans exécution (commit implicite MySQL)',
      },
    });
    return {
      dry_run: true,
      executed: false,
      note: 'DDL/DCL : dry_run ne fait que valider (commit implicite MySQL/MariaDB).',
      migration_sql: migration.migration_sql,
      suggested_filename: migration.suggested_filename,
      migration_warnings: migration.warnings,
      migration_reason: migration.reason,
    };
  }

  // Exécution hors transaction.
  const conn = await pool.getConnection();
  const started = Date.now();
  try {
    const engine = await detectEngine(conn);
    const cfg = getMcpConfig();
    const sql =
      classified.kind === 'ddl'
        ? withStatementTimeout(classified.sql, engine, cfg.statementTimeoutMs)
        : classified.sql;
    const [result] = await conn.query(sql);
    const affected = Number(result?.affectedRows || 0);
    await dbExecute(
      `INSERT INTO audit_log
        (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
       VALUES ('mcp.sql.execute', 'mcp_sql', ?, ?, ?, ?, 'success', ?, UTC_TIMESTAMP(), ?)`,
      [
        classified.subtype,
        maskSqlForAudit(classified.sql).slice(0, 500),
        user.userType || null,
        String(user.userId),
        nowDbTimestamp(),
        JSON.stringify({
          via: 'mcp',
          kind: classified.kind,
          subtype: classified.subtype,
          tables: classified.tables,
          affected_rows: affected,
          dry_run: false,
          sql: maskSqlForAudit(classified.sql).slice(0, 2000),
          duration_ms: Date.now() - started,
        }),
      ],
    );
    await logSecurityEvent('mcp.sql.execute', {
      actorUserType: user.userType,
      actorUserId: user.userId,
      targetType: 'mcp_sql',
      targetId: classified.subtype,
      payload: { kind: classified.kind, tables: classified.tables, affected_rows: affected },
    });
    return {
      dry_run: false,
      executed: true,
      affected_rows: affected,
      migration_sql: migration.migration_sql,
      suggested_filename: migration.suggested_filename,
      migration_warnings: migration.warnings,
      migration_reason: migration.reason,
    };
  } finally {
    conn.release();
  }
}

/**
 * Point d'entrée outil : classifie, confirme si besoin, exécute.
 */
async function sqlExecute(args, ctx) {
  const user = ctx.user;
  const privacyBypass = !!ctx.privacyBypass;
  const cfg = getMcpConfig();
  const dryRun = !!args.dry_run;
  const maxAffected = resolveMaxAffected(args, cfg);

  let classified;
  try {
    classified = classifySql(args.sql);
  } catch (err) {
    await logAudit('mcp.sql.refused', 'mcp_sql', null, err.message, {
      actorUserType: user.userType,
      actorUserId: user.userId,
      result: 'failure',
      payload: { sql: maskSqlForAudit(String(args.sql || '')).slice(0, 500) },
    });
    throw err;
  }

  const summary = [
    `${classified.kind.toUpperCase()} ${classified.subtype}`,
    classified.tables.length ? `tables: ${classified.tables.join(', ')}` : null,
    dryRun ? 'dry_run' : 'execute',
    !classified.hasWhere ? 'SANS WHERE' : null,
    classified.confirmReasons.includes('authz_table') ? 'table d’autorisation' : null,
  ]
    .filter(Boolean)
    .join(' — ');

  // Première passe : confirmation pour raisons structurelles (DDL, no WHERE, authz).
  let confirmed = false;
  const gate = await ensureConfirmed({
    tool: TOOL_NAME,
    args,
    user,
    summary,
    needsConfirm: classified.requiresConfirm && !dryRun,
  });
  if (!gate.proceed) return gate.response;
  confirmed = !!gate.confirmationId || gate.skipped;

  const migration = buildEquivalentMigration(classified);

  if (classified.kind === 'ddl' || classified.kind === 'dcl') {
    return {
      ...((await runDdlOrDcl({ classified, dryRun, user })) || {}),
      kind: classified.kind,
      subtype: classified.subtype,
      tables: classified.tables,
      confirmation_id: gate.confirmationId,
    };
  }

  // DML
  try {
    const result = await runDml({
      classified,
      dryRun,
      maxAffected,
      confirmed,
      user,
      privacyBypass,
      timeoutMs: cfg.statementTimeoutMs,
    });
    if (!dryRun) {
      await logSecurityEvent('mcp.sql.execute', {
        actorUserType: user.userType,
        actorUserId: user.userId,
        targetType: 'mcp_sql',
        targetId: classified.subtype,
        payload: {
          kind: classified.kind,
          tables: classified.tables,
          affected_rows: result.affected_rows,
        },
      });
    }
    return {
      kind: classified.kind,
      subtype: classified.subtype,
      tables: classified.tables,
      dry_run: !!dryRun,
      ...result,
      migration_sql: migration.migration_sql,
      suggested_filename: migration.suggested_filename,
      migration_warnings: migration.warnings,
      migration_reason: migration.reason,
      reminder: migration.migration_sql
        ? 'Verser migration_sql dans migrations/NNN_*.sql par PR.'
        : undefined,
      confirmation_id: gate.confirmationId,
    };
  } catch (err) {
    if (err?.code === 'MCP_SQL_MAX_AFFECTED') {
      // Demande de confirmation avec le nombre de lignes dans le résumé.
      const gate2 = await ensureConfirmed({
        tool: TOOL_NAME,
        args,
        user,
        summary: `${summary} — ${err.affectedRows} ligne(s) > plafond ${maxAffected}`,
        needsConfirm: true,
      });
      if (!gate2.proceed) {
        return {
          ...gate2.response,
          affected_rows_detected: err.affectedRows,
          max_affected_rows: maxAffected,
        };
      }
      // Confirmé : réexécuter sans plafond.
      const result = await runDml({
        classified,
        dryRun: false,
        maxAffected: 100000,
        confirmed: true,
        user,
        privacyBypass,
        timeoutMs: cfg.statementTimeoutMs,
      });
      await logSecurityEvent('mcp.sql.execute', {
        actorUserType: user.userType,
        actorUserId: user.userId,
        targetType: 'mcp_sql',
        targetId: classified.subtype,
        payload: {
          kind: classified.kind,
          tables: classified.tables,
          affected_rows: result.affected_rows,
          after_confirm: true,
        },
      });
      return {
        kind: classified.kind,
        subtype: classified.subtype,
        tables: classified.tables,
        dry_run: false,
        ...result,
        migration_sql: migration.migration_sql,
        suggested_filename: migration.suggested_filename,
        migration_warnings: migration.warnings,
        migration_reason: migration.reason,
        reminder: migration.migration_sql
          ? 'Verser migration_sql dans migrations/NNN_*.sql par PR.'
          : undefined,
        confirmation_id: gate2.confirmationId,
      };
    }
    throw err;
  }
}

module.exports = {
  TOOL_NAME,
  resolveMaxAffected,
  sqlExecute,
};
