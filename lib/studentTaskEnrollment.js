'use strict';

const { queryOne } = require('../database');

/**
 * Nombre de tâches distinctes où l'élève est inscrit et la tâche n'est pas encore validée
 * (inclut disponible, en cours, terminée en attente de validation n3boss).
 */
async function countStudentActiveTaskAssignments(studentId, firstName, lastName) {
  const sid = studentId != null && String(studentId).trim() !== '' ? String(studentId) : null;
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  const row = await queryOne(
    `SELECT COUNT(DISTINCT ta.task_id) AS c
       FROM task_assignments ta
       INNER JOIN tasks t ON t.id = ta.task_id
      WHERE LOWER(t.status) <> 'validated'
        AND (
          (? IS NOT NULL AND ta.student_id = ?)
          OR (ta.student_first_name = ? AND ta.student_last_name = ?)
        )`,
    [sid, sid, fn, ln]
  );
  return Math.max(0, parseInt(row?.c, 10) || 0);
}

module.exports = { countStudentActiveTaskAssignments };
