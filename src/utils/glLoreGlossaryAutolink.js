/**
 * Auto-liens glossaire lore GL (séparé du glossaire SVT).
 */
import { renderMarkdownToSafeHtml } from './markdownRender.js';

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

export function buildLoreGlossaryLinkEntries(items) {
  const entries = [];
  for (const item of items || []) {
    const code = String(item?.lore_code || '').trim();
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

export function autolinkLorePlainText(text, entries) {
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
    return (b.end - b.start) - (a.end - a.start);
  });

  const kept = [];
  let cursor = -1;
  for (const m of matches) {
    if (m.start < cursor) continue;
    kept.push(m);
    cursor = m.end;
  }

  let out = '';
  let pos = 0;
  for (const m of kept) {
    out += source.slice(pos, m.start);
    out += `<a href="#" class="gl-lore-glossary-link" data-gl-lore-code="${m.code}">${m.text}</a>`;
    pos = m.end;
  }
  out += source.slice(pos);
  return out;
}

function walkAndLink(node, entries) {
  if (!node || entries.length === 0) return;
  if (node.nodeType === Node.TEXT_NODE) {
    const linked = autolinkLorePlainText(node.textContent, entries);
    if (linked !== node.textContent) {
      const wrapper = document.createElement('span');
      wrapper.innerHTML = linked;
      node.replaceWith(...wrapper.childNodes);
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName?.toLowerCase();
  if (SKIP_TAGS.has(tag)) return;
  [...node.childNodes].forEach((child) => walkAndLink(child, entries));
}

export function renderGlMarkdownWithLoreGlossaryLinks(markdown, items, options = {}) {
  const html = renderMarkdownToSafeHtml(String(markdown ?? ''), options);
  if (!html || !items?.length) return html;
  const entries = buildLoreGlossaryLinkEntries(items);
  if (!entries.length) return html;
  const container = document.createElement('div');
  container.innerHTML = html;
  walkAndLink(container, entries);
  return container.innerHTML;
}

export function renderGlPlainTextWithLoreGlossaryLinks(text, items) {
  const entries = buildLoreGlossaryLinkEntries(items);
  return autolinkLorePlainText(text, entries);
}
