import React, { useMemo, useState, useCallback } from 'react';

import { api } from '../../services/api';
import { tutorialPreviewCanEmbed } from '../TutorialPreviewModal';
import {
  tutorialPickerHasLocation,
  tutorialPickerLinkedToSameMap,
  dedupeTutorialsByIdForTasks,
  tutorialRefsFromTasksAtLocationFilter,
} from '../../utils/taskListHelpers.js';
import {
  focusMapIdForLocationFilter,
  tutorialLocationIdsAfterLink,
  tutorialLocationIdsAfterUnlink,
} from '../../utils/taskLocationPicker.js';

/**
 * Bloc « 📘 Tutoriels pour ce lieu » de la vue Tâches (affiché quand un lieu est filtré).
 *
 * Extrait de `tasks-views.jsx` (O6) : état du sélecteur de liaison, mémos
 * (tutoriels liés / liables au lieu en focus) et handlers de liaison/déliaison.
 * Le parent fournit `withLoad` (mutex + refresh + toasts d'erreur), `setToast`
 * et `loading` pour rester aligné sur les autres actions de la vue.
 */
export function TaskTutorialsAtFocusBlock({
  isTeacher,
  filterZone,
  tutorialsModuleEnabled,
  tutorials,
  tasks,
  zones,
  markers,
  activeMapId,
  loading,
  withLoad,
  setToast,
  openTasksTutorialPreview,
}) {
  const [quickTutoLinkId, setQuickTutoLinkId] = useState('');

  const focusMapIdForTutorials = useMemo(() => {
    if (!filterZone || !tutorialsModuleEnabled) return null;
    return focusMapIdForLocationFilter(filterZone, zones, markers, activeMapId);
  }, [filterZone, zones, markers, tutorialsModuleEnabled, activeMapId]);

  const linkedTutorialsAtFocus = useMemo(() => {
    if (!filterZone || !tutorialsModuleEnabled) return [];
    const fromLocation = (tutorials || []).filter((tu) => tutorialPickerHasLocation(tu, filterZone));
    const fromTasks = tutorialRefsFromTasksAtLocationFilter(filterZone, tasks, tutorials || []);
    const merged = dedupeTutorialsByIdForTasks([...fromLocation, ...fromTasks]);
    if (isTeacher) return merged;
    return merged.filter((tu) => tu.is_active !== false);
  }, [filterZone, tutorials, tutorialsModuleEnabled, isTeacher, tasks]);

  const assignableTutorialsAtFocus = useMemo(() => {
    if (!filterZone || !isTeacher || !tutorialsModuleEnabled || !focusMapIdForTutorials) return [];
    return (tutorials || []).filter((tu) => (
      tu.is_active !== false
      && !tutorialPickerHasLocation(tu, filterZone)
      && tutorialPickerLinkedToSameMap(tu, focusMapIdForTutorials)
    ));
  }, [filterZone, tutorials, isTeacher, tutorialsModuleEnabled, focusMapIdForTutorials]);

  const linkTutorialAtFocus = useCallback((tutorialId) => withLoad(`tuto-link-${tutorialId}`, async () => {
    const tu = (tutorials || []).find((x) => Number(x.id) === Number(tutorialId));
    if (!tu || !filterZone) return;
    const { zoneIds, markerIds } = tutorialLocationIdsAfterLink(tu, filterZone);
    await api(`/api/tutorials/${tutorialId}`, 'PUT', { zone_ids: zoneIds, marker_ids: markerIds });
    setQuickTutoLinkId('');
    setToast('Tutoriel lié à ce lieu ✓');
  }), [withLoad, tutorials, filterZone, setToast]);

  const unlinkTutorialAtFocus = useCallback((tuRow) => withLoad(`tuto-unlink-${tuRow.id}`, async () => {
    if (!filterZone) return;
    const { zoneIds, markerIds } = tutorialLocationIdsAfterUnlink(tuRow, filterZone);
    await api(`/api/tutorials/${tuRow.id}`, 'PUT', { zone_ids: zoneIds, marker_ids: markerIds });
    setToast('Tutoriel dissocié de ce lieu ✓');
  }), [withLoad, filterZone, setToast]);

  return (
    <div className="tasks-section" style={{ marginTop: 14, marginBottom: 8 }}>
      <div className="tasks-section-title">📘 Tutoriels pour ce lieu</div>
      {isTeacher && (
        <>
          <div style={{ marginTop: 8 }}>
            {linkedTutorialsAtFocus.length === 0 ? (
              <p style={{ color: '#999', fontSize: '.85rem', margin: 0 }}>Aucun tutoriel lié à ce lieu.</p>
            ) : (
              linkedTutorialsAtFocus.map((tu) => (
                <div key={tu.id} className="history-item" style={{ alignItems: 'center' }}>
                  <span>{tu.title}{tu.is_active === false ? ' (archivé)' : ''}</span>
                  {tutorialPickerHasLocation(tu, filterZone) ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!!loading[`tuto-unlink-${tu.id}`]}
                      onClick={() => unlinkTutorialAtFocus(tu)}
                    >
                      Délier
                    </button>
                  ) : (
                    <span style={{ fontSize: '.72rem', color: '#64748b', flexShrink: 0 }}>via mission</span>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="tasks-view-tuto-link">Lier un tutoriel existant</label>
            <select
              id="tasks-view-tuto-link"
              value={quickTutoLinkId}
              onChange={(e) => setQuickTutoLinkId(e.target.value)}
            >
              <option value="">— Choisir un tutoriel —</option>
              {assignableTutorialsAtFocus.map((tu) => (
                <option key={tu.id} value={String(tu.id)}>{tu.title}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ marginTop: 8 }}
            disabled={!quickTutoLinkId || !!loading[`tuto-link-${quickTutoLinkId}`]}
            onClick={() => linkTutorialAtFocus(quickTutoLinkId)}
          >
            🔗 Lier le tutoriel
          </button>
        </>
      )}
      {!isTeacher && (
        <div style={{ marginTop: 8, display: 'grid', gap: 12 }}>
          {linkedTutorialsAtFocus.length === 0 ? (
            <p style={{ color: '#999', fontSize: '.85rem', margin: 0 }}>Aucun tutoriel lié à ce lieu.</p>
          ) : (
            linkedTutorialsAtFocus.map((tu) => {
              const [fk, fid] = String(filterZone).split(':');
              const otherZones = (tu.zones_linked || []).filter((z) => !(fk === 'zone' && String(z.id) === String(fid)));
              const otherMarkers = (tu.markers_linked || []).filter((mk) => !(fk === 'marker' && String(mk.id) === String(fid)));
              return (
                <div
                  key={tu.id}
                  style={{
                    border: '1px solid rgba(0,0,0,.08)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    background: 'var(--parchment)',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--forest)' }}>{tu.title}</div>
                  {tu.summary && (
                    <p style={{ margin: '8px 0 0', fontSize: '.82rem', color: '#555', lineHeight: 1.45 }}>{tu.summary}</p>
                  )}
                  {otherZones.length > 0 && (
                    <p style={{ margin: '10px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                      <strong>Autres zones</strong> : {otherZones.map((z) => z.name).join(', ')}
                    </p>
                  )}
                  {otherMarkers.length > 0 && (
                    <p style={{ margin: '6px 0 0', fontSize: '.76rem', color: '#64748b' }}>
                      <strong>Repères</strong> : {otherMarkers.map((m) => `${m.emoji ? `${m.emoji} ` : ''}${m.label}`).join(', ')}
                    </p>
                  )}
                  {tutorialPreviewCanEmbed(tu) ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 10 }}
                      onClick={() => openTasksTutorialPreview(tu)}
                    >
                      📖 Consulter
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
