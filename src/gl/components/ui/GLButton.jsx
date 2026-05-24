import React from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function GLButton({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  type = 'button',
  ...props
}) {
  const variantClass = `gl-btn--${variant}`;
  return (
    <button
      type={type}
      className={joinClassNames('gl-btn', variantClass, className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? 'Chargement…' : children}
    </button>
  );
}
