import { AppInlineToast } from '../shared/components/AppInlineToast.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, toggleForumPostReaction } from '../services/api';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useAppDialogs } from '../shared/components/AppDialogsProvider.jsx';
import { formatDateTimeFr } from '../shared/platform/datetime-fr';
import { AttachmentImagesPicker } from './attachment-images-picker';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { ForumPostCard } from './forum/ForumPostCard.jsx';
import {
  applyReactionToggle,
  forumPageCount,
  isForumModerator,
  parseReactionEmojiList,
} from '../utils/forumHelpers.js';
import { IconLock } from '../shared/icons.jsx';

const THREAD_PAGE_SIZE = 20;
const POST_PAGE_SIZE = 50;
/* Même seuil que la bascule une colonne de `.forum-grid` dans index.css. */
const NARROW_QUERY = '(max-width: 1023px)';

function isNarrowViewport() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_QUERY).matches
    : false;
}

function ForumPager({ page, pages, disabled, onChange, label, className = '' }) {
  if (pages <= 1) return null;
  return (
    <nav className={`forum-pager ${className}`} aria-label={label}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page <= 1 || disabled}
        onClick={() => onChange(page - 1)}
      >
        Précédent
      </button>
      <span aria-live="polite">
        Page {page}/{pages}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page >= pages || disabled}
        onClick={() => onChange(page + 1)}
      >
        Suivant
      </button>
    </nav>
  );
}

