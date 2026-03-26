import React, { useMemo, useState } from 'react';
import { api, AccountDeletedError } from '../services/api';

function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function TutorialPreviewModal({ tutorial, onClose }) {
  if (!tutorial) return null;
  const canEmbed = !!tutorial.preview_url || !!tutorial.source_file_path;
  const source = tutorial.preview_url || tutorial.source_file_path || '';
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="log-modal fade-in tuto-preview-modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>📘 {tutorial.title}</h3>
        {canEmbed ? (
          <iframe
            title={`Preview ${tutorial.title}`}
            src={source}
            className="tuto-preview-frame"
            sandbox="allow-same-origin allow-popups allow-forms"
          />
        ) : (
          <div className="empty" style={{ padding: 18 }}>
            <p>Aperçu non disponible pour ce tutoriel.</p>
          </div>
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
  };
}

function TutorialsView({ tutorials, isTeacher, onRefresh, onForceLogout }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tutorials.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (statusFilter === 'active' && !t.is_active) return false;
      if (statusFilter === 'archived' && t.is_active) return false;
      if (!q) return true;
      return (
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.summary || '').toLowerCase().includes(q)
      );
    });
  }, [tutorials, search, typeFilter, statusFilter]);

  const openPreview = (t) => {
    const preview_url = t.type === 'html' ? `/api/tutorials/${t.id}/view` : (t.source_file_path || '');
    setPreview({ ...t, preview_url });
  };

  const openSource = (t) => {
    const href = t.source_url || t.source_file_path;
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
    else openPreview(t);
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
    setForm(initialForm());
    setShowEditor(true);
  };

  const beginEdit = async (row) => {
    try {
      const detail = await api(`/api/tutorials/${row.id}?include_content=1&include_inactive=1`);
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
    <div className="fade-in">
      {preview && <TutorialPreviewModal tutorial={preview} onClose={() => setPreview(null)} />}
      {toast && <div className="toast">{toast}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 className="section-title">📘 Tutoriels</h2>
        {isTeacher && (
          <button className="btn btn-primary btn-sm" onClick={beginCreate}>+ Ajouter</button>
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
              <div className="task-meta">
                <span className="task-chip">🔗 {t.linked_tasks_count || 0} tâche(s) liée(s)</span>
              </div>
              <div className="task-actions">
                {t.is_active && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => openPreview(t)}>👁️ Aperçu</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openSource(t)}>🌐 Ouvrir</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => downloadUrl(`/api/tutorials/${t.id}/download/html`)}>⬇️ HTML</button>
                    <button className="btn btn-primary btn-sm" onClick={() => downloadUrl(`/api/tutorials/${t.id}/download/pdf`)}>⬇️ PDF</button>
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
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export { TutorialsView };
