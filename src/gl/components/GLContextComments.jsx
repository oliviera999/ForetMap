import React, { useEffect, useState, useCallback } from 'react';
import { apiGL } from '../services/apiGL.js';

const ALLOWED = ['gl_chapter', 'gl_scene', 'gl_game', 'gl_mascot_pack'];

/** Liste + saisie de commentaires contextuels GL (chapitres, scènes, parties, packs mascotte). */
export function GLContextComments({ contextType, contextId }) {
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const valid = ALLOWED.includes(String(contextType || '')) && contextId != null && contextId !== '';

  const load = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    try {
      const data = await apiGL(
        `/api/gl/context-comments?contextType=${encodeURIComponent(contextType)}&contextId=${encodeURIComponent(contextId)}`
      );
      setItems(Array.isArray(data?.items) ? data.items : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [contextType, contextId, valid]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event) {
    event.preventDefault();
    if (!valid) return;
    const trimmed = String(body || '').trim();
    if (trimmed.length < 2) {
      setError('Message trop court (2 caractères minimum).');
      return;
    }
    try {
      await apiGL('/api/gl/context-comments', 'POST', {
        contextType,
        contextId: String(contextId),
        body: trimmed,
      });
      setBody('');
      await load();
    } catch (err) {
      setError(err.message || 'Envoi impossible');
    }
  }

  if (!valid) return null;
  return (
    <section className="gl-panel">
      <h3>Commentaires</h3>
      {error ? <p className="gl-error">{error}</p> : null}
      <form className="gl-form" onSubmit={submit}>
        <label>
          Message
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
        </label>
        <div className="gl-inline-actions">
          <button type="submit">Publier</button>
          <button type="button" onClick={load} disabled={loading}>
            {loading ? 'Chargement…' : 'Rafraîchir'}
          </button>
        </div>
      </form>
      <ul className="gl-context-comments">
        {items.map((item) => (
          <li key={item.id} className={Number(item.is_deleted) ? 'is-deleted' : ''}>
            <strong>{item.author_user_type}#{item.author_user_id}</strong>
            <p>{item.body}</p>
          </li>
        ))}
        {items.length === 0 ? <li className="gl-hint">Aucun commentaire.</li> : null}
      </ul>
    </section>
  );
}
