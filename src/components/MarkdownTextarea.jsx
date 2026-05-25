import React from 'react';
import { RichTextEditor } from './RichTextEditor.jsx';

/**
 * Éditeur visuel compatible avec les anciennes props de textarea + value/onChange.
 * La valeur reste du Markdown pour préserver les contrats API existants.
 */
const MarkdownTextarea = React.forwardRef(function MarkdownTextarea({
  value,
  onChange,
  rows = 3,
  className = '',
  toolbar = true,
  hint = 'Mise en forme visuelle : titres, listes, citations et liens. Le contenu reste enregistré en Markdown.',
  rich = true,
  ...rest
}, forwardedRef) {
  if (rich) {
    return (
      <RichTextEditor
        ref={forwardedRef}
        value={value}
        onChange={onChange}
        rows={rows}
        className={className}
        toolbar={toolbar}
        hint={hint}
        {...rest}
      />
    );
  }

  return (
    <div className="markdown-textarea-wrap">
      <textarea
        ref={forwardedRef}
        value={value}
        onChange={onChange}
        rows={rows}
        className={['markdown-textarea-input', className].filter(Boolean).join(' ')}
        {...rest}
      />
      {hint && (
        <p className="markdown-textarea-hint" aria-hidden="true">{hint}</p>
      )}
    </div>
  );
});

export { MarkdownTextarea };
