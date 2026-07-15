/**
 * Fabrique mutualisée des auto-liens de termes GL (glossaire SVT + glossaire lore).
 *
 * Les deux glossaires partagent exactement la même logique de détection et
 * d'insertion de liens ; ils ne diffèrent que par trois points de variation :
 *   - `codeField` : nom du champ de code sur les items (`glossary_code` / `lore_code`) ;
 *   - `cssClass`  : classe CSS de l'ancre générée ;
 *   - `dataAttr`  : attribut data portant le code sur l'ancre.
 *
 * Les fonctions de rendu de plus haut niveau (markdown / texte brut) diffèrent en
 * revanche entre les deux glossaires (tokenisation regex vs parcours DOM,
 * options markdown, échappement / sanitisation) : elles restent définies dans
 * chaque module et s'appuient sur les primitives produites ici.
 */

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

function buildLabelRegex(label) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(label)}(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * Construit les primitives d'auto-liens pour un glossaire donné.
 *
 * @param {{ codeField: string, cssClass: string, dataAttr: string }} config
 * @returns {{
 *   SKIP_TAGS: Set<string>,
 *   mergeItems: (baseItems?: any[], extraTerms?: any[]) => any[],
 *   buildEntries: (items?: any[]) => Array<{ code: string, labels: string[] }>,
 *   autolinkPlainText: (text: string, entries: any[]) => string,
 *   autolinkHtmlTextNodes: (html: string, entries: any[]) => string,
 *   walkAndLink: (node: Node, entries: any[]) => void,
 * }}
 */
export function createTermAutolink({ codeField, cssClass, dataAttr }) {
  /**
   * Fusionne l'index du glossaire avec les termes liés à une question.
   * @param {Array<Record<string, string>>} baseItems
   * @param {Array<Record<string, string>>} extraTerms
   */
  function mergeItems(baseItems = [], extraTerms = []) {
    const byCode = new Map();
    for (const item of baseItems || []) {
      const code = String(item?.[codeField] || '').trim();
      if (!code) continue;
      byCode.set(code, item);
    }
    for (const term of extraTerms || []) {
      const code = String(term?.[codeField] || '').trim();
      if (!code || byCode.has(code)) continue;
      byCode.set(code, {
        [codeField]: code,
        terme: term.terme,
        variantes: term.variantes || '',
      });
    }
    return [...byCode.values()];
  }

  function buildEntries(items) {
    const entries = [];
    for (const item of items || []) {
      const code = String(item?.[codeField] || '').trim();
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
      result += `<a href="#" class="${cssClass}" ${dataAttr}="${match.code}">${match.text}</a>`;
      index = match.end;
    }
    result += source.slice(index);
    return result;
  }

  function autolinkHtmlTextNodes(html, entries) {
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

  function walkAndLink(node, entries) {
    if (!node || entries.length === 0) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const linked = autolinkPlainText(node.textContent, entries);
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

  return {
    SKIP_TAGS,
    mergeItems,
    buildEntries,
    autolinkPlainText,
    autolinkHtmlTextNodes,
    walkAndLink,
  };
}
