import { useCallback } from 'react';
import { api } from '../services/api';
import { taskLocationIds, tutorialLocationIds } from '../utils/mapLocationContext';
import { offsetDuplicateZonePoints } from '../utils/zoneEditGeometry.js';
import { orderedLivingBeingsForForm } from '../utils/livingBeings';

/**
 * Actions CRUD de la carte (repères, zones, liens tâches/tutoriels, inscription) —
 * extrait de `MapView`. Appels API + `onRefresh`, comportement strictement inchangé ;
 * les effets d'UI (fermer une modale, sélectionner la copie, toast) restent au call site.
 *
 * Les 4 fonctions symétriques zone/repère de liaison de tâches (et les 4 des tutoriels)
 * sont paramétrées par `kind` (`'zone' | 'marker'`).
 *
 * @param {object} params
 * @param {string|number} params.activeMapId carte active (map_id par défaut des créations)
 * @param {Array<object>} params.tasks tâches connues (résolution des liens existants)
 * @param {Array<object>} params.tutorials tutoriels connus (résolution des liens existants)
 * @param {() => Promise<*>} params.onRefresh recharge les données après chaque mutation
 * @param {object|null} [params.student] élève courant (inscription aux tâches)
 * @param {boolean} [params.canEnrollNewTasks] droit de s'inscrire aux tâches
 */
