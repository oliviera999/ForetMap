/**
 * Markdown léger ForetMap : parse + sanitization (client et tests Node).
 */
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { glImageFrameToStyle, parseGlImageFrameAttr, serializeGlImageFrameAttr } from './glImageFrame.js';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'ul',
  'ol',
  'li',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'hr',
];
const ALLOWED_ATTR = ['href', 'rel', 'target', 'title'];
const ALLOWED_TAGS_WITH_IMAGES = [...ALLOWED_TAGS, 'img'];
const ALLOWED_ATTR_WITH_IMAGES = [...ALLOWED_ATTR, 'src', 'alt', 'title', 'loading', 'class', 'data-gl-frame', 'style'];
const ALLOWED_TAGS_WITH_JOURNAL = [...ALLOWED_TAGS_WITH_IMAGES, 'aside'];
const ALLOWED_ATTR_WITH_JOURNAL = [...ALLOWED_ATTR_WITH_IMAGES, 'data-gl-embed-type', 'data-gl-ref'];
const JOURNAL_EMBED_TYPES = new Set(['spell', 'species', 'glossary', 'chapter', 'module_stub']);

marked.setOptions({
  breaks: true,
  gfm: true,
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || '';
    if (/^https?:/i.test(href)) {
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    } else {
      node.removeAttribute('href');
    }
  }
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') || '';
    if (!/^https?:\/\//i.test(src) && !/^\/uploads\//i.test(src) && !/^\/maps\//i.test(src)) {
      node.removeAttribute('src');
      return;
    }
    const frame = parseGlImageFrameAttr(node.getAttribute('data-gl-frame'), 'markdown');
    const style = glImageFrameToStyle(frame);
    const styleString = Object.entries(style)
      .map(([key, value]) => `${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}:${value}`)
      .join(';');
    node.setAttribute('data-gl-frame', serializeGlImageFrameAttr(frame, 'markdown'));
    node.setAttribute('style', styleString);
    const className = String(node.getAttribute('class') || '').trim();
    if (!className.includes('gl-content-image')) {
      node.setAttribute('class', `${className} gl-content-image`.trim());
    }
  }
  if (node.tagName === 'ASIDE') {
    const className = String(node.getAttribute('class') || '');
    if (!className.includes('gl-journal-embed')) {
      node.remove();
      return;
    }
    const embedType = String(node.getAttribute('data-gl-embed-type') || '').trim().toLowerCase();
    const embedRef = String(node.getAttribute('data-gl-ref') || '').trim();
    if (!JOURNAL_EMBED_TYPES.has(embedType) || !embedRef) {
      node.remove();
      return;
    }
    node.setAttribute('class', 'gl-journal-embed');
    node.setAttribute('data-gl-embed-type', embedType);
    node.setAttribute('data-gl-ref', embedRef);
  }
});

/**
 * @param {string} markdown
 * @param {{ allowImages?: boolean }} [options]
 * @returns {string} HTML sécurisé (chaîne vide si entrée vide)
 */
export function renderMarkdownToSafeHtml(markdown, options = {}) {
  const raw = String(markdown ?? '').trim();
  if (!raw) return '';
  const parsed = marked.parse(raw, { async: false });
  const html = typeof parsed === 'string' ? parsed : '';
  return sanitizeRichHtml(html, {
    allowImages: options?.allowImages,
    allowJournalEmbeds: options?.allowJournalEmbeds,
  });
}

/**
 * Insère un encart de carnet personnel GL.
 */
export function applyJournalEmbed(value, selectionStart, selectionEnd, type, ref) {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const safeType = String(type || '').trim().toLowerCase();
  const safeRef = String(ref || '').trim().replace(/"/g, '');
  const snippet = `\n\n<aside class="gl-journal-embed" data-gl-embed-type="${safeType}" data-gl-ref="${safeRef}"></aside>\n\n`;
  const nextValue = `${text.slice(0, start)}${snippet}${text.slice(end)}`;
  const cursor = start + snippet.length;
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
}

/**
 * @param {string} html
 * @param {{ allowImages?: boolean }} [options]
 * @returns {string}
 */
export function sanitizeRichHtml(html, options = {}) {
  const allowImages = Boolean(options?.allowImages);
  const allowJournalEmbeds = Boolean(options?.allowJournalEmbeds);
  let tags = ALLOWED_TAGS;
  let attrs = ALLOWED_ATTR;
  if (allowJournalEmbeds) {
    tags = ALLOWED_TAGS_WITH_JOURNAL;
    attrs = ALLOWED_ATTR_WITH_JOURNAL;
  } else if (allowImages) {
    tags = ALLOWED_TAGS_WITH_IMAGES;
    attrs = ALLOWED_ATTR_WITH_IMAGES;
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: attrs,
    ALLOW_DATA_ATTR: allowJournalEmbeds,
  });
}

