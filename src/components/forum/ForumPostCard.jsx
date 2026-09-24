import { useEffect, useId, useRef, useState } from 'react';
import { formatDateTimeFr } from '../../shared/platform/datetime-fr';
import { UserContentImagesGrid } from '../attachment-images-picker';
import { MarkdownContent } from '../MarkdownContent.jsx';

const MIN_REPORT_REASON_LEN = 3;

/**
 * Carte d'un message du forum : auteur/date, corps markdown (ou marqueur de
 * suppression), images jointes, rangée de réactions (interactive ou lecture
 * seule) et actions (supprimer/signaler). Les données (expansion des réactions,
 * motif de signalement) et les appels API restent dans `ForumView` ; seule
 * l'ouverture du petit formulaire de signalement est locale à la carte.
 */
export function ForumPostCard({
  post,
  canModerate,
  canUseForumActions,
  reportsEnabled = true,
  isOwner,
  reactionEmojis,
  firstReactionEmoji,
  reactionsExpanded,
  reportReason,
  onSetReactionsExpanded,
  onReact,
  onDelete,
  onReportReasonChange,
  onReport,
}) {
  const p = post;
  const reportInputId = useId();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const reportInputRef = useRef(null);

  useEffect(() => {
    if (reportOpen) reportInputRef.current?.focus();
  }, [reportOpen]);
  const canDelete = canModerate || (canUseForumActions && isOwner);
  const canReport = reportsEnabled && !isOwner;
  const reasonReady = String(reportReason || '').trim().length >= MIN_REPORT_REASON_LEN;

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

  return (
    <article className={`forum-post ${p.is_deleted ? 'is-deleted' : ''}`}>
      <div className="forum-post-head">
        <strong>{p.author_display_name}</strong>
        <time dateTime={p.created_at || undefined}>{formatDateTimeFr(p.created_at)}</time>
      </div>
      {p.is_deleted ? (
        <p className="forum-post-body">[message supprimé]</p>
      ) : (
        <MarkdownContent className="forum-post-body">{p.body}</MarkdownContent>
      )}
      {!p.is_deleted && <UserContentImagesGrid urls={p.image_urls} />}
      {!p.is_deleted &&
        (canUseForumActions ? (
          <div className={`message-reactions-row ${reactionsExpanded ? 'expanded' : 'compact'}`}>
            {!reactionsExpanded ? (
              <>
                {(p.reactions || [])
                  .filter((r) => Number(r.count) > 0)
                  .map((r) => (
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
                  <span aria-hidden="true">
                    {(p.reactions || []).some((r) => Number(r.count) > 0)
                      ? '+'
                      : firstReactionEmoji}
                  </span>
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
          (p.reactions || []).some((r) => Number(r.count) > 0) && (
            <div className="message-reactions-row compact is-readonly">
              {(p.reactions || [])
                .filter((r) => Number(r.count) > 0)
                .map((r) => (
                  <span key={`${p.id}-${r.emoji}`} className="message-reaction-chip">
                    <span>{r.emoji}</span>
                    <span>{r.count}</span>
                  </span>
                ))}
            </div>
          )
        ))}
      {!p.is_deleted && canUseForumActions && (canDelete || canReport) && (
        <div className="forum-post-actions">
          {canDelete && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(p.id)}>
              Supprimer
            </button>
          )}
          {canReport && !reportOpen && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setReportOpen(true)}
              aria-expanded="false"
            >
              Signaler
            </button>
          )}
        </div>
      )}
      {!p.is_deleted && canUseForumActions && canReport && reportOpen && (
        <form className="forum-report-form" onSubmit={submitReport}>
          <label htmlFor={reportInputId}>Motif du signalement</label>
          <input
            id={reportInputId}
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
              className="btn btn-secondary btn-sm"
              disabled={!reasonReady || reportSending}
            >
              {reportSending ? 'Envoi…' : 'Envoyer le signalement'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
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
