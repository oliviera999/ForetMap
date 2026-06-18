'use strict';

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

function buildGlossaryLinkEntries(items) {
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

function autolinkPlainText(text, entries) {
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
    result += `<a href="#" class="fm-glossary-inline-link" data-glossary-code="${match.code}">${match.text}</a>`;
    index = match.end;
  }
  result += source.slice(index);
  return result;
}

const SKIP_TAGS = new Set(['a', 'button', 'code', 'pre', 'script', 'style', 'img', 'aside']);

function autolinkHtmlTextNodes(html, entries) {
  if (!html || !entries?.length) return html;
  return String(html).replace(/(<[^>]+>)|([^<]+)/g, (token, tag, text) => {
    if (tag) {
      const tagName = (tag.match(/^<\/?\s*([a-z0-9]+)/i) || [])[1]?.toLowerCase();
      return SKIP_TAGS.has(tagName) ? token : tag;
    }
    if (!text) return '';
    return autolinkPlainText(text, entries);
  });
}

function injectGlossaryAutolinkScript(html) {
  const script = `<script>
(function(){
  document.addEventListener('click', function(ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('a.fm-glossary-inline-link') : null;
    if (!el) return;
    ev.preventDefault();
    var code = el.getAttribute('data-glossary-code');
    if (!code) return;
    try { parent.postMessage({ type: 'foretmap:glossary', code: code }, '*'); } catch (_) {}
  });
})();
</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}</body>`);
  return `${html}${script}`;
}

module.exports = {
  buildGlossaryLinkEntries,
  autolinkPlainText,
  autolinkHtmlTextNodes,
  injectGlossaryAutolinkScript,
};
