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
 * Le personnel à lecture globale (`tasks.manage`, `tasks.validate`, `stats.read.all`) n'est pas
 * concerné : il voit tout. Un prof de classe (`stats.read.group`) voit les inscrits et comptes
 * rendus des seuls élèves de ses groupes (`getScopedStudentIds`), comme dans la liste
 * (audit du 19/11/2026, T3), plus les comptes rendus de l'encadrement. Un visiteur ne voit
 * jamais que sa propre ligne.
 *
 * Un compte rendu **sans élève rattaché** (écrit par l'encadrement via `POST /:id/logs`) est
 * visible de tous ceux qui lisent le journal, en mode `group` comme en mode `assignees`
 * (décision du 19/11/2026).
 *
 * La ligne de l'élève lui-même est toujours conservée : le front s'y reconnaît (« suis-je
 * inscrit ? », plafond d'inscriptions). Les compteurs (`assigned_count`,
 * `assignees_done_count`) restent calculés sur toutes les lignes, pour que les places
 * restantes demeurent justes.
 */

const { queryAll, queryOne } = require('../../database');
const { getSettingValue } = require('../settings');
const { getScopedStudentIds } = require('../groupScope');
const {
  canReadAllAssignments,
  canReadAllAssignmentsUnscoped,
  isVisitorRole,
} = require('../taskAuthzHelpers');
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

/** Lecture globale, sans filtre (tâches, validation, stats de tout l'établissement). */
function isStaffReader(auth) {
  return !!auth && canReadAllAssignmentsUnscoped(auth);
}

/** Prof de classe : lecture bornée aux élèves de ses groupes (`stats.read.group`). */
function isGroupStaffReader(auth) {
  return !!auth && !isStaffReader(auth) && canReadAllAssignments(auth);
}

/**
 * Contexte de lecture d'un compte hors gestion : son identité (pour reconnaître ses lignes,
 * y compris héritées sans `student_id`) et, à la demande, l'ensemble de ses camarades.
 */
function createViewerContext(auth) {
  const selfId = auth?.userId != null ? String(auth.userId) : null;
  let identityPromise = null;
  let peersPromise = null;
  let scopePromise = null;
  return {
    selfId,
    /** Élèves du périmètre d'un prof de classe (ensemble d'identifiants, sans lui-même). */
    async scopedIds() {
      if (!scopePromise) {
        scopePromise = (async () => {
          const scope = await getScopedStudentIds(auth);
          return new Set((scope.studentIds || []).map((id) => String(id)));
        })();
      }
      return scopePromise;
    },
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

/** Ligne d'un élève du périmètre d'un prof de classe (rattachée par identifiant). */
async function isScopedRow(ctx, row) {
  const rowId = row?.student_id;
  if (rowId == null || String(rowId).trim() === '') return false;
  return (await ctx.scopedIds()).has(String(rowId));
}

/**
 * Compte rendu sans élève rattaché : écrit par l'encadrement (`POST /:id/logs` sans
 * `student_id`), donc ni identifiant ni nom. Une ligne héritée sans identifiant mais avec un
 * nom reste, elle, la ligne d'un élève.
 */
function isStaffLogRow(row) {
  if (!row) return false;
  const rowId = row.student_id;
  if (rowId != null && String(rowId).trim() !== '') return false;
  return (
    !String(row.student_first_name || '').trim() && !String(row.student_last_name || '').trim()
  );
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
  // visiteur anonyme de `GET /api/tasks`.
  if (!auth) return [];
  const viewer = ctx || createViewerContext(auth);
  if (isGroupStaffReader(auth)) return filterRows(rows, (r) => isScopedRow(viewer, r));
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
/** Même motif, sans drapeau `g` (un `test()` sur une regex globale garde un état). */
const PROPOSER_LINE_TEST_RE = /^Proposition n3beur\s*:/im;

/**
 * Tâche telle qu'un lecteur **sans compte** peut la lire : ni le nom ni l'identifiant du
 * proposant, ni les inscrits, ni l'identité des référents. `GET /api/tasks` et
 * `GET /api/tasks/:id` répondent sans session (la Visite liste les tâches d'un lieu) ; ils
 * livraient le prénom et le nom de l'élève qui propose une tâche, son identifiant et le nom
 * des référents.
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
  if (typeof out.description === 'string') out.description = stripProposerLine(out.description);
  return out;
}

/** Description sans la ligne « Proposition n3beur: Prénom Nom ». */
function stripProposerLine(description) {
  if (typeof description !== 'string') return description;
  return description.replace(PROPOSER_LINE_RE, '').trimEnd();
}

/**
 * Le proposant d'une tâche est-il visible de ce lecteur (connecté, hors lecture globale) ?
 * Lui-même toujours ; sinon selon `tasks.assignees_visibility` (visiteur : jamais), ou, pour
 * un prof de classe, s'il est dans ses groupes. Un proposant inconnu (journal d'audit absent)
 * n'est réputé visible qu'en mode `all`.
 */
async function isProposerVisible(auth, ctx, proposerId, { mode } = {}) {
  if (proposerId && String(proposerId) === ctx.selfId) return true;
  if (isGroupStaffReader(auth)) {
    return !!proposerId && (await ctx.scopedIds()).has(String(proposerId));
  }
  if (isVisitorRole(auth)) return false;
  const effective = mode || (await getAssigneesVisibilityMode());
  if (effective === 'all') return true;
  if (!proposerId) return false;
  return effective === 'group' && (await ctx.peerIds()).has(String(proposerId));
}

/**
 * Proposant masqué quand il n'est pas visible (audit du 19/11/2026, T4) : identifiant à `null`
 * **et** ligne « Proposition n3beur: … » retirée de la description. Partagé par le détail et
 * la liste (`GET /api/tasks`), qui ne masquaient auparavant que pour l'anonyme.
 * Modifie et renvoie `task`.
 */
async function redactProposerForViewer(auth, task, { ctx, mode } = {}) {
  if (!task || typeof task !== 'object' || isStaffReader(auth)) return task;
  if (!auth) return redactTaskForAnonymous(task);
  const viewer = ctx || createViewerContext(auth);
  const proposer = task.proposed_by_student_id;
  const hasLine =
    typeof task.description === 'string' && PROPOSER_LINE_TEST_RE.test(task.description);
  if (!proposer && !hasLine) return task;
  if (await isProposerVisible(auth, viewer, proposer, { mode })) return task;
  task.proposed_by_student_id = null;
  if (hasLine) task.description = stripProposerLine(task.description);
  return task;
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
  return redactProposerForViewer(auth, out, { ctx });
}

/**
 * Journal d'une tâche visible par ce lecteur.
 * @returns {Promise<{ allowed: boolean, rows: Array }>} `allowed=false` → 403.
 */
async function filterLogsForViewer(auth, taskId, rows, { assignments } = {}) {
  if (!auth || isVisitorRole(auth)) return { allowed: false, rows: [] };
  if (isStaffReader(auth)) return { allowed: true, rows: rows || [] };
  const ctx = createViewerContext(auth);
  // Prof de classe : comptes rendus de ses élèves et de l'encadrement, quel que soit le mode.
  if (isGroupStaffReader(auth)) {
    return {
      allowed: true,
      rows: await filterRows(rows, async (r) => isStaffLogRow(r) || (await isScopedRow(ctx, r))),
    };
  }
  const mode = await getLogsVisibilityMode();
  if (mode === 'all') return { allowed: true, rows: rows || [] };
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
  // Mode `group` : comptes rendus des camarades, plus ceux de l'encadrement (décision du
  // 19/11/2026, alignée sur le mode `assignees`).
  return {
    allowed: true,
    rows: await filterRows(rows, async (r) => isStaffLogRow(r) || (await isPeerRow(ctx, r))),
  };
}

module.exports = {
  ASSIGNEES_VISIBILITY_VALUES,
  LOGS_VISIBILITY_VALUES,
  getAssigneesVisibilityMode,
  getLogsVisibilityMode,
  filterAssignmentsForViewer,
  redactTaskForAnonymous,
  redactProposerForViewer,
  createViewerContext,
  sanitizeTaskForViewer,
  filterLogsForViewer,
};
