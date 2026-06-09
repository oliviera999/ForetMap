import React, { useState, useEffect, useMemo } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { DialogShell } from '../DialogShell';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { initialLocationIds, normalizeTutorialIds, zonePickDisplayName } from '../../utils/taskFormHelpers.js';

const var_alert = 'var(--alert)';

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
  const [tutorialSearch, setTutorialSearch] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    map_id: defaultMapId,
    zone_ids: [],
    marker_ids: [],
    tutorial_ids: [],
    status: 'active',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setTutorialSearch('');
    if (!editProject) {
      setForm({
        title: '',
        description: '',
        map_id: defaultMapId,
        zone_ids: [],
        marker_ids: [],
        tutorial_ids: [],
        status: 'active',
      });
      return;
    }
    setForm({
      title: String(editProject.title || ''),
      description: String(editProject.description || ''),
      map_id: editProject.map_id || defaultMapId,
      zone_ids: initialLocationIds(editProject, 'zone_ids', 'zone_id'),
      marker_ids: initialLocationIds(editProject, 'marker_ids', 'marker_id'),
      tutorial_ids: normalizeTutorialIds(editProject.tutorial_ids || []),
      status: editProject.status === 'on_hold'
        ? 'on_hold'
        : editProject.status === 'completed'
          ? 'completed'
          : editProject.status === 'validated'
            ? 'validated'
            : 'active',
    });
  }, [editProject, defaultMapId]);

  const toggleZoneId = (zoneId) => {
    const normalizedZoneId = String(zoneId || '').trim();
    if (!normalizedZoneId) return;
    setForm((f) => {
      const has = f.zone_ids.includes(normalizedZoneId);
      return {
        ...f,
        zone_ids: has ? f.zone_ids.filter((id) => id !== normalizedZoneId) : [...f.zone_ids, normalizedZoneId],
      };
    });
  };

  const toggleMarkerId = (markerId) => {
    const normalizedMarkerId = String(markerId || '').trim();
    if (!normalizedMarkerId) return;
    setForm((f) => {
      const has = f.marker_ids.includes(normalizedMarkerId);
      return {
        ...f,
        marker_ids: has ? f.marker_ids.filter((id) => id !== normalizedMarkerId) : [...f.marker_ids, normalizedMarkerId],
      };
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

  const selectableZones = zones.filter((z) => !z.special && (!form.map_id || z.map_id === form.map_id));
  const selectableMarkers = markers.filter((m) => !form.map_id || m.map_id === form.map_id);
  const normalizedTutorialIds = useMemo(
    () => normalizeTutorialIds(form.tutorial_ids),
    [form.tutorial_ids]
  );
  const searchableTutorials = useMemo(
    () => [...tutorials].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr')),
    [tutorials]
  );
  const filteredTutorials = useMemo(() => {
    const q = tutorialSearch.trim().toLowerCase();
    if (!q) return searchableTutorials;
    return searchableTutorials.filter((t) => String(t.title || '').toLowerCase().includes(q));
  }, [searchableTutorials, tutorialSearch]);

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
        marker_ids: [...new Set(form.marker_ids.map((id) => String(id || '').trim()).filter(Boolean))],
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
        <button className="modal-close" aria-label="Fermer la fenêtre" onClick={onClose}>✕</button>
        <h3>{heading}</h3>
        {err && <p style={{ color: var_alert, marginBottom: 12, fontSize: '.85rem' }}>{err}</p>}
        <div className="field"><label>Titre *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex: Préparer la serre de printemps" /></div>
        <div className="field"><label>Description</label><MarkdownTextarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} placeholder="Objectif du projet, consignes générales..." /></div>
        <div className="field"><label>Carte</label>
          <select
            value={form.map_id}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({
                ...f,
                map_id: v,
                zone_ids: f.zone_ids.filter((id) => zones.some((z) => String(z.id) === String(id) && z.map_id === v)),
                marker_ids: f.marker_ids.filter((id) => markers.some((m) => String(m.id) === String(id) && m.map_id === v)),
              }));
            }}
          >
            {maps.map((mp) => <option key={mp.id} value={mp.id}>{mp.label}</option>)}
          </select>
        </div>
        {isEdit && (
          <div className="field"><label>Statut du projet</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {form.status === 'completed' && (
                <option value="completed" disabled>Terminé (toutes les tâches réalisées)</option>
              )}
              {form.status === 'validated' && (
                <option value="validated" disabled>Validé (décision n3boss)</option>
              )}
              <option value="active">Actif (inscriptions ouvertes)</option>
              <option value="on_hold">En attente (inscriptions fermées)</option>
            </select>
            {form.status === 'completed' && (
              <p style={{ fontSize: '.82rem', color: '#555', marginTop: 6 }}>
                Choisis « Actif » ou « En attente » pour rouvrir le projet, ou ajoute une tâche non terminée (le projet repasse alors automatiquement en actif).
              </p>
            )}
            {form.status === 'validated' && (
              <p style={{ fontSize: '.82rem', color: '#555', marginTop: 6 }}>
                Choisis « Actif » ou « En attente » pour rouvrir le projet après validation manuelle.
              </p>
            )}
          </div>
        )}
        <div className="field"><label>Zones et repères (optionnel)</label>
          <div className="task-form-pick-list">
            {selectableZones.length === 0 && selectableMarkers.length === 0 ? (
              <p className="task-form-pick-empty">Aucune zone ni repère pour cette carte.</p>
            ) : (
              <>
                {selectableZones.length > 0 && (
                  <>
                    {selectableMarkers.length > 0 && (
                      <div className="task-form-pick-subheading" aria-hidden="true">Zones</div>
                    )}
                    {selectableZones.map((z) => (
                      <label key={z.id} className="task-form-pick-item">
                        <input
                          type="checkbox"
                          className="task-form-pick-checkbox"
                          checked={form.zone_ids.includes(String(z.id || '').trim())}
                          onChange={() => toggleZoneId(z.id)}
                        />
                        <span className="task-form-pick-text">{zonePickDisplayName(z)}</span>
                      </label>
                    ))}
                  </>
                )}
                {selectableMarkers.length > 0 && (
                  <>
                    {selectableZones.length > 0 && (
                      <div className="task-form-pick-subheading" aria-hidden="true">Repères</div>
                    )}
                    {selectableMarkers.map((m) => (
                      <label key={m.id} className="task-form-pick-item">
                        <input
                          type="checkbox"
                          className="task-form-pick-checkbox"
                          checked={form.marker_ids.includes(String(m.id || '').trim())}
                          onChange={() => toggleMarkerId(m.id)}
                        />
                        <span className="task-form-pick-text">{m.emoji ? `${m.emoji} ` : '📍 '}{m.label}</span>
                      </label>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="field"><label>Tutoriels associés (optionnel)</label>
          {tutorials.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
              <input
                value={tutorialSearch}
                onChange={(e) => setTutorialSearch(e.target.value)}
                placeholder="🔍 Rechercher un tutoriel..."
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.8rem', color: '#666' }}>
                  {normalizedTutorialIds.length} sélectionné{normalizedTutorialIds.length > 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setForm((f) => ({ ...f, tutorial_ids: normalizeTutorialIds(tutorials.map((t) => t.id)) }))}
                  >
                    Tout sélectionner
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setForm((f) => ({ ...f, tutorial_ids: [] }))}
                  >
                    Effacer
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="task-form-pick-list">
            {tutorials.length === 0
              ? <p className="task-form-pick-empty">Aucun tutoriel disponible.</p>
              : filteredTutorials.length === 0
                ? <p className="task-form-pick-empty">Aucun tutoriel trouvé.</p>
                : filteredTutorials.map((t) => (
                  <label key={t.id} className="task-form-pick-item">
                    <input
                      type="checkbox"
                      className="task-form-pick-checkbox"
                      checked={normalizedTutorialIds.includes(Number.parseInt(t.id, 10))}
                      onChange={() => toggleTutorialId(t.id)}
                    />
                    <span className="task-form-pick-text">📘 {t.title}</span>
                  </label>
                ))}
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={submit} disabled={saving}>
          {saving ? 'Sauvegarde...' : isEdit ? 'Enregistrer le projet' : 'Créer le projet'}
        </button>
    </DialogShell>
  );
}

export { TaskProjectFormModal };
