import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, toggleForumPostReaction } from '../services/api';

const THREAD_PAGE_SIZE = 20;
const POST_PAGE_SIZE = 50;
const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏'];

function parseReactionEmojiList(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [...DEFAULT_REACTION_EMOJIS];
  const tokens = raw
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => item.length <= 16);
  const unique = [...new Set(tokens)].slice(0, 24);
  return unique.length > 0 ? unique : [...DEFAULT_REACTION_EMOJIS];
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function isModerator(authClaims) {
  const roleSlug = String(authClaims?.roleSlug || '').toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
  return perms.includes('teacher.access');
}

function ForumView({ authClaims }) {
  const [threads, setThreads] = useState([]);
  const [threadsPage, setThreadsPage] = useState(1);
  const [threadsTotal, setThreadsTotal] = useState(0);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [threadDetail, setThreadDetail] = useState(null);
  const [posts, setPosts] = useState([]);
  const [reactionEmojis, setReactionEmojis] = useState(DEFAULT_REACTION_EMOJIS);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotal, setPostsTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [reportReasonByPost, setReportReasonByPost] = useState({});
  const [toast, setToast] = useState('');

  const canModerate = useMemo(() => isModerator(authClaims), [authClaims]);
  const currentUserType = String(authClaims?.userType || '').toLowerCase();
  const currentUserId = String(authClaims?.canonicalUserId || authClaims?.userId || '');

  const loadThreads = useCallback(async (page = 1) => {
    setThreadsLoading(true);
    try {
      const data = await api(`/api/forum/threads?page=${page}&page_size=${THREAD_PAGE_SIZE}`);
      setThreads(Array.isArray(data?.items) ? data.items : []);
      setThreadsTotal(Number(data?.total || 0));
      setThreadsPage(Number(data?.page || page));
      if (!selectedThreadId && Array.isArray(data?.items) && data.items[0]?.id) {
        setSelectedThreadId(data.items[0].id);
      }
    } catch (err) {
      setToast(`Erreur chargement forum : ${err.message}`);
    } finally {
      setThreadsLoading(false);
    }
  }, [selectedThreadId]);

  const loadThreadDetail = useCallback(async (threadId, page = 1) => {
    if (!threadId) {
      setThreadDetail(null);
      setPosts([]);
      setPostsTotal(0);
      setPostsPage(1);
      return;
    }
    setDetailLoading(true);
    try {
      const data = await api(`/api/forum/threads/${encodeURIComponent(threadId)}?page=${page}&page_size=${POST_PAGE_SIZE}`);
      setThreadDetail(data?.thread || null);
      setPosts(Array.isArray(data?.posts) ? data.posts : []);
      setPostsTotal(Number(data?.total_posts || 0));
      setPostsPage(Number(data?.page || page));
    } catch (err) {
      setToast(`Erreur chargement sujet : ${err.message}`);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads(1);
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedThreadId) return;
    loadThreadDetail(selectedThreadId, 1);
  }, [loadThreadDetail, selectedThreadId]);

  useEffect(() => {
    api('/api/settings/public')
      .then((d) => {
        const configured = d?.settings?.ui?.reactions?.allowed_emojis
          || d?.settings?.reactions?.allowed_emojis
          || '';
        setReactionEmojis(parseReactionEmojiList(configured));
      })
      .catch(() => {
        // Réglage non bloquant : on garde le fallback local.
      });
  }, []);

  useEffect(() => {
    const onRealtime = (e) => {
      if (e?.detail?.domain !== 'forum') return;
      loadThreads(threadsPage);
      if (selectedThreadId) loadThreadDetail(selectedThreadId, postsPage);
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [loadThreadDetail, loadThreads, postsPage, selectedThreadId, threadsPage]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleCreateThread = async (e) => {
    e.preventDefault();
    try {
      const res = await api('/api/forum/threads', 'POST', { title: newTitle, body: newBody });
      setNewTitle('');
      setNewBody('');
      setToast('Sujet créé');
      await loadThreads(1);
      const nextId = res?.thread?.id || '';
      if (nextId) {
        setSelectedThreadId(nextId);
        await loadThreadDetail(nextId, 1);
      }
    } catch (err) {
      setToast(`Création impossible : ${err.message}`);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!selectedThreadId) return;
    try {
      await api(`/api/forum/threads/${encodeURIComponent(selectedThreadId)}/posts`, 'POST', { body: replyBody });
      setReplyBody('');
      setToast('Réponse publiée');
      await loadThreads(threadsPage);
      await loadThreadDetail(selectedThreadId, postsPage);
    } catch (err) {
      setToast(`Réponse impossible : ${err.message}`);
    }
  };

  const handleToggleLock = async () => {
    if (!selectedThreadId || !threadDetail || !canModerate) return;
    try {
      await api(`/api/forum/threads/${encodeURIComponent(selectedThreadId)}/lock`, 'PATCH', {
        locked: !threadDetail.is_locked,
      });
      setToast(threadDetail.is_locked ? 'Sujet déverrouillé' : 'Sujet verrouillé');
      await loadThreads(threadsPage);
      await loadThreadDetail(selectedThreadId, postsPage);
    } catch (err) {
      setToast(`Action impossible : ${err.message}`);
    }
  };

  const handleDeletePost = async (postId) => {
    try {
      await api(`/api/forum/posts/${encodeURIComponent(postId)}`, 'DELETE');
      setToast('Message supprimé');
      await loadThreads(threadsPage);
      if (selectedThreadId) await loadThreadDetail(selectedThreadId, postsPage);
    } catch (err) {
      setToast(`Suppression impossible : ${err.message}`);
    }
  };

  const handleReportPost = async (postId) => {
    const reason = String(reportReasonByPost[postId] || '').trim();
    try {
      await api(`/api/forum/posts/${encodeURIComponent(postId)}/report`, 'POST', { reason });
      setReportReasonByPost((prev) => ({ ...prev, [postId]: '' }));
      setToast('Signalement envoyé');
    } catch (err) {
      setToast(`Signalement impossible : ${err.message}`);
    }
  };

  const handleReactPost = async (postId, emoji) => {
    try {
      await toggleForumPostReaction(postId, emoji);
      await loadThreadDetail(selectedThreadId, postsPage);
    } catch (err) {
      setToast(`Réaction impossible : ${err.message}`);
    }
  };

  const threadPages = Math.max(1, Math.ceil(threadsTotal / THREAD_PAGE_SIZE));
  const postPages = Math.max(1, Math.ceil(postsTotal / POST_PAGE_SIZE));

  return (
    <div className="forum-view">
      <section className="forum-panel">
        <h3>Nouveau sujet</h3>
        <form className="forum-form" onSubmit={handleCreateThread}>
          <div className="field">
            <label htmlFor="forum-thread-title">Titre</label>
            <input
              id="forum-thread-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={180}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="forum-thread-body">Message</label>
            <textarea
              id="forum-thread-body"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={4}
              maxLength={4000}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Publier le sujet</button>
        </form>
      </section>

      <div className="forum-grid">
        <section className="forum-panel">
          <div className="forum-head">
            <h3>Sujets ({threadsTotal})</h3>
            <div className="forum-pager">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={threadsPage <= 1 || threadsLoading}
                onClick={() => loadThreads(threadsPage - 1)}
              >
                Précédent
              </button>
              <span>{threadsPage}/{threadPages}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={threadsPage >= threadPages || threadsLoading}
                onClick={() => loadThreads(threadsPage + 1)}
              >
                Suivant
              </button>
            </div>
          </div>
          <div className="forum-thread-list">
            {threadsLoading && <p className="forum-muted">Chargement…</p>}
            {!threadsLoading && threads.length === 0 && <div className="empty"><p>Aucun sujet pour l’instant.</p></div>}
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`forum-thread-item ${selectedThreadId === t.id ? 'active' : ''}`}
                onClick={() => setSelectedThreadId(t.id)}
              >
                <strong>{t.title}</strong>
                <span className="forum-meta-line">
                  {t.author_display_name} · {Number(t.posts_count || 0)} message(s)
                </span>
                <span className="forum-meta-line">
                  {t.is_locked ? '🔒 Verrouillé' : '💬 Ouvert'} · maj {fmtDate(t.last_post_at)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="forum-panel">
          {!threadDetail ? (
            <div className="empty"><p>Choisis un sujet pour voir la discussion.</p></div>
          ) : (
            <>
              <div className="forum-head">
                <div>
                  <h3>{threadDetail.title}</h3>
                  <p className="forum-muted">
                    Par {threadDetail.author_display_name} · créé le {fmtDate(threadDetail.created_at)}
                  </p>
                </div>
                {canModerate && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleToggleLock}>
                    {threadDetail.is_locked ? 'Déverrouiller' : 'Verrouiller'}
                  </button>
                )}
              </div>

              <div className="forum-pager forum-pager--posts">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={postsPage <= 1 || detailLoading}
                  onClick={() => loadThreadDetail(selectedThreadId, postsPage - 1)}
                >
                  Précédent
                </button>
                <span>{postsPage}/{postPages}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={postsPage >= postPages || detailLoading}
                  onClick={() => loadThreadDetail(selectedThreadId, postsPage + 1)}
                >
                  Suivant
                </button>
              </div>

              <div className="forum-post-list">
                {detailLoading && <p className="forum-muted">Chargement…</p>}
                {!detailLoading && posts.map((p) => {
                  const isOwner = p.author_user_type === currentUserType && p.author_user_id === currentUserId;
                  const canDelete = canModerate || isOwner;
                  return (
                    <article key={p.id} className={`forum-post ${p.is_deleted ? 'is-deleted' : ''}`}>
                      <div className="forum-post-head">
                        <strong>{p.author_display_name}</strong>
                        <span>{fmtDate(p.created_at)}</span>
                      </div>
                      <p className="forum-post-body">
                        {p.is_deleted ? '[message supprimé]' : p.body}
                      </p>
                      {!p.is_deleted && (
                        <div className="message-reactions-row">
                          {reactionEmojis.map((emoji) => {
                            const item = (p.reactions || []).find((r) => r.emoji === emoji);
                            const count = Number(item?.count || 0);
                            const mine = !!item?.reacted_by_me;
                            return (
                              <button
                                key={`${p.id}-${emoji}`}
                                type="button"
                                className={`message-reaction-chip ${mine ? 'active' : ''}`}
                                onClick={() => handleReactPost(p.id, emoji)}
                                title={`Réagir avec ${emoji}`}
                              >
                                <span>{emoji}</span>
                                {count > 0 && <span>{count}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {!p.is_deleted && (
                        <div className="forum-post-actions">
                          {canDelete && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDeletePost(p.id)}>
                              Supprimer
                            </button>
                          )}
                          <input
                            value={reportReasonByPost[p.id] || ''}
                            onChange={(e) => setReportReasonByPost((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder="Motif de signalement"
                            maxLength={500}
                          />
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleReportPost(p.id)}>
                            Signaler
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              <form className="forum-form forum-reply-form" onSubmit={handleReply}>
                <div className="field">
                  <label htmlFor="forum-reply">Répondre</label>
                  <textarea
                    id="forum-reply"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                    maxLength={4000}
                    required
                    disabled={!!threadDetail.is_locked}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!!threadDetail.is_locked}>
                  Envoyer
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {toast && <div className="collective-toast">{toast}</div>}
    </div>
  );
}

export { ForumView };
