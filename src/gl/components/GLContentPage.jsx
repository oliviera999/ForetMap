import React, { useEffect, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
import { apiGL } from '../services/apiGL.js';

function canManageContent(auth) {
  const permissions = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return permissions.includes('gl.content.manage');
}

function hasExistingContent(data) {
  return Boolean(String(data?.bodyMarkdown || '').trim());
}

export function GLContentPage({ slug, fallbackTitle, auth, onSaved, onNavigateTab }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [content, setContent] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const manageable = canManageContent(auth);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setSaveError('');
    setSavedMessage('');
    apiGL(`/api/gl/content/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (cancelled) return;
        setContent(data);
        setDraftTitle(String(data?.title || fallbackTitle || slug));
        setDraftBody(String(data?.bodyMarkdown || ''));
        setEditing(manageable && !hasExistingContent(data));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Chargement impossible');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, fallbackTitle, manageable]);

  async function save() {
    if (!manageable || saving) return;
    const titleTrim = String(draftTitle || '').trim();
    if (!titleTrim) {
      setSaveError('Le titre est obligatoire.');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSavedMessage('');
    try {
      const data = await apiGL(`/api/gl/content/${encodeURIComponent(slug)}`, 'PUT', {
        title: titleTrim,
        bodyMarkdown: draftBody,
      });
      setContent(data);
      setDraftTitle(String(data?.title || titleTrim));
      setDraftBody(String(data?.bodyMarkdown || draftBody));
      setEditing(false);
      setSavedMessage('Contenu enregistré.');
      if (typeof onSaved === 'function') onSaved(data);
    } catch (err) {
      setSaveError(err.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="gl-panel">Chargement…</div>;
  if (loadError) {
    return (
      <div className="gl-panel gl-error">
        <p>{loadError}</p>
        <button type="button" onClick={() => window.location.reload()}>Réessayer</button>
      </div>
    );
  }

  const displayTitle = content?.title || fallbackTitle || slug;
  const previewMarkdown = manageable && editing ? draftBody : (content?.bodyMarkdown || draftBody || '');
  let previewHtml = '';
  try {
    previewHtml = DOMPurify.sanitize(marked.parse(previewMarkdown || '_Contenu vide._'));
  } catch (_) {
    previewHtml = '<p>Aperçu indisponible (markdown invalide).</p>';
  }

  return (
    <article className="gl-panel gl-markdown">
      <h2>{displayTitle}</h2>

      {savedMessage ? (
        <div className="gl-success-banner" role="status">
          {savedMessage}
          {typeof onNavigateTab === 'function' ? (
            <button type="button" className="gl-btn-secondary" onClick={() => onNavigateTab('mj')}>
              Ouvrir la console MJ
            </button>
          ) : null}
        </div>
      ) : null}

      {saveError ? <p className="gl-error">{saveError}</p> : null}

      {manageable && !editing ? (
        <div className="gl-inline-actions" style={{ marginBottom: 12 }}>
          <button type="button" onClick={() => { setSaveError(''); setSavedMessage(''); setEditing(true); }}>
            Modifier le contenu
          </button>
          {typeof onNavigateTab === 'function' ? (
            <button type="button" className="gl-btn-secondary" onClick={() => onNavigateTab('contents')}>
              Tous les contenus (admin)
            </button>
          ) : null}
        </div>
      ) : null}

      {manageable && editing ? (
        <section className="gl-form">
          <p className="gl-hint">
            Cette page est affichée aux joueurs dans l’onglet correspondant. Vous pouvez la modifier plus tard
            depuis l’onglet <strong>Contenus</strong>.
          </p>
          <label>
            Titre
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </label>
          <label>
            Markdown
            <textarea
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              rows={10}
            />
          </label>
          <div className="gl-inline-actions">
            <button type="button" onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {hasExistingContent(content) ? (
              <button
                type="button"
                className="gl-btn-secondary"
                disabled={saving}
                onClick={() => {
                  setSaveError('');
                  setSavedMessage('');
                  setDraftTitle(String(content?.title || fallbackTitle || slug));
                  setDraftBody(String(content?.bodyMarkdown || ''));
                  setEditing(false);
                }}
              >
                Annuler
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {manageable && editing ? <h3>Aperçu</h3> : null}
      <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
    </article>
  );
}
