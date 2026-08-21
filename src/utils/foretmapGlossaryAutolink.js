/**
 * Auto-liens du glossaire **ForetMap** dans du Markdown ou du texte brut.
 *
 * Pendant exact de `src/utils/glGlossaryAutolink.js` (GL) : même tronc commun
 * (`createTermAutolink`), trois points de variation seulement.
 *
 * La classe CSS `fm-glossary-inline-link` est volontairement **la même** que celle
 * produite côté serveur pour les tutoriels (`lib/foretmapGlossaryAutolink.js`) :
 * un seul style pour un seul geste, quel que soit l'écran.
 */
import { renderMarkdownToSafeHtml, sanitizeRichHtml } from './markdown.js';
import { createTermAutolink } from './termAutolink.js';

const autolink = createTermAutolink({
  codeField: 'glossary_code',
  cssClass: 'fm-glossary-inline-link',
  dataAttr: 'data-glossary-code',
});

/**
 * Fusionne l'index glossaire (auto-lien) avec des termes déjà liés à un contenu
 * (par ex. `presentation.glossaryTerms` d'une question de quiz).
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
 * Markdown ForetMap rendu en HTML sûr, puis auto-lié.
 * @param {string} markdown
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} glossaryItems
 * @param {{ allowImages?: boolean }} [options]
 * @returns {string}
 */
export function renderMarkdownWithGlossaryLinks(markdown, glossaryItems, options = {}) {
  const html = renderMarkdownToSafeHtml(markdown, {
    allowImages: options?.allowImages,
    allowGlossaryLinks: true,
  });
  const entries = buildGlossaryLinkEntries(glossaryItems);
  return autolinkHtmlTextNodes(html, entries);
}

/**
 * Texte **brut** ForetMap (énoncé de quiz, description d'interaction…) : le HTML
 * est échappé **avant** insertion des liens, puis le tout repasse au sanitizer.
 * @param {string} text
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} glossaryItems
 * @returns {string}
 */
export function renderPlainTextWithGlossaryLinks(text, glossaryItems) {
  const safe = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const entries = buildGlossaryLinkEntries(glossaryItems);
  const linked = autolinkPlainText(safe, entries);
  return sanitizeRichHtml(linked, { allowGlossaryLinks: true });
}
