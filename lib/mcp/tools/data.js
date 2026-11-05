'use strict';

/**
 * Socle de données du connecteur (lot C) :
 * - `foretmap_describe_schema` : structure de la base (tables, colonnes, clés, index, vues,
 *   volumes approximatifs, migration courante), tables `gl_*` exclues, colonnes secrètes
 *   signalées « masquée » ;
 * - `foretmap_export` : export CSV / XLSX / JSON d'une requête ou d'une table vers un fichier
 *   privé (`uploads/mcp-exports/`), lien signé d'une heure, fichier purgé après 24 h ;
 * - `foretmap_entity_history` : journal d'audit d'une entité et révision d'édition courante ;
 *   `restore` réapplique des valeurs **par le pont API** (PUT de la ressource), pour repasser
 *   par la logique métier.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');
const { SCOPES, getMcpConfig } = require('../config');
const { McpToolError } = require('../registry');
const { READ_ONLY } = require('./common');
const { isSecretColumn, isSecretTable } = require('../secretGuard');

const EXPORT_DIR_REL = 'mcp-exports';
const EXPORT_MAX_BYTES = 50 * 1024 * 1024;
const EXPORT_LINK_TTL_SECONDS = 60 * 60;
const EXPORT_KEEP_MS = 24 * 60 * 60 * 1000;
const EXPORT_PAGE = 5000;
const EXPORT_MAX_ROWS = 2_000_000;

const GL_TABLE_RE = /^gl_/i;

function db() {
  return require('../../../database');
}

// ---------------------------------------------------------------------------------------------
// foretmap_describe_schema
// ---------------------------------------------------------------------------------------------

async function describeSchema(args) {
  const { queryAll, queryOne } = db();
  const tableFilter = String(args.table || '').trim();
  const q = String(args.q || '')
    .trim()
    .toLowerCase();
  const tables = await queryAll(
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS approx_rows,
            TABLE_COMMENT AS comment
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME`,
  );
  const kept = tables.filter((t) => {
    const name = String(t.name);
    if (GL_TABLE_RE.test(name)) return false;
    if (tableFilter && name !== tableFilter) return false;
    return true;
  });
  const names = new Set(kept.map((t) => String(t.name)));
  const detailed = Boolean(tableFilter) || names.size <= 40 || Boolean(args.with_columns);
  const columns = await queryAll(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_DEFAULT AS dflt, COLUMN_KEY AS ckey, EXTRA AS extra, COLUMN_COMMENT AS comment
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  );
  const fks = await queryAll(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS ref_table,
            REFERENCED_COLUMN_NAME AS ref_col, CONSTRAINT_NAME AS name
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  const indexes = await queryAll(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS name, NON_UNIQUE AS non_unique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`,
  );
  const byTable = (rows) => {
    const map = new Map();
    for (const r of rows) {
      const t = String(r.t);
      if (!names.has(t)) continue;
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(r);
    }
    return map;
  };
  const colMap = byTable(columns);
  const fkMap = byTable(fks);
  const idxMap = byTable(indexes);
  let migration = null;
  try {
    const row = await queryOne('SELECT version FROM schema_version LIMIT 1');
    migration = row ? Number(row.version) : null;
  } catch (_) {
    migration = null;
  }
  const out = [];
  for (const t of kept) {
    const name = String(t.name);
    const cols = colMap.get(name) || [];
    const secretTable = isSecretTable(name);
    const entry = {
      name,
      kind: String(t.type) === 'VIEW' ? 'vue' : 'table',
      approx_rows: t.approx_rows == null ? null : Number(t.approx_rows),
      comment: t.comment || undefined,
      secret_table: secretTable || undefined,
      primary_key: cols.filter((c) => c.ckey === 'PRI').map((c) => c.name),
    };
    if (detailed) {
      entry.columns = cols.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable === 'YES',
        default: c.dflt === null ? undefined : c.dflt,
        extra: c.extra || undefined,
        comment: c.comment || undefined,
        masquee: secretTable || isSecretColumn(String(c.name)) ? true : undefined,
      }));
      entry.foreign_keys = (fkMap.get(name) || []).map((f) => ({
        column: f.col,
        references: `${f.ref_table}.${f.ref_col}`,
        name: f.name,
      }));
      entry.indexes = (idxMap.get(name) || []).map((i) => ({
        name: i.name,
        unique: Number(i.non_unique) === 0,
        columns: String(i.cols || '').split(','),
      }));
    } else {
      entry.column_count = cols.length;
    }
    if (q) {
      const hay =
        `${name} ${entry.comment || ''} ${cols.map((c) => c.name).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(entry);
  }
  return {
    migration_courante: migration,
    count: out.length,
    detail: detailed ? 'complet' : 'résumé (filtrer par table, ou with_columns=true)',
    tables: out,
  };
}

// ---------------------------------------------------------------------------------------------
// foretmap_export
// ---------------------------------------------------------------------------------------------

function exportDir() {
  return path.resolve(__dirname, '..', '..', '..', 'uploads', EXPORT_DIR_REL);
}

/** Supprime les exports de plus de 24 h ; renvoie le nombre de fichiers retirés. */
function purgeOldExports({ now = Date.now(), apply = true, keepMs = EXPORT_KEEP_MS } = {}) {
  const dir = exportDir();
  let removed = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return 0;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile() || now - st.mtimeMs < keepMs) continue;
      if (apply) fs.unlinkSync(full);
      removed += 1;
    } catch (_) {
      // fichier disparu entre-temps
    }
  }
  return removed;
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s =
    v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeName(raw, fallback) {
  const base = String(raw || fallback)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return base || fallback;
}

