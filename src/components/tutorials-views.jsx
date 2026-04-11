import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { TutorialReadAcknowledgeButton, fetchTutorialReadIds } from './TutorialReadAcknowledge';
import { TutorialPreviewModal, tutorialPreviewPayload } from './TutorialPreviewModal';
import { ContextComments } from './context-comments';
import { orderedLivingBeingsForForm, formatLivingBeingsListLine } from '../utils/livingBeings';

function tutorialZonePickLabel(z) {
  const line = formatLivingBeingsListLine(
    orderedLivingBeingsForForm(z.living_beings_list || z.living_beings, z.current_plant),
  );
  return line ? `${z.name} — ${line}` : z.name;
}

function sortTutorialsByOrder(list) {
  return [...list].sort(
    (a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''), 'fr')
  );
}

function moveIndex(arr, from, to) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const LINKED_TASK_STATUS_LABELS = {
  available: 'À faire',
  in_progress: 'En cours',
  done: 'Terminée',
  validated: 'Validée',
  proposed: 'Proposée',
  on_hold: 'En attente',
};

function linkedTaskStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  return LINKED_TASK_STATUS_LABELS[s] || status || '—';
}

function TutorialLinkedTasksModal({ state, onClose }) {
  useOverlayHistoryBack(!!state?.tutorial, onClose);
  if (!state?.tutorial) return null;
  const { tutorial, loading, error, tasks } = state;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="log-modal tuto-linked-tasks-modal" role="dialog" aria-labelledby="tuto-linked-tasks-title" aria-modal="true" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">✕</button>
        <h3 id="tuto-linked-tasks-title">Tâches liées</h3>
        <p className="tuto-linked-tasks-subtitle">« {tutorial.title} »</p>
        {loading ? (
          <p className="tuto-linked-tasks-loading">Chargement…</p>
        ) : error ? (
          <p className="tuto-linked-tasks-error">{error}</p>
        ) : !tasks?.length ? (
          <p className="tuto-linked-tasks-empty">Aucune tâche liée.</p>
        ) : (
          <ul className="tuto-linked-tasks-list">
            {tasks.map((task) => (
              <li key={task.id} className="tuto-linked-tasks-row">
                <div className="tuto-linked-tasks-row-title">{task.title}</div>
                <div className="tuto-linked-tasks-row-meta">
                  <span className="task-chip">{linkedTaskStatusLabel(task.status)}</span>
                  {task.map_label ? (
                    <span className="task-chip" title={task.map_id || ''}>🗺️ {task.map_label}</span>
                  ) : null}
                  {task.location_hint ? (
                    <span className="task-chip" title="Lieu">📍 {task.location_hint}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function initialForm() {
  return {
    id: null,
    title: '',
    summary: '',
    type: 'html',
    html_content: '',
    source_url: '',
    source_file_path: '',
    sort_order: 0,
    is_active: true,
    map_id: '',
    zone_ids: [],
    marker_ids: [],
  };
}

function TutorialsView({
  tutorials,
  isTeacher,
  onRefresh,
  onForceLogout,
  zones = [],
  markers = [],
  maps = [],
  activeMapId = 'foret',
  publicSettings = null,
  canParticipateContextComments = true,
}) {
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showReorder, setShowReorder] = useState(false);
  const [reorderDraft, setReorderDraft] = useState([]);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [tutorialReadIds, setTutorialReadIds] = useState(() => new Set());
  const [linkedTasksModal, setLinkedTasksModal] = useState(null);

  const closeLinkedTasks = useCallback(() => setLinkedTasksModal(null), []);

  const openLinkedTasks = useCallback(
    async (t) => {
      const count = Number(t.linked_tasks_count) || 0;
      if (count <= 0) return;
      setLinkedTasksModal({ tutorial: t, loading: true, error: null, tasks: [] });
      const q = isTeacher && !t.is_active ? '?include_inactive=1' : '';
      try {
        const res = await api(`/api/tutorials/${t.id}/linked-tasks${q}`);
        setLinkedTasksModal((prev) =>
          prev?.tutorial?.id === t.id
            ? { ...prev, loading: false, tasks: Array.isArray(res?.tasks) ? res.tasks : [], error: null }
            : prev
        );
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        setLinkedTasksModal((prev) =>
          prev?.tutorial?.id === t.id
            ? { ...prev, loading: false, tasks: [], error: e.message || 'Erreur' }
            : prev
        );
      }
    },
    [isTeacher, onForceLogout]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = await fetchTutorialReadIds();
      if (!cancelled) setTutorialReadIds(new Set(ids));
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [tutorials]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = tutorials.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (statusFilter === 'active' && !t.is_active) return false;
      if (statusFilter === 'archived' && t.is_active) return false;
      if (!q) return true;
      return (
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.summary || '').toLowerCase().includes(q)
      );
    });
    return sortTutorialsByOrder(arr);
  }, [tutorials, search, typeFilter, statusFilter]);

  const openReorder = useCallback(() => {
    setReorderDraft(sortTutorialsByOrder(tutorials));
    setShowReorder(true);
  }, [tutorials]);

  const closeReorder = () => {
    setShowReorder(false);
    setReorderDraft([]);
  };

  useOverlayHistoryBack(showReorder, closeReorder);

  const onReorderDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onReorderDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onReorderDrop = (e, dropIndex) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isFinite(from)) return;
    setReorderDraft((list) => moveIndex(list, from, dropIndex));
  };

  const moveReorderRow = (from, delta) => {
    const to = from + delta;
    setReorderDraft((list) => moveIndex(list, from, to));
  };

  const saveReorder = async () => {
    if (reorderDraft.length === 0) return;
    setReorderSaving(true);
    try {
      await api('/api/tutorials/reorder', 'PUT', {
        tutorial_ids: reorderDraft.map((t) => t.id),
      });
      await onRefresh?.();
      setToast('Ordre des tutoriels enregistré ✓');
      setTimeout(() => setToast(''), 2500);
      closeReorder();
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setToast('Erreur : ' + e.message);
      setTimeout(() => setToast(''), 3500);
    } finally {
      setReorderSaving(false);
    }
  };

  /** Ouvre le tutoriel dans la modale (sans bouton aperçu dédié). */
  const openSource = (t) => {
    setPreview(tutorialPreviewPayload(t));
  };

  const onFileHtml = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setForm((f) => ({ ...f, html_content: text, type: 'html' }));
      setToast('Fichier HTML chargé ✓');
      setTimeout(() => setToast(''), 2000);
    } catch {
      setToast('Impossible de lire le fichier HTML');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const beginCreate = () => {
    setForm({ ...initialForm(), map_id: activeMapId || '' });
    setShowEditor(true);
  };

  const toggleZoneId = (zoneId) => {
    const id = String(zoneId || '').trim();
    if (!id) return;
    setForm((f) => {
      const cur = [...new Set((f.zone_ids || []).map(String))];
      const has = cur.includes(id);
      return { ...f, zone_ids: has ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  const toggleMarkerId = (markerId) => {
    const id = String(markerId || '').trim();
    if (!id) return;
    setForm((f) => {
      const cur = [...new Set((f.marker_ids || []).map(String))];
      const has = cur.includes(id);
      return { ...f, marker_ids: has ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  const beginEdit = async (row) => {
    try {
      const detail = await api(`/api/tutorials/${row.id}?include_content=1&include_inactive=1`);
      const zids = (detail.zone_ids || []).map((id) => String(id || '').trim()).filter(Boolean);
      const mids = (detail.marker_ids || []).map((id) => String(id || '').trim()).filter(Boolean);
      const inferMap =
        (detail.zones_linked && detail.zones_linked[0]?.map_id)
        || (detail.markers_linked && detail.markers_linked[0]?.map_id)
        || activeMapId
        || '';
      setForm({
        id: detail.id,
        title: detail.title || '',
        summary: detail.summary || '',
        type: detail.type || 'html',
        html_content: detail.html_content || '',
        source_url: detail.source_url || '',
        source_file_path: detail.source_file_path || '',
        sort_order: detail.sort_order || 0,
        is_active: detail.is_active !== false,
        map_id: inferMap,
        zone_ids: zids,
        marker_ids: mids,
      });
      setShowEditor(true);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setToast('Erreur ouverture éditeur : ' + e.message);
      setTimeout(() => setToast(''), 2500);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      setToast('Le titre est requis');
      setTimeout(() => setToast(''), 2500);
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      summary: form.summary || '',
      type: form.type,
      html_content: form.type === 'html' ? (form.html_content || null) : null,
      source_url: form.type === 'link' ? (form.source_url || null) : null,
      source_file_path: form.source_file_path || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: !!form.is_active,
      zone_ids: [...new Set((form.zone_ids || []).map((id) => String(id || '').trim()).filter(Boolean))],
      marker_ids: [...new Set((form.marker_ids || []).map((id) => String(id || '').trim()).filter(Boolean))],
    };
    try {
      if (form.id) await api(`/api/tutorials/${form.id}`, 'PUT', payload);
      else await api('/api/tutorials', 'POST', payload);
      await onRefresh?.();
      setShowEditor(false);
      setForm(initialForm());
      setToast(form.id ? 'Tutoriel mis à jour ✓' : 'Tutoriel ajouté ✓');
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setToast('Erreur : ' + e.message);
      setTimeout(() => setToast(''), 2500);
    } finally {
      setSaving(false);
    }
  };

  const selectableZones = zones.filter((z) => !z.special && (!form.map_id || z.map_id === form.map_id));
  const selectableMarkers = markers.filter((m) => !form.map_id || m.map_id === form.map_id);

  const archiveTutorial = async (row) => {
    if (!confirm(`Archiver "${row.title}" ?`)) return;
    try {
      await api(`/api/tutorials/${row.id}`, 'DELETE');
      await onRefresh?.();
      setToast('Tutoriel archivé');
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setToast('Erreur : ' + e.message);
      setTimeout(() => setToast(''), 2500);
    }
  };

  const restoreTutorial = async (row) => {
    try {
      await api(`/api/tutorials/${row.id}`, 'PUT', { is_active: true });
      await onRefresh?.();
      setToast('Tutoriel restauré ✓');
      setTimeout(() => setToast(''), 2500);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      setToast('Erreur : ' + e.message);
      setTimeout(() => setToast(''), 2500);
    }
  };

  return (
    <div className="tutorials-root" style={{ display: 'contents' }}>
      {preview && <TutorialPreviewModal tutorial={preview} onClose={() => setPreview(null)} />}
      {linkedTasksModal && <TutorialLinkedTasksModal state={linkedTasksModal} onClose={closeLinkedTasks} />}
      {showReorder && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !reorderSaving && closeReorder()}>
          <div className="log-modal tuto-reorder-modal" role="dialog" aria-labelledby="tuto-reorder-title" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" disabled={reorderSaving} onClick={closeReorder}>✕</button>
            <h3 id="tuto-reorder-title">Ordre d’affichage des tutoriels</h3>
            <p className="tuto-reorder-hint">
              Glissez-déposez une ligne ou utilisez les flèches. Cet ordre est celui de la liste des tutoriels (élèves et profs) et correspond au champ « Ordre » de chaque fiche.
            </p>
            <ul className="tuto-reorder-list">
              {reorderDraft.map((t, index) => (
                <li
                  key={t.id}
                  className={`tuto-reorder-row ${!t.is_active ? 'archived' : ''}`}
                  draggable={!reorderSaving}
                  onDragStart={(e) => onReorderDragStart(e, index)}
                  onDragOver={onReorderDragOver}
                  onDrop={(e) => onReorderDrop(e, index)}
                >
                  <span className="tuto-reorder-grip" title="Glisser pour déplacer" aria-hidden>⋮⋮</span>
                  <span className="tuto-reorder-row-title">{t.title}</span>
                  {!t.is_active && <span className="task-chip archived">Archivé</span>}
                  <span className="tuto-reorder-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={reorderSaving || index === 0}
                      onClick={() => moveReorderRow(index, -1)}
                      aria-label="Monter"
                    >↑</button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={reorderSaving || index >= reorderDraft.length - 1}
                      onClick={() => moveReorderRow(index, 1)}
                      aria-label="Descendre"
                    >↓</button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="tuto-reorder-footer">
              <button type="button" className="btn btn-primary btn-sm" disabled={reorderSaving} onClick={saveReorder}>
                {reorderSaving ? 'Enregistrement…' : '💾 Enregistrer l’ordre'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={reorderSaving} onClick={closeReorder}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    <div className="fade-in">
      {toast && <div className="toast">{toast}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title">📘 Tutoriels</h2>
        {isTeacher && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tutorials.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={openReorder}>
                ⇅ Ordre
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={beginCreate}>+ Ajouter</button>
          </div>
        )}
      </div>
      <p className="section-sub">Guides pratiques consultables et téléchargeables</p>

      <div className="task-filters">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un tutoriel..."
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">Tous les types</option>
          <option value="html">HTML</option>
          <option value="link">Lien</option>
          <option value="pdf">PDF</option>
        </select>
        {isTeacher && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="archived">Archivés</option>
          </select>
        )}
      </div>

      {isTeacher && showEditor && (
        <div className="plant-edit-form fade-in tuto-editor">
          <h4>{form.id ? 'Modifier le tutoriel' : 'Nouveau tutoriel'}</h4>
          <div className="field"><label>Titre *</label><input value={form.title} onChange={set('title')} /></div>
          <div className="field"><label>Résumé</label><textarea rows={2} value={form.summary} onChange={set('summary')} /></div>
          <div className="row">
            <div className="field">
              <label>Type</label>
              <select value={form.type} onChange={set('type')}>
                <option value="html">HTML</option>
                <option value="link">Lien</option>
              </select>
            </div>
            <div className="field">
              <label>Ordre</label>
              <input type="number" min="0" value={form.sort_order} onChange={set('sort_order')} />
            </div>
          </div>
          <div className="field">
            <label>Carte (filtre zones / repères)</label>
            <select
              value={form.map_id || ''}
              onChange={(e) => {
                const next = e.target.value;
                setForm((f) => ({
                  ...f,
                  map_id: next,
                  zone_ids: (f.zone_ids || []).filter((zid) => {
                    const z = zones.find((zz) => String(zz.id) === String(zid));
                    return z && (!next || z.map_id === next);
                  }),
                  marker_ids: (f.marker_ids || []).filter((mid) => {
                    const mk = markers.find((mm) => String(mm.id) === String(mid));
                    return mk && (!next || mk.map_id === next);
                  }),
                }));
              }}>
              <option value="">Toutes les cartes</option>
              {maps.map((mp) => (
                <option key={mp.id} value={mp.id}>{mp.label}</option>
              ))}
            </select>
            <p style={{ fontSize: '.78rem', color: '#666', margin: '6px 0 0', lineHeight: 1.4 }}>
              Lieux choisis : pastille violette sur la carte et détail dans la fiche zone ou repère.
            </p>
          </div>
          <div className="field"><label>Zones et repères sur la carte (optionnel)</label>
            <div className="task-form-pick-list">
              {selectableZones.length === 0 && selectableMarkers.length === 0 ? (
                <p className="task-form-pick-empty">Aucune zone ni repère pour ce filtre.</p>
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
                            checked={(form.zone_ids || []).map(String).includes(String(z.id))}
                            onChange={() => toggleZoneId(z.id)}
                          />
                          <span className="task-form-pick-text">{tutorialZonePickLabel(z)}</span>
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
                            checked={(form.marker_ids || []).map(String).includes(String(m.id))}
                            onChange={() => toggleMarkerId(m.id)}
                          />
                          <span className="task-form-pick-text">{m.emoji} {m.label}</span>
                        </label>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          {form.id && (
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={e => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Tutoriel actif
              </label>
            </div>
          )}
          {form.type === 'html' && (
            <>
              <div className="field">
                <label>Contenu HTML</label>
                <textarea rows={8} value={form.html_content} onChange={set('html_content')} placeholder="<h1>Mon tuto</h1>" />
              </div>
              <div className="field">
                <label>Ou fichier statique (chemin /tutos/...)</label>
                <input value={form.source_file_path} onChange={set('source_file_path')} placeholder="/tutos/fiche-exemple.html" />
              </div>
              <label className="btn btn-ghost btn-sm" style={{ width: 'fit-content', cursor: 'pointer' }}>
                Importer un fichier HTML
                <input type="file" accept=".html,text/html" style={{ display: 'none' }} onChange={onFileHtml} />
              </label>
            </>
          )}
          {form.type === 'link' && (
            <div className="field">
              <label>URL</label>
              <input value={form.source_url} onChange={set('source_url')} placeholder="https://..." />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
              {saving ? 'Sauvegarde...' : '💾 Enregistrer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEditor(false)}>Annuler</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📘</div>
          <p>Aucun tutoriel pour le moment</p>
        </div>
      ) : (
        <div className="tuto-grid">
          {filtered.map((t, idx) => (
            <article key={t.id} className={`tuto-card fade-in ${!t.is_active ? 'archived' : ''}`} style={{ animationDelay: `${Math.min(idx * 60, 360)}ms` }}>
              <div className="tuto-card-head">
                <div>
                  <h3>{t.title}</h3>
                  {t.summary && <p>{t.summary}</p>}
                </div>
                <span className={`task-chip ${!t.is_active ? 'archived' : ''}`}>
                  {t.type.toUpperCase()}
                  {!t.is_active ? ' · ARCHIVÉ' : ''}
                </span>
              </div>
              <div className="task-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(Number(t.linked_tasks_count) || 0) > 0 ? (
                  <button
                    type="button"
                    className="task-chip tuto-linked-tasks-pill"
                    onClick={() => openLinkedTasks(t)}
                    title="Afficher les tâches liées à ce tutoriel"
                  >
                    🔗 {t.linked_tasks_count} tâche(s) liée(s)
                  </button>
                ) : (
                  <span className="task-chip">🔗 0 tâche(s) liée(s)</span>
                )}
                {(t.zones_linked || []).map((z) => (
                  <span key={`z-${z.id}`} className="task-chip" title="Zone sur la carte">
                    {z.name}
                  </span>
                ))}
                {(t.markers_linked || []).map((m) => (
                  <span key={`m-${m.id}`} className="task-chip" title="Repère sur la carte">
                    📍 {m.label}
                  </span>
                ))}
              </div>
              <div className="task-actions">
                {t.is_active && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => openSource(t)}>🌐 Ouvrir</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => downloadUrl(`/api/tutorials/${t.id}/download/html`)}>⬇️ HTML</button>
                    <button className="btn btn-primary btn-sm" onClick={() => downloadUrl(`/api/tutorials/${t.id}/download/pdf`)}>⬇️ PDF</button>
                    <TutorialReadAcknowledgeButton
                      tutorialId={t.id}
                      tutorialTitle={t.title}
                      isRead={tutorialReadIds.has(Number(t.id))}
                      onAcknowledged={(id) => setTutorialReadIds((prev) => new Set([...prev, id]))}
                      onForceLogout={onForceLogout}
                    />
                  </>
                )}
                {isTeacher && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => beginEdit(t)}>✏️</button>
                    {t.is_active ? (
                      <button className="btn btn-danger btn-sm" onClick={() => archiveTutorial(t)}>🗑️</button>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => restoreTutorial(t)}>♻️ Restaurer</button>
                    )}
                  </>
                )}
              </div>
              {contextCommentsEnabled && (
                <ContextComments
                  contextType="tutorial"
                  contextId={String(t.id)}
                  title="Commentaires sur ce tutoriel"
                  placeholder="Question ou retour sur ce tutoriel…"
                  canParticipateContextComments={canParticipateContextComments}
                />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

export { TutorialsView };
