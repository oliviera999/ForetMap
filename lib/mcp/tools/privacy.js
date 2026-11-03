'use strict';

/**
 * Outils nominatifs élèves — mode productivité, bypass RGPD.
 *
 * Exigent `mcp.privacy_bypass` + profil admin + `MCP_PRIVACY_BYPASS` + ACK daté.
 * Secrets (hachages, TOTP, jetons, .env) jamais renvoyés (`scrub: 'secrets'`).
 * Chaque appel → `audit_log` `mcp.privacy_bypass.read` (identifiants, sans valeurs).
 */

const { z } = require('zod');
const { queryAll, queryOne, execute } = require('../../../database');
const { SCOPES } = require('../config');
const { page, paged, paginationShape, compact } = require('./common');
const { nowDbTimestamp } = require('../../shared/isoTimestamp');

const PRIVACY_REQUIRES = Object.freeze({
  scope: SCOPES.READ,
  permission: ['mcp.use', 'mcp.privacy_bypass'],
  role: 'admin',
  flag: 'privacy_bypass',
});

async function auditPrivacyRead(user, { tool, studentIds }) {
  const ids = (studentIds || []).map(String).slice(0, 200);
  await execute(
    `INSERT INTO audit_log
      (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
     VALUES ('mcp.privacy_bypass.read', 'student', ?, ?, ?, ?, 'success', ?, UTC_TIMESTAMP(), ?)`,
    [
      ids[0] || null,
      tool,
      user.userType || null,
      String(user.userId),
      nowDbTimestamp(),
      JSON.stringify({ via: 'mcp', tool, student_ids: ids, count: ids.length }),
    ],
  );
}

function studentSelectCols() {
  // Jamais password_hash ni colonnes secrètes.
  return `u.id, u.user_type, u.email, u.pseudo, u.first_name, u.last_name, u.display_name,
          u.is_active, u.deactivated_at, u.last_seen, u.created_at, u.auth_provider,
          u.biodiv_pedago_level`;
}

