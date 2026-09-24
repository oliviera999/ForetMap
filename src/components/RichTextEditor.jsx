import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  LINK_INPUT_HELP,
  classifyLinkHref,
  renderMarkdownToSafeHtml,
  sanitizeRichHtml,
} from '../shared/platform/markdown.js';
import {
  createRichTextTurndownService,
  htmlToMarkdownWith,
  normalizeHtmlForCompare,
  runExecCommand,
} from '../shared/richtext/richTextCore.js';
import {
  divBlocksToParagraphs,
  escapeHtml,
  formatShortcut,
  hasMarkdownFormatting,
  normalizeLinkInput,
  toolTitle,
} from '../utils/richTextFormatting.js';

function markdownToEditableHtml(markdown, { allowImages = false } = {}) {
  const html = renderMarkdownToSafeHtml(markdown, { allowImages });
  if (!String(html || '').trim()) return '';
  return sanitizeRichHtml(html, { allowImages });
}

// Instance propre à ForetMap : pas de règle supplémentaire (GL y ajoute les siennes).
const turndownService = createRichTextTurndownService();

function htmlToMarkdown(html, { allowImages = false } = {}) {
  return htmlToMarkdownWith(turndownService, html, { allowImages });
}

export const RICH_TEXT_DEFAULT_HINT =
  'Sélectionner un mot, puis cliquer sur un bouton pour le mettre en forme. ' +
  'Entrée : nouveau paragraphe ; Maj+Entrée : simple retour à la ligne.';

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || '');

const shortcut = (key) => formatShortcut(key, { mac: IS_MAC });

const MAIN_ACTIONS = [
  { id: 'bold', icon: 'G', label: 'Gras', command: 'bold', shortcut: shortcut('B') },
  { id: 'italic', icon: 'I', label: 'Italique', command: 'italic', shortcut: shortcut('I') },
  { id: 'h2', icon: 'T', label: 'Titre', block: 'h2' },
  { id: 'ul', icon: '•', label: 'Liste', title: 'Liste à puces', command: 'insertUnorderedList' },
  {
    id: 'link',
    icon: '\u2197\uFE0E',
    label: 'Lien',
    title: 'Ajouter un lien',
    link: true,
    shortcut: shortcut('K'),
  },
];

const HISTORY_ACTIONS = [
  {
    id: 'undo',
    icon: '↶',
    label: 'Annuler',
    command: 'undo',
    shortcut: shortcut('Z'),
    iconOnly: true,
  },
  {
    id: 'redo',
    icon: '↷',
    label: 'Rétablir',
    command: 'redo',
    shortcut: IS_MAC ? formatShortcut('Z', { mac: true, shift: true }) : shortcut('Y'),
    iconOnly: true,
  },
];

const MORE_ACTIONS = [
  { id: 'h3', icon: 't', label: 'Petit titre', block: 'h3' },
  {
    id: 'ol',
    icon: '1.',
    label: 'Liste 1-2-3',
    title: 'Liste numérotée',
    command: 'insertOrderedList',
  },
  { id: 'quote', icon: '❝', label: 'Encadré', title: 'Encadré (citation)', block: 'blockquote' },
  { id: 'hr', icon: '—', label: 'Ligne de séparation', command: 'insertHorizontalRule' },
];

const UNLINK_ACTION = { id: 'unlink', icon: '✕', label: 'Enlever le lien', command: 'unlink' };

const EMPTY_ACTIVE = Object.freeze({
  bold: false,
  italic: false,
  ul: false,
  ol: false,
  block: '',
  link: false,
});

const BLOCK_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'P']);

