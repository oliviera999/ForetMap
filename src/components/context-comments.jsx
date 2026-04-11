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
import { formatDateTimeFr } from '../utils/datetime-fr';

const PAGE_SIZE = 10;
const DEFAULT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏'];

/** Brouillon commentaire : survit au remontage des tuiles tâche (rafraîchissement liste / changement de section). */
function contextCommentDraftKey(contextType, contextId) {
  return `foretmap:contextCommentDraft:${String(contextType || '')}:${String(contextId ?? '')}`;
}

function readContextCommentDraft(contextType, contextId) {
  if (typeof window === 'undefined') return '';
  try {
    return String(sessionStorage.getItem(contextCommentDraftKey(contextType, contextId)) || '');
  } catch {
    return '';
  }
}

function writeContextCommentDraft(contextType, contextId, text) {
  if (typeof window === 'undefined') return;
  if (!contextType || contextId == null || contextId === '') return;
  try {
    const key = contextCommentDraftKey(contextType, contextId);
    const v = String(text || '');
    if (v.trim()) sessionStorage.setItem(key, v);
    else sessionStorage.removeItem(key);
  } catch {
    // quota / mode privé : ignorer
  }
}

/** Dernier commentaire « lu » pour ce contexte (persisté, par utilisateur). */
function contextCommentReadCursorKey(userType, userId, contextType, contextId) {
  return `foretmap:contextCommentReadCursor:${String(userType || '')}:${String(userId || '')}:${String(contextType || '')}:${String(contextId ?? '')}`;
}

