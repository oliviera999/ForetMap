/**
 * Matcher unique élève ↔ assignation (audit 2026-07, P1) : match par `student_id`
 * OU par (prénom, nom) insensible à la casse et aux espaces. Aligné sur la logique
 * d'affichage des assignés et sur l'API (assign / unassign). Réutilisé par
 * `isStudentAssignedToTask`, `isStudentAlreadyAssignedToTask` (taskComputations),
 * `formatAssigneeName` (taskDisplayHelpers) et `TaskTileCard` (mineAssignment).
 */
export function assignmentMatchesStudent(assignment, student) {
  if (!assignment || !student) return false;
  const sid = String(student.id ?? '');
  const sf = String(student.first_name || '')
    .trim()
    .toLowerCase();
  const sl = String(student.last_name || '')
    .trim()
    .toLowerCase();
  return (
    String(assignment.student_id || '') === sid ||
    (String(assignment.student_first_name || '')
      .trim()
      .toLowerCase() === sf &&
      String(assignment.student_last_name || '')
        .trim()
        .toLowerCase() === sl)
  );
}

/**
 * Détecte si le compte n3beur courant est assigné à la tâche (id ou prénom+nom, casse / espaces ignorés).
 * Aligné sur la logique d'affichage des assignés et sur l'API (assign / unassign).
 */
export function isStudentAssignedToTask(task, student) {
  if (!task || !student) return false;
  const list = Array.isArray(task.assignments) ? task.assignments : [];
  return list.some((a) => assignmentMatchesStudent(a, student));
}
