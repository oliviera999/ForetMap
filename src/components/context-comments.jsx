import React, { useCallback, useEffect, useState } from 'react';
import {
  api,
  createContextComment,
  deleteContextComment,
  getAuthClaims,
  listContextComments,
  reportContextComment,
  toggleContextCommentReaction,
} from '../services/api';
import { ContextCommentForm } from './context-comments/ContextCommentForm.jsx';
import { ContextCommentItem } from './context-comments/ContextCommentItem.jsx';
import { ContextCommentsToggle } from './context-comments/ContextCommentsToggle.jsx';
import {
  CONTEXT_COMMENT_PREVIEW_SIZE,
  DEFAULT_REACTION_EMOJIS,
  canModerate,
  parseReactionEmojiList,
  readContextCommentDraft,
  readContextCommentReadCursor,
  writeContextCommentDraft,
  writeContextCommentReadCursor,
} from '../utils/contextCommentsHelpers.js';

const PAGE_SIZE = 10;
const PREVIEW_SIZE = CONTEXT_COMMENT_PREVIEW_SIZE;

function ContextComments({
  contextType,
  contextId,
  title = 'Commentaires',
  placeholder = 'Ajouter un commentaire...',
  defaultOpen = false,
  canParticipateContextComments = true,
}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reactionEmojis, setReactionEmojis] = useState(DEFAULT_REACTION_EMOJIS);
  const [expandedReactionsByComment, setExpandedReactionsByComment] = useState({});
  const [body, setBody] = useState(() => readContextCommentDraft(contextType, contextId));
  const [pendingImages, setPendingImages] = useState([]);
  const [reportReasonById, setReportReasonById] = useState({});
  const [toast, setToast] = useState('');
  const [authClaims, setAuthClaims] = useState(() => getAuthClaims());
  const [hasUnreadComments, setHasUnreadComments] = useState(false);
  const [isOpen, setIsOpen] = useState(
    () => defaultOpen || !!String(readContextCommentDraft(contextType, contextId) || '').trim(),
  );

  const currentUserType = String(authClaims?.userType || '').toLowerCase();
  const currentUserId = String(authClaims?.canonicalUserId || authClaims?.userId || '');
  const allowModeration = canModerate(authClaims);
  const canUseCommentActions = canParticipateContextComments;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const markCommentsRead = useCallback(
    (list) => {
      if (!currentUserType || !currentUserId || !Array.isArray(list) || list.length === 0) return;
      const newestId = list[0]?.id != null ? Number(list[0].id) : 0;
      writeContextCommentReadCursor(
        currentUserType,
        currentUserId,
        contextType,
        contextId,
        newestId,
      );
      setHasUnreadComments(false);
    },
    [contextId, contextType, currentUserId, currentUserType],
  );

  const load = useCallback(
    async (nextPage = 1, { mode = 'preview' } = {}) => {
      if (!contextType || !contextId) return;
      const pageSize = mode === 'full' ? PAGE_SIZE : PREVIEW_SIZE;
      setLoading(true);
      try {
        const data = await listContextComments({
          contextType,
          contextId,
          page: nextPage,
          pageSize,
        });
        const list = Array.isArray(data?.items) ? data.items : [];
        setItems(list);
        setTotal(Number(data?.total || 0));
        setPage(Number(data?.page || nextPage));
        if (nextPage === 1 && mode === 'full') markCommentsRead(list);
      } catch (err) {
        setToast(`Chargement impossible : ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [contextId, contextType, markCommentsRead],
  );

  /** Même section repliée : le badge doit afficher le bon total (l’API renvoie total avec page_size minimal). */
  const refreshTotal = useCallback(async () => {
    if (!contextType || !contextId) return;
    try {
      const data = await listContextComments({ contextType, contextId, page: 1, pageSize: 1 });
      setTotal(Number(data?.total || 0));
      const newestId = data?.items?.[0]?.id != null ? Number(data.items[0].id) : 0;
      const cursor = readContextCommentReadCursor(
        currentUserType,
        currentUserId,
        contextType,
        contextId,
      );
      setHasUnreadComments((prev) => {
        if (cursor && newestId > cursor.newestId) return true;
        if (cursor && newestId <= cursor.newestId) return false;
        return prev;
      });
    } catch {
      // Silencieux : pas de toast pour un compteur en arrière-plan
    }
  }, [contextId, contextType, currentUserId, currentUserType]);

  useEffect(() => {
    const draft = readContextCommentDraft(contextType, contextId);
    setBody(draft);
    setIsOpen(defaultOpen || !!String(draft || '').trim());
  }, [contextType, contextId, defaultOpen]);

  useEffect(() => {
    setHasUnreadComments(false);
  }, [contextType, contextId]);

  useEffect(() => {
    const t = setTimeout(() => {
      writeContextCommentDraft(contextType, contextId, body);
    }, 200);
    return () => {
      clearTimeout(t);
      writeContextCommentDraft(contextType, contextId, body);
    };
  }, [body, contextType, contextId]);

  useEffect(() => {
    if (!contextType || contextId == null || contextId === '') return;
    if (isOpen) setExpandedReactionsByComment({});
    load(1, { mode: isOpen ? 'full' : 'preview' });
  }, [isOpen, contextType, contextId, load]);

  useEffect(() => {
    if (!contextType || contextId == null || contextId === '') return;
    refreshTotal();
  }, [contextType, contextId, refreshTotal]);

  useEffect(() => {
    if (!contextType || contextId == null || contextId === '') return undefined;
    const sameContext = (payload) =>
      String(payload?.contextType || '') === String(contextType || '') &&
      String(payload?.contextId ?? '') === String(contextId ?? '');
    const onRealtime = (e) => {
      const detail = e?.detail || {};
      if (detail.domain !== 'context_comments') return;
      const payload = detail.payload || {};
      if (!sameContext(payload)) return;
      if (!isOpen) setHasUnreadComments(true);
      refreshTotal();
      load(isOpen ? page : 1, { mode: isOpen ? 'full' : 'preview' });
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [contextId, contextType, isOpen, load, page, refreshTotal]);

  useEffect(() => {
    const refreshAuth = () => setAuthClaims(getAuthClaims());
    window.addEventListener('foretmap_session_changed', refreshAuth);
    window.addEventListener('foretmap_teacher_expired', refreshAuth);
    window.addEventListener('storage', refreshAuth);
    return () => {
      window.removeEventListener('foretmap_session_changed', refreshAuth);
      window.removeEventListener('foretmap_teacher_expired', refreshAuth);
      window.removeEventListener('storage', refreshAuth);
    };
  }, []);

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
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const submit = async (e) => {
    e.preventDefault();
    if ((!body.trim() && pendingImages.length === 0) || !contextType || !contextId) return;
    setSubmitting(true);
    try {
      await createContextComment({
        contextType,
        contextId,
        body: body.trim() || undefined,
        images: pendingImages.length ? pendingImages : undefined,
      });
      setBody('');
      setPendingImages([]);
      writeContextCommentDraft(contextType, contextId, '');
      setToast('Commentaire publié');
      await load(1, { mode: 'full' });
    } catch (err) {
      setToast(`Publication impossible : ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (commentId) => {
    try {
      await deleteContextComment(commentId);
      setToast('Commentaire supprimé');
      await load(page, { mode: 'full' });
    } catch (err) {
      setToast(`Suppression impossible : ${err.message}`);
    }
  };

  const report = async (commentId) => {
    const reason = String(reportReasonById[commentId] || '').trim();
    try {
      await reportContextComment(commentId, reason);
      setReportReasonById((prev) => ({ ...prev, [commentId]: '' }));
      setToast('Signalement envoyé');
    } catch (err) {
      setToast(`Signalement impossible : ${err.message}`);
    }
  };

  const react = async (commentId, emoji) => {
    try {
      await toggleContextCommentReaction(commentId, emoji);
      await load(page, { mode: 'full' });
    } catch (err) {
      setToast(`Réaction impossible : ${err.message}`);
    }
  };

  if (!contextType || !contextId) return null;
  const firstReactionEmoji = reactionEmojis[0] || '👍';
  const hiddenCount = Math.max(0, total - PREVIEW_SIZE);

  const renderCommentItems = (list) =>
    list.map((item) => (
      <ContextCommentItem
        key={item.id}
        item={item}
        currentUserType={currentUserType}
        currentUserId={currentUserId}
        allowModeration={allowModeration}
        canUseCommentActions={canUseCommentActions}
        reactionEmojis={reactionEmojis}
        firstReactionEmoji={firstReactionEmoji}
        reactionsExpanded={!!expandedReactionsByComment[item.id]}
        onExpandReactions={() =>
          setExpandedReactionsByComment((prev) => ({ ...prev, [item.id]: true }))
        }
        onCollapseReactions={() =>
          setExpandedReactionsByComment((prev) => ({ ...prev, [item.id]: false }))
        }
        onReact={react}
        onRemove={remove}
        reportReason={reportReasonById[item.id] || ''}
        onReportReasonChange={(id, value) =>
          setReportReasonById((prev) => ({ ...prev, [id]: value }))
        }
        onReport={report}
      />
    ));

  return (
    <section className="context-comments">
      <ContextCommentsToggle
        title={title}
        total={total}
        isOpen={isOpen}
        hasUnreadComments={hasUnreadComments}
        onToggle={() => setIsOpen((prev) => !prev)}
      />

      {!isOpen && (
        <div className="context-comments-preview">
          {loading && items.length === 0 && <p className="forum-muted">Chargement…</p>}
          {!loading && items.length === 0 && (
            <p className="forum-muted">Aucun commentaire pour l’instant.</p>
          )}
          <div className="context-comments-list">{renderCommentItems(items)}</div>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="context-comments-show-more btn btn-ghost btn-sm"
              onClick={() => setIsOpen(true)}
            >
              {hiddenCount} commentaire{hiddenCount > 1 ? 's' : ''} de plus…
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className="context-comments-body">
          {canUseCommentActions ? (
            <ContextCommentForm
              body={body}
              onBodyChange={setBody}
              pendingImages={pendingImages}
              onPendingImagesChange={setPendingImages}
              placeholder={placeholder}
              submitting={submitting}
              onSubmit={submit}
              onNotify={(msg) => setToast(msg)}
            />
          ) : (
            <p
              className="forum-muted"
              style={{ margin: '0 0 10px', lineHeight: 1.5, fontSize: '.85rem' }}
            >
              Lecture seule : tu peux consulter les commentaires ; la publication n’est pas activée
              sur ton compte.
            </p>
          )}

          <div className="context-comments-list">
            {loading && <p className="forum-muted">Chargement…</p>}
            {!loading && items.length === 0 && (
              <p className="forum-muted">Aucun commentaire pour l’instant.</p>
            )}
            {renderCommentItems(items)}
          </div>

          <div className="context-comments-pager">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1, { mode: 'full' })}
            >
              Précédent
            </button>
            <span>
              {page}/{pages}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page >= pages || loading}
              onClick={() => load(page + 1, { mode: 'full' })}
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {toast && <div className="app-inline-toast">{toast}</div>}
    </section>
  );
}

export { ContextComments };