/** Écrit le fichier d'export et renvoie le lien signé d'une heure. */
async function writeExportFile({ rows, columns, format, name, baseUrl }) {
  const { scrubSecretsOnly } = require('../secretGuard');
  const clean = rows.map((r) => scrubSecretsOnly(r));
  const cols = columns.filter((c) => !isSecretColumn(String(c)));
  let buffer;
  if (format === 'json') {
    buffer = Buffer.from(JSON.stringify(clean), 'utf8');
  } else if (format === 'csv') {
    const lines = [cols.map(csvCell).join(',')];
    for (const r of clean) lines.push(cols.map((c) => csvCell(r[c])).join(','));
    buffer = Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
  } else {
    const { buildWorkbookBuffer, jsonRowsToAoa } = require('../../spreadsheet');
    const aoa = jsonRowsToAoa(
      clean.map((r) => {
        const o = {};
        for (const c of cols) {
          const v = r[c];
          o[c] =
            v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
        }
        return o;
      }),
      cols,
    );
    buffer = await buildWorkbookBuffer([{ name: 'Export', aoa }]);
  }
  if (buffer.length > EXPORT_MAX_BYTES) {
    throw new McpToolError(
      'Export trop volumineux (50 Mo maximum) : filtrez la requête',
      'MCP_EXPORT_SIZE',
    );
  }
  const dir = exportDir();
  fs.mkdirSync(dir, { recursive: true });
  purgeOldExports();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${safeName(name, 'export')}-${stamp}-${crypto.randomBytes(6).toString('hex')}.${format}`;
  fs.writeFileSync(path.join(dir, file), buffer);
  const { signUploadRelativePathFor } = require('../../uploadsSignedUrls');
  const signed = signUploadRelativePathFor(`${EXPORT_DIR_REL}/${file}`, EXPORT_LINK_TTL_SECONDS);
  if (!signed)
    throw new McpToolError('Signature de lien indisponible (secret absent)', 'MCP_EXPORT');
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return {
    file,
    bytes: buffer.length,
    url: `${base}/uploads/${signed}`,
    expires_at: new Date(Date.now() + EXPORT_LINK_TTL_SECONDS * 1000).toISOString(),
    purge_after_hours: 24,
  };
}

async function exportHandler(args, ctx) {
  const { validateSelectSql, tablesWithSecretColumns } = require('./sqlSelect');
  const { analyzeSelect } = require('../sqlAst');
  const { withReadOnly, isReadOnlyPoolConfigured } = require('../readDb');
  const cfg = ctx.cfg || getMcpConfig();
  const privacyBypass = !!ctx.privacyBypass;
  if (!args.sql === !args.table) {
    throw new McpToolError('Indiquer soit `sql`, soit `table`', 'MCP_EXPORT_ARGS');
  }
  let sql = args.sql;
  if (args.table) {
    const t = String(args.table).trim();
    if (!/^[A-Za-z0-9_]{1,64}$/.test(t)) throw new McpToolError('Nom de table invalide');
    const secretMap = await tablesWithSecretColumns();
    const { queryAll } = db();
    const cols = await queryAll(
      `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [t],
    );
    if (!cols.length) throw new McpToolError(`Table « ${t} » introuvable`);
    const secret = new Set(secretMap.get(t.toLowerCase()) || []);
    const list = cols.map((c) => String(c.c)).filter((c) => !secret.has(c));
    sql = `SELECT ${list.map((c) => `\`${c}\``).join(', ')} FROM \`${t}\``;
  }
  const text = validateSelectSql(sql, { privacyBypass });
  const analyzed = analyzeSelect(text, { privacyBypass });
  const dedicated = isReadOnlyPoolConfigured();
  if (!dedicated && analyzed.hasStar) {
    const secretMap = await tablesWithSecretColumns();
    const hit = analyzed.tables.filter((t) => secretMap.has(t));
    if (hit.length) {
      throw new McpToolError(
        `SELECT * refusé sur ${hit.join(', ')} (colonnes secrètes) : nommez les colonnes`,
        'MCP_SQL_STAR_SECRET',
      );
    }
  }
  const rows = await withReadOnly(
    async (rdb) => {
      const all = [];
      for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_PAGE) {
        const page = await rdb.raw(
          `SELECT * FROM (${text}) AS mcp_q LIMIT ${EXPORT_PAGE} OFFSET ${offset}`,
          [],
          { astValidated: true },
        );
        all.push(...page);
        if (page.length < EXPORT_PAGE) break;
      }
      return all;
    },
    { requireReadOnlyPool: dedicated, timeoutMs: Math.max(cfg.statementTimeoutMs, 30000) },
  );
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const out = await writeExportFile({
    rows,
    columns,
    format: args.format,
    name: args.filename || args.table || 'export',
    baseUrl: ctx.baseUrl,
  });
  if (privacyBypass && ctx.user) {
    const { logAudit } = require('../../auditLog');
    const payload = { tables: analyzed.tables, rows: rows.length, format: args.format };
    if (cfg.privacyReadsAuditDetails === 'full') payload.sql = text.slice(0, 4000);
    await logAudit('mcp.privacy_bypass.read', 'mcp_export', out.file, 'foretmap_export', {
      actorUserType: ctx.user.userType || 'teacher',
      actorUserId: String(ctx.user.userId),
      payload,
    });
  }
  return { ...out, rows: rows.length, columns, tables: analyzed.tables };
}