function readContextCommentReadCursor(userType, userId, contextType, contextId) {
  if (typeof window === 'undefined') return null;
  if (!userType || !userId || !contextType || contextId == null || contextId === '') return null;
  try {
    const raw = localStorage.getItem(contextCommentReadCursorKey(userType, userId, contextType, contextId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    const newestId = Number(o?.newestId);
    if (!Number.isFinite(newestId) || newestId < 0) return null;
    return { newestId };
  } catch {
    return null;
  }
}

function writeContextCommentReadCursor(userType, userId, contextType, contextId, newestId) {
  if (typeof window === 'undefined') return;
  if (!userType || !userId || !contextType || contextId == null || contextId === '') return;
  try {
    const n = Math.max(0, Math.floor(Number(newestId) || 0));
    localStorage.setItem(
      contextCommentReadCursorKey(userType, userId, contextType, contextId),
      JSON.stringify({ newestId: n })
    );
  } catch {
    // quota / mode privé : ignorer
  }
}

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

function canModerate(authClaims) {
  const roleSlug = String(authClaims?.roleSlug || '').toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
  return perms.includes('teacher.access');
}

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
  const [reportReasonById, setReportReasonById] = useState({});
  const [toast, setToast] = useState('');
  const [authClaims, setAuthClaims] = useState(() => getAuthClaims());
  const [hasUnreadComments, setHasUnreadComments] = useState(false);
  const [isOpen, setIsOpen] = useState(() => (
    defaultOpen || !!String(readContextCommentDraft(contextType, contextId) || '').trim()
  ));

  const currentUserType = String(authClaims?.userType || '').toLowerCase();
  const currentUserId = String(authClaims?.canonicalUserId || authClaims?.userId || '');
  const allowModeration = canModerate(authClaims);
  const canUseCommentActions = canParticipateContextComments;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (nextPage = 1) => {
    if (!contextType || !contextId) return;
    setLoading(true);
    try {
      const data = await listContextComments({ contextType, contextId, page: nextPage, pageSize: PAGE_SIZE });
      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setTotal(Number(data?.total || 0));
      setPage(Number(data?.page || nextPage));
      if (nextPage === 1 && isOpen && currentUserType && currentUserId) {
        const newestId = list[0]?.id != null ? Number(list[0].id) : 0;
        writeContextCommentReadCursor(currentUserType, currentUserId, contextType, contextId, newestId);
        setHasUnreadComments(false);
      }
    } catch (err) {
      setToast(`Chargement impossible : ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [contextId, contextType, currentUserId, currentUserType, isOpen]);

  /** Même section repliée : le badge doit afficher le bon total (l’API renvoie total avec page_size minimal). */
  const refreshTotal = useCallback(async () => {
    if (!contextType || !contextId) return;
    try {
      const data = await listContextComments({ contextType, contextId, page: 1, pageSize: 1 });
      setTotal(Number(data?.total || 0));
      const newestId = data?.items?.[0]?.id != null ? Number(data.items[0].id) : 0;
      const cursor = readContextCommentReadCursor(currentUserType, currentUserId, contextType, contextId);
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
    if (!isOpen) return;
    setExpandedReactionsByComment({});
    load(1);
  }, [isOpen, contextType, contextId, load]);

  useEffect(() => {
    if (!contextType || contextId == null || contextId === '') return;
    refreshTotal();
  }, [contextType, contextId, refreshTotal]);

  useEffect(() => {
    if (!contextType || contextId == null || contextId === '') return undefined;
    const sameContext = (payload) =>
      String(payload?.contextType || '') === String(contextType || '')
      && String(payload?.contextId ?? '') === String(contextId ?? '');
    const onRealtime = (e) => {
      const detail = e?.detail || {};
      if (detail.domain !== 'context_comments') return;
      const payload = detail.payload || {};
      if (!sameContext(payload)) return;
      if (!isOpen) setHasUnreadComments(true);
      refreshTotal();
      if (isOpen) load(page);
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
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim() || !contextType || !contextId) return;
    setSubmitting(true);
    try {
      await createContextComment({ contextType, contextId, body });
      setBody('');
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

  const toggleUnreadTitle = hasUnreadComments ? 'Nouveaux commentaires non lus' : undefined;
  const toggleAria = hasUnreadComments
    ? `${title}, ${total} commentaire${total === 1 ? '' : 's'}, nouveaux messages non lus`
    : undefined;

  return (
    <section className="context-comments">
      <button
        type="button"
        className={`context-comments-toggle${hasUnreadComments ? ' context-comments-toggle--unread' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title={toggleUnreadTitle}
        aria-label={toggleAria}
      >
        <span className="context-comments-toggle-label">
          {hasUnreadComments && (
            <span className="context-comments-unread-dot" aria-hidden="true" title={toggleUnreadTitle} />
          )}
          <span>{isOpen ? '▾' : '▸'} {title}</span>
        </span>
        <span className="context-comments-count">{total}</span>
      </button>

      {isOpen && (
        <div className="context-comments-body">
          {canUseCommentActions ? (
            <form className="context-comments-form" onSubmit={submit}>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                maxLength={4000}
                placeholder={placeholder}
                required
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={submitting}>
                {submitting ? 'Envoi...' : 'Publier'}
              </button>
            </form>
          ) : (
            <p className="forum-muted" style={{ margin: '0 0 10px', lineHeight: 1.5, fontSize: '.85rem' }}>
              Lecture seule : tu peux consulter les commentaires ; la publication n’est pas activée sur ton compte.
            </p>
          )}

          <div className="context-comments-list">
            {loading && <p className="forum-muted">Chargement…</p>}
            {!loading && items.length === 0 && <p className="forum-muted">Aucun commentaire pour l’instant.</p>}
            {items.map((item) => {
              const isOwner = item.author_user_type === currentUserType && item.author_user_id === currentUserId;
              const canDelete = allowModeration || (canUseCommentActions && isOwner);
              const reactionsExpanded = !!expandedReactionsByComment[item.id];
              return (
                <article key={item.id} className={`context-comment-item ${item.is_deleted ? 'is-deleted' : ''}`}>
                  <div className="context-comment-head">
                    <strong>{item.author_display_name}</strong>
                    <span>{formatDateTimeFr(item.created_at)}</span>
                  </div>
                  <p className="context-comment-body">
                    {item.is_deleted ? '[commentaire supprimé]' : item.body}
                  </p>
                  {!item.is_deleted && (canUseCommentActions ? (
                    <div className={`message-reactions-row ${reactionsExpanded ? 'expanded' : 'compact'}`}>
                      {!reactionsExpanded ? (
                        <button
                          type="button"
                          className="message-reaction-chip message-reaction-chip--toggle"
                          onClick={() => setExpandedReactionsByComment((prev) => ({ ...prev, [item.id]: true }))}
                          title="Afficher toutes les réactions"
                        >
                          <span>{firstReactionEmoji}</span>
                        </button>
                      ) : (
                        <>
                          {reactionEmojis.map((emoji) => {
                            const reaction = (item.reactions || []).find((r) => r.emoji === emoji);
                            const count = Number(reaction?.count || 0);
                            const mine = !!reaction?.reacted_by_me;
                            return (
                              <button
                                key={`${item.id}-${emoji}`}
                                type="button"
                                className={`message-reaction-chip ${mine ? 'active' : ''}`}
                                onClick={() => react(item.id, emoji)}
                                title={`Réagir avec ${emoji}`}
                              >
                                <span>{emoji}</span>
                                {count > 0 && <span>{count}</span>}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            className="message-reaction-chip message-reaction-chip--toggle"
                            onClick={() => setExpandedReactionsByComment((prev) => ({ ...prev, [item.id]: false }))}
                            title="Réduire les réactions"
                          >
                            <span>▾</span>
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    (item.reactions || []).some((r) => Number(r.count) > 0) && (
                      <div className="message-reactions-row compact" style={{ opacity: 0.85 }}>
                        {(item.reactions || []).filter((r) => Number(r.count) > 0).map((r) => (
                          <span key={`${item.id}-${r.emoji}`} className="message-reaction-chip" style={{ cursor: 'default' }}>
                            <span>{r.emoji}</span>
                            <span>{r.count}</span>
                          </span>
                        ))}
                      </div>
                    )
                  ))}
                  {!item.is_deleted && canUseCommentActions && (
                    <div className="context-comment-actions">
                      {canDelete && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(item.id)}>
                          Supprimer
                        </button>
                      )}
                      <input
                        value={reportReasonById[item.id] || ''}
                        onChange={(e) => setReportReasonById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="Motif de signalement"
                        maxLength={500}
                      />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => report(item.id)}>
                        Signaler
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="context-comments-pager">
            <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
              Précédent
            </button>
            <span>{page}/{pages}</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages || loading} onClick={() => load(page + 1)}>
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
