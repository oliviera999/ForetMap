/**
 * Bouton d'en-tête (présentation) qui replie/déplie une section de commentaires
 * contextuels — extrait de `ContextComments` (O6). Affiche le chevron, le titre et
 * une pastille chiffrée : rouge avec le nombre de non-lus, verte avec le total une
 * fois tout lu, absente quand il n'y a aucun commentaire. L'état (ouvert, non lus)
 * reste géré par le parent.
 *
 * @param {object} props
 * @param {string} props.title libellé de la section
 * @param {number} props.total nombre total de commentaires
 * @param {boolean} props.isOpen section dépliée ?
 * @param {number} props.unreadCount nombre de commentaires non lus
 * @param {() => void} props.onToggle bascule l'état déplié/replié
 */
function ContextCommentsToggle({ title, total, isOpen, unreadCount = 0, onToggle }) {
  const count = Math.max(0, Number(total) || 0);
  const unread = Math.min(count, Math.max(0, Number(unreadCount) || 0));
  const hasUnread = unread > 0;
  const totalLabel = `${count} commentaire${count === 1 ? '' : 's'}`;
  const unreadLabel = `${unread} non lu${unread === 1 ? '' : 's'}`;
  const toggleAria = hasUnread
    ? `${title}, ${totalLabel} dont ${unreadLabel}`
    : count > 0
      ? `${title}, ${totalLabel}`
      : undefined;

  return (
    <button
      type="button"
      className={`context-comments-toggle${hasUnread ? ' context-comments-toggle--unread' : ''}`}
      onClick={onToggle}
      title={hasUnread ? `Commentaires non lus : ${unread}` : undefined}
      aria-label={toggleAria}
    >
      <span className="context-comments-toggle-label">
        <span>
          {isOpen ? '▾' : '▸'} {title}
        </span>
      </span>
      {count > 0 && (
        <span
          className={`context-comments-count ${hasUnread ? 'context-comments-count--unread' : 'context-comments-count--read'}`}
          aria-hidden="true"
        >
          {hasUnread ? unread : count}
        </span>
      )}
    </button>
  );
}

export { ContextCommentsToggle };
