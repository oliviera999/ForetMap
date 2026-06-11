/**
 * Markdown léger ForetMap : helpers purs de transformation de texte (sans marked/DOMPurify).
 * Pour le rendu HTML (marked + DOMPurify), importer markdownRender.js.
 */
import { serializeGlImageFrameAttr } from './glImageFrame.js';

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
