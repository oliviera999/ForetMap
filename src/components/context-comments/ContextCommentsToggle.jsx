import React from 'react';

/**
 * Bouton d'en-tête (présentation) qui replie/déplie une section de commentaires
 * contextuels — extrait de `ContextComments` (O6). Affiche le chevron, le titre,
 * le total et un point « non lu » optionnel. L'état (ouvert, non lus) reste géré
 * par le parent. DOM/classes/textes inchangés.
 *
 * @param {object} props
 * @param {string} props.title libellé de la section
 * @param {number} props.total nombre de commentaires affiché dans le badge
 * @param {boolean} props.isOpen section dépliée ?
 * @param {boolean} props.hasUnreadComments nouveaux commentaires non lus ?
 * @param {() => void} props.onToggle bascule l'état déplié/replié
 */
function ContextCommentsToggle({ title, total, isOpen, hasUnreadComments, onToggle }) {
  const toggleUnreadTitle = hasUnreadComments ? 'Nouveaux commentaires non lus' : undefined;
  const toggleAria = hasUnreadComments
    ? `${title}, ${total} commentaire${total === 1 ? '' : 's'}, nouveaux messages non lus`
    : undefined;

  return (
    <button
      type="button"
      className={`context-comments-toggle${hasUnreadComments ? ' context-comments-toggle--unread' : ''}`}
      onClick={onToggle}
      title={toggleUnreadTitle}
      aria-label={toggleAria}
    >
      <span className="context-comments-toggle-label">
        {hasUnreadComments && (
          <span
            className="context-comments-unread-dot"
            aria-hidden="true"
            title={toggleUnreadTitle}
          />
        )}
        <span>
          {isOpen ? '▾' : '▸'} {title}
        </span>
      </span>
      <span className="context-comments-count">{total}</span>
    </button>
  );
}

export { ContextCommentsToggle };
