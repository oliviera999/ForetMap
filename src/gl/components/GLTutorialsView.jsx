import React, { useCallback, useEffect, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
import { apiGL } from '../services/apiGL.js';

export function GLTutorialsView({ canManage }) {
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ slug: '', title: '', bodyMarkdown: '' });
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await apiGL('/api/gl/tutorials');
      setItems(Array.isArray(list?.tutorials) ? list.tutorials : []);
      const reads = await apiGL('/api/gl/tutorials/me/read-ids').catch(() => ({ ids: [] }));
      setReadIds(Array.isArray(reads?.ids) ? reads.ids : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function openTutorial(id) {
    try {
      const data = await apiGL(`/api/gl/tutorials/${id}`);
      setActive(data || null);
      await apiGL(`/api/gl/tutorials/${id}/read`, 'POST').catch(() => null);
      await reload();
    } catch (err) {
      setError(err.message || 'Lecture impossible');
    }
  }

  async function createDraft(event) {
    event.preventDefault();
    try {
      await apiGL('/api/gl/tutorials', 'POST', {
        slug: draft.slug || `tuto-${Date.now()}`,
        title: draft.title,
        bodyMarkdown: draft.bodyMarkdown,
      });
      setDraft({ slug: '', title: '', bodyMarkdown: '' });
      setEditing(false);
      await reload();
    } catch (err) {
      setError(err.message || 'Création impossible');
    }
  }

  let html = '';
  if (active?.body_markdown) {
    try {
      html = DOMPurify.sanitize(marked.parse(active.body_markdown));
    } catch (_) {
      html = '<p>Aperçu indisponible.</p>';
    }
  }

  return (
    <section className="gl-panel">
      <h2>Tutoriels GL</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="gl-inline-actions">
        {canManage ? (
          <button type="button" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Annuler' : 'Nouveau tutoriel'}
          </button>
        ) : null}
        <button type="button" onClick={reload}>Rafraîchir</button>
      </div>

      {editing && canManage ? (
        <form className="gl-form" onSubmit={createDraft}>
          <label>
            Slug
            <input value={draft.slug} onChange={(event) => setDraft((d) => ({ ...d, slug: event.target.value }))} />
          </label>
          <label>
            Titre
            <input value={draft.title} onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))} />
          </label>
          <label>
            Markdown
            <textarea
              value={draft.bodyMarkdown}
              onChange={(event) => setDraft((d) => ({ ...d, bodyMarkdown: event.target.value }))}
              rows={6}
            />
          </label>
          <button type="submit">Publier</button>
        </form>
      ) : null}

      <ul className="gl-tutorials-list">
        {items.map((item) => (
          <li key={item.id} className={readIds.includes(item.id) ? 'is-read' : ''}>
            <button type="button" onClick={() => openTutorial(item.id)}>
              <strong>{item.title}</strong>
              {readIds.includes(item.id) ? <span className="gl-hint"> · lu</span> : null}
            </button>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="gl-empty gl-hint">
            <span className="gl-empty-icon" aria-hidden>🎓</span>
            Aucun tutoriel.
          </li>
        ) : null}
      </ul>

      {active ? (
        <article className="gl-tutorial-active gl-markdown">
          <h3>{active.title}</h3>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      ) : null}
    </section>
  );
}
