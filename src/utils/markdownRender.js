/**
 * Markdown rendu lourd ForetMap : parse + sanitization (client et tests Node).
 * Ce module contient marked + DOMPurify — il doit rester en dehors du bundle main.
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
const ALLOWED_ATTR_WITH_GLOSSARY = [...ALLOWED_ATTR, 'class', 'data-gl-glossary-code'];
const JOURNAL_EMBED_TYPES = new Set(['spell', 'species', 'glossary', 'chapter', 'module_stub']);

marked.setOptions({
  breaks: true,
  gfm: true,
});

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
    allowGlossaryLinks: options?.allowGlossaryLinks,
  });
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
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: attrs,
    ALLOW_DATA_ATTR: allowJournalEmbeds || allowGlossaryLinks,
  });
}