/** État de la sélection lu dans le DOM (fiable partout) et complété par le navigateur. */
function readActiveState(root) {
  if (typeof window === 'undefined' || !root) return EMPTY_ACTIVE;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return EMPTY_ACTIVE;
  let node = selection.anchorNode;
  if (!node || !root.contains(node)) return EMPTY_ACTIVE;
  const next = { ...EMPTY_ACTIVE };
  let blockFound = false;
  while (node && node !== root) {
    const tag = node.nodeName;
    if (tag === 'STRONG' || tag === 'B') next.bold = true;
    if (tag === 'EM' || tag === 'I') next.italic = true;
    if (tag === 'A') next.link = true;
    if (tag === 'UL' && !next.ol) next.ul = true;
    if (tag === 'OL' && !next.ul) next.ol = true;
    if (!blockFound && BLOCK_TAGS.has(tag)) {
      next.block = tag.toLowerCase();
      blockFound = true;
    }
    if (tag === 'BLOCKQUOTE') next.block = 'blockquote';
    node = node.parentNode;
  }
  if (typeof document !== 'undefined' && typeof document.queryCommandState === 'function') {
    try {
      next.bold = next.bold || document.queryCommandState('bold');
      next.italic = next.italic || document.queryCommandState('italic');
    } catch {
      // jsdom et certains navigateurs n'implémentent pas l'état de commande.
    }
  }
  return next;
}

function isActionActive(action, active) {
  if (action.id === 'bold') return active.bold;
  if (action.id === 'italic') return active.italic;
  if (action.id === 'ul') return active.ul;
  if (action.id === 'ol') return active.ol;
  if (action.id === 'link') return active.link;
  if (action.block) return active.block === action.block;
  return false;
}

function findAncestorLink(root, node) {
  let current = node;
  while (current && current !== root) {
    if (current.nodeName === 'A') return current;
    current = current.parentNode;
  }
  return null;
}

/**
 * Position du curseur sous forme de chemin d'indices depuis la racine. Réécrire
 * `innerHTML` renvoie sinon le curseur au début : après une conversion `<div>` → `<p>`,
 * la structure est identique et le même chemin retrouve le même endroit.
 */
function nodePath(root, target) {
  const path = [];
  let node = target;
  while (node && node !== root) {
    const parent = node.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
    node = parent;
  }
  return node === root ? path : null;
}

function resolvePoint(root, point) {
  let node = root;
  for (const index of point.path) {
    node = node.childNodes[index];
    if (!node) return null;
  }
  const max = node.nodeType === 3 ? node.textContent.length : node.childNodes.length;
  return { node, offset: Math.min(point.offset, max) };
}

function readCaretPath(root) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (document.activeElement !== root) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const startPath = nodePath(root, range.startContainer);
  const endPath = nodePath(root, range.endContainer);
  if (!startPath || !endPath) return null;
  return {
    start: { path: startPath, offset: range.startOffset },
    end: { path: endPath, offset: range.endOffset },
  };
}