function ForumView({ authClaims, canParticipateForum = true }) {
  const [threads, setThreads] = useState([]);
  const [threadsPage, setThreadsPage] = useState(1);
  const [threadsTotal, setThreadsTotal] = useState(0);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [threadDetail, setThreadDetail] = useState(null);
  const [posts, setPosts] = useState([]);
  const [expandedReactionsByPost, setExpandedReactionsByPost] = useState({});
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotal, setPostsTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newThreadGroupId, setNewThreadGroupId] = useState('');
  const [groupOptions, setGroupOptions] = useState([]);
  const [newThreadImages, setNewThreadImages] = useState([]);
  const [creating, setCreating] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyImages, setReplyImages] = useState([]);
  const [replying, setReplying] = useState(false);
  const [reportReasonByPost, setReportReasonByPost] = useState({});
  const [toast, setToast] = useState('');
  // Sur écran étroit, liste et discussion ne s'affichent pas ensemble : sans cette bascule,
  // choisir un sujet ne changeait rien à l'écran (la discussion était sous toute la liste).
  const [mobilePane, setMobilePane] = useState('list');

  const threadDetailRequestSeqRef = useRef(0);
  const reactionInFlightRef = useRef(new Set());
  const viewRef = useRef(null);
  const postListRef = useRef(null);
  const newTitleRef = useRef(null);

  useEffect(() => {
    if (composerOpen) newTitleRef.current?.focus();
  }, [composerOpen]);

  const { confirm } = useAppDialogs();
  const canModerate = useMemo(() => isForumModerator(authClaims), [authClaims]);
  const canUseForumActions = canParticipateForum || canModerate;
  const publicSettings = usePublicSettings();
  const reportsEnabled = publicSettings?.modules?.reports_enabled !== false;
  // Emojis de réaction : lus dans les réglages publics déjà fournis par le contexte, comme
  // dans ContextComments. Le forum allait sinon les rechercher lui-même à chaque ouverture
  // (`GET /api/settings/public`), pour une valeur identique à celle déjà en mémoire
  // (cf. docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, T3).
  const reactionEmojis = useMemo(
    () =>
      parseReactionEmojiList(
        publicSettings?.ui?.reactions?.allowed_emojis ||
          publicSettings?.reactions?.allowed_emojis ||
          '',
      ),
    [publicSettings],
  );
  const currentUserType = String(authClaims?.userType || '').toLowerCase();
  const currentUserId = String(authClaims?.canonicalUserId || authClaims?.userId || '');

  // Sans dépendance au sujet sélectionné : la liste se rechargeait (et revenait en page 1)
  // à chaque clic sur un sujet, puisque la fonction changeait d'identité.
  const loadThreads = useCallback(async (page = 1, { silent = false } = {}) => {
    if (!silent) setThreadsLoading(true);
    try {
      const data = await api(`/api/forum/threads?page=${page}&page_size=${THREAD_PAGE_SIZE}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      setThreads(items);
      setThreadsTotal(Number(data?.total || 0));
      setThreadsPage(Number(data?.page || page));
      setSelectedThreadId((prev) => prev || items[0]?.id || '');
    } catch (err) {
      setToast(`Erreur chargement forum : ${err.message}`);
    } finally {
      if (!silent) setThreadsLoading(false);
    }
  }, []);

  const loadThreadDetail = useCallback(async (threadId, page = 1, { silent = false } = {}) => {
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
    if (!silent) setDetailLoading(true);
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
    api('/api/groups/options')
      .then((payload) => setGroupOptions(Array.isArray(payload?.groups) ? payload.groups : []))
      .catch(() => setGroupOptions([]));
  }, []);

  // Rafraîchissements en arrière-plan : sans « Chargement… », qui faisait clignoter la
  // discussion et perdre la position de lecture à chaque message ou réaction d'autrui.
  useEffect(() => {
    const onRealtime = (e) => {
      if (e?.detail?.domain !== 'forum') return;
      loadThreads(threadsPage, { silent: true });
      if (selectedThreadId) loadThreadDetail(selectedThreadId, postsPage, { silent: true });
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [loadThreadDetail, loadThreads, postsPage, selectedThreadId, threadsPage]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const scrollViewTopOnNarrow = () => {
    if (!isNarrowViewport()) return;
    const el = viewRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    }
  };

  const openThread = (threadId) => {
    setSelectedThreadId(threadId);
    setMobilePane('detail');
    scrollViewTopOnNarrow();
  };

  const backToList = () => {
    setMobilePane('list');
    scrollViewTopOnNarrow();
  };

  const scrollPostsToEnd = () => {
    requestAnimationFrame(() => {
      const el = postListRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const handleCreateThread = async (e) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const payload = { title: newTitle, body: newBody.trim() || undefined };
      if (newThreadGroupId) payload.group_id = newThreadGroupId;
      if (newThreadImages.length > 0) payload.images = newThreadImages;
      const res = await api('/api/forum/threads', 'POST', payload);
      setNewTitle('');
      setNewBody('');
      setNewThreadGroupId('');
      setNewThreadImages([]);
      setComposerOpen(false);
      setToast('Sujet créé');
      await loadThreads(1, { silent: true });
      const nextId = res?.thread?.id || '';
      if (nextId) openThread(nextId);
    } catch (err) {
      setToast(`Création impossible : ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!selectedThreadId || replying) return;
    setReplying(true);
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
      // La réponse est le dernier message : on va à la dernière page pour la montrer,
      // au lieu de rester sur une page où elle n'apparaît pas.
      const lastPage = forumPageCount(postsTotal + 1, POST_PAGE_SIZE);
      await loadThreadDetail(selectedThreadId, lastPage, { silent: true });
      scrollPostsToEnd();
      loadThreads(threadsPage, { silent: true });
    } catch (err) {
      setToast(`Réponse impossible : ${err.message}`);
    } finally {
      setReplying(false);
    }
  };

  const handleToggleLock = async () => {
    if (!selectedThreadId || !threadDetail || !canModerate) return;
    const locked = !!Number(threadDetail.is_locked);
    try {
      await api(`/api/forum/threads/${encodeURIComponent(selectedThreadId)}/lock`, 'PATCH', {
        locked: !locked,
      });
      setToast(locked ? 'Sujet déverrouillé' : 'Sujet verrouillé');
      await Promise.all([
        loadThreads(threadsPage, { silent: true }),
        loadThreadDetail(selectedThreadId, postsPage, { silent: true }),
      ]);
    } catch (err) {
      setToast(`Action impossible : ${err.message}`);
    }
  };

  const handleDeletePost = async (postId) => {
    const ok = await confirm({
      title: 'Supprimer le message',
      message: 'Le message sera remplacé par « [message supprimé] » pour tout le monde.',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/forum/posts/${encodeURIComponent(postId)}`, 'DELETE');
      setToast('Message supprimé');
      loadThreads(threadsPage, { silent: true });
      if (selectedThreadId) {
        await loadThreadDetail(selectedThreadId, postsPage, { silent: true });
      }
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
      return true;
    } catch (err) {
      setToast(`Signalement impossible : ${err.message}`);
      return false;
    }
  };

  const handleReactPost = async (postId, emoji) => {
    const key = `${postId}\u0000${emoji}`;
    if (reactionInFlightRef.current.has(key)) return;
    reactionInFlightRef.current.add(key);
    try {
      const res = await toggleForumPostReaction(postId, emoji);
      if (typeof res?.reacted === 'boolean') {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, reactions: applyReactionToggle(p.reactions, emoji, res.reacted) }
              : p,
          ),
        );
      } else {
        await loadThreadDetail(selectedThreadId, postsPage, { silent: true });
      }
    } catch (err) {
      setToast(`Réaction impossible : ${err.message}`);
    } finally {
      reactionInFlightRef.current.delete(key);
    }
  };

  const threadPages = forumPageCount(threadsTotal, THREAD_PAGE_SIZE);
  const postPages = forumPageCount(postsTotal, POST_PAGE_SIZE);
  const firstReactionEmoji = reactionEmojis[0] || '👍';
  const detailLocked = !!Number(threadDetail?.is_locked);

  return (
    <div ref={viewRef} className={`forum-view forum-view--pane-${mobilePane}`}>
      {!canUseForumActions && (
        <section className="fm-panel forum-panel forum-readonly-note">
          <p className="forum-muted">
            Tu consultes le forum en <strong>lecture seule</strong>. La participation (nouveaux
            sujets, réponses, réactions, signalements) n’est pas activée sur ton compte — contacte
            un n3boss si besoin.
          </p>
        </section>
      )}

      {canUseForumActions && composerOpen && (
        <section className="fm-panel forum-panel forum-composer" aria-labelledby="forum-new-title">
          <h3 id="forum-new-title">Nouveau sujet</h3>
          <form className="forum-form" onSubmit={handleCreateThread}>
            <div className="field">
              <label htmlFor="forum-thread-title">Titre</label>
              <input
                id="forum-thread-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                minLength={4}
                maxLength={180}
                required
                ref={newTitleRef}
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
            <div className="forum-form-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                {creating ? 'Publication…' : 'Publier le sujet'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setComposerOpen(false)}
                disabled={creating}
              >
                Annuler
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="forum-grid">
        <section className="fm-panel forum-panel forum-panel--list" aria-label="Sujets du forum">
          <div className="forum-head">
            <h3>Sujets ({threadsTotal})</h3>
            {canUseForumActions && !composerOpen && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setComposerOpen(true);
                  scrollViewTopOnNarrow();
                }}
              >
                + Nouveau sujet
              </button>
            )}
          </div>
          <div className="forum-thread-list">
            {threadsLoading && <p className="forum-muted">Chargement…</p>}
            {!threadsLoading && threads.length === 0 && (
              <div className="empty">
                <p>Aucun sujet pour l’instant.</p>
              </div>
            )}
            {threads.map((t) => {
              const active = selectedThreadId === t.id;
              const count = Number(t.posts_count || 0);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`forum-thread-item ${active ? 'active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => openThread(t.id)}
                >
                  <strong>{t.title}</strong>
                  {(!!Number(t.is_pinned) || !!Number(t.is_locked)) && (
                    <span className="forum-badges">
                      {!!Number(t.is_pinned) && <span className="forum-badge">Épinglé</span>}
                      {!!Number(t.is_locked) && (
                        <span className="forum-badge forum-badge--locked">
                          <IconLock size={12} /> Verrouillé
                        </span>
                      )}
                    </span>
                  )}
                  <span className="forum-meta-line">
                    {t.author_display_name} · {count} message{count > 1 ? 's' : ''}
                  </span>
                  <span className="forum-meta-line">
                    Dernier message : {formatDateTimeFr(t.last_post_at)}
                  </span>
                </button>
              );
            })}
          </div>
          <ForumPager
            page={threadsPage}
            pages={threadPages}
            disabled={threadsLoading}
            onChange={(page) => loadThreads(page)}
            label="Pages des sujets"
          />
        </section>

        <section className="fm-panel forum-panel forum-panel--detail" aria-label="Discussion">
          {!threadDetail ? (
            <div className="empty">
              <p>Choisis un sujet pour voir la discussion.</p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm forum-back-btn"
                onClick={backToList}
              >
                ← Tous les sujets
              </button>
              <div className="forum-head">
                <div className="forum-head__title">
                  <h3>{threadDetail.title}</h3>
                  <p className="forum-muted">
                    Par {threadDetail.author_display_name} · créé le{' '}
                    {formatDateTimeFr(threadDetail.created_at)}
                    {detailLocked && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="forum-badge forum-badge--locked">
                          <IconLock size={12} /> Verrouillé
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {canModerate && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleToggleLock}>
                    {detailLocked ? 'Déverrouiller' : 'Verrouiller'}
                  </button>
                )}
              </div>

              <ForumPager
                page={postsPage}
                pages={postPages}
                disabled={detailLoading}
                onChange={(page) => loadThreadDetail(selectedThreadId, page)}
                label="Pages de la discussion"
                className="forum-pager--posts"
              />

              <div className="forum-post-list" ref={postListRef}>
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
                        p.author_user_type === currentUserType &&
                        String(p.author_user_id) === currentUserId
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

              {detailLocked ? (
                <p className="forum-locked-note" role="status">
                  <IconLock size={14} /> Sujet verrouillé : les réponses sont fermées.
                </p>
              ) : (
                canUseForumActions && (
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
                      />
                    </div>
                    <AttachmentImagesPicker
                      value={replyImages}
                      onChange={setReplyImages}
                      onNotify={(msg) => setToast(msg)}
                      label="Photos (optionnel, max 3)"
                    />
                    <div className="forum-form-actions">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={replying}>
                        {replying ? 'Envoi…' : 'Envoyer'}
                      </button>
                    </div>
                  </form>
                )
              )}
            </>
          )}
        </section>
      </div>

      <AppInlineToast>{toast}</AppInlineToast>
    </div>
  );
}

export { ForumView };
