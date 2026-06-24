import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { TutorialReadAcknowledgeButton, fetchTutorialReadIds } from './TutorialReadAcknowledge';
import { TutorialPreviewModal, tutorialPreviewPayload } from './TutorialPreviewModal';
import { ContextComments } from './context-comments';
import { DialogShell } from './DialogShell';
import { MarkdownContent } from './MarkdownContent.jsx';
import { FixedToast } from '../shared/components/FixedToast.jsx';
import { TutorialEditorPanel } from './tutorials/TutorialEditorPanel.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import { fileToDataUrl } from '../utils/fileToDataUrl.js';
import {
  sortTutorialsByOrder,
  moveIndex,
  linkedTaskStatusLabel,
  createInitialTutorialForm,
  filterAndSortTutorials,
} from '../utils/tutorialListHelpers.js';
import { tutorialFormFromDetail, buildTutorialSavePayload } from '../utils/tutorialFormHelpers.js';

function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function TutorialLinkedTasksModal({ state, onClose }) {
  useOverlayHistoryBack(!!state?.tutorial, onClose);
  if (!state?.tutorial) return null;
  const { tutorial, loading, error, tasks } = state;
  return (
    <DialogShell
      open={!!state?.tutorial}
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal tuto-linked-tasks-modal"
      ariaLabelledBy="tuto-linked-tasks-title"
      closeOnOverlay
      showCloseButton
      closeButtonLabel="Fermer"
    >
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
                  <span className="task-chip" title={task.map_id || ''}>
                    🗺️ {task.map_label}
                  </span>
                ) : null}
                {task.location_hint ? (
                  <span className="task-chip" title="Lieu">
                    📍 {task.location_hint}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DialogShell>
  );
}

