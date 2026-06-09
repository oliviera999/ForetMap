/**
 * Helpers purs de la liste des tâches — tri, statut effectif, libellés et filtrage par lieu.
 *
 * Extraits de `tasks-views.jsx` (O6) pour réduire le méga-composant et couvrir cette logique
 * par des tests unitaires. Aucune dépendance React/DOM/API : fonctions pures (sauf
 * `currentLocalDateOnly`/`isBeforeTaskStartDate`/`taskEffectiveStatus` qui lisent l'horloge locale).
 */

// ── Tri par importance puis date limite ──────────────────────────────────────
export const TASK_IMPORTANCE_SORT_WEIGHT = {
  not_important: 1,
  low: 2,
  medium: 3,
  high: 4,
  absolute: 5,
};

/** Même logique que GET /api/tasks : importance explicite d’abord (poids décroissant), puis sans importance, puis date limite. */
export function compareTasksByImportanceThenDueDate(a, b) {
  const rawA = String(a?.importance_level || '').trim().toLowerCase();
  const rawB = String(b?.importance_level || '').trim().toLowerCase();
  const tierA = rawA && TASK_IMPORTANCE_SORT_WEIGHT[rawA] != null ? 0 : 1;
  const tierB = rawB && TASK_IMPORTANCE_SORT_WEIGHT[rawB] != null ? 0 : 1;
  if (tierA !== tierB) return tierA - tierB;
  if (tierA === 0) {
    const wA = TASK_IMPORTANCE_SORT_WEIGHT[rawA] || 0;
    const wB = TASK_IMPORTANCE_SORT_WEIGHT[rawB] || 0;
    if (wA !== wB) return wB - wA;
  }
  const da = String(a?.due_date || '');
  const db = String(b?.due_date || '');
  if (da !== db) return da.localeCompare(db);
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

// ── Dates & statut effectif ───────────────────────────────────────────────────
export function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function currentLocalDateOnly() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isBeforeTaskStartDate(task) {
  const startDate = normalizeDateOnly(task?.start_date);
  if (!startDate) return false;
  return startDate > currentLocalDateOnly();
}

export function taskEffectiveStatus(task) {
  const baseStatus = task?.status || 'available';
  if (baseStatus === 'done' || baseStatus === 'validated' || baseStatus === 'proposed') return baseStatus;
  if (task?.project_status === 'validated') return 'project_validated';
  if (task?.project_status === 'completed') return 'project_completed';
  if (baseStatus === 'on_hold' || task?.project_status === 'on_hold' || task?.is_before_start_date || isBeforeTaskStartDate(task)) {
    return 'on_hold';
  }
  return baseStatus;
}

// ── Libellés ──────────────────────────────────────────────────────────────────
export function projectStatusLabel(status) {
  if (status === 'on_hold') return ' (en attente)';
  if (status === 'completed') return ' (terminé)';
  if (status === 'validated') return ' (validé)';
  return '';
}

export function normalizeProjectUiStatus(status) {
  if (status === 'on_hold') return 'on_hold';
  if (status === 'completed') return 'completed';
  if (status === 'validated') return 'validated';
  return 'active';
}

export function mapLabelFromMaps(mapId, maps) {
  if (!mapId) return 'Globale';
  const map = maps.find((m) => m.id === mapId);
  return map ? map.label : mapId;
}

// ── Filtrage des tâches par lieu (zone / repère) ──────────────────────────────
export function taskHasZone(t, zoneId) {
  if (!zoneId) return true;
  const normalizedZoneId = String(zoneId || '').trim();
  if (!normalizedZoneId) return true;
  if ((t.zone_ids || []).some((id) => String(id || '').trim() === normalizedZoneId)) return true;
  return String(t.zone_id || '').trim() === normalizedZoneId;
}

export function taskHasMarker(t, markerId) {
  if (!markerId) return true;
  const normalizedMarkerId = String(markerId || '').trim();
  if (!normalizedMarkerId) return true;
  if ((t.marker_ids || []).some((id) => String(id || '').trim() === normalizedMarkerId)) return true;
  return String(t.marker_id || '').trim() === normalizedMarkerId;
}

export function taskHasLocation(t, locationFilterValue) {
  if (!locationFilterValue) return true;
  const [kind, rawId] = String(locationFilterValue).split(':');
  if (!rawId) return taskHasZone(t, locationFilterValue);
  if (kind === 'zone') return taskHasZone(t, rawId);
  if (kind === 'marker') return taskHasMarker(t, rawId);
  return true;
}

// ── Filtrage du sélecteur de tutoriels par lieu ───────────────────────────────
export function tutorialPickerLocationIds(tu) {
  if (!tu) return { zoneIds: [], markerIds: [] };
  const zoneIds = [...new Set((tu.zone_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const markerIds = [...new Set((tu.marker_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  return { zoneIds, markerIds };
}

export function tutorialPickerHasLocation(tu, locationFilterValue) {
  if (!locationFilterValue) return true;
  const [kind, rawId] = String(locationFilterValue).split(':');
  const { zoneIds: zl, markerIds: ml } = tutorialPickerLocationIds(tu);
  if (!rawId) return zl.includes(String(locationFilterValue).trim());
  if (kind === 'zone') return zl.includes(String(rawId).trim());
  if (kind === 'marker') return ml.includes(String(rawId).trim());
  return true;
}

export function tutorialPickerLinkedToSameMap(tu, mapId) {
  if (!mapId) return true;
  const zl = tu.zones_linked || [];
  const ml = tu.markers_linked || [];
  if (zl.length === 0 && ml.length === 0) return true;
  return [...zl, ...ml].every((x) => x.map_id === mapId);
}

export function dedupeTutorialsByIdForTasks(list) {
  const seen = new Set();
  const out = [];
  for (const tu of list || []) {
    if (!tu || tu.id == null) continue;
    const k = String(tu.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tu);
  }
  return out;
}

/** Tutoriels référencés par une tâche (tutorials_linked ou tutorial_ids + catalogue). */
export function taskLinkedTutorialRefsForPicker(task, tutorialsCatalog = []) {
  if (!task) return [];
  const linked = task.tutorials_linked;
  if (Array.isArray(linked) && linked.length) return linked;
  const ids = task.tutorial_ids;
  if (!Array.isArray(ids) || !ids.length) return [];
  const out = [];
  for (const raw of ids) {
    const tu = tutorialsCatalog.find((x) => Number(x.id) === Number(raw));
    if (tu) out.push(tu);
  }
  return out;
}

export function tutorialRefsFromTasksAtLocationFilter(filterZone, tasks, tutorialsCatalog) {
  if (!filterZone) return [];
  const refs = [];
  for (const t of tasks || []) {
    if (t.status === 'done' || t.status === 'validated') continue;
    if (!taskHasLocation(t, filterZone)) continue;
    refs.push(...taskLinkedTutorialRefsForPicker(t, tutorialsCatalog));
  }
  return dedupeTutorialsByIdForTasks(refs);
}
