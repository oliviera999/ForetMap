import React from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function GLBadge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={joinClassNames('gl-badge', `gl-badge--${tone}`, className)}>{children}</span>
  );
}
