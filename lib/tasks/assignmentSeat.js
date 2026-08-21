'use strict';

const { normalizeTaskStatusForRead } = require('../taskStatusRecalc');
const { recalculateTaskStatus } = require('./taskQueries');

/**
 * Prise d'une place sur une tâche, **entièrement sous le verrou** de la ligne `tasks`.
 *
 * Les contrôles faits en tête de route (statut, capacité) reposent sur une lecture
 * antérieure (`getTaskWithAssignments`), hors transaction. Entre cette lecture et
 * l'insertion, deux choses peuvent survenir :
 *
 *   - une autre inscription prend la dernière place — d'où le recomptage ici (audit B4,
 *     l'index unique de la migration 170 restant le filet anti-doublon) ;
 *   - un n3boss valide la tâche ou la met en attente — l'inscription passait alors, et le
 *     recalcul de statut repartait de l'objet `task` périmé.
 *
 * Le statut est donc **relu sous `FOR UPDATE`** : si la tâche a changé d'état, on refuse
 * plutôt que d'écrire par-dessus. Le recalcul part lui aussi de la ligne verrouillée.
 *
 * @param {{ queryOne: Function, execute: Function }} tx transaction ouverte
 * @param {{ taskId: string|number, studentId: string|number|null, firstName: string,
 *           lastName: string, assignedAt: string }} params
 * @returns {Promise<{ ok: true, status: string } |
 *                   { ok: false, reason: 'missing'|'validated'|'on_hold'|'full' }>}
 */
async function claimAssignmentSeat(tx, { taskId, studentId, firstName, lastName, assignedAt }) {
  const locked = await tx.queryOne(
    'SELECT id, status, completion_mode, required_students FROM tasks WHERE id = ? FOR UPDATE',
    [taskId],
  );
  if (!locked) return { ok: false, reason: 'missing' };

  const lockedStatus = normalizeTaskStatusForRead(locked.status);
  if (lockedStatus === 'validated') return { ok: false, reason: 'validated' };
  if (lockedStatus === 'on_hold') return { ok: false, reason: 'on_hold' };

  const countRow = await tx.queryOne(
    'SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?',
    [taskId],
  );
  if ((Number(countRow?.c) || 0) >= Number(locked.required_students)) {
    return { ok: false, reason: 'full' };
  }

  await tx.execute(
    'INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at) VALUES (?, ?, ?, ?, ?)',
    [taskId, studentId || null, firstName, lastName, assignedAt],
  );

  const recalculated = await recalculateTaskStatus(locked, tx);
  return { ok: true, status: recalculated?.status || lockedStatus };
}

/** Message d'erreur (400/404) associé à un refus de `claimAssignmentSeat`. */
const SEAT_REFUSAL = {
  missing: { status: 404, error: 'Tâche introuvable' },
  validated: { status: 400, error: 'Tâche déjà validée' },
  on_hold: { status: 400, error: 'Tâche en attente : inscription indisponible' },
  full: { status: 400, error: 'Plus de place disponible sur cette tâche' },
};

module.exports = { claimAssignmentSeat, SEAT_REFUSAL };
