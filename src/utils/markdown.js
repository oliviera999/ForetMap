/**
 * Markdown léger ForetMap : parse + sanitization (client et tests Node).
 */
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { repairSupplementaryPlaneEmojiMojibake } from '../shared/emojiMojibakeCore.js';
import {
  glImageFrameToImgFillStyle,
  glImageFrameToWrapStyle,
  parseGlImageFrameAttr,
  serializeGlImageFrameAttr,
} from './glImageFrame.js';

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
const ALLOWED_TAGS_WITH_IMAGES = [...ALLOWED_TAGS, 'img', 'figure'];
const ALLOWED_ATTR_WITH_IMAGES = [
  ...ALLOWED_ATTR,
  'src',
  'alt',
  'title',
  'loading',
  'class',
  'data-gl-frame',
  'data-gl-md-src',
  'style',
];
const ALLOWED_TAGS_WITH_JOURNAL = [...ALLOWED_TAGS_WITH_IMAGES, 'aside'];
const ALLOWED_ATTR_WITH_JOURNAL = [
  ...ALLOWED_ATTR_WITH_IMAGES,
  'data-gl-embed-type',
  'data-gl-ref',
];
const ALLOWED_ATTR_WITH_GLOSSARY = [...ALLOWED_ATTR, 'class', 'data-gl-glossary-code'];
const JOURNAL_EMBED_TYPES = new Set(['spell', 'species', 'glossary', 'chapter', 'module_stub']);

marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Cache LRU du rendu `marked.parse()` : les longues listes (glossaire, lore,
 * carnet) re-parsent en boucle les mêmes textes à chaque rendu. Le parse est
 * déterministe à partir du texte brut → mémoïsation par clé, éviction FIFO.
 */
const MARKED_CACHE_MAX = 300;
const markedParseCache = new Map();

function parseMarkdownCached(raw) {
  const cached = markedParseCache.get(raw);
  if (cached !== undefined) {
    // Rafraîchit l'ancienneté (LRU) : re-insertion en fin d'ordre.
    markedParseCache.delete(raw);
    markedParseCache.set(raw, cached);
    return cached;
  }
  const parsed = marked.parse(raw, { async: false });
  const html = typeof parsed === 'string' ? parsed : '';
  markedParseCache.set(raw, html);
  if (markedParseCache.size > MARKED_CACHE_MAX) {
    // Évince l'entrée la plus ancienne (première clé insérée).
    markedParseCache.delete(markedParseCache.keys().next().value);
  }
  return html;
}

function styleObjectToString(style) {
  return Object.entries(style || {})
    .map(
      ([key, value]) => `${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}:${value}`,
    )
    .join(';');
}