async function listStudents(args, ctx) {
  const { limit, offset } = page(args, 50);
  const params = [];
  const where = ["u.user_type = 'student'"];
  if (args.active === true) where.push('u.is_active = 1');
  if (args.active === false) where.push('(u.is_active = 0 OR u.is_active IS NULL)');
  if (args.q) {
    where.push(
      '(u.display_name LIKE ? OR u.pseudo LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)',
    );
    const like = `%${String(args.q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like, like, like);
  }
  if (args.group_id) {
    where.push(
      'EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id AND gm.group_id = ?)',
    );
    params.push(String(args.group_id));
  }
  const sql = `SELECT ${studentSelectCols()}
                 FROM users u
                WHERE ${where.join(' AND ')}
                ORDER BY u.last_name, u.first_name, u.id
                LIMIT ${limit} OFFSET ${offset}`;
  const rows = await queryAll(sql, params);
  const ids = rows.map((r) => r.id);
  let groupsByUser = {};
  if (ids.length) {
    const gRows = await queryAll(
      `SELECT gm.user_id, g.id AS group_id, g.name AS group_name, g.kind
         FROM group_members gm
         JOIN \`groups\` g ON g.id = gm.group_id
        WHERE gm.user_id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    for (const g of gRows) {
      if (!groupsByUser[g.user_id]) groupsByUser[g.user_id] = [];
      groupsByUser[g.user_id].push(compact({ id: g.group_id, name: g.group_name, kind: g.kind }));
    }
  }
  await auditPrivacyRead(ctx.user, { tool: 'foretmap_list_students', studentIds: ids });
  return {
    privacy_bypass: true,
    ...paged(
      rows.map((r) =>
        compact({
          id: r.id,
          email: r.email,
          pseudo: r.pseudo,
          first_name: r.first_name,
          last_name: r.last_name,
          display_name: r.display_name,
          is_active: !!Number(r.is_active),
          last_seen: r.last_seen,
          created_at: r.created_at,
          groups: groupsByUser[r.id] || [],
        }),
      ),
      { limit, offset },
    ),
  };
}

async function getStudent(args, ctx) {
  const id = String(args.student_id);
  const row = await queryOne(
    `SELECT ${studentSelectCols()} FROM users u WHERE u.id = ? AND u.user_type = 'student' LIMIT 1`,
    [id],
  );
  if (!row) {
    const { McpToolError } = require('../registry');
    throw new McpToolError('Élève introuvable', 'MCP_NOT_FOUND');
  }
  const groups = await queryAll(
    `SELECT g.id, g.name, g.kind
       FROM group_members gm JOIN \`groups\` g ON g.id = gm.group_id
      WHERE gm.user_id = ?`,
    [id],
  );
  const roles = await queryAll(
    `SELECT r.slug, r.display_name, ur.is_primary
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?`,
    [id],
  );

  const [taskCount] = await queryAll(
    `SELECT COUNT(*) AS n,
            SUM(done_at IS NOT NULL) AS done_n
       FROM task_assignments WHERE student_id = ?`,
    [id],
  );
  const recentTasks = await queryAll(
    `SELECT ta.task_id, ta.assigned_at, ta.done_at, t.title
       FROM task_assignments ta
       LEFT JOIN tasks t ON t.id = ta.task_id
      WHERE ta.student_id = ?
      ORDER BY COALESCE(ta.done_at, ta.assigned_at) DESC
      LIMIT 20`,
    [id],
  );
  const [obsCount] = await queryAll(
    `SELECT COUNT(*) AS n FROM species_observations WHERE observer_user_id = ?`,
    [id],
  );
  const recentObs = await queryAll(
    `SELECT id, plant_id, status, created_at
       FROM species_observations WHERE observer_user_id = ?
      ORDER BY created_at DESC LIMIT 20`,
    [id],
  );
  const [quizCount] = await queryAll(
    `SELECT COUNT(*) AS n, SUM(is_correct) AS correct FROM user_quiz_attempts WHERE user_id = ?`,
    [id],
  );
  const recentQuiz = await queryAll(
    `SELECT question_code, is_correct, answered_at, categorie_slug
       FROM user_quiz_attempts WHERE user_id = ?
      ORDER BY answered_at DESC LIMIT 20`,
    [id],
  );
  const [readCount] = await queryAll(
    `SELECT COUNT(*) AS n FROM user_tutorial_reads WHERE user_id = ?`,
    [id],
  );
  const recentReads = await queryAll(
    `SELECT tutorial_id, acknowledged_at FROM user_tutorial_reads
      WHERE user_id = ? ORDER BY acknowledged_at DESC LIMIT 20`,
    [id],
  );

  await auditPrivacyRead(ctx.user, { tool: 'foretmap_get_student', studentIds: [id] });

  return {
    privacy_bypass: true,
    student: compact({
      id: row.id,
      email: row.email,
      pseudo: row.pseudo,
      first_name: row.first_name,
      last_name: row.last_name,
      display_name: row.display_name,
      is_active: !!Number(row.is_active),
      deactivated_at: row.deactivated_at,
      last_seen: row.last_seen,
      created_at: row.created_at,
      auth_provider: row.auth_provider,
      biodiv_pedago_level: row.biodiv_pedago_level,
    }),
    groups: groups.map((g) => compact(g)),
    roles: roles.map((r) => compact(r)),
    activity: {
      tasks: {
        assigned: Number(taskCount?.n || 0),
        done: Number(taskCount?.done_n || 0),
        recent: recentTasks,
      },
      observations: { count: Number(obsCount?.n || 0), recent: recentObs },
      quiz_attempts: {
        count: Number(quizCount?.n || 0),
        correct: Number(quizCount?.correct || 0),
        recent: recentQuiz,
      },
      tutorial_reads: { count: Number(readCount?.n || 0), recent: recentReads },
    },
  };
}

function buildPrivacyTools() {
  return [
    {
      name: 'foretmap_list_students',
      title: 'Lister les élèves (nominatif, admin)',
      description:
        'Liste nominative des élèves (nom, prénom, pseudo, e-mail, groupes, statut). Réservé à l’admin avec bypass RGPD actif (MCP_PRIVACY_BYPASS + ACK). Chaque appel est journalisé. Les secrets (mots de passe, TOTP, jetons) ne sont jamais renvoyés.',
      inputSchema: z.strictObject({
        q: z.string().min(1).max(120).optional().describe('Recherche nom / pseudo / e-mail'),
        group_id: z.string().min(1).max(64).optional().describe('Filtrer par groupe'),
        active: z.boolean().optional().describe('true = actifs seulement'),
        ...paginationShape,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      requires: PRIVACY_REQUIRES,
      scrub: 'secrets',
      handler: listStudents,
    },
    {
      name: 'foretmap_get_student',
      title: 'Fiche élève (nominatif, admin)',
      description:
        'Profil nominatif d’un élève et activité récente (tâches, observations, QCM, lectures). Bypass RGPD admin uniquement. Audit mcp.privacy_bypass.read. Secrets jamais renvoyés.',
      inputSchema: z.strictObject({
        student_id: z.string().min(1).max(64).describe('Identifiant users.id de l’élève'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      requires: PRIVACY_REQUIRES,
      scrub: 'secrets',
      handler: getStudent,
    },
  ];
}

module.exports = { PRIVACY_REQUIRES, buildPrivacyTools, auditPrivacyRead };
