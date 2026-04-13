/**
 * Liens tâches / tutoriels ↔ lieux (zones, repères) — logique partagée carte, tâches, visite.
 */

/** IDs zones/repères liés à une tâche (API multi + champs legacy). */
export function taskLocationIds(t) {
  if (!t) return { zoneIds: [], markerIds: [] };
  const zoneIds = [...new Set([...(t.zone_ids || []), ...(t.zone_id ? [t.zone_id] : [])])];
  const markerIds = [...new Set([...(t.marker_ids || []), ...(t.marker_id ? [t.marker_id] : [])])];
  return { zoneIds, markerIds };
}

/** IDs zones/repères liés à un tutoriel (API). */
export function tutorialLocationIds(tu) {
  if (!tu) return { zoneIds: [], markerIds: [] };
  const zoneIds = [...new Set((tu.zone_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const markerIds = [...new Set((tu.marker_ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  return { zoneIds, markerIds };
}

export function isTaskDetachedFromLocation(task) {
  if (!task) return false;
  return task.status === 'done' || task.status === 'validated';
}

/** Tutoriels référencés par une tâche (`tutorials_linked` ou `tutorial_ids` + catalogue). */
export function taskLinkedTutorialRefs(task, tutorialsCatalog = []) {
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

export function dedupeTutorialsById(list) {
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

/** Tutoriels référencés par des tâches sur ce lieu (dédoublonnés). */
export function tutorialsFromTasksAtLocation(kind, locationId, tasks, tutorialsCatalog) {
  const locZone = kind === 'zone';
  const refs = [];
  for (const t of tasks || []) {
    if (isTaskDetachedFromLocation(t)) continue;
    const { zoneIds, markerIds } = taskLocationIds(t);
    const at = locZone
      ? zoneIds.some((id) => String(id) === String(locationId))
      : markerIds.some((id) => String(id) === String(locationId));
    if (!at) continue;
    refs.push(...taskLinkedTutorialRefs(t, tutorialsCatalog));
  }
  return dedupeTutorialsById(refs);
}

/** Noms d’êtres vivants portés par les tâches à ce lieu (ordre d’apparition, sans doublon). */
export function livingBeingNamesFromTasksAtLocation(kind, locationId, tasks) {
  const locZone = kind === 'zone';
  const names = [];
  const seen = new Set();
  for (const t of tasks || []) {
    if (isTaskDetachedFromLocation(t)) continue;
    const { zoneIds, markerIds } = taskLocationIds(t);
    const at = locZone
      ? zoneIds.some((id) => String(id) === String(locationId))
      : markerIds.some((id) => String(id) === String(locationId));
    if (!at) continue;
    const list = Array.isArray(t.living_beings_list) ? t.living_beings_list : [];
    for (const raw of list) {
      const s = String(raw || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      names.push(s);
    }
  }
  return names;
}
