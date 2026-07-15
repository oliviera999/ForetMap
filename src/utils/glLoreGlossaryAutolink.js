/**
 * Auto-liens glossaire lore GL (séparé du glossaire SVT).
 */
import { renderMarkdownToSafeHtml } from './markdown.js';
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

export function buildLoreGlossaryLinkEntries(items) {
  return autolink.buildEntries(items);
}

export function autolinkLorePlainText(text, entries) {
  return autolink.autolinkPlainText(text, entries);
}

export function renderGlMarkdownWithLoreGlossaryLinks(markdown, items, options = {}) {
  const html = renderMarkdownToSafeHtml(String(markdown ?? ''), options);
  if (!html || !items?.length) return html;
  const entries = buildLoreGlossaryLinkEntries(items);
  if (!entries.length) return html;
  const container = document.createElement('div');
  container.innerHTML = html;
  autolink.walkAndLink(container, entries);
  return container.innerHTML;
}

export function renderGlPlainTextWithLoreGlossaryLinks(text, items) {
  const entries = buildLoreGlossaryLinkEntries(items);
  return autolinkLorePlainText(text, entries);
}