// ---------------------------------------------------------------------------------------------
// foretmap_entity_history
// ---------------------------------------------------------------------------------------------

/** Entités connues : table, type d'audit, route de mise à jour (restauration par le pont). */
const ENTITY_TYPES = Object.freeze({
  task: { table: 'tasks', audit: ['task'], put: (id) => `/api/tasks/${id}` },
  task_project: {
    table: 'task_projects',
    audit: ['task_project'],
    put: (id) => `/api/task-projects/${id}`,
  },
  zone: { table: 'zones', audit: ['zone'], put: (id) => `/api/zones/${id}` },
  marker: {
    table: 'map_markers',
    audit: ['marker', 'map_marker'],
    put: (id) => `/api/map/markers/${id}`,
  },
  plant: { table: 'plants', audit: ['plant'], put: (id) => `/api/plants/${id}` },
  tutorial: { table: 'tutorials', audit: ['tutorial'], put: (id) => `/api/tutorials/${id}` },
  group: { table: 'groups', audit: ['group'], put: (id) => `/api/groups/${id}`, method: 'PATCH' },
  map_route: { table: 'map_routes', audit: ['map_route'], put: (id) => `/api/map-routes/${id}` },
  location_category: {
    table: 'location_categories',
    audit: ['location_category'],
    put: (id) => `/api/map-categories/${id}`,
  },
  quiz_question: {
    table: 'quiz_questions',
    audit: ['quiz_question'],
    put: (id) => `/api/quiz/admin/questions/${encodeURIComponent(id)}`,
  },
  user: { table: 'users', audit: ['user', 'student'], put: null },
  role: { table: 'roles', audit: ['role'], put: null },
  setting: { table: null, audit: ['setting'], put: null },
});

