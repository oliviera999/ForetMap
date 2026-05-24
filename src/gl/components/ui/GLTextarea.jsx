import React from 'react';

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export const GLTextarea = React.forwardRef(function GLTextarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={joinClassNames('gl-textarea', className)} {...props} />;
});
