import React from 'react';
import { LINK_INPUT_HELP } from '../shared/platform/markdown.js';
import { RICH_TEXT_DEFAULT_HINT, RichTextEditor } from './RichTextEditor.jsx';

const PLAIN_TEXTAREA_HINT = `Mise en forme Markdown : **gras**, *italique*, ## titre, - liste. ${LINK_INPUT_HELP}`;

/**
 * Éditeur visuel compatible avec les anciennes props de textarea + value/onChange.
 * La valeur reste du Markdown pour préserver les contrats API existants.
 */
const MarkdownTextarea = React.forwardRef(function MarkdownTextarea(
  { value, onChange, rows = 3, className = '', toolbar = true, hint, rich = true, ...rest },
  forwardedRef,
) {
  if (rich) {
    return (
      <RichTextEditor
        ref={forwardedRef}
        value={value}
        onChange={onChange}
        rows={rows}
        className={className}
        toolbar={toolbar}
        hint={hint === undefined ? RICH_TEXT_DEFAULT_HINT : hint}
        {...rest}
      />
    );
  }
  const plainHint = hint === undefined ? PLAIN_TEXTAREA_HINT : hint;

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
      {plainHint && (
        <p className="markdown-textarea-hint" aria-hidden="true">
          {plainHint}
        </p>
      )}
    </div>
  );
});

export { MarkdownTextarea };
