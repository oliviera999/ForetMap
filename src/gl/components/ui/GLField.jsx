import React from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function GLField({ label, htmlFor, hint = '', error = '', className = '', children }) {
  return (
    <label htmlFor={htmlFor} className={joinClassNames('gl-field', error ? 'is-invalid' : '', className)}>
      <span className="gl-field__label">{label}</span>
      {children}
      {hint ? <span className="gl-field__hint">{hint}</span> : null}
      {error ? <span className="gl-field__error">{error}</span> : null}
    </label>
  );
}