function restoreCaretPath(root, saved) {
  const selection = window.getSelection();
  if (!selection) return;
  const start = resolvePoint(root, saved.start);
  const end = resolvePoint(root, saved.end);
  const range = document.createRange();
  if (start && end) {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

const EMPTY_LINK_PANEL = Object.freeze({
  open: false,
  text: '',
  url: '',
  error: '',
});

export const RichTextEditor = React.forwardRef(function RichTextEditor(
  {
    value,
    onChange,
    className = '',
    placeholder = 'Saisissez votre texte…',
    hint = RICH_TEXT_DEFAULT_HINT,
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
  },
  forwardedRef,
) {
  const editableRef = useRef(null);
  const lastMarkdownRef = useRef(null);
  const savedRangeRef = useRef(null);
  const userToggledRef = useRef(false);
  const linkUrlInputRef = useRef(null);
  const baseId = useId();
  const toolbarId = `${baseId}-toolbar`;
  const moreId = `${baseId}-more`;

  const [toolbarOpen, setToolbarOpen] = useState(() => hasMarkdownFormatting(value));
  const [moreOpen, setMoreOpen] = useState(false);
  const [active, setActive] = useState(EMPTY_ACTIVE);
  const [linkPanel, setLinkPanel] = useState(EMPTY_LINK_PANEL);

  const setEditableRef = useCallback(
    (element) => {
      editableRef.current = element;
      if (typeof forwardedRef === 'function') forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    },
    [forwardedRef],
  );

  const emitMarkdown = useCallback(
    (markdown) => {
      if (typeof onChange !== 'function') return;
      lastMarkdownRef.current = markdown;
      onChange({ target: { value: markdown, name }, currentTarget: { value: markdown, name } });
    },
    [name, onChange],
  );

  const syncFromDom = useCallback(() => {
    const el = editableRef.current;
    if (!el || disabled || readOnly) return;
    const sanitized = sanitizeRichHtml(divBlocksToParagraphs(el.innerHTML), { allowImages });
    if (el.innerHTML !== sanitized) {
      const caret = readCaretPath(el);
      el.innerHTML = sanitized;
      if (caret) restoreCaretPath(el, caret);
    }
    let markdown = htmlToMarkdown(sanitized, { allowImages });
    if (
      Number.isFinite(Number(maxLength)) &&
      Number(maxLength) >= 0 &&
      markdown.length > Number(maxLength)
    ) {
      markdown = markdown.slice(0, Number(maxLength));
      el.innerHTML = markdownToEditableHtml(markdown, { allowImages });
    }
    emitMarkdown(markdown);
  }, [allowImages, disabled, emitMarkdown, maxLength, readOnly]);

  useEffect(() => {
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
  }, [allowImages, value]);

  // Un contenu chargé après coup (fiche ouverte, brouillon restauré) déplie la barre s'il
  // est déjà mis en forme — sauf si l'utilisateur l'a lui-même repliée.
  useEffect(() => {
    if (userToggledRef.current) return;
    if (hasMarkdownFormatting(value)) setToolbarOpen(true);
  }, [value]);

  const refreshActive = useCallback(() => {
    setActive(readActiveState(editableRef.current));
  }, []);

  useEffect(() => {
    if (!toolbar || !toolbarOpen || typeof document === 'undefined') return undefined;
    const onSelectionChange = () => {
      const root = editableRef.current;
      const selection = window.getSelection();
      if (!root || !selection || !selection.anchorNode || !root.contains(selection.anchorNode)) {
        return;
      }
      refreshActive();
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [refreshActive, toolbar, toolbarOpen]);

  const focusEditable = useCallback(() => {
    editableRef.current?.focus();
  }, []);

  // Entrée doit créer des paragraphes `<p>` plutôt que des `<div>` (Chrome, Edge, Firefox).
  // Chrome ignore ce réglage pendant l'événement de focus : on le pose aussi juste avant
  // chaque Entrée, là où il est pris en compte à coup sûr.
  const handleFocus = useCallback(() => {
    runExecCommand('defaultParagraphSeparator', 'p');
  }, []);

  const applyCommand = useCallback(
    (command, commandValue = null) => {
      if (disabled || readOnly) return;
      focusEditable();
      runExecCommand(command, commandValue);
      syncFromDom();
      refreshActive();
    },
    [disabled, focusEditable, readOnly, refreshActive, syncFromDom],
  );

  const saveSelection = useCallback(() => {
    const root = editableRef.current;
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (
      root &&
      selection &&
      selection.rangeCount > 0 &&
      root.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    } else {
      savedRangeRef.current = null;
    }
    return selection;
  }, []);

  const restoreSelection = useCallback(() => {
    const root = editableRef.current;
    if (!root || typeof window === 'undefined') return;
    root.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    if (savedRangeRef.current) {
      selection.addRange(savedRangeRef.current);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    selection.addRange(range);
  }, []);

  const openLinkPanel = useCallback(() => {
    if (disabled || readOnly) return;
    const selection = saveSelection();
    const root = editableRef.current;
    const anchorLink =
      selection && selection.anchorNode ? findAncestorLink(root, selection.anchorNode) : null;
    if (anchorLink && savedRangeRef.current?.collapsed) {
      const range = document.createRange();
      range.selectNodeContents(anchorLink);
      savedRangeRef.current = range;
    }
    const selectedText = savedRangeRef.current ? savedRangeRef.current.toString() : '';
    setToolbarOpen(true);
    setLinkPanel({
      open: true,
      text: selectedText,
      url: anchorLink?.getAttribute('href') || '',
      error: '',
    });
  }, [disabled, readOnly, saveSelection]);

  useEffect(() => {
    if (linkPanel.open) linkUrlInputRef.current?.focus();
  }, [linkPanel.open]);

  const closeLinkPanel = useCallback(
    ({ refocus = true } = {}) => {
      setLinkPanel(EMPTY_LINK_PANEL);
      if (refocus) restoreSelection();
    },
    [restoreSelection],
  );

  const submitLink = useCallback(() => {
    const url = normalizeLinkInput(linkPanel.url);
    if (!url || url === 'https://') {
      setLinkPanel((prev) => ({ ...prev, error: 'Indiquer l’adresse du lien.' }));
      return;
    }
    // Une adresse hors politique (`ftp:`, `//autre-site`…) perdrait son `href` à
    // l'assainissement : le lien disparaîtrait sans un mot. On le dit tout de suite.
    if (classifyLinkHref(url) === null) {
      setLinkPanel((prev) => ({
        ...prev,
        error:
          'Cette adresse n’est pas reconnue. Exemple d’adresse valide : https://www.exemple.fr',
      }));
      return;
    }
    const range = savedRangeRef.current;
    const originalText = range ? range.toString() : '';
    const text = linkPanel.text.trim() || originalText || url;
    setLinkPanel(EMPTY_LINK_PANEL);
    restoreSelection();
    if (range && !range.collapsed && text === originalText) {
      runExecCommand('createLink', url);
    } else {
      runExecCommand('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>&nbsp;`);
    }
    syncFromDom();
    refreshActive();
  }, [linkPanel.text, linkPanel.url, refreshActive, restoreSelection, syncFromDom]);

  const applyAction = useCallback(
    (action) => {
      if (action.link) {
        openLinkPanel();
        return;
      }
      if (action.block) {
        const alreadyApplied = active.block === action.block;
        applyCommand('formatBlock', alreadyApplied ? '<p>' : `<${action.block}>`);
        return;
      }
      applyCommand(action.command);
    },
    [active.block, applyCommand, openLinkPanel],
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        runExecCommand('defaultParagraphSeparator', 'p');
        // Une première ligne tapée dans une zone vide reste du texte nu : on la range dans
        // un paragraphe pour que l'espacement soit le même entre toutes les lignes.
        const root = editableRef.current;
        const anchor = typeof window !== 'undefined' ? window.getSelection()?.anchorNode : null;
        if (root && anchor && (anchor === root || anchor.parentNode === root)) {
          runExecCommand('formatBlock', '<p>');
        }
        return;
      }
      if (!toolbar) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openLinkPanel();
      }
    },
    [openLinkPanel, toolbar],
  );

  const handleLinkPanelKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        // L'éditeur vit souvent dans un <form> : Entrée ne doit pas soumettre la fiche.
        event.preventDefault();
        submitLink();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeLinkPanel();
      }
    },
    [closeLinkPanel, submitLink],
  );

  const toggleToolbar = useCallback(() => {
    userToggledRef.current = true;
    if (toolbarOpen) {
      setMoreOpen(false);
      setLinkPanel(EMPTY_LINK_PANEL);
    }
    setToolbarOpen(!toolbarOpen);
  }, [toolbarOpen]);

  const editorClassName = useMemo(
    () => ['rich-text-editor', className].filter(Boolean).join(' '),
    [className],
  );
  const minHeight = Math.max(3, Number(rows) || 3) * 2.15;
  const toolsDisabled = disabled || readOnly;

  const renderTool = (action) => {
    const pressable = action.command !== 'undo' && action.command !== 'redo' && action.id !== 'hr';
    const isActive = pressable && isActionActive(action, active);
    const title = toolTitle(action.title || action.label, action.shortcut);
    return (
      <button
        key={action.id}
        type="button"
        className={[
          'rich-text-editor-tool btn btn-ghost btn-sm',
          `rich-text-editor-tool--${action.id}`,
          isActive ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={title}
        aria-label={action.title || action.label}
        aria-pressed={pressable ? isActive : undefined}
        disabled={toolsDisabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => applyAction(action)}
      >
        <span className="rich-text-editor-tool-icon" aria-hidden="true">
          {action.icon}
        </span>
        {action.iconOnly ? null : (
          <span className="rich-text-editor-tool-label">{action.label}</span>
        )}
      </button>
    );
  };

  return (
    <div className={editorClassName} {...rest}>
      {toolbar ? (
        <div className="rich-text-editor-head">
          <button
            type="button"
            className={[
              'rich-text-editor-toggle btn btn-ghost btn-sm',
              toolbarOpen ? 'is-open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-expanded={toolbarOpen}
            aria-controls={toolbarId}
            title={toolbarOpen ? 'Masquer les outils de mise en forme' : 'Mettre le texte en forme'}
            disabled={toolsDisabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleToolbar}
          >
            <span className="rich-text-editor-toggle-icon" aria-hidden="true">
              Aa
            </span>
            <span>Mise en forme</span>
          </button>
        </div>
      ) : null}

      {toolbar && toolbarOpen ? (
        <div id={toolbarId} className="rich-text-editor-tools">
          <div
            className="rich-text-editor-toolbar"
            role="toolbar"
            aria-label="Mise en forme du texte"
          >
            <div className="rich-text-editor-group">{MAIN_ACTIONS.map(renderTool)}</div>
            {active.link ? (
              <div className="rich-text-editor-group">{renderTool(UNLINK_ACTION)}</div>
            ) : null}
            <div className="rich-text-editor-group">{HISTORY_ACTIONS.map(renderTool)}</div>
            <button
              type="button"
              className={[
                'rich-text-editor-tool rich-text-editor-more-toggle btn btn-ghost btn-sm',
                moreOpen ? 'is-open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-expanded={moreOpen}
              aria-controls={moreId}
              title="Plus d’outils de mise en forme"
              disabled={toolsDisabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setMoreOpen((prev) => !prev)}
            >
              Plus…
            </button>
          </div>
          {moreOpen ? (
            <div
              id={moreId}
              className="rich-text-editor-toolbar rich-text-editor-toolbar--more"
              role="toolbar"
              aria-label="Autres outils de mise en forme"
            >
              <div className="rich-text-editor-group">{MORE_ACTIONS.map(renderTool)}</div>
            </div>
          ) : null}
          {linkPanel.open ? (
            <div className="rich-text-editor-link-panel" role="group" aria-label="Ajouter un lien">
              <label className="rich-text-editor-link-field">
                <span>Texte à afficher</span>
                <input
                  type="text"
                  value={linkPanel.text}
                  placeholder="Exemple : la fiche"
                  onKeyDown={handleLinkPanelKeyDown}
                  onChange={(event) =>
                    setLinkPanel((prev) => ({ ...prev, text: event.target.value, error: '' }))
                  }
                />
              </label>
              <label className="rich-text-editor-link-field">
                <span>Adresse du lien</span>
                <input
                  ref={linkUrlInputRef}
                  type="text"
                  inputMode="url"
                  value={linkPanel.url}
                  placeholder="Exemple : www.exemple.fr"
                  aria-invalid={linkPanel.error ? true : undefined}
                  onKeyDown={handleLinkPanelKeyDown}
                  onChange={(event) =>
                    setLinkPanel((prev) => ({ ...prev, url: event.target.value, error: '' }))
                  }
                />
              </label>
              {linkPanel.error ? (
                <div className="rich-text-editor-link-error" role="alert">
                  <p>{linkPanel.error}</p>
                  <details>
                    <summary>En savoir plus</summary>
                    <p>{LINK_INPUT_HELP}</p>
                  </details>
                </div>
              ) : null}
              <div className="rich-text-editor-link-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={submitLink}>
                  Ajouter le lien
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => closeLinkPanel()}
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        id={id}
        ref={setEditableRef}
        className="rich-text-editor-surface markdown-content"
        contentEditable={!disabled && !readOnly}
        tabIndex={disabled || readOnly ? -1 : 0}
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        aria-disabled={disabled || undefined}
        data-placeholder={placeholder}
        style={{ minHeight: `${minHeight}rem` }}
        onFocus={handleFocus}
        onInput={syncFromDom}
        onBlur={syncFromDom}
        onKeyDown={handleKeyDown}
        onKeyUp={toolbarOpen ? refreshActive : undefined}
        onMouseUp={toolbarOpen ? refreshActive : undefined}
      />

      {name ? <input type="hidden" name={name} value={String(value ?? '')} readOnly /> : null}
      {toolbar && toolbarOpen && hint ? (
        <p className="rich-text-editor-hint" aria-hidden="true">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
