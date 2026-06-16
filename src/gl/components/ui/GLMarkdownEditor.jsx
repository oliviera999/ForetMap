import React from 'react';
import { MarkdownTextarea } from '../../../components/MarkdownTextarea.jsx';

export const GLMarkdownEditor = React.forwardRef(function GLMarkdownEditor(
  { className = '', ...props },
  ref,
) {
  const nextClassName = className ? `gl-markdown-editor ${className}` : 'gl-markdown-editor';
  return <MarkdownTextarea ref={ref} className={nextClassName} {...props} />;
});
