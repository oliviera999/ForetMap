import React from 'react';

export function formatUsageLocation(loc) {
  const kind = String(loc?.kind || 'Référence');
  const label = loc?.label ? ` — ${loc.label}` : '';
  const field = loc?.field ? ` (${loc.field})` : '';
  return `${kind}${label}${field}`;
}

export function MediaUsageInfo({ usage, ready, limit = 3 }) {
  if (!ready) {
    return (
      <span className="media-library-menu__usage media-library-menu__usage--pending">Usage…</span>
    );
  }
  if (!usage || !usage.count) {
    return (
      <span className="media-library-menu__usage media-library-menu__usage--unused">
        Inutilisée
      </span>
    );
  }
  const locations = Array.isArray(usage.locations) ? usage.locations : [];
  const shown = locations.slice(0, limit);
  const extra = usage.count - shown.length;
  const fullList = locations.map(formatUsageLocation).join('\n');
  return (
    <span className="media-library-menu__usage media-library-menu__usage--used">
      <span className="media-library-menu__usage-badge" title={fullList}>
        Utilisée · {usage.count}
      </span>
      <span className="media-library-menu__usage-list">
        {shown.map((loc, index) => (
          <span
            key={`${loc.kind}-${loc.id}-${loc.field}-${index}`}
            className="media-library-menu__usage-loc"
          >
            {formatUsageLocation(loc)}
          </span>
        ))}
        {extra > 0 ? (
          <span className="media-library-menu__usage-loc media-library-menu__usage-more">
            +{extra} autre{extra > 1 ? 's' : ''}
          </span>
        ) : null}
      </span>
    </span>
  );
}
