import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TurndownService from 'turndown';

// Singleton de module rendu chargé paresseusement.
let renderModuleCache = null;
let renderModRef = null;

function loadRenderModule() {
  if (!renderModuleCache) {
    renderModuleCache = import('../utils/markdownRender.js').then((mod) => {
      renderModRef = mod;
      return mod;
    });
  }
  return renderModuleCache;
}

function normalizeHtmlForCompare(html) {
  return String(html || '').replace(/\s+/g, ' ').trim();
}

function markdownToEditableHtml(markdown, { allowImages = false } = {}) {
  if (!renderModRef) return '';
  const html = renderModRef.renderMarkdownToSafeHtml(markdown, { allowImages });
  if (!String(html || '').trim()) return '';
  return renderModRef.sanitizeRichHtml(html, { allowImages });
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '*',
});

turndownService.remove(['script', 'style']);
turndownService.keep(['hr']);

function htmlToMarkdown(html, { allowImages = false } = {}) {
  if (!renderModRef) return '';
  const sanitized = renderModRef.sanitizeRichHtml(html, { allowImages });
  const markdown = turndownService.turndown(sanitized);
  return String(markdown || '').trim();
}

function runExecCommand(command, commandValue = null) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  return document.execCommand(command, false, commandValue);
}

const DEFAULT_ACTIONS = [
  { id: 'bold', label: 'B', title: 'Gras', command: 'bold' },
  { id: 'italic', label: 'I', title: 'Italique', command: 'italic' },
  { id: 'h2', label: 'H2', title: 'Titre', block: 'h2' },
  { id: 'h3', label: 'H3', title: 'Sous-titre', block: 'h3' },
  { id: 'ul', label: '• Liste', title: 'Liste à puces', command: 'insertUnorderedList' },
  { id: 'ol', label: '1. Liste', title: 'Liste numérotée', command: 'insertOrderedList' },
  { id: 'quote', label: 'Citation', title: 'Citation', block: 'blockquote' },
  { id: 'hr', label: '---', title: 'Séparateur', command: 'insertHorizontalRule' },
  { id: 'link', label: 'Lien', title: 'Insérer un lien', link: true },
  { id: 'unlink', label: 'Délier', title: 'Retirer le lien', command: 'unlink' },
];

export const RichTextEditor = React.forwardRef(function RichTextEditor({
  value,
  onChange,
  className = '',
  placeholder = 'Saisissez votre texte…',
  hint = 'Mise en forme enrichie : titres, listes, citations et liens.',
  allowImages = false,
  toolbar = true,
  disabled = false,
  readOnly = false,
  id,
  name,
  rows = 3,
  maxLength,
  'aria-label': ariaLabel,
  ...rest
}, forwardedRef) {
  const editableRef = useRef(null);
  const lastMarkdownRef = useRef(null);

  // renderReady passe à true une fois markdownRender.js chargé.
  const [renderReady, setRenderReady] = useState(() => renderModRef !== null);

  useEffect(() => {
    if (renderModRef !== null) return;
    let cancelled = false;
    loadRenderModule().then(() => {
      if (!cancelled) setRenderReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const setEditableRef = useCallback((element) => {
    editableRef.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }, [forwardedRef]);

  const emitMarkdown = useCallback((markdown) => {
    if (typeof onChange !== 'function') return;
    lastMarkdownRef.current = markdown;
    onChange({ target: { value: markdown, name }, currentTarget: { value: markdown, name } });
  }, [name, onChange]);

  const syncFromDom = useCallback(() => {
    if (!renderReady) return;
    const el = editableRef.current;
    if (!el || disabled || readOnly) return;
    const sanitized = renderModRef.sanitizeRichHtml(el.innerHTML, { allowImages });
    if (el.innerHTML !== sanitized) {
      el.innerHTML = sanitized;
    }
    let markdown = htmlToMarkdown(sanitized, { allowImages });
    if (Number.isFinite(Number(maxLength)) && Number(maxLength) >= 0 && markdown.length > Number(maxLength)) {
      markdown = markdown.slice(0, Number(maxLength));
      el.innerHTML = markdownToEditableHtml(markdown, { allowImages });
    }
    emitMarkdown(markdown);
  }, [allowImages, disabled, emitMarkdown, maxLength, readOnly, renderReady]);

  useEffect(() => {
    if (!renderReady) return;
    const nextMarkdown = String(value ?? '');
    if (nextMarkdown === lastMarkdownRef.current) return;
    const el = editableRef.current;
    if (!el) {
      lastMarkdownRef.current = nextMarkdown;
      return;
    }
    const nextHtml = markdownToEditableHtml(nextMarkdown, { allowImages });
    if (normalizeHtmlForCompare(el.innerHTML) !== normalizeHtmlForCompare(nextHtml)) {
      el.innerHTML = nextHtml;
    }
    lastMarkdownRef.current = nextMarkdown;
  }, [allowImages, value, renderReady]);

  const focusEditable = useCallback(() => {
    editableRef.current?.focus();
  }, []);

  const applyCommand = useCallback((command, commandValue = null) => {
    if (disabled || readOnly) return;
    focusEditable();
    runExecCommand(command, commandValue);
    syncFromDom();
  }, [disabled, focusEditable, readOnly, syncFromDom]);

  const applyAction = useCallback((action) => {
    if (action.link) {
      const url = typeof window !== 'undefined' ? window.prompt('URL du lien', 'https://') : 'https://';
      if (!url) return;
      applyCommand('createLink', url);
      return;
    }
    if (action.block) {
      applyCommand('formatBlock', `<${action.block}>`);
      return;
    }
    applyCommand(action.command);
  }, [applyCommand]);

  const editorClassName = useMemo(() => (
    ['rich-text-editor', className].filter(Boolean).join(' ')
  ), [className]);
  const minHeight = Math.max(3, Number(rows) || 3) * 2.15;

  return (
    <div className={editorClassName} {...rest}>
      {toolbar ? (
        <div className="rich-text-editor-toolbar" role="toolbar" aria-label="Mise en forme enrichie">
          {DEFAULT_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="rich-text-editor-tool btn btn-ghost btn-sm"
              title={action.title}
              aria-label={action.title}
              disabled={disabled || readOnly}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        id={id}
        ref={setEditableRef}
        className="rich-text-editor-surface markdown-content"
        contentEditable={!disabled && !readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        aria-disabled={disabled || undefined}
        data-placeholder={placeholder}
        style={{ minHeight: `${minHeight}rem` }}
        onInput={syncFromDom}
        onBlur={syncFromDom}
      />

      {name ? <input type="hidden" name={name} value={String(value ?? '')} readOnly /> : null}
      {toolbar && hint ? <p className="rich-text-editor-hint" aria-hidden="true">{hint}</p> : null}
    </div>
  );
});
