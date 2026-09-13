import React from 'react';
import { joinClassNames } from '../../../shared/utils/classNames.js';

export const GLInput = React.forwardRef(function GLInput({ className = '', ...props }, ref) {
  return <input ref={ref} className={joinClassNames('gl-input', className)} {...props} />;
});
