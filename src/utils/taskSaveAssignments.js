/**
 * Logique de sauvegarde d'une tâche avec inscriptions initiales (O6).
 *
 * Extraite de `tasks-views.jsx` : séparation du payload tâche et des ids à
 * inscrire (avec ajustement de `required_students`), exécution séquentielle
 * des inscriptions après création et message de toast récapitulatif.
 * Le client HTTP est injecté (même approche que `taskQuickAssign.js`),
 * testable unitairement (`tests-ui/utils/taskSaveAssignments.test.js`).
 */

/**
 * Sépare le formulaire en payload tâche + ids d'inscription initiale (dédoublonnés),
 * en garantissant assez de places (`required_students`) pour les inscrits demandés.
 */
export function prepareTaskSavePayload(form) {
  const { assign_student_ids: rawAssignIds = [], ...taskPayload } = form || {};
  const assignStudentIds = [
    ...new Set((rawAssignIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  if (assignStudentIds.length > 0) {
    const cur = Math.max(1, Number.parseInt(taskPayload.required_students, 10) || 1);
    taskPayload.required_students = Math.max(cur, assignStudentIds.length);
  }
  return { taskPayload, assignStudentIds };
}

/**
 * Inscrit séquentiellement les comptes demandés sur la tâche créée
 * (ids absents de `students` ignorés). Retourne le nombre d'inscriptions réussies.
 */
export async function executeInitialAssignments(api, taskId, assignStudentIds, students) {
  let ok = 0;
  for (const sid of assignStudentIds || []) {
    const assignee = (students || []).find((s) => String(s.id) === String(sid));
    if (!assignee) continue;
    await api(`/api/tasks/${taskId}/assign`, 'POST', {
      firstName: assignee.first_name,
      lastName: assignee.last_name,
      studentId: assignee.id,
    });
    ok += 1;
  }
  return ok;
}

/** Message de toast après création de la tâche + tentative d'inscriptions initiales. */
export function initialAssignmentsToast(ok, assignStudentIds, students) {
  const requested = (assignStudentIds || []).length;
  if (ok === 0) {
    return 'Tâche créée — impossible d’inscrire tout de suite (comptes introuvables dans la liste chargée).';
  }
  if (ok === 1) {
    const one = (students || []).find((s) => String(s.id) === String(assignStudentIds[0]));
    return `Tâche créée et ${one?.first_name || 'n3beur'} inscrit(e) ✓`;
  }
  if (ok < requested) {
    return `Tâche créée : ${ok} inscription(s) sur ${requested} — certains comptes manquaient dans la liste.`;
  }
  return `Tâche créée : ${ok} n3beur(s) inscrit(s) — bien joué ! ✓`;
}