function TutorialsView({ isTeacher, onRefresh, onForceLogout, maps = [] }) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { tutorials = [], zones = [], markers = [], activeMapId = 'foret' } = useData();
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(createInitialTutorialForm());
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showReorder, setShowReorder] = useState(false);
  const [reorderDraft, setReorderDraft] = useState([]);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importScan, setImportScan] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importDryRun, setImportDryRun] = useState(false);
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
            ? {
                ...prev,
                loading: false,
                tasks: Array.isArray(res?.tasks) ? res.tasks : [],
                error: null,
              }
            : prev,
        );
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        setLinkedTasksModal((prev) =>
          prev?.tutorial?.id === t.id
            ? { ...prev, loading: false, tasks: [], error: e.message || 'Erreur' }
            : prev,
        );
      }
    },
    [isTeacher, onForceLogout],
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

  const showToast = (message, ms = 2500) => {
    setToast(message);
    setTimeout(() => setToast(''), ms);
  };

  const filtered = useMemo(
    () => filterAndSortTutorials(tutorials, { search, typeFilter, statusFilter }),
    [tutorials, search, typeFilter, statusFilter],
  );

  const openReorder = useCallback(() => {
    setReorderDraft(sortTutorialsByOrder(tutorials));
    setShowReorder(true);
  }, [tutorials]);

  const closeReorder = () => {
    setShowReorder(false);
    setReorderDraft([]);
  };

  useOverlayHistoryBack(showReorder, closeReorder);

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportScan(null);
    setImportDryRun(false);
  }, []);

  useOverlayHistoryBack(showImportModal, closeImportModal);

  const openImportModal = useCallback(async () => {
    setShowImportModal(true);
    setImportScan(null);
    setImportLoading(true);
    try {
      const res = await api('/api/tutorials/import/scan');
      setImportScan(res?.report || null);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      showToast(e.message || 'Scan impossible');
      setShowImportModal(false);
    } finally {
      setImportLoading(false);
    }
  }, [onForceLogout]);

  const runTutosImport = async () => {
    setImportLoading(true);
    try {
      const res = await api('/api/tutorials/import/files', 'POST', { dryRun: importDryRun });
      const report = res?.report;
      setImportScan(report || null);
      if (importDryRun) {
        showToast(
          report?.totals?.pending
            ? `${report.totals.pending} fiche(s) seraient importée(s)`
            : 'Aucune nouvelle fiche à importer',
        );
      } else if (report?.totals?.imported > 0) {
        showToast(`${report.totals.imported} tutoriel(s) importé(s)`);
        onRefresh?.();
        closeImportModal();
      } else {
        showToast('Aucune nouvelle fiche à importer');
      }
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      showToast(e.message || 'Import impossible');
    } finally {
      setImportLoading(false);
    }
  };

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

  const beginCreate = () => {
    setForm({ ...createInitialTutorialForm(), map_id: activeMapId || '' });
    setShowEditor(true);
  };

  const beginEdit = async (row) => {
    try {
      const detail = await api(`/api/tutorials/${row.id}?include_content=1&include_inactive=1`);
      setForm(tutorialFormFromDetail(detail, activeMapId));
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
    const payload = buildTutorialSavePayload(form);
    try {
      if (form.id) await api(`/api/tutorials/${form.id}`, 'PUT', payload);
      else await api('/api/tutorials', 'POST', payload);
      await onRefresh?.();
      setShowEditor(false);
      setForm(createInitialTutorialForm());
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

  const uploadCover = async (row) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const imageData = await fileToDataUrl(file);
        await api(`/api/tutorials/${row.id}/cover-photo-upload`, 'POST', { imageData });
        await onRefresh?.();
        setToast('Couverture mise à jour ✓');
        setTimeout(() => setToast(''), 2500);
      } catch (e) {
        if (e instanceof AccountDeletedError) onForceLogout?.();
        setToast('Erreur couverture : ' + e.message);
        setTimeout(() => setToast(''), 3000);
      }
    };
    input.click();
  };

  return (
    <div className="tutorials-root" style={{ display: 'contents' }}>
      {preview && (
        <TutorialPreviewModal
          tutorial={preview}
          onClose={() => setPreview(null)}
          readAcknowledge={{
            isRead: tutorialReadIds.has(Number(preview.id)),
            onAcknowledged: (id) => setTutorialReadIds((prev) => new Set([...prev, id])),
            onForceLogout,
          }}
        />
      )}
      {linkedTasksModal && (
        <TutorialLinkedTasksModal state={linkedTasksModal} onClose={closeLinkedTasks} />
      )}
      {showReorder && (
        <DialogShell
          open={showReorder}
          onClose={() => {
            if (!reorderSaving) closeReorder();
          }}
          overlayClassName="modal-overlay"
          dialogClassName="log-modal tuto-reorder-modal"
          ariaLabelledBy="tuto-reorder-title"
          closeOnOverlay={!reorderSaving}
          showCloseButton
          closeButtonDisabled={reorderSaving}
        >
          <h3 id="tuto-reorder-title">Ordre d’affichage des tutoriels</h3>
          <p className="tuto-reorder-hint">
            Glissez-déposez une ligne ou utilisez les flèches. Cet ordre est celui de la liste des
            tutoriels (élèves et profs) et correspond au champ « Ordre » de chaque fiche.
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
                <span className="tuto-reorder-grip" title="Glisser pour déplacer" aria-hidden>
                  ⋮⋮
                </span>
                <span className="tuto-reorder-row-title">{t.title}</span>
                {!t.is_active && <span className="task-chip archived">Archivé</span>}
                <span className="tuto-reorder-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={reorderSaving || index === 0}
                    onClick={() => moveReorderRow(index, -1)}
                    aria-label="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={reorderSaving || index >= reorderDraft.length - 1}
                    onClick={() => moveReorderRow(index, 1)}
                    aria-label="Descendre"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="tuto-reorder-footer">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={reorderSaving}
              onClick={saveReorder}
            >
              {reorderSaving ? 'Enregistrement…' : '💾 Enregistrer l’ordre'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={reorderSaving}
              onClick={closeReorder}
            >
              Annuler
            </button>
          </div>
        </DialogShell>
      )}
      {showImportModal && (
        <DialogShell
          open={showImportModal}
          onClose={closeImportModal}
          overlayClassName="modal-overlay"
          dialogClassName="log-modal tuto-import-modal"
          ariaLabelledBy="tuto-import-title"
          closeOnOverlay
          showCloseButton
          closeButtonLabel="Fermer"
        >
          <h3 id="tuto-import-title">Importer depuis /tutos/</h3>
          <p className="tuto-import-subtitle">
            Détecte les fiches HTML du dossier serveur <code>tutos/</code> absentes de la base.
          </p>
          {importLoading && !importScan ? (
            <p className="tuto-import-loading">Analyse des fichiers…</p>
          ) : importScan ? (
            <>
              <div className="tuto-import-totals">
                <span>
                  Sur disque : <strong>{importScan.totals?.on_disk ?? 0}</strong>
                </span>
                <span>
                  Déjà en BDD : <strong>{importScan.totals?.already_imported ?? 0}</strong>
                </span>
                <span>
                  À importer : <strong>{importScan.totals?.pending ?? 0}</strong>
                </span>
              </div>
              {importScan.items?.some((item) => item.status === 'pending') ? (
                <ul className="tuto-import-list">
                  {importScan.items
                    .filter((item) => item.status === 'pending')
                    .map((item) => (
                      <li key={item.filename}>
                        <strong>{item.title || item.filename}</strong>
                        <span className="tuto-import-filename">{item.filename}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="tuto-import-empty">Toutes les fiches présentes sont déjà en base.</p>
              )}
              <label className="tuto-import-dryrun">
                <input
                  type="checkbox"
                  checked={importDryRun}
                  onChange={(e) => setImportDryRun(e.target.checked)}
                  disabled={importLoading}
                />
                Simulation (sans création)
              </label>
              <div className="tuto-import-footer">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={importLoading || (importScan.totals?.pending ?? 0) === 0}
                  onClick={runTutosImport}
                >
                  {importLoading
                    ? 'Traitement…'
                    : importDryRun
                      ? 'Simuler l’import'
                      : 'Importer les nouvelles fiches'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={importLoading}
                  onClick={closeImportModal}
                >
                  Fermer
                </button>
              </div>
            </>
          ) : (
            <p className="tuto-import-error">Impossible de lire le dossier tutos/.</p>
          )}
        </DialogShell>
      )}
      <div className="fade-in">
        {toast ? <FixedToast>{toast}</FixedToast> : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h2 className="section-title">📘 Tutoriels</h2>
          {isTeacher && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tutorials.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={openReorder}>
                  ⇅ Ordre
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={openImportModal}>
                ⬇ Importer /tutos/
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={beginCreate}>
                + Ajouter
              </button>
            </div>
          )}
        </div>
        <p className="section-sub">Guides pratiques consultables et téléchargeables</p>

        <div className="task-filters">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Rechercher un tutoriel..."
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">Tous les types</option>
            <option value="html">HTML</option>
            <option value="link">Lien</option>
            <option value="pdf">PDF</option>
          </select>
          {isTeacher && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="archived">Archivés</option>
            </select>
          )}
        </div>

        {isTeacher && showEditor && (
          <TutorialEditorPanel
            form={form}
            setForm={setForm}
            saving={saving}
            maps={maps}
            zones={zones}
            markers={markers}
            onSave={save}
            onCancel={() => setShowEditor(false)}
            onToast={showToast}
          />
        )}

        {filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📘</div>
            <p>Aucun tutoriel pour le moment</p>
          </div>
        ) : (
          <div className="tuto-grid">
            {filtered.map((t, idx) => (
              <article
                key={t.id}
                className={`tuto-card fade-in ${!t.is_active ? 'archived' : ''}`}
                style={{ animationDelay: `${Math.min(idx * 60, 360)}ms` }}
              >
                <div className="tuto-card-head">
                  <div>
                    <h3>{t.title}</h3>
                    {t.summary && <MarkdownContent>{t.summary}</MarkdownContent>}
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
                      <button className="btn btn-ghost btn-sm" onClick={() => openSource(t)}>
                        🌐 Ouvrir
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => downloadUrl(`/api/tutorials/${t.id}/download/html`)}
                      >
                        ⬇️ HTML
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => downloadUrl(`/api/tutorials/${t.id}/download/pdf`)}
                      >
                        ⬇️ PDF
                      </button>
                      <TutorialReadAcknowledgeButton
                        tutorialId={t.id}
                        tutorialTitle={t.title}
                        isRead={tutorialReadIds.has(Number(t.id))}
                        onAcknowledged={(id) =>
                          setTutorialReadIds((prev) => new Set([...prev, id]))
                        }
                        onForceLogout={onForceLogout}
                      />
                    </>
                  )}
                  {isTeacher && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => beginEdit(t)}>
                        ✏️
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => uploadCover(t)}
                        title="Uploader une image de couverture"
                      >
                        🖼️ Couverture
                      </button>
                      {t.is_active ? (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => archiveTutorial(t)}
                        >
                          🗑️
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => restoreTutorial(t)}
                        >
                          ♻️ Restaurer
                        </button>
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
