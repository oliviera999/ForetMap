import React from 'react';
import { joinClassNames } from '../../../shared/utils/classNames.js';

export const GLTextarea = React.forwardRef(function GLTextarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={joinClassNames('gl-textarea', className)} {...props} />;
});
