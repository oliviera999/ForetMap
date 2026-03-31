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
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total || 0));
      setPage(Number(data?.page || nextPage));
    } catch (err) {
      setToast(`Chargement impossible : ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [contextId, contextType]);

  const [isOpen, setIsOpen] = useState(() => (
    defaultOpen || !!String(readContextCommentDraft(contextType, contextId) || '').trim()
  ));

  useEffect(() => {
    const draft = readContextCommentDraft(contextType, contextId);
    setBody(draft);
    setIsOpen(defaultOpen || !!String(draft || '').trim());
  }, [contextType, contextId, defaultOpen]);

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
    if (!isOpen || !contextType || !contextId) return undefined;
    const onRealtime = (e) => {
      const detail = e?.detail || {};
      if (detail.domain !== 'context_comments') return;
      const payload = detail.payload || {};
      if (payload.contextType !== contextType || payload.contextId !== contextId) return;
      load(page);
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

  return (
    <section className="context-comments">
      <button type="button" className="context-comments-toggle" onClick={() => setIsOpen((prev) => !prev)}>
        <span>{isOpen ? '▾' : '▸'} {title}</span>
        <span>{total}</span>
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
                    <span>{fmtDate(item.created_at)}</span>
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
