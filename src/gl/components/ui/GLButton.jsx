import React from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function GLButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  type = 'button',
  ...props
}) {
  const variantClass = `gl-btn--${variant}`;
  const sizeClass = size === 'sm' ? 'gl-btn--sm' : '';
  return (
    <button
      type={type}
      className={joinClassNames('gl-btn', variantClass, sizeClass, className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? 'Chargement…' : children}
    </button>
  );
}
