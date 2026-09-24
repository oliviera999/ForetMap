/** Classes de boutons du forum partagé : `.shared-btn*` est chargée par les deux produits. */
export function forumBtn(variant = 'ghost', { small = true } = {}) {
  return ['shared-btn', `shared-btn--${variant}`, small ? 'shared-btn--sm' : '']
    .filter(Boolean)
    .join(' ');
}

/* Même seuil que la bascule une colonne de `.forum-grid` dans shared/styles/forum.css. */
export const FORUM_NARROW_QUERY = '(max-width: 1023px)';

export function isForumNarrowViewport() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(FORUM_NARROW_QUERY).matches
    : false;
}
