import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppInlineToast } from '../components/AppInlineToast.jsx';
import { useAppDialogs } from '../components/AppDialogsProvider.jsx';
import { formatDateTimeFr } from '../platform/datetime-fr';
import { IconLock } from '../icons.jsx';
import { ForumPostCard } from './ForumPostCard.jsx';
import { ForumNewThreadForm, ForumReplyForm } from './ForumComposer.jsx';
import { ForumPager } from './ForumPager.jsx';
import { ForumReportsPanel } from './ForumReportsPanel.jsx';
import { ForumPlainEditor, SharedForumMarkdown } from './SharedForumMarkdown.jsx';
import {
  appendQuoteToDraft,
  applyReactionToggle,
  buildQuoteMarkdown,
  forumPageCount,
  sameForumId,
} from './forumHelpers.js';
import { forumBtn, isForumNarrowViewport } from './forumUi.js';
import { useForumThreads } from './useForumThreads.js';
import { useForumThreadUnread } from './useForumThreadUnread.js';

const THREAD_PAGE_SIZE = 20;
const POST_PAGE_SIZE = 50;
const DEFAULT_LIMITS = Object.freeze({ titleMin: 3, titleMax: 180, bodyMax: 4000 });
const EMPTY_DRAFT = Object.freeze({ title: '', body: '', groupId: '', images: [] });

/**
 * Forum commun ForetMap / G&L. Tout ce qui distingue les produits arrive par les props :
 * - `adapter` (routes et client HTTP, capacités : groupes, réponse du MJ dans un sujet
 *   verrouillé) — `createForumAdapter` ;
 * - `Markdown` / `Editor` : rendu et saisie (ForetMap : glossaire + éditeur visuel) ;
 * - droits (`canModerate`, `canParticipate`), réglages (`reactionEmojis`, `reportsEnabled`) ;
 * - `refreshSignal` : incrémenté par l'enveloppe à chaque événement temps réel.
 */
