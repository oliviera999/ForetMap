import React, { useEffect, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
import { apiGL } from '../services/apiGL.js';

function canManageContent(auth) {
  const permissions = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return permissions.includes('gl.content.manage');
}

export function GLContentPage({ slug, fallbackTitle, auth, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSavedMessage('');
    apiGL(`/api/gl/content/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (!cancelled) {
          setContent(data);
          setDraftTitle(String(data?.title || fallbackTitle || slug));
          setDraftBody(String(data?.bodyMarkdown || ''));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Chargement impossible');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, fallbackTitle]);

  async function save() {
    if (!canManageContent(auth) || saving) return;
    setSaving(true);
    setError('');
    setSavedMessage('');
    try {
      const data = await apiGL(`/api/gl/content/${encodeURIComponent(slug)}`, 'PUT', {
        title: draftTitle,
        bodyMarkdown: draftBody,
      });
      setContent(data);
      setDraftTitle(String(data?.title || draftTitle));
      setDraftBody(String(data?.bodyMarkdown || draftBody));
      setSavedMessage('Contenu enregistre');
      if (typeof onSaved === 'function') onSaved(data);
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="gl-panel">Chargement...</div>;
  if (error) return <div className="gl-panel gl-error">{error}</div>;
  const title = content?.title || fallbackTitle || slug;
  const markdown = canManageContent(auth) ? draftBody : (content?.bodyMarkdown || '');
  const html = DOMPurify.sanitize(marked.parse(markdown));
  return (
    <article className="gl-panel gl-markdown">
      <h2>{title}</h2>
      {canManageContent(auth) ? (
        <section className="gl-form">
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
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            {savedMessage ? <span>{savedMessage}</span> : null}
          </div>
        </section>
      ) : null}
      {canManageContent(auth) ? <h3>Apercu</h3> : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