async function entityHistory(args, ctx) {
  const def = ENTITY_TYPES[args.entity_type];
  if (!def) throw new McpToolError('Type d’entité inconnu');
  const id = String(args.entity_id);
  if (args.action === 'restore') {
    if (!def.put) {
      throw new McpToolError(
        'Restauration non disponible pour ce type : passer par foretmap_api ou l’outil de domaine',
        'MCP_RESTORE_UNSUPPORTED',
      );
    }
    if (!args.values || typeof args.values !== 'object' || !Object.keys(args.values).length) {
      throw new McpToolError('`values` requis : champs à réappliquer (relus dans l’historique)');
    }
    const scopes = new Set(ctx?.access?.scopes || []);
    if (!scopes.has(SCOPES.WRITE)) {
      throw new McpToolError('Portée « foretmap.write » requise pour restaurer', 'MCP_FORBIDDEN');
    }
    const { callApi } = require('../apiBridge');
    const updated = await callApi(ctx, def.method || 'PUT', def.put(id), args.values, undefined, {
      tool: 'foretmap_entity_history',
    });
    return { restored: true, entity_type: args.entity_type, entity_id: id, result: updated };
  }
  const { queryAll, queryOne } = db();
  const limit = Math.min(500, Math.max(1, args.limit ?? 100));
  const offset = Math.max(0, args.offset ?? 0);
  const placeholders = def.audit.map(() => '?').join(', ');
  const rows = await queryAll(
    `SELECT id, action, details, actor_user_type, actor_user_id, result, created_at, payload_json
       FROM audit_log
      WHERE target_type IN (${placeholders}) AND target_id = ?
      ORDER BY id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    [...def.audit, id],
  );
  let revision = null;
  let exists = null;
  if (def.table) {
    try {
      const cur = await queryOne(`SELECT * FROM \`${def.table}\` WHERE id = ? LIMIT 1`, [id]);
      exists = !!cur;
      if (cur && cur.edit_revision !== undefined) revision = Number(cur.edit_revision);
    } catch (_) {
      exists = null;
    }
  }
  const items = rows.map((r) => {
    let payload = r.payload_json;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        // charge non JSON : laissée telle quelle
      }
    }
    return {
      id: r.id,
      action: r.action,
      details: r.details,
      actor: r.actor_user_id ? { type: r.actor_user_type, id: r.actor_user_id } : null,
      result: r.result,
      at: r.created_at,
      via: payload && payload.via ? payload.via : undefined,
      payload,
    };
  });
  const out = {
    entity_type: args.entity_type,
    entity_id: id,
    exists,
    edit_revision: revision,
    count: items.length,
    offset,
    items,
    note: 'Le site ne conserve pas d’instantané complet des fiches : l’historique est celui du journal d’audit (et le compteur de révision). Pour restaurer, relire les valeurs voulues puis action=restore avec values.',
  };
  if (items.length === limit) out.next_offset = offset + limit;
  return out;
}

