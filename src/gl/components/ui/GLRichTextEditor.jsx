import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdownToSafeHtml, sanitizeRichHtml } from '../../../shared/platform/markdown.js';
import {
  createRichTextTurndownService,
  htmlToMarkdownWith,
  normalizeHtmlForCompare,
  runExecCommand,
} from '../../../shared/richtext/richTextCore.js';
import {
  glImageFrameToImgFillStyle,
  glImageFrameToWrapStyle,
  normalizeGlImageFrame,
  serializeGlImageFrameAttr,
} from '../../../shared/image-frame/glImageFrame.js';
import { GLImageInlineInsertControls } from '../GLImageInlineInsertControls.jsx';
import { useAppDialogs } from '../../../shared/components/AppDialogsProvider.jsx';
import { annotateEditorHtmlWithOriginalSrc } from '../../utils/glMarkdownEditorDisplay.js';

function normalizeResolveDisplayResult(markdown, resolveDisplayMarkdown) {
  if (typeof resolveDisplayMarkdown !== 'function') {
    return { displayMarkdown: markdown, originalSrcByResolved: new Map() };
  }
  const result = resolveDisplayMarkdown(markdown);
  if (result && typeof result === 'object' && 'displayMarkdown' in result) {
    return {
      displayMarkdown: String(result.displayMarkdown ?? ''),
      originalSrcByResolved:
        result.originalSrcByResolved instanceof Map ? result.originalSrcByResolved : new Map(),
    };
  }
  return { displayMarkdown: String(result ?? markdown), originalSrcByResolved: new Map() };
}

function markdownToEditableHtml(markdown, resolveDisplayMarkdown) {
  const { displayMarkdown, originalSrcByResolved } = normalizeResolveDisplayResult(
    markdown,
    resolveDisplayMarkdown,
  );
  const html = renderMarkdownToSafeHtml(displayMarkdown, { allowImages: true });
  if (!String(html || '').trim()) return '';
  const sanitized = sanitizeRichHtml(html, { allowImages: true });
  return annotateEditorHtmlWithOriginalSrc(sanitized, originalSrcByResolved);
}

function styleObjectToString(style) {
  return Object.entries(style || {})
    .map(
      ([key, value]) => `${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}:${value}`,
    )
    .join(';');
}

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Instance GL : base commune, enrichie ci-dessous des règles d'images propres au produit.
const turndownService = createRichTextTurndownService();