/**
 * Insère ou entoure la sélection avec un préfixe/suffixe Markdown.
 * @param {string} value
 * @param {number} selectionStart
 * @param {number} selectionEnd
 * @param {string} prefix
 * @param {string} [suffix]
 * @param {string} [placeholder]
 * @returns {{ value: string, selectionStart: number, selectionEnd: number }}
 */
export function applyMarkdownWrap(value, selectionStart, selectionEnd, prefix, suffix = prefix, placeholder = '') {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const selected = text.slice(start, end) || placeholder;
  const wrapped = `${prefix}${selected}${suffix}`;
  const nextValue = `${text.slice(0, start)}${wrapped}${text.slice(end)}`;
  const innerStart = start + prefix.length;
  const innerEnd = innerStart + selected.length;
  return { value: nextValue, selectionStart: innerStart, selectionEnd: innerEnd };
}

/**
 * Préfixe chaque ligne sélectionnée (ou la ligne courante) pour une liste.
 * @param {string} value
 * @param {number} selectionStart
 * @param {number} selectionEnd
 * @param {'ul'|'ol'} listType
 * @returns {{ value: string, selectionStart: number, selectionEnd: number }}
 */
export function applyMarkdownList(value, selectionStart, selectionEnd, listType) {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  let blockStart = start;
  let blockEnd = end;
  if (start === end) {
    blockStart = text.lastIndexOf('\n', start - 1) + 1;
    blockEnd = text.indexOf('\n', start);
    if (blockEnd === -1) blockEnd = text.length;
  } else {
    blockStart = text.lastIndexOf('\n', start - 1) + 1;
    const afterEnd = text.indexOf('\n', end);
    blockEnd = afterEnd === -1 ? text.length : afterEnd;
  }
  const block = text.slice(blockStart, blockEnd);
  const lines = block.split('\n');
  const prefix = listType === 'ol' ? (i) => `${i + 1}. ` : () => '- ';
  const transformed = lines.map((line, i) => {
    const trimmed = line.replace(/^(\d+\.\s+|-\s+)/, '');
    return `${prefix(i)}${trimmed}`;
  }).join('\n');
  const nextValue = `${text.slice(0, blockStart)}${transformed}${text.slice(blockEnd)}`;
  return { value: nextValue, selectionStart: blockStart, selectionEnd: blockStart + transformed.length };
}

/**
 * Insère un lien Markdown [texte](url).
 */
/**
 * Insère une image Markdown ![alt](url) à la position du curseur.
 */
export function applyMarkdownImage(value, selectionStart, selectionEnd, url, alt = 'Image') {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const safeUrl = String(url || '').trim();
  const safeAlt = String(alt || 'Image').replace(/[\[\]]/g, '');
  const snippet = `\n\n![${safeAlt}](${safeUrl})\n\n`;
  const nextValue = `${text.slice(0, start)}${snippet}${text.slice(end)}`;
  const cursor = start + snippet.length;
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
}

export function applyMarkdownHtmlImage(value, selectionStart, selectionEnd, url, alt = 'Image', frame = null) {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const safeUrl = String(url || '').trim();
  const safeAlt = String(alt || 'Image').replace(/"/g, '&quot;');
  const frameAttr = serializeGlImageFrameAttr(frame, 'markdown').replace(/'/g, '&apos;');
  const snippet = `\n\n<img src="${safeUrl}" alt="${safeAlt}" class="gl-content-image" data-gl-frame='${frameAttr}' loading="lazy" />\n\n`;
  const nextValue = `${text.slice(0, start)}${snippet}${text.slice(end)}`;
  const cursor = start + snippet.length;
  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
}

export function applyMarkdownLink(value, selectionStart, selectionEnd) {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const selected = text.slice(start, end) || 'texte';
  const wrapped = `[${selected}](https://)`;
  const nextValue = `${text.slice(0, start)}${wrapped}${text.slice(end)}`;
  const urlStart = start + selected.length + 3;
  const urlEnd = urlStart + 8;
  return { value: nextValue, selectionStart: urlStart, selectionEnd: urlEnd };
}
