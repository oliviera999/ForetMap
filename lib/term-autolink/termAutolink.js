/* Fichier généré par scripts/sync-term-autolink-lib.js — ne pas éditer à la main. */
/* Source : src/utils/termAutolink.js — régénérer avec `npm run sync:term-autolink-lib`. */
/* global Node, document */
/**
 * Tronc commun des auto-liens de termes (glossaire ForetMap, glossaire SVT GL,
 * glossaire lore GL).
 *
 * Source de vérité **unique** : ce module ESM. Deux consommateurs :
 *   - front / GL : `src/utils/glTermAutolink.js` (réexport direct) ;
 *   - serveur ForetMap : `lib/foretmapGlossaryAutolink.js`, via le miroir CJS
 *     `lib/term-autolink/termAutolink.js` généré par `npm run sync:term-autolink-lib`
 *     (le dossier `src/` est absent des déploiements « runtime »).
 *
 * Les trois glossaires partagent exactement la même logique de détection et
 * d'insertion de liens ; ils ne diffèrent que par trois points de variation :
 *   - `codeField` : nom du champ de code sur les items (`glossary_code` / `lore_code`) ;
 *   - `cssClass`  : classe CSS de l'ancre générée ;
 *   - `dataAttr`  : attribut data portant le code sur l'ancre.
 *
 * Les fonctions de rendu de plus haut niveau (markdown / texte brut) diffèrent en
 * revanche entre les glossaires (tokenisation regex vs parcours DOM, options
 * markdown, échappement / sanitisation) : elles restent définies dans chaque
 * module et s'appuient sur les primitives produites ici.
 *
 * Ce fichier doit rester exécutable **sans DOM** (il tourne aussi côté serveur) :
 * pas de dépendance externe, pas de parseur HTML, uniquement du balayage de chaîne.
 */

/** Éléments dont le contenu textuel ne doit jamais être auto-lié. */
const SKIP_TAGS = new Set(['a', 'button', 'code', 'pre', 'script', 'style', 'img', 'aside']);

/**
 * Éléments vides HTML : ils n'ont jamais de balise fermante, donc jamais de
 * contenu à protéger. Les compter comme « ouvrants » laissait `skipDepth` bloqué
 * jusqu'à la fin du document (audit A6 : plus aucun lien après une image).
 */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Échappe une valeur destinée à un attribut HTML entre guillemets doubles. */
function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function isAsciiLetter(char) {
  if (!char) return false;
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

/**
 * Fin d'un jeton de balisage délimité par `>`, en tenant compte des guillemets
 * simples et doubles des attributs : `<img alt="a > b">` est **un seul** jeton.
 *
 * @param {string} source
 * @param {number} start index du `<`
 * @returns {number} index (exclu) de fin du jeton
 */
function findMarkupEnd(source, start) {
  let quote = '';
  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return i + 1;
  }
  return source.length;
}

/**
 * Découpe le HTML en jetons « texte » et « balisage ».
 *
 * Balayage de chaîne conscient des guillemets d'attributs et des commentaires
 * (audit A10) : `<[^>]+>` décalait le découpage dès qu'un `>` littéral apparaissait
 * dans un attribut ou dans un commentaire, et pouvait injecter un lien au milieu
 * d'une balise. Un `<` isolé (`a < b`) reste du texte.
 *
 * @param {string} source
 * @returns {Array<{ markup: boolean, value: string, opaque?: boolean, tagName?: string,
 *   closing?: boolean, selfClosing?: boolean }>}
 */
function tokenizeHtml(source) {
  const tokens = [];
  let textStart = 0;
  let index = 0;

  const flushText = (end) => {
    if (end > textStart) tokens.push({ markup: false, value: source.slice(textStart, end) });
  };

  while (index < source.length) {
    const lt = source.indexOf('<', index);
    if (lt < 0) break;
    const next = source[lt + 1] || '';

    // Commentaire HTML : jeton opaque, jamais lié, jamais compté dans skipDepth.
    if (source.startsWith('<!--', lt)) {
      const close = source.indexOf('-->', lt + 4);
      const end = close < 0 ? source.length : close + 3;
      flushText(lt);
      tokens.push({ markup: true, opaque: true, value: source.slice(lt, end) });
      textStart = end;
      index = end;
      continue;
    }

    // Doctype / instruction de traitement : opaques eux aussi.
    if (next === '!' || next === '?') {
      const end = findMarkupEnd(source, lt);
      flushText(lt);
      tokens.push({ markup: true, opaque: true, value: source.slice(lt, end) });
      textStart = end;
      index = end;
      continue;
    }

    const closing = next === '/';
    const nameStart = closing ? lt + 2 : lt + 1;
    if (!isAsciiLetter(source[nameStart])) {
      // `<` littéral dans du texte : on continue le balayage sans couper.
      index = lt + 1;
      continue;
    }

    const end = findMarkupEnd(source, lt);
    const value = source.slice(lt, end);
    let nameEnd = nameStart;
    while (nameEnd < end && /[a-zA-Z0-9]/.test(source[nameEnd])) nameEnd += 1;
    flushText(lt);
    tokens.push({
      markup: true,
      value,
      tagName: source.slice(nameStart, nameEnd).toLowerCase(),
      closing,
      selfClosing: /\/>$/.test(value.trim()),
    });
    textStart = end;
    index = end;
  }

  flushText(source.length);
  return tokens;
}

