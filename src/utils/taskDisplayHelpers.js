/**
 * Helpers d'affichage des tâches (purs) partagés par `TasksView` et `TaskTileCard`.
 *
 * Extraits de `tasks-views.jsx` (O6) pour mutualiser et tester ; prérequis au déplacement
 * de `TaskTileCard` dans son propre fichier. (Les helpers retournant du JSX — `startDateChip`,
 * `Lightbox` — restent dans le composant.)
 */

/** Emoji de l'être vivant d'une zone (repli 🌱). */
export function taskLivingBeingEmoji(plants, name) {
  const p = (plants || []).find((x) => x.name === name);
  return p?.emoji || '🌱';
}

/** Nom affiché d'un assigné + s'il s'agit de l'élève courant (anonymisé si `canViewIdentity` faux). */
export function formatAssigneeName(assignee, student, canViewIdentity = true) {
  const firstName = String(assignee?.student_first_name || '').trim();
  const lastName = String(assignee?.student_last_name || '').trim();
  if (!canViewIdentity) {
    const isCurrentStudent =
      !!student &&
      (String(assignee?.student_id || '') === String(student?.id || '') ||
        (firstName.toLowerCase() ===
          String(student?.first_name || '')
            .trim()
            .toLowerCase() &&
          lastName.toLowerCase() ===
            String(student?.last_name || '')
              .trim()
              .toLowerCase()));
    return { fullName: isCurrentStudent ? 'Toi' : 'Participant', isCurrentStudent };
  }
  const fullName = `${firstName} ${lastName}`.trim() || 'n3beur';
  const isCurrentStudent =
    !!student &&
    firstName.toLowerCase() ===
      String(student.first_name || '')
        .trim()
        .toLowerCase() &&
    lastName.toLowerCase() ===
      String(student.last_name || '')
        .trim()
        .toLowerCase();
  return { fullName, isCurrentStudent };
}

/** Clé `loading[…]` pour POST /done côté n3boss (tâche collective) — doit coïncider entre la carte et `withLoad`. */
export function teacherCollectiveAssigneeLoadKey(taskId, assignment) {
  const tid = String(taskId || '');
  const rawId = assignment?.id != null ? String(assignment.id) : '';
  if (rawId !== '') return `${tid}_teacher_collective_done_${rawId}`;
  const sid = assignment?.student_id ?? assignment?.studentId;
  if (sid != null && String(sid).trim() !== '') {
    return `${tid}_teacher_collective_done_sid:${String(sid).trim()}`;
  }
  const fn = String(assignment?.student_first_name || '').trim();
  const ln = String(assignment?.student_last_name || '').trim();
  if (fn && ln) return `${tid}_teacher_collective_done_${fn}|${ln}`;
  return `${tid}_teacher_collective_done_legacy`;
}

/** Normalise un id élève en chaîne (pour les sélections d'affectation rapide). */
export function toQuickAssignStudentId(id) {
  return String(id ?? '');
}