function decodeHtmlAttr(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function wrapMarkdownContentImagesWithDom(doc, source) {
  const template = doc.createElement('template');
  template.innerHTML = source;
  const images = template.content.querySelectorAll('img.gl-content-image');
  images.forEach((img) => {
    if (img.parentElement?.classList?.contains('gl-content-image-wrap')) return;
    const frame = parseGlImageFrameAttr(img.getAttribute('data-gl-frame'), 'markdown');
    const wrap = doc.createElement('figure');
    wrap.className = 'gl-content-image-wrap';
    const wrapStyle = styleObjectToString(glImageFrameToWrapStyle(frame, 'markdown'));
    if (wrapStyle) wrap.setAttribute('style', wrapStyle);
    img.setAttribute('style', styleObjectToString(glImageFrameToImgFillStyle(frame, 'markdown')));
    img.parentNode?.insertBefore(wrap, img);
    wrap.appendChild(img);
  });
  return template.innerHTML;
}

function wrapMarkdownContentImagesWithString(source) {
  return source.replace(
    /<img\b([^>]*\bclass="[^"]*\bgl-content-image\b[^"]*"[^>]*)>/gi,
    (imgTag) => {
      if (/gl-content-image-wrap/i.test(imgTag)) return imgTag;
      const frameMatch = imgTag.match(/data-gl-frame=(['"])(.*?)\1/i);
      const frame = parseGlImageFrameAttr(decodeHtmlAttr(frameMatch?.[2]), 'markdown');
      const wrapStyle = styleObjectToString(glImageFrameToWrapStyle(frame, 'markdown'));
      const fillStyle = styleObjectToString(glImageFrameToImgFillStyle(frame, 'markdown'));
      const imgWithoutStyle = imgTag.replace(/\sstyle=(['"]).*?\1/i, '');
      const imgWithFill = imgWithoutStyle.replace(/>$/, ` style="${fillStyle}">`);
      const wrapOpen = `<figure class="gl-content-image-wrap"${
        wrapStyle ? ` style="${wrapStyle}"` : ''
      }>`;
      return `${wrapOpen}${imgWithFill}</figure>`;
    },
  );
}

function wrapMarkdownContentImages(html) {
  const source = String(html || '');
  if (!source.includes('gl-content-image')) return source;
  if (typeof document !== 'undefined') {
    return wrapMarkdownContentImagesWithDom(document, source);
  }
  return wrapMarkdownContentImagesWithString(source);
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const glossaryCode = String(node.getAttribute('data-gl-glossary-code') || '').trim();
    if (glossaryCode) {
      node.setAttribute('href', '#');
      node.removeAttribute('target');
      node.removeAttribute('rel');
      const className = String(node.getAttribute('class') || '').trim();
      if (!className.includes('gl-glossary-inline-link')) {
        node.setAttribute('class', `${className} gl-glossary-inline-link`.trim());
      }
      return;
    }
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
    node.setAttribute('data-gl-frame', serializeGlImageFrameAttr(frame, 'markdown'));
    const className = String(node.getAttribute('class') || '').trim();
    if (!className.includes('gl-content-image')) {
      node.setAttribute('class', `${className} gl-content-image`.trim());
    }
    if (!node.parentElement?.classList?.contains('gl-content-image-wrap')) {
      node.removeAttribute('style');
    }
  }
  if (node.tagName === 'FIGURE') {
    const className = String(node.getAttribute('class') || '').trim();
    if (!className.includes('gl-content-image-wrap')) {
      node.remove();
      return;
    }
    node.setAttribute('class', 'gl-content-image-wrap');
    const img = node.querySelector('img.gl-content-image');
    if (!img) {
      node.remove();
    }
  }
  if (node.tagName === 'ASIDE') {
    const className = String(node.getAttribute('class') || '');
    if (!className.includes('gl-journal-embed')) {
      node.remove();
      return;
    }
    const embedType = String(node.getAttribute('data-gl-embed-type') || '')
      .trim()
      .toLowerCase();
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
  const raw = repairSupplementaryPlaneEmojiMojibake(String(markdown ?? '').trim());
  if (!raw) return '';
  const html = parseMarkdownCached(raw);
  return sanitizeRichHtml(html, {
    allowImages: options?.allowImages,
    allowJournalEmbeds: options?.allowJournalEmbeds,
    allowGlossaryLinks: options?.allowGlossaryLinks,
  });
}

/**
 * Insère un encart de carnet personnel GL.
 */
export function applyJournalEmbed(value, selectionStart, selectionEnd, type, ref) {
  const text = String(value ?? '');
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const safeType = String(type || '')
    .trim()
    .toLowerCase();
  const safeRef = String(ref || '')
    .trim()
    .replace(/"/g, '');
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
  const allowGlossaryLinks = Boolean(options?.allowGlossaryLinks);
  let tags = ALLOWED_TAGS;
  let attrs = ALLOWED_ATTR;
  if (allowJournalEmbeds) {
    tags = ALLOWED_TAGS_WITH_JOURNAL;
    attrs = ALLOWED_ATTR_WITH_JOURNAL;
  } else if (allowImages) {
    tags = ALLOWED_TAGS_WITH_IMAGES;
    attrs = ALLOWED_ATTR_WITH_IMAGES;
  }
  if (allowGlossaryLinks) {
    attrs = Array.from(new Set([...attrs, ...ALLOWED_ATTR_WITH_GLOSSARY]));
  }
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: attrs,
    ALLOW_DATA_ATTR: allowJournalEmbeds || allowGlossaryLinks || allowImages,
  });
  if (allowImages) {
    return wrapMarkdownContentImages(sanitized);
  }
  return sanitized;
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
export function applyMarkdownWrap(
  value,
  selectionStart,
  selectionEnd,
  prefix,
  suffix = prefix,
  placeholder = '',
) {
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
  const transformed = lines
    .map((line, i) => {
      const trimmed = line.replace(/^(\d+\.\s+|-\s+)/, '');
      return `${prefix(i)}${trimmed}`;
    })
    .join('\n');
  const nextValue = `${text.slice(0, blockStart)}${transformed}${text.slice(blockEnd)}`;
  return {
    value: nextValue,
    selectionStart: blockStart,
    selectionEnd: blockStart + transformed.length,
  };
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

export function applyMarkdownHtmlImage(
  value,
  selectionStart,
  selectionEnd,
  url,
  alt = 'Image',
  frame = null,
) {
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
