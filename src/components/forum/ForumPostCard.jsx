import { formatDateTimeFr } from '../../utils/datetime-fr';
import { UserContentImagesGrid } from '../attachment-images-picker';
import { MarkdownContent } from '../MarkdownContent.jsx';

/**
 * Carte d'un message du forum : auteur/date, corps markdown (ou marqueur de
 * suppression), images jointes, rangée de réactions (interactive ou lecture
 * seule) et actions (supprimer/signaler). Présentation pure : tout l'état
 * (expansion des réactions, motif de signalement) et les appels API restent
 * dans `ForumView`.
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
  const canDelete = canModerate || (canUseForumActions && isOwner);
  return (
    <article className={`forum-post ${p.is_deleted ? 'is-deleted' : ''}`}>
      <div className="forum-post-head">
        <strong>{p.author_display_name}</strong>
        <span>{formatDateTimeFr(p.created_at)}</span>
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
              <button
                type="button"
                className="message-reaction-chip message-reaction-chip--toggle"
                onClick={() => onSetReactionsExpanded(p.id, true)}
                title="Afficher toutes les réactions"
              >
                <span>{firstReactionEmoji}</span>
              </button>
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
                >
                  <span>▾</span>
                </button>
              </>
            )}
          </div>
        ) : (
          (p.reactions || []).some((r) => Number(r.count) > 0) && (
            <div className="message-reactions-row compact" style={{ opacity: 0.85 }}>
              {(p.reactions || [])
                .filter((r) => Number(r.count) > 0)
                .map((r) => (
                  <span
                    key={`${p.id}-${r.emoji}`}
                    className="message-reaction-chip"
                    style={{ cursor: 'default' }}
                  >
                    <span>{r.emoji}</span>
                    <span>{r.count}</span>
                  </span>
                ))}
            </div>
          )
        ))}
      {!p.is_deleted && canUseForumActions && (canDelete || reportsEnabled) && (
        <div className="forum-post-actions">
          {canDelete && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(p.id)}>
              Supprimer
            </button>
          )}
          {reportsEnabled && (
            <>
              <input
                value={reportReason}
                onChange={(e) => onReportReasonChange(p.id, e.target.value)}
                placeholder="Motif de signalement"
                maxLength={500}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onReport(p.id)}
              >
                Signaler
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