function useMapCrudActions({
  activeMapId,
  tasks,
  tutorials,
  onRefresh,
  student = null,
  canEnrollNewTasks = false,
}) {
  const saveMarker = useCallback(
    async (d) => {
      const payload = { ...d, map_id: d.map_id || activeMapId };
      await api('/api/map/markers', 'POST', payload);
      await onRefresh();
    },
    [activeMapId, onRefresh],
  );

  const updateMarker = useCallback(
    async (id, data) => {
      const payload = { ...data, map_id: data.map_id || activeMapId };
      await api(`/api/map/markers/${id}`, 'PUT', payload);
      await onRefresh();
    },
    [activeMapId, onRefresh],
  );

  /** Lie une tâche à une zone (`kind: 'zone'`) ou à un repère (`kind: 'marker'`). */
  const linkTaskToLocation = useCallback(
    async (taskId, kind, locationId) => {
      const t = (tasks || []).find((x) => x.id === taskId);
      const { zoneIds: zi, markerIds: mi } = taskLocationIds(t);
      const zoneIds = kind === 'zone' ? [...new Set([...zi, locationId])] : zi;
      const markerIds = kind === 'marker' ? [...new Set([...mi, locationId])] : mi;
      await api(`/api/tasks/${taskId}`, 'PUT', { zone_ids: zoneIds, marker_ids: markerIds });
      await onRefresh();
    },
    [tasks, onRefresh],
  );

  /** Délie une tâche ; si plus aucun lieu, la tâche reste rattachée à la carte active. */
  const unlinkTaskFromLocation = useCallback(
    async (task, kind, locationId) => {
      const { zoneIds: zi, markerIds: mi } = taskLocationIds(task);
      const zoneIds = kind === 'zone' ? zi.filter((id) => id !== locationId) : zi;
      const markerIds = kind === 'marker' ? mi.filter((id) => id !== locationId) : mi;
      const payload = { zone_ids: zoneIds, marker_ids: markerIds };
      if (zoneIds.length === 0 && markerIds.length === 0) payload.map_id = activeMapId;
      await api(`/api/tasks/${task.id}`, 'PUT', payload);
      await onRefresh();
    },
    [activeMapId, onRefresh],
  );

  /** Lie un tutoriel à une zone (`kind: 'zone'`) ou à un repère (`kind: 'marker'`). */
  const linkTutorialToLocation = useCallback(
    async (tutorialId, kind, locationId) => {
      const tu = (tutorials || []).find((x) => Number(x.id) === Number(tutorialId));
      if (!tu) return;
      const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tu);
      const zoneIds = kind === 'zone' ? [...new Set([...(zi || []), locationId])] : zi;
      const markerIds = kind === 'marker' ? [...new Set([...(mi || []), locationId])] : mi;
      await api(`/api/tutorials/${tutorialId}`, 'PUT', {
        zone_ids: zoneIds,
        marker_ids: markerIds,
      });
      await onRefresh();
    },
    [tutorials, onRefresh],
  );

  const unlinkTutorialFromLocation = useCallback(
    async (tutorial, kind, locationId) => {
      const { zoneIds: zi, markerIds: mi } = tutorialLocationIds(tutorial);
      const zoneIds = kind === 'zone' ? zi.filter((id) => String(id) !== String(locationId)) : zi;
      const markerIds =
        kind === 'marker' ? mi.filter((id) => String(id) !== String(locationId)) : mi;
      await api(`/api/tutorials/${tutorial.id}`, 'PUT', {
        zone_ids: zoneIds,
        marker_ids: markerIds,
      });
      await onRefresh();
    },
    [onRefresh],
  );

  const deleteMarker = useCallback(
    async (id) => {
      await api(`/api/map/markers/${id}`, 'DELETE');
      await onRefresh();
    },
    [onRefresh],
  );

  const deleteZone = useCallback(
    async (id) => {
      await api(`/api/zones/${id}`, 'DELETE');
      await onRefresh();
    },
    [onRefresh],
  );

  /** Duplique une zone (contour décalé) et retourne la zone créée. */
  const duplicateZone = useCallback(
    async (z) => {
      let pts;
      try {
        pts = z.points ? JSON.parse(z.points) : [];
      } catch (_e) {
        pts = [];
      }
      if (!pts || pts.length < 3) throw new Error('Contour invalide');
      const shifted = offsetDuplicateZonePoints(pts);
      if (!shifted) throw new Error('Contour invalide');
      const living = orderedLivingBeingsForForm(
        z.living_beings_list || z.living_beings,
        z.current_plant,
      );
      const created = await api('/api/zones', 'POST', {
        name: `${z.name || 'Zone'} (copie)`,
        points: shifted,
        color: z.color || '#86efac80',
        current_plant: '',
        living_beings: living,
        stage: z.stage || 'empty',
        special: z.special ? 1 : 0,
        map_id: z.map_id || activeMapId,
        description: z.description || '',
      });
      await onRefresh();
      return created;
    },
    [activeMapId, onRefresh],
  );

  /** Duplique un repère (léger décalage) et retourne le repère créé. */
  const duplicateMarker = useCallback(
    async (m) => {
      const dx = 1.5;
      const dy = 1.5;
      const nx = Math.min(100, Math.max(0, Number(m.x_pct) + dx));
      const ny = Math.min(100, Math.max(0, Number(m.y_pct) + dy));
      const living = orderedLivingBeingsForForm(
        m.living_beings_list || m.living_beings,
        m.plant_name,
      );
      const baseLabel = String(m.label || 'Repère')
        .replace(/\s*\(copie\)\s*$/i, '')
        .trim();
      const created = await api('/api/map/markers', 'POST', {
        map_id: m.map_id || activeMapId,
        x_pct: nx,
        y_pct: ny,
        label: `${baseLabel} (copie)`,
        plant_name: '',
        living_beings: living,
        note: m.note || '',
        emoji: String(m.emoji ?? '').trim(),
        visit_subtitle: m.visit_subtitle,
        visit_short_description: m.visit_short_description,
        visit_details_title: m.visit_details_title,
        visit_details_text: m.visit_details_text,
      });
      await onRefresh();
      return created;
    },
    [activeMapId, onRefresh],
  );

  const assignTasksToStudent = useCallback(
    async (taskIds) => {
      const ids = [...new Set((taskIds || []).filter(Boolean))];
      if (!canEnrollNewTasks || !ids.length || !student) {
        return { assignedCount: 0, failedCount: 0, firstError: null };
      }
      let assignedCount = 0;
      let failedCount = 0;
      let firstError = null;
      for (const taskId of ids) {
        try {
          await api(`/api/tasks/${taskId}/assign`, 'POST', {
            firstName: student.first_name,
            lastName: student.last_name,
            studentId: student.id,
          });
          assignedCount += 1;
        } catch (err) {
          failedCount += 1;
          if (!firstError) firstError = err?.message || 'Erreur serveur';
        }
      }
      await onRefresh();
      return { assignedCount, failedCount, firstError };
    },
    [canEnrollNewTasks, student, onRefresh],
  );

  return {
    saveMarker,
    updateMarker,
    linkTaskToLocation,
    unlinkTaskFromLocation,
    linkTutorialToLocation,
    unlinkTutorialFromLocation,
    deleteMarker,
    deleteZone,
    duplicateZone,
    duplicateMarker,
    assignTasksToStudent,
  };
}

export default useMapCrudActions;
