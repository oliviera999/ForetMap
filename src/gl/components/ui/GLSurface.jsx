import React from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function GLSurface({
  as: Tag = 'section',
  variant = 'elevated',
  className = '',
  children,
  ...props
}) {
  return (
    <Tag className={joinClassNames('gl-surface', `gl-surface--${variant}`, className)} {...props}>
      {children}
    </Tag>
  );
}
