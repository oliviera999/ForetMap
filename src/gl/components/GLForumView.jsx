import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';

export function GLForumView({ canModerate }) {
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [creatingThread, setCreatingThread] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [postBody, setPostBody] = useState('');

  const loadThreads = useCallback(async () => {
    try {
      const data = await apiGL('/api/gl/forum/threads');
      setThreads(Array.isArray(data?.items) ? data.items : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    }
  }, []);

  const loadThread = useCallback(async (id) => {
    if (id == null) {
      setActiveThread(null);
      setPosts([]);
      return;
    }
    try {
      const data = await apiGL(`/api/gl/forum/threads/${id}`);
      setActiveThread(data?.thread || null);
      setPosts(Array.isArray(data?.posts) ? data.posts : []);
    } catch (err) {
      setError(err.message || 'Chargement sujet impossible');
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    loadThread(activeId);
  }, [activeId, loadThread]);

  async function createThread(event) {
    event.preventDefault();
    if (!draftTitle.trim() || !draftBody.trim()) return;
    try {
      const created = await apiGL('/api/gl/forum/threads', 'POST', {
        title: draftTitle.trim(),
        body: draftBody.trim(),
      });
      setDraftTitle('');
      setDraftBody('');
      setCreatingThread(false);
      await loadThreads();
      setActiveId(created?.id || null);
    } catch (err) {
      setError(err.message || 'Création impossible');
    }
  }

  async function postReply(event) {
    event.preventDefault();
    if (!activeThread || !postBody.trim()) return;
    try {
      await apiGL(`/api/gl/forum/threads/${activeThread.id}/posts`, 'POST', { body: postBody.trim() });
      setPostBody('');
      await loadThread(activeThread.id);
      await loadThreads();
    } catch (err) {
      setError(err.message || 'Réponse impossible');
    }
  }

  async function toggleLock() {
    if (!activeThread) return;
    try {
      await apiGL(`/api/gl/forum/threads/${activeThread.id}/lock`, 'PATCH', { locked: !activeThread.is_locked });
      await loadThread(activeThread.id);
      await loadThreads();
    } catch (err) {
      setError(err.message || 'Verrouillage impossible');
    }
  }

  return (
    <section className="gl-panel">
      <h2>Forum GL</h2>
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="gl-inline-actions">
        <button type="button" onClick={() => setCreatingThread((v) => !v)}>
          {creatingThread ? 'Annuler' : 'Nouveau sujet'}
        </button>
        <button type="button" onClick={loadThreads}>Rafraîchir</button>
      </div>

      {creatingThread ? (
        <form className="gl-form" onSubmit={createThread}>
          <label>
            Titre
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </label>
          <label>
            Premier message
            <textarea value={draftBody} onChange={(event) => setDraftBody(event.target.value)} rows={4} />
          </label>
          <button type="submit">Publier le sujet</button>
        </form>
      ) : null}

      <ul className="gl-forum-threads">
        {threads.map((thread) => (
          <li key={thread.id} className={activeId === thread.id ? 'is-active' : ''}>
            <button type="button" onClick={() => setActiveId(thread.id)}>
              <strong>{thread.title}</strong>
              <span className="gl-hint">
                {Number(thread.is_locked) ? '🔒 ' : ''}{thread.posts_count} messages
              </span>
            </button>
          </li>
        ))}
        {threads.length === 0 ? <li className="gl-hint">Aucun sujet.</li> : null}
      </ul>

      {activeThread ? (
        <article className="gl-forum-thread">
          <header>
            <h3>{activeThread.title}</h3>
            {canModerate ? (
              <button type="button" onClick={toggleLock}>
                {Number(activeThread.is_locked) ? 'Déverrouiller' : 'Verrouiller'}
              </button>
            ) : null}
          </header>
          <ul className="gl-forum-posts">
            {posts.map((post) => (
              <li key={post.id} className={Number(post.is_deleted) ? 'is-deleted' : ''}>
                <strong>{post.author_user_type}#{post.author_user_id}</strong>
                <p>{post.body}</p>
              </li>
            ))}
          </ul>
          {!Number(activeThread.is_locked) || canModerate ? (
            <form className="gl-form" onSubmit={postReply}>
              <label>
                Répondre
                <textarea value={postBody} onChange={(event) => setPostBody(event.target.value)} rows={3} />
              </label>
              <button type="submit">Envoyer</button>
            </form>
          ) : (
            <p className="gl-hint">Sujet verrouillé.</p>
          )}
        </article>
      ) : null}
    </section>
  );
}
