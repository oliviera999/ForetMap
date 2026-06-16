import React from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export const GLSelect = React.forwardRef(function GLSelect(
  { className = '', children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={joinClassNames('gl-select', className)} {...props}>
      {children}
    </select>
  );
});
