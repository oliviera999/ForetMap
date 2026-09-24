import { forumBtn } from './forumUi.js';

/** Pagination « Précédent / Page n/N / Suivant » ; rien quand il n'y a qu'une page. */
export function ForumPager({ page, pages, disabled, onChange, label, className = '' }) {
  if (pages <= 1) return null;
  return (
    <nav className={`forum-pager ${className}`.trim()} aria-label={label}>
      <button
        type="button"
        className={forumBtn('ghost')}
        disabled={page <= 1 || disabled}
        onClick={() => onChange(page - 1)}
      >
        Précédent
      </button>
      <span aria-live="polite">
        Page {page}/{pages}
      </span>
      <button
        type="button"
        className={forumBtn('ghost')}
        disabled={page >= pages || disabled}
        onClick={() => onChange(page + 1)}
      >
        Suivant
      </button>
    </nav>
  );
}