/**
 * Construit les primitives d'auto-liens pour un glossaire donné.
 *
 * @param {{ codeField: string, cssClass: string, dataAttr: string }} config
 * @returns {{
 *   SKIP_TAGS: Set<string>,
 *   VOID_TAGS: Set<string>,
 *   mergeItems: (baseItems?: any[], extraTerms?: any[]) => any[],
 *   buildEntries: (items?: any[]) => Array<{ code: string, labels: string[] }>,
 *   autolinkPlainText: (text: string, entries: any[]) => string,
 *   autolinkHtmlTextNodes: (html: string, entries: any[]) => string,
 *   walkAndLink: (node: Node, entries: any[]) => void,
 * }}
 */
function createTermAutolink({ codeField, cssClass, dataAttr }) {
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
      // Regex précompilées une fois pour toutes (audit A4) : la version précédente
      // en compilait une par libellé **et par nœud texte**, soit des dizaines de
      // milliers de compilations par document.
      entries.push({ code, labels, regexes: labels.map((label) => buildLabelRegex(label)) });
    }
    entries.sort((a, b) => {
      const maxA = Math.max(...a.labels.map((label) => label.length));
      const maxB = Math.max(...b.labels.map((label) => label.length));
      return maxB - maxA;
    });
    return entries;
  }

  /** Regex d'une entrée : précompilée si l'entrée vient de `buildEntries`, sinon à la volée. */
  function entryRegex(entry, labelIndex, label) {
    const cached = Array.isArray(entry?.regexes) ? entry.regexes[labelIndex] : null;
    if (cached instanceof RegExp) {
      cached.lastIndex = 0;
      return cached;
    }
    return buildLabelRegex(label);
  }

  function autolinkPlainText(text, entries) {
    const source = String(text ?? '');
    if (!source || !Array.isArray(entries) || entries.length === 0) return source;

    const matches = [];
    for (const entry of entries) {
      const labels = entry?.labels || [];
      for (let i = 0; i < labels.length; i += 1) {
        const label = labels[i];
        if (!label) continue;
        const regex = entryRegex(entry, i, label);
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
      result += `<a href="#" class="${cssClass}" ${dataAttr}="${escapeAttribute(match.code)}">${match.text}</a>`;
      index = match.end;
    }
    result += source.slice(index);
    return result;
  }

  function autolinkHtmlTextNodes(html, entries) {
    const source = String(html ?? '');
    if (!source || !Array.isArray(entries) || entries.length === 0) return source;

    let skipDepth = 0;
    let result = '';

    for (const token of tokenizeHtml(source)) {
      if (!token.markup) {
        result += skipDepth > 0 ? token.value : autolinkPlainText(token.value, entries);
        continue;
      }
      result += token.value;
      if (token.opaque) continue;
      const tagName = token.tagName;
      if (!tagName || !SKIP_TAGS.has(tagName)) continue;
      // Élément vide (`<img>`, `<br>`, …) : aucun contenu à protéger, qu'il soit
      // auto-fermé ou non — ne jamais toucher à `skipDepth` (audit A6).
      if (VOID_TAGS.has(tagName)) continue;
      if (token.closing) {
        skipDepth = Math.max(0, skipDepth - 1);
        continue;
      }
      if (token.selfClosing) continue;
      skipDepth += 1;
    }

    return result;
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
    VOID_TAGS,
    mergeItems,
    buildEntries,
    autolinkPlainText,
    autolinkHtmlTextNodes,
    walkAndLink,
  };
}

module.exports = {
  SKIP_TAGS,
  VOID_TAGS,
  createTermAutolink,
};
