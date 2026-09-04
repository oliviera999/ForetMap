/**
 * Auto-liens du glossaire **lore** G&L (univers du jeu), séparé du glossaire SVT.
 *
 * Pendant exact de `glGlossaryAutolink.js` : même tronc commun (`createTermAutolink`),
 * trois points de variation seulement (champ de code, classe CSS, attribut de
 * données). Comme lui, ce module balaie des **chaînes** — aucune dépendance au DOM,
 * il reste exécutable côté serveur ou dans un test sans `document`.
 */
import { renderMarkdownToSafeHtml, sanitizeRichHtml } from '../shared/platform/markdown.js';
import { createTermAutolink } from './glTermAutolink.js';

const autolink = createTermAutolink({
  codeField: 'lore_code',
  cssClass: 'gl-lore-glossary-link',
  dataAttr: 'data-gl-lore-code',
});

/**
 * Fusionne l’index lore avec les termes liés à une question lore.
 * @param {Array<{ lore_code?: string, terme?: string, variantes?: string }>} baseItems
 * @param {Array<{ lore_code?: string, terme?: string, variantes?: string }>} extraTerms
 */
export function mergeLoreGlossaryLinkItems(baseItems = [], extraTerms = []) {
  return autolink.mergeItems(baseItems, extraTerms);
}

/**
 * @param {Array<{ lore_code?: string, terme?: string, variantes?: string }>} items
 * @returns {Array<{ code: string, labels: string[] }>}
 */
export function buildLoreGlossaryLinkEntries(items) {
  return autolink.buildEntries(items);
}

/**
 * @param {string} text
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
export function autolinkLorePlainText(text, entries) {
  return autolink.autolinkPlainText(text, entries);
}

/**
 * Lie les termes lore dans les nœuds texte d'un HTML déjà assaini (balayage de
 * chaîne : les contenus d'ancres, de code, d'images… ne sont jamais touchés).
 * @param {string} html
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
export function autolinkLoreHtmlTextNodes(html, entries) {
  return autolink.autolinkHtmlTextNodes(html, entries);
}

/**
 * Markdown lore rendu en HTML sûr (liens de glossaire autorisés), puis auto-lié.
 * @param {string} markdown
 * @param {Array<{ lore_code?: string, terme?: string, variantes?: string }>} items
 * @param {{ allowImages?: boolean }} [options]
 * @returns {string}
 */
export function renderGlMarkdownWithLoreGlossaryLinks(markdown, items, options = {}) {
  const html = renderMarkdownToSafeHtml(String(markdown ?? ''), {
    allowImages: options?.allowImages,
    allowGlossaryLinks: true,
  });
  const entries = buildLoreGlossaryLinkEntries(items);
  return autolinkLoreHtmlTextNodes(html, entries);
}

/**
 * Texte **brut** lore (énoncé, feuillet…) : le HTML est échappé **avant**
 * insertion des liens, puis le tout repasse au sanitizer — un `<script>` ou une
 * `<img onerror>` saisis dans le texte s'affichent tels quels, sans s'exécuter.
 * @param {string} text
 * @param {Array<{ lore_code?: string, terme?: string, variantes?: string }>} items
 * @returns {string}
 */
export function renderGlPlainTextWithLoreGlossaryLinks(text, items) {
  const safe = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const entries = buildLoreGlossaryLinkEntries(items);
  const linked = autolinkLorePlainText(safe, entries);
  return sanitizeRichHtml(linked, { allowGlossaryLinks: true });
}