export function SharedForumView({
  adapter,
  currentUser,
  unreadStorageKey = '',
  canModerate = false,
  canParticipate = true,
  reportsEnabled = true,
  reactionEmojis = [],
  limits = DEFAULT_LIMITS,
  groupOptions = [],
  Markdown = SharedForumMarkdown,
  Editor = ForumPlainEditor,
  readOnlyNote = null,
  refreshSignal = 0,
  threadListAttrs = undefined,
  threadRequest = null,
  onThreadRequestHandled = null,
}) {
  const [toast, setToast] = useState('');
  const {
    threads,
    total: threadsTotal,
    page: threadsPage,
    loading: threadsLoading,
    loaded: threadsLoaded,
    load: loadThreads,
  } = useForumThreads(adapter, { pageSize: THREAD_PAGE_SIZE, onError: setToast });

  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [threadDetail, setThreadDetail] = useState(null);
  const [posts, setPosts] = useState([]);
  const [expandedReactionsByPost, setExpandedReactionsByPost] = useState({});
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotal, setPostsTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyImages, setReplyImages] = useState([]);
  const [replying, setReplying] = useState(false);
  const [reportReasonByPost, setReportReasonByPost] = useState({});

  const [reportsOpen, setReportsOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportBusyId, setReportBusyId] = useState(null);

  // Écran étroit : liste OU discussion. Sans cette bascule, choisir un sujet ne changeait
  // rien à l'écran (la discussion était sous toute la liste).
  const [mobilePane, setMobilePane] = useState('list');

  const threadDetailRequestSeqRef = useRef(0);
  const reactionInFlightRef = useRef(new Set());
  const viewRef = useRef(null);
  const postListRef = useRef(null);
  const replyEditorRef = useRef(null);

  const { confirm } = useAppDialogs();
  const canUseForumActions = canParticipate || canModerate;
  const moderatorCanReplyLocked = !!adapter.capabilities?.moderatorCanReplyLocked;
  const currentUserType = String(currentUser?.userType || '').toLowerCase();
  const currentUserId = String(currentUser?.userId ?? '');
  const firstReactionEmoji = reactionEmojis[0] || '👍';

  const isOwnPost = useCallback(
    (p) =>
      String(p.author_user_type || '').toLowerCase() === currentUserType &&
      String(p.author_user_id) === currentUserId,
    [currentUserId, currentUserType],
  );

  const loadThreadDetail = useCallback(
    async (threadId, page = 1, { silent = false } = {}) => {
      if (threadId == null || threadId === '') {
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
        const data = await adapter.getThread(threadId, { page, pageSize: POST_PAGE_SIZE });
        if (seq !== threadDetailRequestSeqRef.current) return;
        setThreadDetail(data?.thread || null);
        setPosts(Array.isArray(data?.posts) ? data.posts : []);
        setPostsTotal(Number(data?.total_posts ?? data?.posts?.length ?? 0));
        setPostsPage(Number(data?.page || page));
      } catch (err) {
        if (seq !== threadDetailRequestSeqRef.current) return;
        setToast(`Erreur chargement sujet : ${err.message}`);
      } finally {
        if (seq === threadDetailRequestSeqRef.current) setDetailLoading(false);
      }
    },
    [adapter],
  );

  const loadReports = useCallback(async () => {
    if (!canModerate) return;
    setReportsLoading(true);
    try {
      const data = await adapter.listReports({ status: 'open' });
      setReports(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [adapter, canModerate]);

  useEffect(() => {
    loadThreads(1).then((items) => {
      // Sur grand écran, la discussion est visible à côté de la liste : on ouvre le premier
      // sujet. Sur écran étroit, on reste sur la liste (l'ouvrir le marquerait lu à tort).
      if (items?.length && !isForumNarrowViewport()) {
        setSelectedThreadId((prev) => prev ?? items[0].id);
      }
    });
  }, [loadThreads]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (selectedThreadId == null) return;
    setExpandedReactionsByPost({});
    loadThreadDetail(selectedThreadId, 1);
  }, [loadThreadDetail, selectedThreadId]);

  // Rafraîchissements en arrière-plan (temps réel) : sans « Chargement… », qui faisait
  // clignoter la discussion et perdre la position de lecture.
  const refreshStateRef = useRef({});
  refreshStateRef.current = { threadsPage, postsPage, selectedThreadId };
  useEffect(() => {
    if (!refreshSignal) return;
    const { threadsPage: tp, postsPage: pp, selectedThreadId: sel } = refreshStateRef.current;
    loadThreads(tp, { silent: true });
    if (sel != null) loadThreadDetail(sel, pp, { silent: true });
    loadReports();
  }, [loadReports, loadThreadDetail, loadThreads, refreshSignal]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const readingThreadId =
    mobilePane === 'detail' || !isForumNarrowViewport() ? selectedThreadId : null;
  const { isUnread } = useForumThreadUnread({
    storageKey: unreadStorageKey,
    threads,
    loaded: threadsLoaded,
    activeThreadId: readingThreadId,
  });

  const scrollViewTopOnNarrow = () => {
    if (!isForumNarrowViewport()) return;
    const el = viewRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    }
  };

  const openThread = (threadId) => {
    setSelectedThreadId(threadId);
    setMobilePane('detail');
    setReportsOpen(false);
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

  // Notification / lien direct : ouvre le sujet demandé puis amène la réponse visée à
  // l'écran (en passant à la page qui la contient si besoin). Une seule fois par nonce.
  const handledThreadRequestRef = useRef(null);
  const [pendingPostId, setPendingPostId] = useState('');
  useEffect(() => {
    if (!threadRequest?.id || handledThreadRequestRef.current === threadRequest.nonce) return;
    handledThreadRequestRef.current = threadRequest.nonce;
    setSelectedThreadId(threadRequest.id);
    setMobilePane('detail');
    setReportsOpen(false);
    setPendingPostId(threadRequest.postId ? String(threadRequest.postId) : '');
    onThreadRequestHandled?.(threadRequest.nonce);
  }, [threadRequest, onThreadRequestHandled]);
  useEffect(() => {
    if (!pendingPostId || detailLoading) return;
    if (!threadDetail || !sameForumId(threadDetail.id, selectedThreadId)) return;
    const onPage = posts.some((p) => String(p.id) === pendingPostId);
    const lastPage = forumPageCount(postsTotal, POST_PAGE_SIZE);
    if (!onPage && postsPage < lastPage) {
      loadThreadDetail(selectedThreadId, lastPage);
      return;
    }
    setPendingPostId('');
    if (!onPage) return;
    requestAnimationFrame(() => {
      const el = Array.from(postListRef.current?.querySelectorAll?.('[data-post-id]') || []).find(
        (node) => node.getAttribute('data-post-id') === pendingPostId,
      );
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    });
  }, [
    pendingPostId,
    detailLoading,
    threadDetail,
    selectedThreadId,
    posts,
    postsPage,
    postsTotal,
    loadThreadDetail,
  ]);

  const refreshAfterAction = async () => {
    await Promise.all([
      loadThreads(threadsPage, { silent: true }),
      selectedThreadId != null
        ? loadThreadDetail(selectedThreadId, postsPage, { silent: true })
        : null,
    ]);
  };

  const handleCreateThread = async (e) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const payload = { title: draft.title, body: draft.body.trim() || undefined };
      if (draft.groupId) payload.group_id = draft.groupId;
      if (draft.images.length > 0) payload.images = draft.images;
      const res = await adapter.createThread(payload);
      setDraft(EMPTY_DRAFT);
      setComposerOpen(false);
      setToast('Sujet créé');
      await loadThreads(1, { silent: true });
      const nextId = res?.thread?.id;
      if (nextId != null) openThread(nextId);
    } catch (err) {
      setToast(`Création impossible : ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (selectedThreadId == null || replying) return;
    setReplying(true);
    try {
      const payload = { body: replyBody.trim() || undefined };
      if (replyImages.length > 0) payload.images = replyImages;
      await adapter.reply(selectedThreadId, payload);
      setReplyBody('');
      setReplyImages([]);
      setToast('Réponse publiée');
      // La réponse est le dernier message : on va à la dernière page pour la montrer.
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

  const handleToggleFlag = async (kind) => {
    if (selectedThreadId == null || !threadDetail || !canModerate) return;
    const current = !!Number(kind === 'lock' ? threadDetail.is_locked : threadDetail.is_pinned);
    try {
      if (kind === 'lock') {
        await adapter.setLocked(selectedThreadId, !current);
        setToast(current ? 'Sujet déverrouillé' : 'Sujet verrouillé');
      } else {
        await adapter.setPinned(selectedThreadId, !current);
        setToast(current ? 'Sujet désépinglé' : 'Sujet épinglé');
      }
      await refreshAfterAction();
    } catch (err) {
      setToast(`Action impossible : ${err.message}`);
    }
  };

  const deletePost = async (postId) => {
    const ok = await confirm({
      title: 'Supprimer le message',
      message: 'Le message sera remplacé par « [message supprimé] » pour tout le monde.',
      danger: true,
    });
    if (!ok) return false;
    try {
      await adapter.deletePost(postId);
      setToast('Message supprimé');
      await refreshAfterAction();
      return true;
    } catch (err) {
      setToast(`Suppression impossible : ${err.message}`);
      return false;
    }
  };

  const handleEditPost = async (postId, body) => {
    try {
      const updated = await adapter.editPost(postId, body);
      setPosts((prev) =>
        prev.map((p) =>
          sameForumId(p.id, postId)
            ? { ...p, ...(updated && typeof updated === 'object' ? updated : { body }) }
            : p,
        ),
      );
      setToast('Message modifié');
      return true;
    } catch (err) {
      setToast(`Modification impossible : ${err.message}`);
      return false;
    }
  };

  const handleQuotePost = (post) => {
    setReplyBody((prev) => appendQuoteToDraft(prev, buildQuoteMarkdown(post)));
    requestAnimationFrame(() => replyEditorRef.current?.focus?.());
  };

  const handleReportPost = async (postId) => {
    const reason = String(reportReasonByPost[postId] || '').trim();
    try {
      await adapter.report(postId, reason);
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
      const res = await adapter.toggleReaction(postId, emoji);
      if (typeof res?.reacted === 'boolean') {
        setPosts((prev) =>
          prev.map((p) =>
            sameForumId(p.id, postId)
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

  const handleReportDelete = async (report) => {
    setReportBusyId(report.id);
    try {
      if (await deletePost(report.post_id)) await loadReports();
    } finally {
      setReportBusyId(null);
    }
  };

  const handleReportResolve = async (report, status) => {
    setReportBusyId(report.id);
    try {
      await adapter.resolveReport(report.id, status);
      setToast(status === 'dismissed' ? 'Signalement classé sans suite' : 'Signalement traité');
      await loadReports();
    } catch (err) {
      setToast(`Action impossible : ${err.message}`);
    } finally {
      setReportBusyId(null);
    }
  };

  const threadPages = forumPageCount(threadsTotal, THREAD_PAGE_SIZE);
  const postPages = forumPageCount(postsTotal, POST_PAGE_SIZE);
  const detailLocked = !!Number(threadDetail?.is_locked);
  const detailPinned = !!Number(threadDetail?.is_pinned);
  const canReply =
    canUseForumActions && (!detailLocked || (canModerate && moderatorCanReplyLocked));
  const openReportsCount = reports.length;

  const readOnlyBanner = useMemo(
    () =>
      canUseForumActions ? null : (
        <section className="fm-panel forum-panel forum-readonly-note">
          {readOnlyNote || (
            <p className="forum-muted">
              Tu consultes le forum en <strong>lecture seule</strong>.
            </p>
          )}
        </section>
      ),
    [canUseForumActions, readOnlyNote],
  );

  return (
    <div ref={viewRef} className={`forum-view forum-view--pane-${mobilePane}`}>
      {readOnlyBanner}

      {canModerate && reportsOpen && (
        <ForumReportsPanel
          reports={reports}
          loading={reportsLoading}
          busyId={reportBusyId}
          onOpenThread={openThread}
          onDeletePost={handleReportDelete}
          onResolve={handleReportResolve}
          onClose={() => setReportsOpen(false)}
        />
      )}

      {canUseForumActions && composerOpen && (
        <ForumNewThreadForm
          draft={draft}
          onDraftChange={setDraft}
          groupOptions={adapter.capabilities?.groups ? groupOptions : []}
          limits={limits}
          Editor={Editor}
          submitting={creating}
          onSubmit={handleCreateThread}
          onCancel={() => setComposerOpen(false)}
          onNotify={setToast}
        />
      )}

      <div className="forum-grid">
        <section className="fm-panel forum-panel forum-panel--list" aria-label="Sujets du forum">
          <div className="forum-head">
            <h3>Sujets ({threadsTotal})</h3>
            <div className="forum-head__actions">
              {canModerate && (
                <button
                  type="button"
                  className={forumBtn(openReportsCount > 0 ? 'secondary' : 'ghost')}
                  aria-expanded={reportsOpen}
                  onClick={() => {
                    setReportsOpen((v) => !v);
                    if (!reportsOpen) loadReports();
                    scrollViewTopOnNarrow();
                  }}
                >
                  Signalements ({openReportsCount})
                </button>
              )}
              {canUseForumActions && !composerOpen && (
                <button
                  type="button"
                  className={forumBtn('primary')}
                  onClick={() => {
                    setComposerOpen(true);
                    scrollViewTopOnNarrow();
                  }}
                >
                  + Nouveau sujet
                </button>
              )}
            </div>
          </div>
          <div className="forum-thread-list" {...threadListAttrs}>
            {threadsLoading && <p className="forum-muted">Chargement…</p>}
            {!threadsLoading && threads.length === 0 && (
              <p className="forum-empty">Aucun sujet pour l’instant.</p>
            )}
            {threads.map((t) => {
              const active = sameForumId(selectedThreadId, t.id);
              const unread = isUnread(t);
              const count = Number(t.posts_count || 0);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`forum-thread-item ${active ? 'active' : ''} ${unread ? 'is-unread' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => openThread(t.id)}
                >
                  <span className="forum-thread-item__title">
                    {unread && (
                      <span
                        className="forum-unread-dot"
                        role="img"
                        aria-label="Nouveaux messages"
                      />
                    )}
                    <strong>{t.title}</strong>
                  </span>
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
                    Dernier message : {formatDateTimeFr(t.last_post_at || t.updated_at)}
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
            <p className="forum-empty">Choisis un sujet pour voir la discussion.</p>
          ) : (
            <>
              <button
                type="button"
                className={`${forumBtn('ghost')} forum-back-btn`}
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
                    {detailPinned && (
                      <>
                        {' '}
                        · <span className="forum-badge">Épinglé</span>
                      </>
                    )}
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
                  <div className="forum-head__actions">
                    <button
                      type="button"
                      className={forumBtn('ghost')}
                      onClick={() => handleToggleFlag('pin')}
                    >
                      {detailPinned ? 'Désépingler' : 'Épingler'}
                    </button>
                    <button
                      type="button"
                      className={forumBtn('ghost')}
                      onClick={() => handleToggleFlag('lock')}
                    >
                      {detailLocked ? 'Déverrouiller' : 'Verrouiller'}
                    </button>
                  </div>
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
                {!detailLoading && posts.length === 0 && (
                  <p className="forum-empty">Aucun message.</p>
                )}
                {!detailLoading &&
                  posts.map((p) => {
                    const own = isOwnPost(p);
                    return (
                      <ForumPostCard
                        key={p.id}
                        post={p}
                        canModerate={canModerate}
                        canUseForumActions={canUseForumActions}
                        canEdit={own && canParticipate && canReply}
                        canQuote={canReply}
                        reportsEnabled={reportsEnabled}
                        isOwner={own}
                        reactionEmojis={reactionEmojis}
                        firstReactionEmoji={firstReactionEmoji}
                        reactionsExpanded={!!expandedReactionsByPost[p.id]}
                        reportReason={reportReasonByPost[p.id] || ''}
                        maxBodyLength={limits.bodyMax}
                        Markdown={Markdown}
                        onSetReactionsExpanded={(postId, expanded) =>
                          setExpandedReactionsByPost((prev) => ({ ...prev, [postId]: expanded }))
                        }
                        onReact={handleReactPost}
                        onDelete={deletePost}
                        onReportReasonChange={(postId, value) =>
                          setReportReasonByPost((prev) => ({ ...prev, [postId]: value }))
                        }
                        onReport={handleReportPost}
                        onQuote={handleQuotePost}
                        onEdit={handleEditPost}
                      />
                    );
                  })}
              </div>

              {canReply ? (
                <ForumReplyForm
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  images={replyImages}
                  onImagesChange={setReplyImages}
                  limits={limits}
                  Editor={Editor}
                  editorRef={replyEditorRef}
                  submitting={replying}
                  onSubmit={handleReply}
                  onNotify={setToast}
                  lockedNote={
                    detailLocked ? (
                      <p className="forum-locked-note" role="status">
                        <IconLock size={14} /> Sujet verrouillé : seuls les modérateurs peuvent
                        encore répondre.
                      </p>
                    ) : null
                  }
                />
              ) : (
                detailLocked && (
                  <p className="forum-locked-note" role="status">
                    <IconLock size={14} /> Sujet verrouillé : les réponses sont fermées.
                  </p>
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
