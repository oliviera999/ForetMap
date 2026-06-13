/**
 * Helpers purs des formulaires de tâche/projet — initialisation de champs et libellés de zone.
 *
 * Extraits de `tasks-views.jsx` (O6) car partagés par `TaskFormModal` et `TaskProjectFormModal` ;
 * sortir ce dernier dans son propre fichier imposait de mutualiser ces fonctions.
 */
import { orderedLivingBeingsForForm, formatLivingBeingsListLine } from './livingBeings';
import { currentLocalDateOnly } from './taskListHelpers.js';
import { getCompletionMode } from './taskComputations.js';

/** Libellé d'un candidat référent (display_name, sinon prénom + nom, sinon id). */
export function referentCandidateLabel(c) {
  const dn = String(c?.display_name || '').trim();
  if (dn) return dn;
  return `${String(c?.first_name || '').trim()} ${String(c?.last_name || '').trim()}`.trim() || String(c?.id || '');
}

/** Indice de rôle d'un candidat référent (Admin / n3boss / Équipe / n3beur). */
export function referentRoleHint(c, terms) {
  const slug = String(c?.primary_role_slug || '').toLowerCase();
  if (c?.user_type === 'teacher') {
    if (slug === 'admin') return 'Admin';
    if (slug === 'prof') return terms?.teacherSingular ? terms.teacherSingular : 'n3boss';
    return 'Équipe';
  }
  return terms?.studentSingular ? terms.studentSingular : 'n3beur';
}

/** Carte initiale du formulaire selon la tâche éditée ou le projet par défaut. */
export function initialTaskFormMapId(editTask, defaultProjectForNew, activeMapId) {
  return editTask
    ? (editTask.map_id_resolved || editTask.map_id || editTask.zone_map_id || editTask.marker_map_id || null)
    : (defaultProjectForNew?.map_id || activeMapId);
}

/**
 * Construit l'état initial du formulaire de tâche.
 * Comportement identique à l'ancien `useState(...)` inline de `TaskFormModal`.
 */
export function buildInitialTaskForm({
  editTask,
  isDuplicate = false,
  initialMapId,
  initialZoneIds = [],
  initialMarkerIds = [],
  defaultProjectForNew = null,
} = {}) {
  if (editTask) {
    return {
      title: isDuplicate ? `${editTask.title} (copie)` : editTask.title,
      description: editTask.description || '',
      map_id: initialMapId || '',
      zone_ids: initialZoneIds,
      marker_ids: initialMarkerIds,
      tutorial_ids: normalizeTutorialIds(initialLocationIds(editTask, 'tutorial_ids', 'tutorial_id')),
      referent_user_ids: editTask && Array.isArray(editTask.referent_user_ids)
        ? [...new Set(editTask.referent_user_ids.map((id) => String(id || '').trim()).filter(Boolean))]
        : [],
      project_id: editTask.project_id || '',
      start_date: isDuplicate ? currentLocalDateOnly() : (editTask.start_date || ''),
      due_date: editTask.due_date || '',
      required_students: editTask.required_students || 1,
      completion_mode: getCompletionMode(editTask),
      danger_level: editTask.danger_level != null && editTask.danger_level !== '' ? editTask.danger_level : '',
      difficulty_level: editTask.difficulty_level != null && editTask.difficulty_level !== '' ? editTask.difficulty_level : '',
      importance_level: editTask.importance_level != null && editTask.importance_level !== '' ? editTask.importance_level : '',
      recurrence: editTask.recurrence || '',
      living_beings: orderedLivingBeingsForForm(editTask.living_beings_list || editTask.living_beings, ''),
      assign_student_ids: [],
    };
  }
  return {
    title: '', description: '', map_id: initialMapId || '',
    zone_ids: [], marker_ids: [], tutorial_ids: [], referent_user_ids: [], living_beings: [],
    project_id: defaultProjectForNew ? String(defaultProjectForNew.id) : '',
    start_date: '', due_date: '', required_students: 1, completion_mode: 'single_done',
    danger_level: '', difficulty_level: '', importance_level: '', recurrence: '',
    assign_student_ids: [],
  };
}

