'use strict';

/**
 * Écriture de contenu par le connecteur MCP — patron **plan → apply**.
 *
 * 1. `planContentChange(ops, user)` lit l'état « avant » de chaque cible (lecture seule),
 *    calcule le diff avant/après, les risques, une **migration SQL idempotente** et son
 *    **rollback**, et enregistre le plan (`mcp_content_plans`, expiration ~1 h). Rien n'est
 *    écrit dans le contenu.
 * 2. `applyPlan(planId, user)` relit l'état, vérifie qu'il est **identique** à celui du plan
 *    (empreinte sha256) — sinon `conflict`, rien n'est écrit —, applique toutes les opérations
 *    dans **une** transaction, journalise dans `audit_log`, et renvoie la migration à verser
 *    par PR.
 * 3. `exportPlanAsMigration(planId)` renvoie seulement le fichier de migration + rollback,
 *    pour la voie « par PR » (recommandée pour le corpus semé par les migrations).
 *
 * Pourquoi la migration accompagne toujours l'écriture : le corpus pédagogique est **semé par
 * les migrations** et vérifié par `tests/content/`. Une correction faite seulement en base de
 * production serait écrasée par une future migration, ou ferait diverger la prod d'une base
 * neuve (`db:init`). Verser la migration générée dans le dépôt referme cette dérive.
 *
 * Les valeurs SQL de la migration générée sont échappées par `mysql2.escape` (identifiants :
 * liste blanche, jamais du texte reçu).
 */

const crypto = require('node:crypto');
const mysql = require('mysql2');
const { queryOne, execute, withTransaction } = require('../../../database');
const { withReadOnly } = require('../readDb');
const { getMcpConfig } = require('../config');
const { McpToolError } = require('../registry');
const { EDITABLE_FIELDS, LINK_TABLES, normalizeOperations } = require('./operations');
const { logSecurityEvent } = require('../../auditLog');
const { nowDbTimestamp } = require('../../shared/isoTimestamp');

const esc = (v) => mysql.escape(v);

