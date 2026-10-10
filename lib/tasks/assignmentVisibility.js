'use strict';

/**
 * Qui voit les noms des inscrits d'une tâche et son journal (audit RGPD du 28/09/2026,
 * constats S-2 / S-3).
 *
 * Deux réglages admin gouvernent la lecture par un compte **hors gestion** (n3beur, compte
 * sans permission de lecture des inscriptions, anonyme) :
 *
 *   - `tasks.assignees_visibility` : `all` | `group` | `self`
 *   - `tasks.logs_visibility`      : `all` | `assignees` | `group`
 *
 * Le personnel qui lit déjà toutes les inscriptions (`canReadAllAssignments`) n'est pas
 * concerné : sa règle reste celle des routes. Un visiteur ne voit jamais que sa propre ligne.
 *
 * La ligne de l'élève lui-même est toujours conservée : le front s'y reconnaît (« suis-je
 * inscrit ? », plafond d'inscriptions). Les compteurs (`assigned_count`,
 * `assignees_done_count`) restent calculés sur toutes les lignes, pour que les places
 * restantes demeurent justes.
 */

const { queryAll, queryOne } = require('../../database');
const { getSettingValue } = require('../settings');
const { getScopedStudentIds } = require('../groupScope');
const { canReadAllAssignments, isVisitorRole } = require('../taskAuthzHelpers');
const { assignmentRowMatchesStudent } = require('./assignmentIdentityMatch');

const ASSIGNEES_VISIBILITY_VALUES = ['all', 'group', 'self'];
const LOGS_VISIBILITY_VALUES = ['all', 'assignees', 'group'];

async function getAssigneesVisibilityMode() {
  const v = String(await getSettingValue('tasks.assignees_visibility', 'group'));
  return ASSIGNEES_VISIBILITY_VALUES.includes(v) ? v : 'group';
}

async function getLogsVisibilityMode() {
  const v = String(await getSettingValue('tasks.logs_visibility', 'group'));
  return LOGS_VISIBILITY_VALUES.includes(v) ? v : 'group';
}

function isStaffReader(auth) {
  return !!auth && canReadAllAssignments(auth);
}

/**
 * Contexte de lecture d'un compte hors gestion : son identité (pour reconnaître ses lignes,
 * y compris héritées sans `student_id`) et, à la demande, l'ensemble de ses camarades.
 */
function createViewerContext(auth) {
  const selfId = auth?.userId != null ? String(auth.userId) : null;
  let identityPromise = null;
  let peersPromise = null;
  return {
    selfId,
    async identity() {
      if (!identityPromise) {
        identityPromise = (async () => {
          if (!selfId) return { studentId: null, firstName: '', lastName: '' };
          const row = await queryOne('SELECT first_name, last_name FROM users WHERE id = ?', [
            selfId,
          ]);
          return {
            studentId: selfId,
            firstName: row?.first_name || '',
            lastName: row?.last_name || '',
          };
        })();
      }
      return identityPromise;
    },
    async peerIds() {
      if (!peersPromise) {
        peersPromise = (async () => {
          const ids = new Set();
          if (!selfId) return ids;
          ids.add(selfId);
          const scope = await getScopedStudentIds(auth);
          for (const id of scope.studentIds || []) ids.add(String(id));
          return ids;
        })();
      }
      return peersPromise;
    },
  };
}

async function isOwnRow(ctx, row) {
  if (!ctx.selfId || !row) return false;
  const rowId = row.student_id;
  if (rowId != null && String(rowId).trim() !== '') return String(rowId) === ctx.selfId;
  return assignmentRowMatchesStudent(row, await ctx.identity());
}

async function isPeerRow(ctx, row) {
  if (await isOwnRow(ctx, row)) return true;
  const rowId = row?.student_id;
  if (rowId == null || String(rowId).trim() === '') return false;
  return (await ctx.peerIds()).has(String(rowId));
}

async function filterRows(rows, predicate) {
  const out = [];
  for (const row of rows || []) {
    if (await predicate(row)) out.push(row);
  }
  return out;
}

/**
 * Lignes d'inscription visibles par ce lecteur. `mode` peut être passé pour éviter une
 * relecture du réglage dans une boucle.
 */
