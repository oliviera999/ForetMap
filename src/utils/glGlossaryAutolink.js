/**
 * Auto-liens glossaire GL dans texte / HTML markdown.
 */
import { renderMarkdownToSafeHtml, sanitizeRichHtml } from './markdown.js';

const SKIP_TAGS = new Set(['a', 'button', 'code', 'pre', 'script', 'style', 'img', 'aside']);

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLabels(terme, variantes) {
  const labels = new Set();
  const main = String(terme || '').trim();
  if (main) labels.add(main);
  for (const part of String(variantes || '').split(/[,;|\n]+/)) {
    const label = part.trim();
    if (label) labels.add(label);
  }
  return [...labels];
}

/**
 * @param {Array<{ glossary_code?: string, terme?: string, variantes?: string }>} items
 * @returns {Array<{ code: string, labels: string[] }>}
 */
export function buildGlossaryLinkEntries(items) {
  const entries = [];
  for (const item of items || []) {
    const code = String(item?.glossary_code || '').trim();
    if (!code) continue;
    const labels = splitLabels(item.terme, item.variantes);
    if (labels.length === 0) continue;
    entries.push({ code, labels });
  }
  entries.sort((a, b) => {
    const maxA = Math.max(...a.labels.map((label) => label.length));
    const maxB = Math.max(...b.labels.map((label) => label.length));
    return maxB - maxA;
  });
  return entries;
}

function buildLabelRegex(label) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(label)}(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * @param {string} text
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
export function autolinkPlainText(text, entries) {
  const source = String(text ?? '');
  if (!source || !Array.isArray(entries) || entries.length === 0) return source;

  const matches = [];
  for (const entry of entries) {
    for (const label of entry.labels) {
      if (!label) continue;
      const regex = buildLabelRegex(label);
      let match;
      while ((match = regex.exec(source)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          code: entry.code,
          text: match[0],
        });
      }
    }
  }

  if (matches.length === 0) return source;

  matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });

  const selected = [];
  let cursor = -1;
  for (const match of matches) {
    if (match.start < cursor) continue;
    selected.push(match);
    cursor = match.end;
  }

  let result = '';
  let index = 0;
  for (const match of selected) {
    result += source.slice(index, match.start);
    result += `<a href="#" class="gl-glossary-inline-link" data-gl-glossary-code="${match.code}">${match.text}</a>`;
    index = match.end;
  }
  result += source.slice(index);
  return result;
}

/**
 * @param {string} html
 * @param {Array<{ code: string, labels: string[] }>} entries
 * @returns {string}
 */
export function autolinkHtmlTextNodes(html, entries) {
  const source = String(html ?? '');
  if (!source || !Array.isArray(entries) || entries.length === 0) return source;

  const tokens = source.split(/(<[^>]+>)/g);
  let skipDepth = 0;

  return tokens
    .map((token) => {
      if (!token.startsWith('<')) {
        return skipDepth > 0 ? token : autolinkPlainText(token, entries);
      }

      const close = /^<\/(\w+)/i.exec(token);
      if (close && SKIP_TAGS.has(close[1].toLowerCase())) {
        skipDepth = Math.max(0, skipDepth - 1);
        return token;
      }

      const open = /^<(\w+)/i.exec(token);
      if (open && SKIP_TAGS.has(open[1].toLowerCase()) && !/\/>$/.test(token.trim())) {
        skipDepth += 1;
      }
      return token;
    })
    .join('');
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