function whereFor(key) {
  return Object.keys(key)
    .map((c) => `${c} = ${esc(key[c])}`)
    .join(' AND ');
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Lit l'état actuel de chaque cible (dans la transaction donnée ou en lecture seule). */
async function readBefore(ops, read) {
  const states = [];
  for (const op of ops) {
    if (op.op === 'set_field') {
      const where = Object.keys(op.key).map((c) => `${c} = ?`);
      const row = await read(
        `SELECT ${op.column} AS v FROM ${op.table} WHERE ${where.join(' AND ')}`,
        Object.values(op.key),
      );
      states.push({ exists: !!row, value: row ? (row.v ?? null) : null });
    } else {
      const def = Object.hasOwn(LINK_TABLES, op.table) ? LINK_TABLES[op.table] : null;
      if (!def) throw new McpToolError(`Liaison « ${op.table} » non admise`, 'MCP_WRITE_REJECTED');
      const row = await read(
        `SELECT 1 AS x FROM ${op.table} WHERE ${def.cols.map((c) => `${c} = ?`).join(' AND ')}`,
        def.cols.map((c) => op.key[c]),
      );
      const [parentCol] = Object.keys(def.parents);
      const [parentTable, parentPk] = def.parents[parentCol];
      const parent = await read(`SELECT 1 AS x FROM ${parentTable} WHERE ${parentPk} = ?`, [
        op.key[parentCol],
      ]);
      const plant = await read('SELECT 1 AS x FROM plants WHERE id = ?', [op.key.plant_id]);
      states.push({ exists: !!row, parentExists: !!parent, plantExists: !!plant });
    }
  }
  return states;
}

function describeRisks(ops, states) {
  const risks = [];
  ops.forEach((op, i) => {
    const st = states[i];
    if (op.op === 'set_field') {
      if (!st.exists)
        risks.push(`#${i + 1} : ligne ${op.table} ${JSON.stringify(op.key)} introuvable`);
      else if (st.value === op.value)
        risks.push(`#${i + 1} : valeur identique, opération sans effet`);
      if (op.value === null || op.value === '') risks.push(`#${i + 1} : le champ sera vidé`);
      if (['name', 'scientific_name', 'label'].includes(op.column)) {
        risks.push(`#${i + 1} : renommer change la recherche, les alias et les tests de contenu`);
      }
    } else {
      if (!st.parentExists || !st.plantExists)
        risks.push(`#${i + 1} : cible ou espèce introuvable`);
      if (op.op === 'link' && st.exists) risks.push(`#${i + 1} : liaison déjà présente`);
      if (op.op === 'unlink' && !st.exists) risks.push(`#${i + 1} : liaison déjà absente`);
      if (op.op === 'unlink')
        risks.push(`#${i + 1} : détacher retire l’espèce de la carte et des réseaux`);
    }
  });
  return risks;
}

/** Migration idempotente + rollback équivalents aux opérations. */
function buildMigration(ops, states, { planId, note }) {
  const header = [
    '-- =====================================================================',
    `-- Correction de contenu préparée par le connecteur MCP (plan ${planId}).`,
    note ? `-- ${String(note).replace(/\s+/g, ' ').slice(0, 200)}` : null,
    '-- Idempotente : chaque UPDATE est gardé par la valeur attendue avant correction,',
    '-- chaque liaison par INSERT IGNORE / DELETE ciblé. Rejouable sans effet.',
    '-- Rollback : voir le bloc fourni avec ce plan (foretmap_export_plan_as_migration).',
    '-- =====================================================================',
  ].filter(Boolean);
  const up = [];
  const down = [];
  ops.forEach((op, i) => {
    const st = states[i];
    if (op.op === 'set_field') {
      const guardBefore =
        st.value === null
          ? `${op.column} IS NULL`
          : `BINARY ${op.column} = BINARY ${esc(st.value)}`;
      const guardAfter =
        op.value === null
          ? `${op.column} IS NULL`
          : `BINARY ${op.column} = BINARY ${esc(op.value)}`;
      up.push(
        `UPDATE ${op.table} SET ${op.column} = ${esc(op.value)}\n WHERE ${whereFor(op.key)} AND ${guardBefore};`,
      );
      down.push(
        `UPDATE ${op.table} SET ${op.column} = ${esc(st.value)}\n WHERE ${whereFor(op.key)} AND ${guardAfter};`,
      );
    } else {
      const def = Object.hasOwn(LINK_TABLES, op.table) ? LINK_TABLES[op.table] : null;
      if (!def) throw new McpToolError(`Liaison « ${op.table} » non admise`, 'MCP_WRITE_REJECTED');
      const cols = def.cols.join(', ');
      const vals = def.cols.map((c) => esc(op.key[c])).join(', ');
      const ins = `INSERT IGNORE INTO ${op.table} (${cols}) VALUES (${vals});`;
      const del = `DELETE FROM ${op.table} WHERE ${whereFor(op.key)};`;
      if (op.op === 'link') {
        up.push(ins);
        if (!st.exists) down.push(del);
      } else {
        up.push(del);
        if (st.exists) down.push(ins);
      }
    }
  });
  return {
    migration_sql: `${header.join('\n')}\n\n${up.join('\n\n')}\n`,
    rollback_sql: `-- Rollback du plan ${planId}\n\n${down.reverse().join('\n\n')}\n`,
  };
}

function buildDiff(ops, states) {
  return ops.map((op, i) => {
    if (op.op === 'set_field') {
      return {
        table: op.table,
        key: op.key,
        column: op.column,
        before: states[i].value,
        after: op.value,
      };
    }
    return { table: op.table, key: op.key, change: op.op, present_before: states[i].exists };
  });
}

async function planContentChange({ operations, note }, user) {
  const ops = normalizeOperations(operations);
  const states = await withReadOnly((db) => readBefore(ops, (sql, params) => db.one(sql, params)));
  const planId = crypto.randomUUID();
  const diff = buildDiff(ops, states);
  const risks = describeRisks(ops, states);
  const { migration_sql, rollback_sql } = buildMigration(ops, states, { planId, note });
  const cfg = getMcpConfig();
  await execute(
    `INSERT INTO mcp_content_plans
       (id, user_id, operations_json, before_hash, diff_json, migration_sql, rollback_sql, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [
      planId,
      String(user.userId),
      JSON.stringify({ ops, note: note || null }),
      stableHash(states),
      JSON.stringify(diff),
      migration_sql,
      rollback_sql,
      cfg.planTtlMinutes,
    ],
  );
  return {
    plan_id: planId,
    expires_in_minutes: cfg.planTtlMinutes,
    diff,
    risks,
    migration_sql,
    rollback_sql,
    next: 'Montrer le diff à la personne. Pour appliquer : foretmap_apply_plan. Pour la voie par PR : foretmap_export_plan_as_migration.',
  };
}

async function loadPlan(planId, user) {
  const plan = await queryOne(
    `SELECT id, user_id, operations_json, before_hash, migration_sql, rollback_sql, status,
            (expires_at > NOW()) AS fresh
       FROM mcp_content_plans WHERE id = ? LIMIT 1`,
    [String(planId)],
  );
  if (!plan) throw new McpToolError('Plan introuvable', 'MCP_NOT_FOUND');
  if (user && String(plan.user_id) !== String(user.userId)) {
    throw new McpToolError('Ce plan appartient à un autre compte', 'MCP_FORBIDDEN');
  }
  return plan;
}

async function applyPlan(planId, user, options = {}) {
  const via = options.via || 'mcp';
  const plan = await loadPlan(planId, user);
  if (plan.status !== 'planned') {
    throw new McpToolError(`Plan déjà ${plan.status}`, 'MCP_PLAN_STATE');
  }
  if (!Number(plan.fresh)) {
    await execute("UPDATE mcp_content_plans SET status = 'expired' WHERE id = ?", [plan.id]);
    throw new McpToolError('Plan expiré : en préparer un nouveau', 'MCP_PLAN_EXPIRED');
  }
  const stored = JSON.parse(plan.operations_json);
  const note = stored.note || null;
  // Revalidation à l'application (relecture de sécurité, M7) : la liste blanche est rejouée
  // sur les opérations stockées — un plan préparé avant un resserrement de la liste, ou une
  // ligne altérée en base, n'écrit rien hors de ce qui est admis **aujourd'hui**.
  let ops;
  try {
    ops = normalizeOperations(stored.ops);
  } catch (err) {
    throw new McpToolError(`Plan refusé à l'application : ${err.message}`, 'MCP_WRITE_REJECTED');
  }
  const auditPayload = (affected) =>
    JSON.stringify({
      via,
      operations: ops.length,
      tables: [...new Set(ops.map((o) => o.table))],
      affected_rows: affected,
    });
  const result = await withTransaction(async (tx) => {
    // Verrou des lignes cibles le temps de la comparaison et de l'écriture.
    const states = await readBefore(ops, (sql, params) => tx.queryOne(`${sql} FOR UPDATE`, params));
    if (stableHash(states) !== plan.before_hash) {
      return { conflict: true };
    }
    let affected = 0;
    for (const op of ops) {
      if (op.op === 'set_field') {
        const where = Object.keys(op.key).map((c) => `${c} = ?`);
        const res = await tx.execute(
          `UPDATE ${op.table} SET ${op.column} = ? WHERE ${where.join(' AND ')}`,
          [op.value, ...Object.values(op.key)],
        );
        affected += res.affectedRows;
      } else {
        const def = Object.hasOwn(LINK_TABLES, op.table) ? LINK_TABLES[op.table] : null;
        if (!def)
          throw new McpToolError(`Liaison « ${op.table} » non admise`, 'MCP_WRITE_REJECTED');
        const vals = def.cols.map((c) => op.key[c]);
        const res =
          op.op === 'link'
            ? await tx.execute(
                `INSERT IGNORE INTO ${op.table} (${def.cols.join(', ')}) VALUES (${def.cols.map(() => '?').join(', ')})`,
                vals,
              )
            : await tx.execute(
                `DELETE FROM ${op.table} WHERE ${def.cols.map((c) => `${c} = ?`).join(' AND ')}`,
                vals,
              );
        affected += res.affectedRows;
      }
    }
    const marked = await tx.execute(
      "UPDATE mcp_content_plans SET status = 'applied', applied_at = NOW() WHERE id = ? AND status = 'planned'",
      [plan.id],
    );
    if (marked.affectedRows !== 1) {
      throw new McpToolError('Plan appliqué entre-temps', 'MCP_PLAN_STATE');
    }
    // Journal d'audit **dans** la transaction : s'il échoue, rien n'est écrit (M7).
    // Même forme que `lib/auditLog.js` (logAudit), sans son repli silencieux.
    await tx.execute(
      `INSERT INTO audit_log
        (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
       VALUES ('mcp.content.apply', 'mcp_plan', ?, ?, ?, ?, 'success', ?, UTC_TIMESTAMP(), ?)`,
      [
        plan.id,
        note,
        user.userType || null,
        String(user.userId),
        nowDbTimestamp(),
        auditPayload(affected),
      ],
    );
    return { conflict: false, affected };
  });
  if (result.conflict) {
    await execute("UPDATE mcp_content_plans SET status = 'conflict' WHERE id = ?", [plan.id]);
    throw new McpToolError(
      'Le contenu a changé depuis le plan : rien n’a été écrit. Préparer un nouveau plan.',
      'MCP_PLAN_CONFLICT',
    );
  }
  // Duplication dans le journal de sécurité (comme logAudit) : best effort, après commit.
  await logSecurityEvent('mcp.content.apply', {
    actorUserType: user.userType,
    actorUserId: user.userId,
    targetType: 'mcp_plan',
    targetId: plan.id,
    payload: { via, operations: ops.length, affected_rows: result.affected },
  });
  return {
    plan_id: plan.id,
    applied: true,
    affected_rows: result.affected,
    migration_sql: plan.migration_sql,
    rollback_sql: plan.rollback_sql,
    reminder:
      'Verser migration_sql dans migrations/NNN_*.sql par PR, sinon une base neuve (db:init) ou une future migration divergera de la production.',
  };
}

/**
 * Écriture directe : plan puis apply en un seul appel (même validation, transaction, audit).
 * Le plan reste stocké pour la trace et l'export de migration.
 */
async function applyContentChangeDirect({ operations, note }, user) {
  const planned = await planContentChange({ operations, note }, user);
  const applied = await applyPlan(planned.plan_id, user, { via: 'mcp_direct' });
  return {
    plan_id: planned.plan_id,
    applied: true,
    diff: planned.diff,
    risks: planned.risks,
    affected_rows: applied.affected_rows,
    migration_sql: applied.migration_sql,
    rollback_sql: applied.rollback_sql,
    reminder: applied.reminder,
  };
}

async function exportPlanAsMigration(planId, user) {
  const plan = await loadPlan(planId, user);
  return {
    plan_id: plan.id,
    status: plan.status,
    suggested_filename: `migrations/NNN_contenu_mcp_${plan.id.slice(0, 8)}.sql`,
    migration_sql: plan.migration_sql,
    rollback_sql: plan.rollback_sql,
  };
}

module.exports = {
  EDITABLE_FIELDS,
  applyContentChangeDirect,
  applyPlan,
  buildMigration,
  exportPlanAsMigration,
  planContentChange,
};