async function filterAssignmentsForViewer(auth, rows, { mode, ctx } = {}) {
  if (!Array.isArray(rows)) return [];
  if (isStaffReader(auth)) return rows;
  // Sans compte, aucun inscrit : le réglage « tous » s'entend des comptes connectés, pas d'un
  // visiteur anonyme de `GET /api/tasks` (dossier sûreté d'octobre 2026, constat R9).
  if (!auth) return [];
  const viewer = ctx || createViewerContext(auth);
  if (auth && isVisitorRole(auth)) return filterRows(rows, (r) => isOwnRow(viewer, r));
  const effective = mode || (await getAssigneesVisibilityMode());
  if (effective === 'all') return rows;
  if (effective === 'self') return filterRows(rows, (r) => isOwnRow(viewer, r));
  return filterRows(rows, (r) => isPeerRow(viewer, r));
}

/**
 * Ligne « Proposition n3beur: Prénom Nom » que `routes/tasks/proposals.js` ajoute à la
 * description d'une tâche proposée par un élève.
 */
const PROPOSER_LINE_RE = /\n*^Proposition n3beur\s*:.*$/gim;

/**
 * Tâche telle qu'un lecteur **sans compte** peut la lire : ni le nom ni l'identifiant du
 * proposant, ni les inscrits, ni l'identité des référents. `GET /api/tasks` et
 * `GET /api/tasks/:id` répondent sans session (la Visite liste les tâches d'un lieu) ; ils
 * livraient le prénom et le nom de l'élève qui propose une tâche, son identifiant et le nom
 * des référents (dossier sûreté d'octobre 2026, constat R9).
 */
function redactTaskForAnonymous(task) {
  if (!task || typeof task !== 'object') return task;
  const out = {
    ...task,
    proposed_by_student_id: null,
    assignments: [],
    referent_user_ids: [],
    referents_linked: [],
  };
  if (typeof out.description === 'string') {
    out.description = out.description.replace(PROPOSER_LINE_RE, '').trimEnd();
  }
  return out;
}

/**
 * Tâche complète (détail, réponses d'inscription) prête à renvoyer à ce lecteur : lignes
 * d'inscription filtrées, proposant masqué quand il n'est pas visible.
 */
async function sanitizeTaskForViewer(auth, task) {
  if (!task || isStaffReader(auth)) return task;
  if (!auth) return redactTaskForAnonymous(task);
  const ctx = createViewerContext(auth);
  const out = { ...task };
  out.assignments = await filterAssignmentsForViewer(auth, task.assignments || [], { ctx });
  const proposer = task.proposed_by_student_id;
  if (proposer && String(proposer) !== ctx.selfId) {
    const mode = auth && isVisitorRole(auth) ? 'self' : await getAssigneesVisibilityMode();
    const visible =
      mode === 'all' || (mode === 'group' && (await ctx.peerIds()).has(String(proposer)));
    if (!visible) out.proposed_by_student_id = null;
  }
  return out;
}

/**
 * Journal d'une tâche visible par ce lecteur.
 * @returns {Promise<{ allowed: boolean, rows: Array }>} `allowed=false` → 403.
 */
async function filterLogsForViewer(auth, taskId, rows, { assignments } = {}) {
  if (!auth || isVisitorRole(auth)) return { allowed: false, rows: [] };
  if (isStaffReader(auth)) return { allowed: true, rows: rows || [] };
  const mode = await getLogsVisibilityMode();
  if (mode === 'all') return { allowed: true, rows: rows || [] };
  const ctx = createViewerContext(auth);
  if (mode === 'assignees') {
    let taskAssignments = assignments;
    if (!taskAssignments) {
      taskAssignments = await queryAll(
        'SELECT student_id, student_first_name, student_last_name FROM task_assignments WHERE task_id = ?',
        [taskId],
      );
    }
    for (const a of taskAssignments) {
      if (await isOwnRow(ctx, a)) return { allowed: true, rows: rows || [] };
    }
    return { allowed: false, rows: [] };
  }
  return { allowed: true, rows: await filterRows(rows, (r) => isPeerRow(ctx, r)) };
}

module.exports = {
  ASSIGNEES_VISIBILITY_VALUES,
  LOGS_VISIBILITY_VALUES,
  getAssigneesVisibilityMode,
  getLogsVisibilityMode,
  filterAssignmentsForViewer,
  redactTaskForAnonymous,
  sanitizeTaskForViewer,
  filterLogsForViewer,
};
