import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, toggleForumPostReaction } from '../services/api';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { formatDateTimeFr } from '../utils/datetime-fr';
import { AttachmentImagesPicker } from './attachment-images-picker';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { ForumPostCard } from './forum/ForumPostCard.jsx';
import {
  DEFAULT_REACTION_EMOJIS,
  forumPageCount,
  isForumModerator,
  parseReactionEmojiList,
} from '../utils/forumHelpers.js';

const THREAD_PAGE_SIZE = 20;
const POST_PAGE_SIZE = 50;

function ForumView({ authClaims, canParticipateForum = true }) {
  const [threads, setThreads] = useState([]);
  const [threadsPage, setThreadsPage] = useState(1);
  const [threadsTotal, setThreadsTotal] = useState(0);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [threadDetail, setThreadDetail] = useState(null);
  const [posts, setPosts] = useState([]);
  const [reactionEmojis, setReactionEmojis] = useState(DEFAULT_REACTION_EMOJIS);
  const [expandedReactionsByPost, setExpandedReactionsByPost] = useState({});
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotal, setPostsTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newThreadGroupId, setNewThreadGroupId] = useState('');
  const [groupOptions, setGroupOptions] = useState([]);
  const [newThreadImages, setNewThreadImages] = useState([]);
  const [replyBody, setReplyBody] = useState('');
  const [replyImages, setReplyImages] = useState([]);
  const [reportReasonByPost, setReportReasonByPost] = useState({});
  const [toast, setToast] = useState('');

  const threadDetailRequestSeqRef = useRef(0);

  const canModerate = useMemo(() => isForumModerator(authClaims), [authClaims]);
  const canUseForumActions = canParticipateForum || canModerate;
  const publicSettings = usePublicSettings();
  const reportsEnabled = publicSettings?.modules?.reports_enabled !== false;
  const currentUserType = String(authClaims?.userType || '').toLowerCase();
  const currentUserId = String(authClaims?.canonicalUserId || authClaims?.userId || '');

  const loadThreads = useCallback(
    async (page = 1) => {
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
    },
    [selectedThreadId],
  );

  const loadThreadDetail = useCallback(async (threadId, page = 1) => {
    if (!threadId) {
      threadDetailRequestSeqRef.current += 1;
      setThreadDetail(null);
      setPosts([]);
      setPostsTotal(0);
      setPostsPage(1);
      setDetailLoading(false);
      return;
    }
    const seq = ++threadDetailRequestSeqRef.current;
    setDetailLoading(true);
    try {
      const data = await api(
        `/api/forum/threads/${encodeURIComponent(threadId)}?page=${page}&page_size=${POST_PAGE_SIZE}`,
      );
      if (seq !== threadDetailRequestSeqRef.current) return;
      setThreadDetail(data?.thread || null);
      setPosts(Array.isArray(data?.posts) ? data.posts : []);
      setPostsTotal(Number(data?.total_posts || 0));
      setPostsPage(Number(data?.page || page));
    } catch (err) {
      if (seq !== threadDetailRequestSeqRef.current) return;
      setToast(`Erreur chargement sujet : ${err.message}`);
    } finally {
      if (seq === threadDetailRequestSeqRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads(1);
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedThreadId) return;
    setExpandedReactionsByPost({});
    loadThreadDetail(selectedThreadId, 1);
  }, [loadThreadDetail, selectedThreadId]);

  useEffect(() => {
    api('/api/settings/public')
      .then((d) => {
        const configured =
          d?.settings?.ui?.reactions?.allowed_emojis ||
          d?.settings?.reactions?.allowed_emojis ||
          '';
        setReactionEmojis(parseReactionEmojiList(configured));
      })
      .catch(() => {
        // Réglage non bloquant : on garde le fallback local.
      });
  }, []);

  useEffect(() => {
    api('/api/groups/options')
      .then((payload) => setGroupOptions(Array.isArray(payload?.groups) ? payload.groups : []))
      .catch(() => setGroupOptions([]));
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
      const payload = { title: newTitle, body: newBody.trim() || undefined };
      if (newThreadGroupId) payload.group_id = newThreadGroupId;
      if (newThreadImages.length > 0) payload.images = newThreadImages;
      const res = await api('/api/forum/threads', 'POST', payload);
      setNewTitle('');
      setNewBody('');
      setNewThreadGroupId('');
      setNewThreadImages([]);
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
      const payload = { body: replyBody.trim() || undefined };
      if (replyImages.length > 0) payload.images = replyImages;
      await api(
        `/api/forum/threads/${encodeURIComponent(selectedThreadId)}/posts`,
        'POST',
        payload,
      );
      setReplyBody('');
      setReplyImages([]);
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

  const threadPages = forumPageCount(threadsTotal, THREAD_PAGE_SIZE);
  const postPages = forumPageCount(postsTotal, POST_PAGE_SIZE);
  const firstReactionEmoji = reactionEmojis[0] || '👍';

  return (
    <div className="forum-view">
      {canUseForumActions ? (
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
              <MarkdownTextarea
                id="forum-thread-body"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={4}
                maxLength={4000}
                required={newThreadImages.length === 0}
              />
            </div>
            {groupOptions.length > 0 && (
              <div className="field">
                <label htmlFor="forum-thread-group">Groupe (optionnel)</label>
                <select
                  id="forum-thread-group"
                  value={newThreadGroupId}
                  onChange={(e) => setNewThreadGroupId(e.target.value)}
                >
                  <option value="">Tous les groupes visibles</option>
                  {groupOptions.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <AttachmentImagesPicker
              value={newThreadImages}
              onChange={setNewThreadImages}
              onNotify={(msg) => setToast(msg)}
              label="Photos du premier message (optionnel, max 3)"
            />
            <button type="submit" className="btn btn-primary btn-sm">
              Publier le sujet
            </button>
          </form>
        </section>
      ) : (
        <section
          className="forum-panel"
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
        >
          <p className="forum-muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Tu consultes le forum en <strong>lecture seule</strong>. La participation (nouveaux
            sujets, réponses, réactions, signalements) n’est pas activée sur ton compte — contacte
            un n3boss si besoin.
          </p>
        </section>
      )}

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
              <span>
                {threadsPage}/{threadPages}
              </span>
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
            {!threadsLoading && threads.length === 0 && (
              <div className="empty">
                <p>Aucun sujet pour l’instant.</p>
              </div>
            )}
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
                  {t.is_locked ? '🔒 Verrouillé' : '💬 Ouvert'} · maj{' '}
                  {formatDateTimeFr(t.last_post_at)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="forum-panel">
          {!threadDetail ? (
            <div className="empty">
              <p>Choisis un sujet pour voir la discussion.</p>
            </div>
          ) : (
            <>
              <div className="forum-head">
                <div>
                  <h3>{threadDetail.title}</h3>
                  <p className="forum-muted">
                    Par {threadDetail.author_display_name} · créé le{' '}
                    {formatDateTimeFr(threadDetail.created_at)}
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
                <span>
                  {postsPage}/{postPages}
                </span>
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
                {!detailLoading &&
                  posts.map((p) => (
                    <ForumPostCard
                      key={p.id}
                      post={p}
                      canModerate={canModerate}
                      canUseForumActions={canUseForumActions}
                      reportsEnabled={reportsEnabled}
                      isOwner={
                        p.author_user_type === currentUserType && p.author_user_id === currentUserId
                      }
                      reactionEmojis={reactionEmojis}
                      firstReactionEmoji={firstReactionEmoji}
                      reactionsExpanded={!!expandedReactionsByPost[p.id]}
                      reportReason={reportReasonByPost[p.id] || ''}
                      onSetReactionsExpanded={(postId, expanded) =>
                        setExpandedReactionsByPost((prev) => ({ ...prev, [postId]: expanded }))
                      }
                      onReact={handleReactPost}
                      onDelete={handleDeletePost}
                      onReportReasonChange={(postId, value) =>
                        setReportReasonByPost((prev) => ({ ...prev, [postId]: value }))
                      }
                      onReport={handleReportPost}
                    />
                  ))}
              </div>

              {canUseForumActions && (
                <form className="forum-form forum-reply-form" onSubmit={handleReply}>
                  <div className="field">
                    <label htmlFor="forum-reply">Répondre</label>
                    <MarkdownTextarea
                      id="forum-reply"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      required={replyImages.length === 0}
                      disabled={!!threadDetail.is_locked}
                    />
                  </div>
                  <AttachmentImagesPicker
                    value={replyImages}
                    onChange={setReplyImages}
                    disabled={!!threadDetail.is_locked}
                    onNotify={(msg) => setToast(msg)}
                    label="Photos (optionnel, max 3)"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={!!threadDetail.is_locked}
                  >
                    Envoyer
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {toast && <div className="app-inline-toast">{toast}</div>}
    </div>
  );
}

export { ForumView };
