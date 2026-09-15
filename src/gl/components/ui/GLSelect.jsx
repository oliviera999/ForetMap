import React from 'react';
import { joinClassNames } from '../../../shared/utils/classNames.js';

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
