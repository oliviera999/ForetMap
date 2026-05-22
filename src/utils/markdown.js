/**
 * Markdown léger ForetMap : parse + sanitization (client et tests Node).
 */
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'a'];
const ALLOWED_ATTR = ['href', 'rel', 'target', 'title'];
const ALLOWED_TAGS_WITH_IMAGES = [...ALLOWED_TAGS, 'img'];
const ALLOWED_ATTR_WITH_IMAGES = [...ALLOWED_ATTR, 'src', 'alt', 'title', 'loading'];

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
    }
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
  const allowImages = Boolean(options?.allowImages);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowImages ? ALLOWED_TAGS_WITH_IMAGES : ALLOWED_TAGS,
    ALLOWED_ATTR: allowImages ? ALLOWED_ATTR_WITH_IMAGES : ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
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
