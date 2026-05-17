import React, { useCallback, useRef } from 'react';
import {
  applyMarkdownLink,
  applyMarkdownList,
  applyMarkdownWrap,
} from '../utils/markdown.js';

const TOOLBAR_ACTIONS = [
  { id: 'bold', label: 'Gras', title: 'Gras (**texte**)', prefix: '**', suffix: '**', placeholder: 'texte' },
  { id: 'italic', label: 'Italique', title: 'Italique (*texte*)', prefix: '*', suffix: '*', placeholder: 'texte' },
  { id: 'ul', label: 'Liste', title: 'Liste à puces', listType: 'ul' },
  { id: 'ol', label: '1.', title: 'Liste numérotée', listType: 'ol' },
  { id: 'link', label: 'Lien', title: 'Lien [texte](url)', action: 'link' },
];

/**
 * Zone de texte avec barre d’outils Markdown minimal.
 * Props identiques à textarea + value/onChange.
 */
function MarkdownTextarea({
  value,
  onChange,
  rows = 3,
  className = '',
  toolbar = true,
  hint = 'Mise en forme légère : gras, listes, liens (Markdown).',
  ...rest
}) {
  const textareaRef = useRef(null);

  const applyEdit = useCallback((editFn) => {
    const el = textareaRef.current;
    if (!el || typeof onChange !== 'function') return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const result = editFn(String(value ?? ''), start, end);
    onChange({ target: { value: result.value } });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }, [onChange, value]);

  const onToolbarClick = (action) => {
    if (action.action === 'link') {
      applyEdit((v, s, e) => applyMarkdownLink(v, s, e));
      return;
    }
    if (action.listType) {
      applyEdit((v, s, e) => applyMarkdownList(v, s, e, action.listType));
      return;
    }
    applyEdit((v, s, e) => applyMarkdownWrap(v, s, e, action.prefix, action.suffix, action.placeholder));
  };

  return (
    <div className="markdown-textarea-wrap">
      {toolbar && (
        <div className="markdown-textarea-toolbar" role="toolbar" aria-label="Mise en forme du texte">
          {TOOLBAR_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="markdown-textarea-tool btn btn-ghost btn-sm"
              title={action.title}
              aria-label={action.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToolbarClick(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        rows={rows}
        className={['markdown-textarea-input', className].filter(Boolean).join(' ')}
        {...rest}
      />
      {toolbar && hint && (
        <p className="markdown-textarea-hint" aria-hidden="true">{hint}</p>
      )}
    </div>
  );
}

export { MarkdownTextarea };
