import '../../shared/styles/version-badge.css';

/**
 * Pastille version (staff G&L) — même style `.app-version-badge` que ForetMap,
 * porté par la feuille partagée `src/shared/styles/version-badge.css` importée
 * ici (le point d'entrée G&L ne charge pas `src/index.css`).
 */
export function GLAppVersionBadge({ appVersion }) {
  const label = appVersion != null ? appVersion : '…';
  return (
    <span
      className="app-version-badge gl-app-version-badge"
      title={`Version installée : ${label}`}
      aria-label={`Version ${label}`}
    >
      <span className="app-version-badge__version">v{label}</span>
    </span>
  );
}
