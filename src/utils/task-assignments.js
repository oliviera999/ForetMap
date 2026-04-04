/**
 * Détecte si l'élève courant est assigné à la tâche (id élève ou prénom+nom, casse / espaces ignorés).
 * Aligné sur la logique d'affichage des assignés et sur l'API (assign / unassign).
 */
export function isStudentAssignedToTask(task, student) {
  if (!task || !student) return false;
  const sid = String(student.id ?? '');
  const sf = String(student.first_name || '').trim().toLowerCase();
  const sl = String(student.last_name || '').trim().toLowerCase();
  const list = Array.isArray(task.assignments) ? task.assignments : [];
  return list.some((a) => (
    String(a.student_id || '') === sid
    || (
      String(a.student_first_name || '').trim().toLowerCase() === sf
      && String(a.student_last_name || '').trim().toLowerCase() === sl
    )
  ));
}
