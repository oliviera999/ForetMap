'use strict';

const { normalizeTaskStatusForRead } = require('../taskStatusRecalc');
const { recalculateTaskStatus } = require('./taskQueries');
const { countStudentActiveTaskAssignments } = require('../studentTaskEnrollment');

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
 * Une tâche `proposed` (pas encore acceptée) ou `done` (en attente de validation) est
 * refusée elle aussi (audit du 19/11/2026, T2).
 *
 * Avec `maxActive > 0`, le plafond de tâches actives de l'élève est recompté sous le verrou
 * de sa ligne `users` (T10).
 *
 * `bypassCapacity` : une inscription faite par un n3boss (ou un compte habilité à agir pour
 * un n3beur) peut dépasser `required_students`. Le plafond reste opposable à l'auto-inscription
 * élève — `required_students` décrit alors le nombre de places *ouvertes aux élèves*, pas un
 * plafond absolu d'inscrits.
 *
 * @param {{ queryOne: Function, execute: Function }} tx transaction ouverte
 * @param {{ taskId: string|number, studentId: string|number|null, firstName: string,
 *           lastName: string, assignedAt: string, maxActive?: number,
 *           bypassCapacity?: boolean }} params
 * @returns {Promise<{ ok: true, status: string } |
 *                   { ok: false, reason: 'missing'|'validated'|'on_hold'|'proposed'|'done'|'full' } |
 *                   { ok: false, reason: 'limit', maxActive: number, current: number }>}
 */
async function claimAssignmentSeat(
  tx,
  { taskId, studentId, firstName, lastName, assignedAt, maxActive = 0, bypassCapacity = false },
) {
  const sid = studentId != null && String(studentId).trim() !== '' ? String(studentId) : null;
  const limit = Math.max(0, Number(maxActive) || 0);
  // Plafond de tâches actives : la ligne `users` de l'élève est verrouillée AVANT la tâche,
  // pour sérialiser ses inscriptions simultanées sur des tâches différentes (le verrou de la
  // tâche ne couvre qu'elle). Ordre fixe users → tasks : pas d'interblocage entre deux
  // inscriptions du même élève.
  if (limit > 0 && sid) {
    await tx.queryOne('SELECT id FROM users WHERE id = ? FOR UPDATE', [sid]);
  }

  const locked = await tx.queryOne(
    'SELECT id, status, completion_mode, required_students FROM tasks WHERE id = ? FOR UPDATE',
    [taskId],
  );
  if (!locked) return { ok: false, reason: 'missing' };

  const lockedStatus = normalizeTaskStatusForRead(locked.status);
  if (lockedStatus === 'validated') return { ok: false, reason: 'validated' };
  if (lockedStatus === 'on_hold') return { ok: false, reason: 'on_hold' };
  // Proposition pas encore acceptée, ou tâche déjà marquée faite (audit du 19/11/2026, T2).
  if (lockedStatus === 'proposed') return { ok: false, reason: 'proposed' };
  if (lockedStatus === 'done') return { ok: false, reason: 'done' };

  if (limit > 0 && sid) {
    const current = await countStudentActiveTaskAssignments(sid, firstName, lastName, tx);
    if (current >= limit) return { ok: false, reason: 'limit', maxActive: limit, current };
  }

  if (!bypassCapacity) {
    const countRow = await tx.queryOne(
      'SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?',
      [taskId],
    );
    if ((Number(countRow?.c) || 0) >= Number(locked.required_students)) {
      return { ok: false, reason: 'full' };
    }
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
  proposed: {
    status: 400,
    error: 'Idée encore en discussion : inscriptions pas encore ouvertes',
    code: 'task_proposed',
  },
  done: { status: 400, error: 'C’est déjà plié pour celle-ci', code: 'task_done' },
  full: { status: 400, error: 'Plus de place disponible sur cette tâche' },
};

module.exports = { claimAssignmentSeat, SEAT_REFUSAL };
