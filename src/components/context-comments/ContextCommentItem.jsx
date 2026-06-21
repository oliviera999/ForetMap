import React from 'react';
import { formatDateTimeFr } from '../../utils/datetime-fr';
import { UserContentImagesGrid } from '../attachment-images-picker';
import { MarkdownContent } from '../MarkdownContent.jsx';

/**
 * Carte d'un commentaire contextuel (feuille prop-driven) : entête, corps,
 * images, rangée de réactions et actions de modération/signalement.
 * L'état d'expansion des réactions et les motifs de signalement restent
 * gérés par le parent ; les actions remontent via les callbacks.
 */
function ContextCommentItem({
  item,
  currentUserType,
  currentUserId,
  allowModeration,
  canUseCommentActions,
  reportsEnabled = true,
  reactionEmojis,
  firstReactionEmoji,
  reactionsExpanded,
  onExpandReactions,
  onCollapseReactions,
  onReact,
  onRemove,
  reportReason,
  onReportReasonChange,
  onReport,
}) {
  const isOwner =
    item.author_user_type === currentUserType && item.author_user_id === currentUserId;
  const canDelete = allowModeration || (canUseCommentActions && isOwner);

  return (
    <article className={`context-comment-item ${item.is_deleted ? 'is-deleted' : ''}`}>
      <div className="context-comment-head">
        <strong>{item.author_display_name}</strong>
        <span>{formatDateTimeFr(item.created_at)}</span>
      </div>
      {item.is_deleted ? (
        <p className="context-comment-body">[commentaire supprimé]</p>
      ) : (
        <MarkdownContent className="context-comment-body">{item.body}</MarkdownContent>
      )}
      {!item.is_deleted && <UserContentImagesGrid urls={item.image_urls} />}
      {!item.is_deleted &&
        (canUseCommentActions ? (
          <div className={`message-reactions-row ${reactionsExpanded ? 'expanded' : 'compact'}`}>
            {!reactionsExpanded ? (
              <button
                type="button"
                className="message-reaction-chip message-reaction-chip--toggle"
                onClick={onExpandReactions}
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
                      onClick={() => onReact(item.id, emoji)}
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
                  onClick={onCollapseReactions}
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
              {(item.reactions || [])
                .filter((r) => Number(r.count) > 0)
                .map((r) => (
                  <span
                    key={`${item.id}-${r.emoji}`}
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
      {!item.is_deleted && canUseCommentActions && (canDelete || reportsEnabled) && (
        <div className="context-comment-actions">
          {canDelete && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onRemove(item.id)}
            >
              Supprimer
            </button>
          )}
          {reportsEnabled && (
            <>
              <input
                value={reportReason || ''}
                onChange={(e) => onReportReasonChange(item.id, e.target.value)}
                placeholder="Motif de signalement"
                maxLength={500}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onReport(item.id)}
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

export { ContextCommentItem };
