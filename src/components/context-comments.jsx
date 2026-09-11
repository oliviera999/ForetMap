import { AppInlineToast } from '../shared/components/AppInlineToast.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createContextComment,
  deleteContextComment,
  getAuthClaims,
  listContextComments,
  reportContextComment,
  toggleContextCommentReaction,
} from '../services/api';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { ContextCommentForm } from './context-comments/ContextCommentForm.jsx';
import { ContextCommentItem } from './context-comments/ContextCommentItem.jsx';
import { ContextCommentsToggle } from './context-comments/ContextCommentsToggle.jsx';
import {
  canModerate,
  parseReactionEmojiList,
  readContextCommentDraft,
  readContextCommentReadCursor,
  writeContextCommentDraft,
  writeContextCommentReadCursor,
} from '../utils/contextCommentsHelpers.js';

const PAGE_SIZE = 10;

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
  const publicSettings = usePublicSettings();
  const reportsEnabled = publicSettings?.modules?.reports_enabled !== false;
  const reactionEmojis = useMemo(
    () =>
      parseReactionEmojiList(
        publicSettings?.ui?.reactions?.allowed_emojis ||
          publicSettings?.reactions?.allowed_emojis ||
          '',
      ),
    [publicSettings],
  );
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

  const applyUnreadFromFirstPage = useCallback(
    (list) => {
      const newestId = list?.[0]?.id != null ? Number(list[0].id) : 0;
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
    },
    [contextId, contextType, currentUserId, currentUserType],
  );

  const loadSeqRef = useRef(0);
  const load = useCallback(
    async (nextPage = 1) => {
      if (!contextType || !contextId) return;
      const mySeq = ++loadSeqRef.current;
      setLoading(true);
      try {
        const data = await listContextComments({
          contextType,
          contextId,
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        if (mySeq !== loadSeqRef.current) return;
        const list = Array.isArray(data?.items) ? data.items : [];
        setItems(list);
        setTotal(Number(data?.total || 0));
        setPage(Number(data?.page || nextPage));
        if (nextPage === 1) {
          applyUnreadFromFirstPage(list);
          markCommentsRead(list);
        }
      } catch (err) {
        if (mySeq !== loadSeqRef.current) return;
        setToast(`Chargement impossible : ${err.message}`);
      } finally {
        if (mySeq === loadSeqRef.current) setLoading(false);
      }
    },
    [contextId, contextType, applyUnreadFromFirstPage, markCommentsRead],
  );

  useEffect(() => {
    const draft = readContextCommentDraft(contextType, contextId);
    setBody(draft);
    setIsOpen(defaultOpen || !!String(draft || '').trim());
  }, [contextType, contextId, defaultOpen]);

  useEffect(() => {
    setHasUnreadComments(false);
    setItems([]);
    setTotal(0);
    setPage(1);
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

  // D1-A : aucun GET tant que la section est fermée (listes tâches / tutoriels).
  useEffect(() => {
    if (!contextType || contextId == null || contextId === '') return;
    if (!isOpen) return;
    setExpandedReactionsByComment({});
    void load(1);
  }, [isOpen, contextType, contextId, load]);

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
      if (!isOpen) {
        setHasUnreadComments(true);
        return;
      }
      void load(page);
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [contextId, contextType, isOpen, load, page]);

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
      await load(1);
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
      await load(page);
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
      await load(page);
    } catch (err) {
      setToast(`Réaction impossible : ${err.message}`);
    }
  };

  if (!contextType || !contextId) return null;
  const firstReactionEmoji = reactionEmojis[0] || '👍';

  const renderCommentItems = (list) =>
    list.map((item) => (
      <ContextCommentItem
        key={item.id}
        item={item}
        currentUserType={currentUserType}
        currentUserId={currentUserId}
        allowModeration={allowModeration}
        canUseCommentActions={canUseCommentActions}
        reportsEnabled={reportsEnabled}
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
              style={{
                margin: '0 0 10px',
                lineHeight: 'var(--lh-normal)',
                fontSize: 'var(--text-sm)',
              }}
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
              onClick={() => load(page - 1)}
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
              onClick={() => load(page + 1)}
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      <AppInlineToast>{toast}</AppInlineToast>
    </section>
  );
}

export { ContextComments };