function buildDataTools() {
  const sqlRequires = {
    scope: SCOPES.READ,
    permission: ['mcp.use', 'mcp.sql'],
    flag: 'sql',
    available: () => require('./sqlSelect').sqlToolAvailable(),
  };
  return [
    {
      name: 'foretmap_describe_schema',
      title: 'Structure de la base de données',
      description:
        'Décrit la base ForêtMap : tables et vues, colonnes (type, nullabilité, défaut, commentaire), clés primaires et étrangères, index, nombre approximatif de lignes, migration courante. Tables Gnomes & Licornes (gl_*) exclues ; colonnes secrètes signalées « masquee » (jamais de valeur). Filtres table (détail complet), q (texte) ; sans filtre au-delà de 40 tables : résumé.',
      inputSchema: z.strictObject({
        table: z.string().max(64).optional().describe('Nom exact de la table'),
        q: z.string().max(100).optional().describe('Texte cherché dans les noms'),
        with_columns: z.boolean().optional().describe('Forcer le détail des colonnes'),
      }),
      annotations: READ_ONLY,
      requires: { scope: SCOPES.READ, permission: ['mcp.use', 'mcp.sql'], flag: 'sql' },
      handler: describeSchema,
    },
    {
      name: 'foretmap_export',
      title: 'Exporter des données (CSV, XLSX, JSON)',
      description:
        'Exporte le résultat d’une requête SELECT (mêmes règles que foretmap_sql_select) ou d’une table entière (colonnes secrètes retirées) dans un fichier CSV, XLSX ou JSON, sans plafond de lignes (fichier ≤ 50 Mo). Renvoie un lien signé valable 1 heure ; le fichier est purgé après 24 h. Pour les gros volumes et les bilans de fin d’année.',
      inputSchema: z.strictObject({
        sql: z.string().min(6).max(8000).optional().describe('Requête SELECT (sans LIMIT)'),
        table: z.string().max(64).optional().describe('Table entière à exporter'),
        format: z.enum(['csv', 'xlsx', 'json']).describe('Format du fichier'),
        filename: z
          .string()
          .max(60)
          .optional()
          .describe('Nom de fichier souhaité (sans extension)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      requires: sqlRequires,
      scrub: (ctx) => (ctx.privacyBypass ? 'secrets' : 'full'),
      handler: exportHandler,
    },
    {
      name: 'foretmap_entity_history',
      title: 'Historique d’une fiche (et restauration)',
      description:
        'action=history (défaut) : lignes du journal d’audit d’une entité (tâche, projet, zone, repère, espèce, tutoriel, groupe, parcours, catégorie de lieu, question de quiz, compte, profil, réglage), avec l’acteur, la date, l’origine (via: mcp) et la révision d’édition courante. action=restore : réapplique les valeurs `values` par l’API de la ressource (PUT/PATCH, logique métier comprise ; écrit, portée foretmap.write).',
      inputSchema: z.strictObject({
        entity_type: z.enum(Object.keys(ENTITY_TYPES)),
        entity_id: z.union([z.string().min(1).max(80), z.number().int()]),
        action: z.enum(['history', 'restore']).optional(),
        values: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('restore : champs à réappliquer'),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).max(100000).optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      requires: { scope: SCOPES.READ, permission: ['mcp.use', 'audit.read'] },
      scrub: (ctx) => (ctx.privacyBypass ? 'secrets' : 'full'),
      handler: entityHistory,
    },
  ];
}

module.exports = {
  ENTITY_TYPES,
  EXPORT_DIR_REL,
  buildDataTools,
  describeSchema,
  entityHistory,
  exportHandler,
  purgeOldExports,
  writeExportFile,
};
