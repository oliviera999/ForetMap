import { useEffect, useId, useRef, useState } from 'react';
import { formatDateTimeFr } from '../platform/datetime-fr';
import { UserContentImagesGrid } from '../components/AttachmentImagesPicker.jsx';
import { SharedForumMarkdown } from './SharedForumMarkdown.jsx';
import { forumBtn } from './forumUi.js';

const MIN_REPORT_REASON_LEN = 3;

/**
 * Carte d'un message du forum : auteur, date (et mention « modifié »), corps Markdown (ou
 * marqueur de suppression), images, rangée de réactions (interactive ou lecture seule) et
 * actions (citer, modifier, supprimer, signaler). Les appels API restent dans la vue ; seuls
 * les petits formulaires de signalement et d'édition sont locaux à la carte.
 */
export function ForumPostCard({
  post,
  canModerate,
  canUseForumActions,
  canEdit = false,
  canQuote = false,
  reportsEnabled = true,
  isOwner,
  reactionEmojis,
  firstReactionEmoji,
  reactionsExpanded,
  reportReason,
  maxBodyLength = 4000,
  Markdown = SharedForumMarkdown,
  onSetReactionsExpanded,
  onReact,
  onDelete,
  onReportReasonChange,
  onReport,
  onQuote,
  onEdit,
}) {
  const p = post;
  const deleted = !!Number(p.is_deleted);
  const reportInputId = useId();
  const editInputId = useId();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const reportInputRef = useRef(null);
  const editInputRef = useRef(null);

  useEffect(() => {
    if (reportOpen) reportInputRef.current?.focus();
  }, [reportOpen]);
  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  const canDelete = canModerate || (canUseForumActions && isOwner);
  const canReport = reportsEnabled && !isOwner;
  const reasonReady = String(reportReason || '').trim().length >= MIN_REPORT_REASON_LEN;
  const firstEmoji = firstReactionEmoji || reactionEmojis?.[0] || '👍';
  const visibleReactions = (p.reactions || []).filter((r) => Number(r.count) > 0);

  const submitReport = async (e) => {
    e.preventDefault();
    if (!reasonReady || reportSending) return;
    setReportSending(true);
    try {
      const ok = await onReport(p.id);
      if (ok !== false) setReportOpen(false);
    } finally {
      setReportSending(false);
    }
  };

  const startEdit = () => {
    setEditDraft(String(p.body || ''));
    setEditing(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (editSaving) return;
    setEditSaving(true);
    try {
      const ok = await onEdit?.(p.id, editDraft);
      if (ok !== false) setEditing(false);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <article className={`forum-post ${deleted ? 'is-deleted' : ''}`}>
      <div className="forum-post-head">
        <strong>{p.author_display_name}</strong>
        <time dateTime={p.created_at || undefined}>{formatDateTimeFr(p.created_at)}</time>
        {!deleted && p.edited_at && (
          <span className="forum-post-edited" title={formatDateTimeFr(p.edited_at)}>
            modifié le {formatDateTimeFr(p.edited_at)}
          </span>
        )}
      </div>
      {deleted ? (
        <p className="forum-post-body">[message supprimé]</p>
      ) : editing ? (
        <form className="forum-edit-form" onSubmit={submitEdit}>
          <label htmlFor={editInputId}>Modifier le message</label>
          <textarea
            id={editInputId}
            ref={editInputRef}
            className="fm-textarea"
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            rows={4}
            maxLength={maxBodyLength}
          />
          <div className="forum-form-actions">
            <button type="submit" className={forumBtn('primary')} disabled={editSaving}>
              {editSaving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              className={forumBtn('ghost')}
              onClick={() => setEditing(false)}
              disabled={editSaving}
            >
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <Markdown className="forum-post-body">{p.body}</Markdown>
      )}
      {!deleted && <UserContentImagesGrid urls={p.image_urls} />}
      {!deleted &&
        (canUseForumActions ? (
          <div className={`message-reactions-row ${reactionsExpanded ? 'expanded' : 'compact'}`}>
            {!reactionsExpanded ? (
              <>
                {visibleReactions.map((r) => (
                  <button
                    key={`${p.id}-${r.emoji}`}
                    type="button"
                    className={`message-reaction-chip ${r.reacted_by_me ? 'active' : ''}`}
                    onClick={() => onReact(p.id, r.emoji)}
                    aria-pressed={!!r.reacted_by_me}
                    aria-label={`${r.emoji} : ${r.count} réaction${Number(r.count) > 1 ? 's' : ''}`}
                  >
                    <span aria-hidden="true">{r.emoji}</span>
                    <span aria-hidden="true">{r.count}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="message-reaction-chip message-reaction-chip--toggle"
                  onClick={() => onSetReactionsExpanded(p.id, true)}
                  title="Afficher toutes les réactions"
                  aria-label="Ajouter une réaction"
                  aria-expanded="false"
                >
                  <span aria-hidden="true">{visibleReactions.length > 0 ? '+' : firstEmoji}</span>
                </button>
              </>
            ) : (
              <>
                {reactionEmojis.map((emoji) => {
                  const item = (p.reactions || []).find((r) => r.emoji === emoji);
                  const count = Number(item?.count || 0);
                  const mine = !!item?.reacted_by_me;
                  return (
                    <button
                      key={`${p.id}-${emoji}`}
                      type="button"
                      className={`message-reaction-chip ${mine ? 'active' : ''}`}
                      onClick={() => onReact(p.id, emoji)}
                      title={`Réagir avec ${emoji}`}
                      aria-pressed={mine}
                    >
                      <span>{emoji}</span>
                      {count > 0 && <span>{count}</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="message-reaction-chip message-reaction-chip--toggle"
                  onClick={() => onSetReactionsExpanded(p.id, false)}
                  title="Réduire les réactions"
                  aria-expanded="true"
                >
                  <span aria-hidden="true">▾</span>
                </button>
              </>
            )}
          </div>
        ) : (
          visibleReactions.length > 0 && (
            <div className="message-reactions-row compact is-readonly">
              {visibleReactions.map((r) => (
                <span key={`${p.id}-${r.emoji}`} className="message-reaction-chip">
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </span>
              ))}
            </div>
          )
        ))}
      {!deleted &&
        !editing &&
        canUseForumActions &&
        (canDelete || canReport || canEdit || canQuote) && (
          <div className="forum-post-actions">
            {canQuote && (
              <button type="button" className={forumBtn('ghost')} onClick={() => onQuote?.(p)}>
                Citer
              </button>
            )}
            {canEdit && (
              <button type="button" className={forumBtn('ghost')} onClick={startEdit}>
                Modifier
              </button>
            )}
            {canDelete && (
              <button type="button" className={forumBtn('ghost')} onClick={() => onDelete(p.id)}>
                Supprimer
              </button>
            )}
            {canReport && !reportOpen && (
              <button
                type="button"
                className={forumBtn('ghost')}
                onClick={() => setReportOpen(true)}
                aria-expanded="false"
              >
                Signaler
              </button>
            )}
          </div>
        )}
      {!deleted && canUseForumActions && canReport && reportOpen && (
        <form className="forum-report-form" onSubmit={submitReport}>
          <label htmlFor={reportInputId}>Motif du signalement</label>
          <input
            id={reportInputId}
            className="fm-input"
            value={reportReason}
            onChange={(e) => onReportReasonChange(p.id, e.target.value)}
            placeholder="Motif de signalement"
            minLength={MIN_REPORT_REASON_LEN}
            maxLength={500}
            ref={reportInputRef}
          />
          <div className="forum-form-actions">
            <button
              type="submit"
              className={forumBtn('secondary')}
              disabled={!reasonReady || reportSending}
            >
              {reportSending ? 'Envoi…' : 'Envoyer le signalement'}
            </button>
            <button
              type="button"
              className={forumBtn('ghost')}
              onClick={() => setReportOpen(false)}
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
