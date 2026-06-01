import React from 'react';

/** Pastille version (staff GL) — réutilise les styles ForetMap `.app-version-badge`. */
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
