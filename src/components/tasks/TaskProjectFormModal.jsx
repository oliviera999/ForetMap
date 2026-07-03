import { useState, useMemo } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { DialogShell } from '../DialogShell';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import {
  initialLocationIds,
  normalizeTutorialIds,
  zonePickDisplayName,
} from '../../utils/taskFormHelpers.js';
import { TaskFormTutorialsField } from './TaskFormTutorialsField.jsx';
import {
  LocationPickList,
  filterSelectableZones,
  filterSelectableMarkers,
  toggledLocationIds,
} from './LocationPickList.jsx';
import { useTutorialSearch } from './useTutorialSearch.js';

const var_alert = 'var(--alert)';

/**
 * Formulaire initial du projet. La modale étant montée/démontée à chaque
 * ouverture (rendu conditionnel `showProjectForm` dans `tasks-views.jsx`),
 * l'initialisation est paresseuse (pas de useEffect de resynchronisation).
 */
function buildInitialProjectForm(editProject, defaultMapId) {
  if (!editProject) {
    return {
      title: '',
      description: '',
      map_id: defaultMapId,
      zone_ids: [],
      marker_ids: [],
      tutorial_ids: [],
      status: 'active',
    };
  }
  return {
    title: String(editProject.title || ''),
    description: String(editProject.description || ''),
    map_id: editProject.map_id || defaultMapId,
    zone_ids: initialLocationIds(editProject, 'zone_ids', 'zone_id'),
    marker_ids: initialLocationIds(editProject, 'marker_ids', 'marker_id'),
    tutorial_ids: normalizeTutorialIds(editProject.tutorial_ids || []),
    status:
      editProject.status === 'on_hold'
        ? 'on_hold'
        : editProject.status === 'completed'
          ? 'completed'
          : editProject.status === 'validated'
            ? 'validated'
            : 'active',
  };
}

function TaskProjectFormModal({
  maps = [],
  zones = [],
  markers = [],
  tutorials = [],
  activeMapId = 'foret',
  editProject = null,
  onClose,
  onSave,
}) {
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const defaultMapId = activeMapId || maps[0]?.id || '';
  const {
    search: tutorialSearch,
    setSearch: setTutorialSearch,
    filteredTutorials,
  } = useTutorialSearch(tutorials);
  const [form, setForm] = useState(() => buildInitialProjectForm(editProject, defaultMapId));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const toggleZoneId = (zoneId) => {
    setForm((f) => {
      const zone_ids = toggledLocationIds(f.zone_ids, zoneId);
      return zone_ids ? { ...f, zone_ids } : f;
    });
  };

  const toggleMarkerId = (markerId) => {
    setForm((f) => {
      const marker_ids = toggledLocationIds(f.marker_ids, markerId);
      return marker_ids ? { ...f, marker_ids } : f;
    });
  };

  const toggleTutorialId = (tutorialId) => {
    const id = Number.parseInt(tutorialId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    setForm((f) => {
      const tutorialIds = normalizeTutorialIds(f.tutorial_ids);
      const has = tutorialIds.includes(id);
      return {
        ...f,
        tutorial_ids: has ? tutorialIds.filter((x) => x !== id) : [...tutorialIds, id],
      };
    });
  };

  const selectableZones = filterSelectableZones(zones, form.map_id);
  const selectableMarkers = filterSelectableMarkers(markers, form.map_id);
  const normalizedTutorialIds = useMemo(
    () => normalizeTutorialIds(form.tutorial_ids),
    [form.tutorial_ids],
  );

  const submit = async () => {
    if (!form.title.trim()) return setErr('Le titre est requis');
    if (!form.map_id) return setErr('La carte est requise');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        map_id: form.map_id,
        zone_ids: [...new Set(form.zone_ids.map((id) => String(id || '').trim()).filter(Boolean))],
        marker_ids: [
          ...new Set(form.marker_ids.map((id) => String(id || '').trim()).filter(Boolean)),
        ],
        tutorial_ids: normalizedTutorialIds,
      };
      if (editProject && (form.status === 'active' || form.status === 'on_hold')) {
        payload.status = form.status;
      }
      await onSave(payload);
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  const isEdit = !!editProject;
  const heading = isEdit ? 'Modifier le projet' : 'Nouveau projet';

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="modal fade-in"
      ariaLabel={heading}
      closeOnOverlay
      dialogRef={dialogRef}
    >
      <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>
        ✕
      </button>
      <h3>{heading}</h3>
      {err && <p style={{ color: var_alert, marginBottom: 12, fontSize: '.85rem' }}>{err}</p>}
      <div className="field">
        <label>Titre *</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Ex: Préparer la serre de printemps"
        />
      </div>
      <div className="field">
        <label>Description</label>
        <MarkdownTextarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={4}
          placeholder="Objectif du projet, consignes générales..."
        />
      </div>
      <div className="field">
        <label>Carte</label>
        <select
          value={form.map_id}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({
              ...f,
              map_id: v,
              zone_ids: f.zone_ids.filter((id) =>
                zones.some((z) => String(z.id) === String(id) && z.map_id === v),
              ),
              marker_ids: f.marker_ids.filter((id) =>
                markers.some((m) => String(m.id) === String(id) && m.map_id === v),
              ),
            }));
          }}
        >
          {maps.map((mp) => (
            <option key={mp.id} value={mp.id}>
              {mp.label}
            </option>
          ))}
        </select>
      </div>
      {isEdit && (
        <div className="field">
          <label>Statut du projet</label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {form.status === 'completed' && (
              <option value="completed" disabled>
                Terminé (toutes les tâches réalisées)
              </option>
            )}
            {form.status === 'validated' && (
              <option value="validated" disabled>
                Validé (décision n3boss)
              </option>
            )}
            <option value="active">Actif (inscriptions ouvertes)</option>
            <option value="on_hold">En attente (inscriptions fermées)</option>
          </select>
          {form.status === 'completed' && (
            <p style={{ fontSize: '.82rem', color: '#555', marginTop: 6 }}>
              Choisis « Actif » ou « En attente » pour rouvrir le projet, ou ajoute une tâche non
              terminée (le projet repasse alors automatiquement en actif).
            </p>
          )}
          {form.status === 'validated' && (
            <p style={{ fontSize: '.82rem', color: '#555', marginTop: 6 }}>
              Choisis « Actif » ou « En attente » pour rouvrir le projet après validation manuelle.
            </p>
          )}
        </div>
      )}
      <div className="field">
        <label>Zones et repères (optionnel)</label>
        <LocationPickList
          zones={selectableZones}
          markers={selectableMarkers}
          selectedZoneIds={form.zone_ids}
          selectedMarkerIds={form.marker_ids}
          onToggleZone={toggleZoneId}
          onToggleMarker={toggleMarkerId}
          zoneLabel={zonePickDisplayName}
        />
      </div>
      <TaskFormTutorialsField
        tutorials={tutorials}
        filteredTutorials={filteredTutorials}
        search={tutorialSearch}
        onSearchChange={setTutorialSearch}
        selectedIds={form.tutorial_ids}
        onToggle={toggleTutorialId}
        onSelectAll={() =>
          setForm((f) => ({
            ...f,
            tutorial_ids: normalizeTutorialIds(tutorials.map((t) => t.id)),
          }))
        }
        onClear={() => setForm((f) => ({ ...f, tutorial_ids: [] }))}
      />
      <button className="btn btn-primary btn-full" onClick={submit} disabled={saving}>
        {saving ? 'Sauvegarde...' : isEdit ? 'Enregistrer le projet' : 'Créer le projet'}
      </button>
    </DialogShell>
  );
}

export { TaskProjectFormModal };
