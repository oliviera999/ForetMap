import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import { formatDateTimeFr } from '../../shared/platform/datetime-fr';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLTextarea } from './ui/GLTextarea.jsx';

const THREAD_PAGE_SIZE = 20;
/* Même seuil que la bascule une colonne de `.gl-forum__layout` dans gl-theme.css. */
const NARROW_QUERY = '(max-width: 1023px)';

function isNarrowViewport() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_QUERY).matches
    : false;
}

export function GLForumView({ canModerate, auth }) {
  const [threads, setThreads] = useState([]);
  const [threadsPage, setThreadsPage] = useState(1);
  const [threadsTotal, setThreadsTotal] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [creatingThread, setCreatingThread] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [postBody, setPostBody] = useState('');
  const [busy, setBusy] = useState('');
  // Écran étroit : liste OU discussion, sinon la discussion s'ouvrait sous toute la liste.
  const [pane, setPane] = useState('list');
  const rootRef = useRef(null);
  const { confirm } = useAppDialogs();

  const loadThreads = useCallback(async (page = 1) => {
    try {
      const data = await apiGL(`/api/gl/forum/threads?page=${page}&page_size=${THREAD_PAGE_SIZE}`);
      setThreads(Array.isArray(data?.items) ? data.items : []);
      setThreadsTotal(Number(data?.total || 0));
      setThreadsPage(Number(data?.page || page));
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
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement sujet impossible');
    }
  }, []);

  useEffect(() => {
    loadThreads(1);
  }, [loadThreads]);

  useEffect(() => {
    loadThread(activeId);
  }, [activeId, loadThread]);

  const scrollTopOnNarrow = () => {
    if (!isNarrowViewport()) return;
    const el = rootRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    }
  };

  function openThread(id) {
    setActiveId(id);
    setPane('detail');
    scrollTopOnNarrow();
  }

  function backToList() {
    setPane('list');
    scrollTopOnNarrow();
  }

  async function createThread(event) {
    event.preventDefault();
    if (busy || !draftTitle.trim() || !draftBody.trim()) return;
    setBusy('create');
    try {
      const created = await apiGL('/api/gl/forum/threads', 'POST', {
        title: draftTitle.trim(),
        body: draftBody.trim(),
      });
      setDraftTitle('');
      setDraftBody('');
      setCreatingThread(false);
      await loadThreads(1);
      if (created?.id) openThread(created.id);
    } catch (err) {
      setError(err.message || 'Création impossible');
    } finally {
      setBusy('');
    }
  }

  async function postReply(event) {
    event.preventDefault();
    if (busy || !activeThread || !postBody.trim()) return;
    setBusy('reply');
    try {
      await apiGL(`/api/gl/forum/threads/${activeThread.id}/posts`, 'POST', {
        body: postBody.trim(),
      });
      setPostBody('');
      await Promise.all([loadThread(activeThread.id), loadThreads(threadsPage)]);
    } catch (err) {
      setError(err.message || 'Réponse impossible');
    } finally {
      setBusy('');
    }
  }

  async function toggleLock() {
    if (!activeThread || busy) return;
    setBusy('lock');
    try {
      await apiGL(`/api/gl/forum/threads/${activeThread.id}/lock`, 'PATCH', {
        locked: !Number(activeThread.is_locked),
      });
      await Promise.all([loadThread(activeThread.id), loadThreads(threadsPage)]);
    } catch (err) {
      setError(err.message || 'Verrouillage impossible');
    } finally {
      setBusy('');
    }
  }

  async function deletePost(postId) {
    const ok = await confirm({
      title: 'Supprimer le message',
      message: 'Le message sera remplacé par « [message supprimé] » pour tout le monde.',
      danger: true,
    });
    if (!ok || !activeThread) return;
    try {
      await apiGL(`/api/gl/forum/posts/${postId}`, 'DELETE');
      await Promise.all([loadThread(activeThread.id), loadThreads(threadsPage)]);
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    }
  }

  const threadPages = Math.max(1, Math.ceil(threadsTotal / THREAD_PAGE_SIZE));
  const activeLocked = !!Number(activeThread?.is_locked);
  const selfType = String(auth?.userType || '');
  const selfId = String(auth?.userId ?? '');

  return (
    <section ref={rootRef} className={`gl-panel fade-in gl-forum gl-forum--pane-${pane}`}>
      <h2>Forum GL</h2>
      {error ? (
        <p className="gl-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="gl-inline-actions gl-forum__actions">
        <GLButton type="button" onClick={() => setCreatingThread((v) => !v)}>
          {creatingThread ? 'Annuler' : 'Nouveau sujet'}
        </GLButton>
        <GLButton type="button" variant="secondary" onClick={() => loadThreads(threadsPage)}>
          Rafraîchir
        </GLButton>
      </div>

      {creatingThread ? (
        <form className="gl-form gl-forum__composer" onSubmit={createThread}>
          <GLField label="Titre">
            <GLInput
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              minLength={3}
              maxLength={200}
              required
            />
          </GLField>
          <GLField label="Premier message">
            <GLTextarea
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
              rows={4}
              maxLength={4000}
              required
            />
          </GLField>
          <GLButton type="submit" loading={busy === 'create'} loadingLabel="Publication…">
            Publier le sujet
          </GLButton>
        </form>
      ) : null}

      <div className="gl-forum__layout">
        <div className="gl-forum__list">
          <ul className="gl-forum-threads" data-gl-tour="forum-threads">
            {threads.map((thread) => {
              const count = Number(thread.posts_count || 0);
              const active = activeId === thread.id;
              return (
                <li key={thread.id} className={active ? 'is-active' : ''}>
                  <button
                    type="button"
                    onClick={() => openThread(thread.id)}
                    aria-current={active ? 'true' : undefined}
                  >
                    <strong>
                      {Number(thread.is_locked) ? (
                        <span role="img" aria-label="Verrouillé">
                          🔒{' '}
                        </span>
                      ) : null}
                      {thread.title}
                    </strong>
                    <span className="gl-hint">
                      {thread.author_display_name ? `${thread.author_display_name} · ` : ''}
                      {count} message{count > 1 ? 's' : ''} · {formatDateTimeFr(thread.updated_at)}
                    </span>
                  </button>
                </li>
              );
            })}
            {threads.length === 0 ? (
              <li className="gl-empty gl-hint">
                <span className="gl-empty-icon" aria-hidden>
                  💬
                </span>
                Aucun sujet.
              </li>
            ) : null}
          </ul>
          {threadPages > 1 ? (
            <nav className="gl-forum__pager" aria-label="Pages des sujets">
              <GLButton
                type="button"
                size="sm"
                variant="secondary"
                disabled={threadsPage <= 1}
                onClick={() => loadThreads(threadsPage - 1)}
              >
                Précédent
              </GLButton>
              <span>
                Page {threadsPage}/{threadPages}
              </span>
              <GLButton
                type="button"
                size="sm"
                variant="secondary"
                disabled={threadsPage >= threadPages}
                onClick={() => loadThreads(threadsPage + 1)}
              >
                Suivant
              </GLButton>
            </nav>
          ) : null}
        </div>

        <div className="gl-forum__detail">
          {activeThread ? (
            <article className="gl-forum-thread">
              <GLButton
                type="button"
                size="sm"
                variant="ghost"
                className="gl-forum__back"
                onClick={backToList}
              >
                ← Tous les sujets
              </GLButton>
              <header>
                <div className="gl-forum-thread__title">
                  <h3>{activeThread.title}</h3>
                  <p className="gl-hint">
                    {activeThread.author_display_name
                      ? `Par ${activeThread.author_display_name} · `
                      : ''}
                    créé le {formatDateTimeFr(activeThread.created_at)}
                  </p>
                </div>
                {canModerate ? (
                  <GLButton type="button" size="sm" variant="secondary" onClick={toggleLock}>
                    {activeLocked ? 'Déverrouiller' : 'Verrouiller'}
                  </GLButton>
                ) : null}
              </header>
              <ul className="gl-forum-posts">
                {posts.map((post) => {
                  const deleted = !!Number(post.is_deleted);
                  const own =
                    post.author_user_type === selfType && String(post.author_user_id) === selfId;
                  return (
                    <li key={post.id} className={deleted ? 'is-deleted' : ''}>
                      <div className="gl-forum-post__head">
                        <strong>{post.author_display_name || 'Joueur'}</strong>
                        <time dateTime={post.created_at || undefined}>
                          {formatDateTimeFr(post.created_at)}
                        </time>
                      </div>
                      <p className="gl-forum-post__body">{post.body}</p>
                      {!deleted && (own || canModerate) ? (
                        <div className="gl-forum-post__actions">
                          <GLButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => deletePost(post.id)}
                          >
                            Supprimer
                          </GLButton>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {posts.length === 0 ? (
                  <li className="gl-empty gl-hint">
                    <span className="gl-empty-icon" aria-hidden>
                      📝
                    </span>
                    Aucun message.
                  </li>
                ) : null}
              </ul>
              {!activeLocked || canModerate ? (
                <form className="gl-form" onSubmit={postReply}>
                  {activeLocked ? (
                    <p className="gl-hint">
                      Sujet verrouillé : seuls les MJ peuvent encore répondre.
                    </p>
                  ) : null}
                  <GLField label="Répondre">
                    <GLTextarea
                      value={postBody}
                      onChange={(event) => setPostBody(event.target.value)}
                      rows={3}
                      maxLength={4000}
                      required
                    />
                  </GLField>
                  <GLButton type="submit" loading={busy === 'reply'} loadingLabel="Envoi…">
                    Envoyer
                  </GLButton>
                </form>
              ) : (
                <p className="gl-hint" role="status">
                  🔒 Sujet verrouillé : les réponses sont fermées.
                </p>
              )}
            </article>
          ) : (
            <p className="gl-empty gl-hint gl-forum__placeholder">
              Choisis un sujet pour lire la discussion.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
