/** Point rouge « non lu » accolé à un onglet de navigation. */
export function UnreadDot({ show, label = 'Nouveaux messages' }) {
  if (!show) return null;
  return <span className="nav-unread-dot" role="img" aria-label={label} title={label} />;
}
