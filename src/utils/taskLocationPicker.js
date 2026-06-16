/**
 * Logique pure du sélecteur de lieu (zones / repères) de la vue Tâches.
 *
 * Extraite de `tasks-views.jsx` (O6) : carte effective d'une tâche, filtre carte,
 * collecte des lieux utilisés (tâches + tutoriels) et calcul des ids zone/repère
 * d'un tutoriel après liaison/déliaison à un lieu. Sans React ni I/O, testable
 * unitairement (`tests-ui/utils/taskLocationPicker.test.js`).
 */

import { tutorialPickerLocationIds } from './taskListHelpers.js';

/** Carte effective d'une tâche (résolue par l'API, sinon carte directe ou héritée de la zone / du repère). */
export function taskEffectiveMapId(task) {
  return task.map_id_resolved || task.map_id || task.zone_map_id || task.marker_map_id || null;
}

/** Une tâche (par sa carte effective, null = globale) passe-t-elle le filtre carte (`active` / `all` / id) ? */
export function taskMapIdMatchesFilter(taskMapId, filterMap, activeMapId) {
  if (filterMap === 'active' && taskMapId !== activeMapId && taskMapId != null) return false;
  if (filterMap !== 'active' && filterMap !== 'all' && taskMapId !== filterMap && taskMapId != null)
    return false;
  return true;
}

/**
 * Zones et repères proposés dans le sélecteur de lieu : ceux référencés par les tâches
 * (déjà filtrées par carte) + ceux des tutoriels actifs (archivés inclus côté n3boss),
 * en respectant le filtre carte pour les lieux des tutoriels.
 */
export function collectUsedLocationIds({
  tasksForLocationPicker = [],
  tutorials = [],
  zones = [],
  markers = [],
  filterMap,
  activeMapId,
  tutorialsModuleEnabled = true,
  isTeacher = false,
}) {
  const usedZoneIds = new Set();
  const usedMarkerIds = new Set();
  for (const t of tasksForLocationPicker) {
    (t.zone_ids || []).forEach((id) => usedZoneIds.add(id));
    if (t.zone_id) usedZoneIds.add(t.zone_id);
    (t.marker_ids || []).forEach((id) => usedMarkerIds.add(id));
    if (t.marker_id) usedMarkerIds.add(t.marker_id);
  }
  if (tutorialsModuleEnabled) {
    for (const tu of tutorials || []) {
      if (!isTeacher && tu.is_active === false) continue;
      for (const zid of tu.zone_ids || []) {
        const z = zones.find((zz) => String(zz.id) === String(zid));
        if (!z) continue;
        if (filterMap === 'active' && z.map_id !== activeMapId) continue;
        if (filterMap !== 'active' && filterMap !== 'all' && z.map_id !== filterMap) continue;
        usedZoneIds.add(zid);
      }
      for (const mid of tu.marker_ids || []) {
        const m = markers.find((mm) => String(mm.id) === String(mid));
        if (!m) continue;
        if (filterMap === 'active' && m.map_id !== activeMapId) continue;
        if (filterMap !== 'active' && filterMap !== 'all' && m.map_id !== filterMap) continue;
        usedMarkerIds.add(mid);
      }
    }
  }
  return { usedZones: [...usedZoneIds], usedMarkers: [...usedMarkerIds] };
}

/** Carte du lieu ciblé par le filtre (`zone:id` / `marker:id` / id de zone hérité), repli carte active. */
export function focusMapIdForLocationFilter(locationFilterValue, zones, markers, activeMapId) {
  const [kind, rawId] = String(locationFilterValue).split(':');
  if (kind === 'zone' && rawId) {
    return zones.find((z) => String(z.id) === String(rawId))?.map_id ?? activeMapId;
  }
  if (kind === 'marker' && rawId) {
    return markers.find((m) => String(m.id) === String(rawId))?.map_id ?? activeMapId;
  }
  return zones.find((z) => String(z.id) === String(locationFilterValue))?.map_id ?? activeMapId;
}

/** Ids zone/repère d'un tutoriel après liaison au lieu du filtre (dédupliqués, payload PUT /api/tutorials/:id). */
export function tutorialLocationIdsAfterLink(tu, locationFilterValue) {
  const { zoneIds: zi, markerIds: mi } = tutorialPickerLocationIds(tu);
  const [kind, rawId] = String(locationFilterValue).split(':');
  let zoneIds = [...zi];
  let markerIds = [...mi];
  if (kind === 'zone' && rawId) {
    zoneIds = [...new Set([...zi.map(String), String(rawId).trim()])];
  } else if (kind === 'marker' && rawId) {
    markerIds = [...new Set([...mi.map(String), String(rawId).trim()])];
  }
  return { zoneIds, markerIds };
}

/** Ids zone/repère d'un tutoriel après déliaison du lieu du filtre (payload PUT /api/tutorials/:id). */
export function tutorialLocationIdsAfterUnlink(tu, locationFilterValue) {
  const { zoneIds: zi, markerIds: mi } = tutorialPickerLocationIds(tu);
  const [kind, rawId] = String(locationFilterValue).split(':');
  let zoneIds = [...zi];
  let markerIds = [...mi];
  if (kind === 'zone' && rawId) {
    zoneIds = zi.filter((id) => String(id) !== String(rawId));
  } else if (kind === 'marker' && rawId) {
    markerIds = mi.filter((id) => String(id) !== String(rawId));
  }
  return { zoneIds, markerIds };
}
