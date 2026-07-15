/**
 * Auto-liens glossaire GL dans texte / HTML markdown.
 */
import { renderMarkdownToSafeHtml, sanitizeRichHtml } from './markdown.js';
import { createTermAutolink } from './glTermAutolink.js';

const autolink = createTermAutolink({
  codeField: 'glossary_code',
  cssClass: 'gl-glossary-inline-link',
  dataAttr: 'data-gl-glossary-code',
});

/**
 * Fusionne l’index glossaire (auto-lien) avec les termes liés à une question.
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} baseItems
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} extraTerms
 */
export function mergeGlossaryLinkItems(baseItems = [], extraTerms = []) {
  return autolink.mergeItems(baseItems, extraTerms);
}

/**
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} items
 * @returns {Array<{ code: string, labels: string[] }>}
 */
export function buildGlossaryLinkEntries(items) {
  return autolink.buildEntries(items);
}

/**
 * @param {string} text
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
export function autolinkPlainText(text, entries) {
  return autolink.autolinkPlainText(text, entries);
}

/**
 * @param {string} html
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
export function autolinkHtmlTextNodes(html, entries) {
  return autolink.autolinkHtmlTextNodes(html, entries);
}

/**
 * @param {string} markdown
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} glossaryItems
 * @param {{ allowImages?: boolean, allowJournalEmbeds?: boolean }} [options]
 * @returns {string}
 */
export function renderGlMarkdownWithGlossaryLinks(markdown, glossaryItems, options = {}) {
  const html = renderMarkdownToSafeHtml(markdown, {
    allowImages: options?.allowImages,
    allowJournalEmbeds: options?.allowJournalEmbeds,
    allowGlossaryLinks: true,
  });
  const entries = buildGlossaryLinkEntries(glossaryItems);
  return autolinkHtmlTextNodes(html, entries);
}

/**
 * @param {string} text
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} glossaryItems
 * @returns {string}
 */
export function renderGlPlainTextWithGlossaryLinks(text, glossaryItems) {
  const safe = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const entries = buildGlossaryLinkEntries(glossaryItems);
  const linked = autolinkPlainText(safe, entries);
  return sanitizeRichHtml(linked, { allowGlossaryLinks: true });
}