/**
 * Construit le payload de sauvegarde d'une tâche à partir de l'état du formulaire.
 * Transformation pure (dédup d'ids, repli de carte sur les liens, gestion image).
 */
export function buildTaskSavePayload({
  form,
  zones = [],
  markers = [],
  normalizedTutorialIds = [],
  taskImageData = null,
  editTask = null,
  isDuplicate = false,
  taskImageRemoved = false,
} = {}) {
  const mapFromLinks = () => {
    for (const id of form.zone_ids) {
      const z = zones.find((zz) => String(zz.id || '').trim() === String(id || '').trim());
      if (z?.map_id) return z.map_id;
    }
    for (const id of form.marker_ids) {
      const m = markers.find((mm) => String(mm.id || '').trim() === String(id || '').trim());
      if (m?.map_id) return m.map_id;
    }
    return form.map_id || null;
  };
  const normalizedReferentIds = [...new Set((form.referent_user_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const payload = {
    title: form.title.trim(),
    description: form.description || '',
    map_id: form.map_id || null,
    zone_ids: [...new Set(form.zone_ids.map((id) => String(id || '').trim()).filter(Boolean))],
    marker_ids: [...new Set(form.marker_ids.map((id) => String(id || '').trim()).filter(Boolean))],
    tutorial_ids: normalizedTutorialIds,
    referent_user_ids: normalizedReferentIds,
    project_id: form.project_id || null,
    start_date: form.start_date || null,
    due_date: form.due_date || null,
    required_students: form.required_students,
    completion_mode: form.completion_mode || 'single_done',
    danger_level: form.danger_level ? form.danger_level : null,
    difficulty_level: form.difficulty_level ? form.difficulty_level : null,
    importance_level: form.importance_level ? form.importance_level : null,
    recurrence: form.recurrence || null,
    living_beings: [...new Set((form.living_beings || []).map((n) => String(n || '').trim()).filter(Boolean))],
    assign_student_ids: [...new Set((form.assign_student_ids || []).map((id) => String(id || '').trim()).filter(Boolean))],
  };
  if (!payload.map_id && (payload.zone_ids.length || payload.marker_ids.length)) {
    payload.map_id = mapFromLinks();
  }
  if (taskImageData) payload.imageData = taskImageData;
  else if (editTask && !isDuplicate && taskImageRemoved) payload.remove_task_image = true;
  return payload;
}

/** Libellé d'une zone dans un sélecteur (nom + êtres vivants éventuels). */
export function zonePickDisplayName(z) {
  const line = formatLivingBeingsListLine(
    orderedLivingBeingsForForm(z.living_beings_list || z.living_beings, z.current_plant),
  );
  return line ? `${z.name} — ${line}` : z.name;
}

/** IDs initiaux d'un champ lieu (clé multi prioritaire, repli sur la clé simple). */
export function initialLocationIds(editTask, keyMulti, keySingle) {
  if (!editTask) return [];
  const multi = editTask[keyMulti];
  if (Array.isArray(multi) && multi.length) {
    return [...new Set(multi.map((id) => String(id || '').trim()).filter(Boolean))];
  }
  const one = editTask[keySingle];
  return one ? [String(one).trim()].filter(Boolean) : [];
}

/** IDs initiaux d'objets liés (tableau d'objets `{ id }`), dédupliqués. */
export function initialLinkedObjectIds(editTask, linkedKey) {
  if (!editTask) return [];
  const linked = editTask[linkedKey];
  if (!Array.isArray(linked) || !linked.length) return [];
  return [...new Set(linked
    .map((entry) => String(entry?.id || '').trim())
    .filter(Boolean))];
}

/** Normalise une liste d'IDs de tutoriels en entiers positifs uniques. */
export function normalizeTutorialIds(ids) {
  if (!Array.isArray(ids)) return [];
  const unique = new Set();
  for (const raw of ids) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    unique.add(n);
  }
  return [...unique];
}
