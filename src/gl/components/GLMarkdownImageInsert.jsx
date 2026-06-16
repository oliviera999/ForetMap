import React from 'react';
import { insertHtmlImageAtSelection } from '../../shared/markdown/insertImage.js';
import { GLImageInlineInsertControls } from './GLImageInlineInsertControls.jsx';

/**
 * Import d’image (fichier ou bibliothèque) et insertion Markdown dans un textarea.
 */
export function GLMarkdownImageInsert({ textareaRef, value, onChange, onStatus }) {
  function applyInsert({ url, alt = 'Image', frame = null }) {
    const el = textareaRef?.current;
    const start = el?.selectionStart ?? String(value ?? '').length;
    const end = el?.selectionEnd ?? start;
    const result = insertHtmlImageAtSelection(String(value ?? ''), start, end, url, alt, frame);
    onChange({ target: { value: result.value } });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  return (
    <GLImageInlineInsertControls
      onInsert={applyInsert}
      onStatus={onStatus}
      intro="Chargez une image depuis votre ordinateur ou smartphone ; elle sera ajoutée au markdown de la page."
    />
  );
}
