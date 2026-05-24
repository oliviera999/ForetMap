import React from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export const GLInput = React.forwardRef(function GLInput({ className = '', ...props }, ref) {
  return <input ref={ref} className={joinClassNames('gl-input', className)} {...props} />;
});