function turndownGlImageMarkup(node) {
  const src = String(node.getAttribute('data-gl-md-src') || node.getAttribute('src') || '').trim();
  if (!src) return '';
  const alt = String(node.getAttribute('alt') || 'Image').replace(/"/g, '&quot;');
  const frame = String(node.getAttribute('data-gl-frame') || '').replace(/'/g, '&apos;');
  const classAttr = String(node.getAttribute('class') || '').trim();
  const classValue = classAttr.includes('gl-content-image')
    ? classAttr
    : `${classAttr} gl-content-image`.trim();
  return `\n\n<img src="${src}" alt="${alt}" class="${classValue}" data-gl-frame='${frame}' loading="lazy" />\n\n`;
}

turndownService.addRule('glImageFigure', {
  filter(node) {
    return (
      node.nodeName === 'FIGURE' &&
      String(node.getAttribute('class') || '').includes('gl-content-image-wrap')
    );
  },
  replacement(_content, node) {
    const img = node.querySelector('img');
    if (!img) return '';
    return turndownGlImageMarkup(img);
  },
});

turndownService.addRule('glImage', {
  filter(node) {
    return node.nodeName === 'IMG';
  },
  replacement(_content, node) {
    if (node.parentElement?.classList?.contains('gl-content-image-wrap')) {
      return '';
    }
    return turndownGlImageMarkup(node);
  },
});

function htmlToMarkdown(html) {
  return htmlToMarkdownWith(turndownService, html, { allowImages: true });
}

export const GLRichTextEditor = React.forwardRef(function GLRichTextEditor(
  {
    value,
    onChange,
    className = '',
    placeholder = 'Saisissez votre texte…',
    hint = 'Mise en forme enrichie : titres, listes, citations, liens et images.',
    imageLegend = 'Photos dans le texte',
    resolveDisplayMarkdown = null,
  },
  forwardedRef,
) {
  const { prompt } = useAppDialogs();
  const editableRef = useRef(null);
  const lastMarkdownRef = useRef(null);
  const [imageStatus, setImageStatus] = useState('');
  const [imageStatusError, setImageStatusError] = useState(false);

  const setEditableRef = useCallback(
    (element) => {
      editableRef.current = element;
      if (typeof forwardedRef === 'function') forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    },
    [forwardedRef],
  );

  const syncFromDom = useCallback(() => {
    const el = editableRef.current;
    if (!el || typeof onChange !== 'function') return;
    const sanitized = sanitizeRichHtml(el.innerHTML, { allowImages: true });
    if (el.innerHTML !== sanitized) {
      el.innerHTML = sanitized;
    }
    const markdown = htmlToMarkdown(sanitized);
    lastMarkdownRef.current = markdown;
    onChange({ target: { value: markdown } });
  }, [onChange]);

  useEffect(() => {
    const nextMarkdown = String(value ?? '');
    if (nextMarkdown === lastMarkdownRef.current) return;
    const el = editableRef.current;
    if (!el) {
      lastMarkdownRef.current = nextMarkdown;
      return;
    }
    const nextHtml = markdownToEditableHtml(nextMarkdown, resolveDisplayMarkdown);
    if (normalizeHtmlForCompare(el.innerHTML) !== normalizeHtmlForCompare(nextHtml)) {
      el.innerHTML = nextHtml;
    }
    lastMarkdownRef.current = nextMarkdown;
  }, [value, resolveDisplayMarkdown]);

  const focusEditable = useCallback(() => {
    editableRef.current?.focus();
  }, []);

  const applyCommand = useCallback(
    (command, commandValue = null) => {
      focusEditable();
      runExecCommand(command, commandValue);
      syncFromDom();
    },
    [focusEditable, syncFromDom],
  );

  const applyFormatBlock = useCallback(
    (tagName) => {
      applyCommand('formatBlock', `<${tagName}>`);
    },
    [applyCommand],
  );

  const editorClassName = useMemo(
    () => ['gl-rich-editor', className].filter(Boolean).join(' '),
    [className],
  );

  function insertInlineImage({ url, alt = 'Image', frame = null }) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) return;
    const normalizedFrame = normalizeGlImageFrame(frame, 'markdown');
    const frameAttr = serializeGlImageFrameAttr(normalizedFrame, 'markdown').replace(
      /'/g,
      '&apos;',
    );
    const wrapStyle = styleObjectToString(glImageFrameToWrapStyle(normalizedFrame, 'markdown'));
    const fillStyle = styleObjectToString(glImageFrameToImgFillStyle(normalizedFrame, 'markdown'));
    const snippet = `<figure class="gl-content-image-wrap" style="${wrapStyle}"><img src="${escapeHtmlAttr(safeUrl)}" alt="${escapeHtmlAttr(alt)}" class="gl-content-image" data-gl-frame='${frameAttr}' style="${fillStyle}" loading="lazy" /></figure>`;
    focusEditable();
    const inserted = runExecCommand('insertHTML', snippet);
    if (!inserted && editableRef.current) {
      editableRef.current.innerHTML = `${editableRef.current.innerHTML}${snippet}`;
    }
    syncFromDom();
  }

  return (
    <div className={editorClassName}>
      <div className="gl-rich-editor-toolbar" role="toolbar" aria-label="Mise en forme enrichie">
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyCommand('bold')}
          title="Gras"
        >
          B
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyCommand('italic')}
          title="Italique"
        >
          I
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyFormatBlock('h2')}
          title="Titre"
        >
          H2
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyFormatBlock('h3')}
          title="Sous-titre"
        >
          H3
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyCommand('insertUnorderedList')}
          title="Liste à puces"
        >
          • Liste
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyCommand('insertOrderedList')}
          title="Liste numérotée"
        >
          1. Liste
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyFormatBlock('blockquote')}
          title="Citation"
        >
          Citation
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyCommand('insertHorizontalRule')}
          title="Séparateur"
        >
          ---
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={async () => {
            // `createLink` agit sur la sélection courante du contenteditable : on la
            // mémorise avant l'ouverture du dialogue (dont le champ prend le focus),
            // puis on la restaure avant d'appliquer la commande.
            const selection = typeof window !== 'undefined' ? window.getSelection() : null;
            const savedRange =
              selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
            const url = await prompt({ message: 'URL du lien', defaultValue: 'https://' });
            if (!url) return;
            if (selection && savedRange) {
              selection.removeAllRanges();
              selection.addRange(savedRange);
            }
            applyCommand('createLink', url);
          }}
          title="Insérer un lien"
        >
          Lien
        </button>
        <button
          type="button"
          className="gl-rich-editor-tool"
          onClick={() => applyCommand('unlink')}
          title="Retirer le lien"
        >
          Delier
        </button>
      </div>

      <div
        ref={setEditableRef}
        className="gl-rich-editor-surface"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={syncFromDom}
      />

      <GLImageInlineInsertControls
        onInsert={insertInlineImage}
        onStatus={(message, isError = false) => {
          setImageStatus(String(message || ''));
          setImageStatusError(Boolean(isError));
        }}
        legend={imageLegend}
      />

      {imageStatus ? (
        <p className={imageStatusError ? 'gl-error' : 'gl-info'}>{imageStatus}</p>
      ) : null}
      {hint ? <p className="gl-rich-editor-hint">{hint}</p> : null}
    </div>
  );
});
