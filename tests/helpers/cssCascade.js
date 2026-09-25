'use strict';

/**
 * Cascade CSS STATIQUE, juste assez fidèle pour les tests de garde d'accessibilité.
 *
 * Pourquoi : un test qui cherche « la règle de `.map-toolbar-pill` » dans la feuille rate
 * exactement le défaut que l'audit du 25/09/2026 (§ 1.4.7) a relevé — la règle `pointer:coarse`
 * à 44 px existait bien, mais une règle de spécificité supérieure (`.main.main--map-visible
 * .map-view-toolbar button`) la battait sur l'écran principal de l'élève. Seule une cascade
 * répond à la question posée : « au doigt, combien mesure CE bouton, À CET ENDROIT ? ».
 *
 * Ce que le module sait faire :
 *   - lire une feuille et ses `@import` (dans l'ordre de la cascade), avec l'imbrication
 *     `@media` / `@supports` ;
 *   - évaluer les requêtes média pour un environnement donné (largeur, pointeur, survol) ;
 *   - apparier un sélecteur complexe à un élément décrit par sa chaîne d'ancêtres
 *     (combinateurs descendant et enfant, `:not()`, `:is()`, `:where()`, `:root`, attributs) ;
 *   - trier les déclarations comme le navigateur (`!important`, spécificité, ordre) ;
 *   - résoudre `var(--x, repli)` (custom properties héritées, `:root` compris) et
 *     `color-mix(in srgb, …)` pour les couleurs.
 *
 * Ce qu'il ne sait PAS faire, et qu'il traite prudemment :
 *   - les pseudo-classes d'état (`:hover`, `:focus-visible`, `:active`…) et structurelles
 *     (`:first-child`…) ne s'appliquent pas, SAUF si l'élément les déclare dans `states`
 *     (un bouton « pressé » se décrit `{ …, states: ['active'] }`) ;
 *   - les combinateurs de fratrie (`+`, `~`), `:has()` et `@container` ne s'appliquent pas ;
 *   - les styles inline ne sont pas lus : l'élément décrit les porte dans `inline` s'il le faut.
 */

const fs = require('node:fs');
const path = require('node:path');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Découpe `str` sur `sep` au premier niveau (hors parenthèses, crochets et chaînes). */
function splitTopLevel(str, sep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === sep && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

/** Déclarations `prop: valeur [!important]` d'un corps de règle. */
function parseDeclarations(body) {
  const decls = [];
  for (const raw of splitTopLevel(body, ';')) {
    const colon = raw.indexOf(':');
    if (colon < 0) continue;
    const prop = raw.slice(0, colon).trim();
    if (!prop) continue;
    let value = raw.slice(colon + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    decls.push({ prop: prop.startsWith('--') ? prop : prop.toLowerCase(), value, important });
  }
  return decls;
}

// ── Sélecteurs ──────────────────────────────────────────────────────────────

const IDENT = /^-?(?:[\w-]|\\.)+/;

/** Lit un groupe parenthésé à partir de `s[start] === '('` ; renvoie [contenu, fin]. */
function readParens(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') {
      depth -= 1;
      if (depth === 0) return [s.slice(start + 1, i), i + 1];
    }
  }
  throw new Error(`Parenthèse non fermée dans « ${s} »`);
}

/** Sélecteur composé (`button.btn:not(.x)::after`) → structure appariable. */
function parseCompound(s) {
  const c = { tag: null, ids: [], classes: [], attrs: [], pseudos: [], pseudoElement: null };
  let i = 0;
  const tag = s.match(/^(\*|[a-zA-Z][\w-]*)/);
  if (tag) {
    c.tag = tag[1].toLowerCase();
    i = tag[0].length;
  }
  while (i < s.length) {
    const ch = s[i];
    if (ch === '.' || ch === '#') {
      const m = s.slice(i + 1).match(IDENT);
      if (!m) throw new Error(`Sélecteur non analysé : « ${s} »`);
      (ch === '.' ? c.classes : c.ids).push(m[0].replace(/\\/g, ''));
      i += 1 + m[0].length;
    } else if (ch === '[') {
      const end = s.indexOf(']', i);
      const inner = s.slice(i + 1, end).trim();
      const m = inner.match(
        /^([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*(i)?)?$/,
      );
      if (!m) throw new Error(`Attribut non analysé : « ${s} »`);
      c.attrs.push({ name: m[1], op: m[2] || null, value: m[3] ?? m[4] ?? m[5] ?? null });
      i = end + 1;
    } else if (ch === ':') {
      const isElement = s[i + 1] === ':';
      const from = i + (isElement ? 2 : 1);
      const m = s.slice(from).match(IDENT);
      if (!m) throw new Error(`Pseudo non analysé : « ${s} »`);
      const name = m[0].toLowerCase();
      let arg = null;
      let next = from + m[0].length;
      if (s[next] === '(') [arg, next] = readParens(s, next);
      if (isElement) c.pseudoElement = name;
      // `:before` / `:after` à un deux-points : syntaxe CSS2 des pseudo-éléments.
      else if (['before', 'after', 'first-line', 'first-letter'].includes(name)) {
        c.pseudoElement = name;
      } else {
        c.pseudos.push({
          name,
          arg,
          list: ['not', 'is', 'where', 'matches'].includes(name)
            ? splitTopLevel(arg || '', ',').map((x) => parseComplex(x.trim()))
            : null,
        });
      }
      i = next;
    } else {
      throw new Error(`Sélecteur non analysé : « ${s} » (à « ${s.slice(i)} »)`);
    }
  }
  return c;
}

/** Sélecteur complexe → [{ compound, combinator }] (combinateur AVANT le composé). */
function parseComplex(selector) {
  const s = selector.trim();
  const parts = [];
  let depth = 0;
  let buf = '';
  let pending = null;
  const flush = () => {
    if (!buf.trim()) return;
    parts.push({
      compound: parseCompound(buf.trim()),
      combinator: parts.length ? pending || ' ' : null,
    });
    buf = '';
    pending = null;
  };
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (depth === 0 && (ch === '>' || ch === '+' || ch === '~')) {
      flush();
      pending = ch;
    } else if (depth === 0 && /\s/.test(ch)) {
      flush();
    } else {
      buf += ch;
    }
  }
  flush();
  return parts;
}

/** Spécificité [a, b, c] d'un sélecteur complexe analysé. */
function specificity(parts) {
  const spec = [0, 0, 0];
  const add = (x) => {
    spec[0] += x[0];
    spec[1] += x[1];
    spec[2] += x[2];
  };
  const max = (list) =>
    list.map(specificity).reduce((best, x) => (compareSpec(x, best) > 0 ? x : best), [0, 0, 0]);
  for (const { compound: c } of parts) {
    spec[0] += c.ids.length;
    spec[1] += c.classes.length + c.attrs.length;
    if (c.tag && c.tag !== '*') spec[2] += 1;
    if (c.pseudoElement) spec[2] += 1;
    for (const p of c.pseudos) {
      if (p.name === 'where') continue;
      if (p.list) add(max(p.list));
      else spec[1] += 1;
    }
  }
  return spec;
}

function compareSpec(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// ── Appariement ─────────────────────────────────────────────────────────────

function matchAttr(el, { name, op, value }) {
  const actual = el.attrs?.[name];
  if (actual === undefined) return false;
  if (!op) return true;
  const v = String(actual);
  switch (op) {
    case '=':
      return v === value;
    case '~=':
      return v.split(/\s+/).includes(value);
    case '^=':
      return v.startsWith(value);
    case '$=':
      return v.endsWith(value);
    case '*=':
      return v.includes(value);
    case '|=':
      return v === value || v.startsWith(`${value}-`);
    default:
      return false;
  }
}

function matchCompound(c, chain, index, pseudoElement) {
  const el = chain[index];
  if ((c.pseudoElement || null) !== (pseudoElement || null)) return false;
  if (c.tag && c.tag !== '*' && c.tag !== el.tag) return false;
  if (c.ids.some((id) => id !== el.id)) return false;
  const classes = el.classes || [];
  if (c.classes.some((cls) => !classes.includes(cls))) return false;
  if (c.attrs.some((a) => !matchAttr(el, a))) return false;
  for (const p of c.pseudos) {
    if (p.name === 'not') {
      if (p.list.some((sel) => matchParts(sel, chain, index))) return false;
    } else if (['is', 'where', 'matches'].includes(p.name)) {
      if (!p.list.some((sel) => matchParts(sel, chain, index))) return false;
    } else if (p.name === 'root') {
      if (index !== 0 || el.tag !== 'html') return false;
    } else if (!(el.states || []).includes(p.name)) {
      return false;
    }
  }
  return true;
}

/** Le sélecteur `parts` désigne-t-il `chain[index]` (ou son pseudo-élément) ? */
function matchParts(parts, chain, index, pseudoElement = null) {
  const last = parts.length - 1;
  if (!matchCompound(parts[last].compound, chain, index, pseudoElement)) return false;
  const walk = (partIndex, elIndex) => {
    if (partIndex < 0) return true;
    const comb = parts[partIndex + 1].combinator;
    const { compound } = parts[partIndex];
    if (comb === '>') {
      return (
        elIndex - 1 >= 0 &&
        matchCompound(compound, chain, elIndex - 1, null) &&
        walk(partIndex - 1, elIndex - 1)
      );
    }
    if (comb === ' ') {
      for (let j = elIndex - 1; j >= 0; j -= 1) {
        if (matchCompound(compound, chain, j, null) && walk(partIndex - 1, j)) return true;
      }
      return false;
    }
    return false; // `+` et `~` : la fratrie n'est pas décrite
  };
  return walk(last - 1, index);
}

// ── Médias ──────────────────────────────────────────────────────────────────

const toPx = (value) => {
  const m = String(value)
    .trim()
    .match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return NaN;
  return m[2] === 'rem' || m[2] === 'em' ? Number(m[1]) * 16 : Number(m[1]);
};

function featureMatches(feature, env) {
  const f = feature.trim().toLowerCase();
  if (['all', 'screen', 'only screen'].includes(f)) return true;
  if (f === 'print') return false;
  const m = f.match(/^\(\s*([a-z-]+)\s*(?::\s*([^)]+))?\)$/);
  if (!m) return false;
  const [, name, raw = ''] = m;
  const value = raw.trim();
  switch (name) {
    case 'pointer':
    case 'any-pointer':
      return value === env.pointer;
    case 'hover':
    case 'any-hover':
      return value === env.hover;
    case 'max-width':
      return env.width <= toPx(value);
    case 'min-width':
      return env.width >= toPx(value);
    case 'max-height':
      return env.height <= toPx(value);
    case 'min-height':
      return env.height >= toPx(value);
    case 'orientation':
      return value === (env.width > env.height ? 'landscape' : 'portrait');
    case 'prefers-reduced-motion':
      return value === 'no-preference';
    case 'prefers-color-scheme':
      return value === 'light';
    default:
      return false;
  }
}

function mediaMatches(query, env) {
  return splitTopLevel(query, ',').some((q) => {
    let s = q.trim();
    let negate = false;
    if (/^not\s/i.test(s)) {
      negate = true;
      s = s.replace(/^not\s+/i, '');
    }
    const ok = s.split(/\s+and\s+/i).every((feature) => featureMatches(feature, env));
    return negate ? !ok : ok;
  });
}

/** Une pile d'at-rules englobantes s'applique-t-elle dans `env` ? */
function contextMatches(stack, env) {
  return stack.every(({ name, prelude }) => {
    if (name === 'media') return mediaMatches(prelude, env);
    // Les blocs `@supports not (…)` du dépôt ciblent des navigateurs anciens.
    if (name === 'supports') return !/^not\s/i.test(prelude.trim());
    return false; // @container, @layer… : non évalués
  });
}

// ── Chargement des feuilles ─────────────────────────────────────────────────

/**
 * Règles d'une feuille, `@import` résolus en tête (ordre de la cascade).
 * @returns {Array<{ file: string, selectorText: string, selectors: Array<{ text: string, parts: object[], spec: number[] }>, decls: object[], stack: object[] }>}
 */
function loadSheet(file, seen = new Set()) {
  const abs = path.resolve(file);
  if (seen.has(abs)) return [];
  seen.add(abs);
  const css = stripComments(fs.readFileSync(abs, 'utf8'));
  const out = [];
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]\s*\)?[^;]*;/g)) {
    out.push(...loadSheet(path.resolve(path.dirname(abs), m[1]), seen));
  }
  const rel = path.relative(path.join(__dirname, '..', '..'), abs);
  const stack = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) {
      buf += ch;
      if (ch === '\\') buf += css[++i] || '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      if (prelude.startsWith('@')) {
        const m = prelude.match(/^@([\w-]+)\s*([\s\S]*)$/);
        const name = m[1].toLowerCase();
        if (['keyframes', '-webkit-keyframes', 'font-face', 'page'].includes(name)) {
          // Corps sans intérêt pour la cascade des éléments : on le saute en bloc.
          let depth = 1;
          while (depth > 0 && i < css.length - 1) {
            i += 1;
            if (css[i] === '{') depth += 1;
            else if (css[i] === '}') depth -= 1;
          }
          continue;
        }
        stack.push({ name, prelude: m[2].trim() });
      } else {
        const end = css.indexOf('}', i);
        const body = css.slice(i + 1, end);
        const selectors = splitTopLevel(prelude, ',')
          .map((x) => x.trim().replace(/\s+/g, ' '))
          .filter(Boolean)
          .map((text) => {
            const parts = parseComplex(text);
            return { text, parts, spec: specificity(parts) };
          });
        out.push({
          file: rel,
          selectorText: prelude.replace(/\s+/g, ' '),
          selectors,
          decls: parseDeclarations(body),
          stack: stack.slice(),
        });
        i = end;
      }
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else if (ch === ';') {
      // Hors corps de règle, un `;` ne peut clore qu'une instruction (`@import …;`).
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

// ── Cascade ─────────────────────────────────────────────────────────────────

/**
 * Déclaration gagnante de `prop` pour `chain[index]` (ou son pseudo-élément) dans `env`.
 * @returns {{ value: string, important: boolean, spec: number[], rule: object } | null}
 */
function cascadedDeclaration(
  rules,
  chain,
  prop,
  env,
  { index = chain.length - 1, pseudoElement = null } = {},
) {
  let best = null;
  rules.forEach((rule, order) => {
    const decls = rule.decls.filter((d) => d.prop === prop);
    if (!decls.length || !contextMatches(rule.stack, env)) return;
    let spec = null;
    for (const sel of rule.selectors) {
      if (!matchParts(sel.parts, chain, index, pseudoElement)) continue;
      if (!spec || compareSpec(sel.spec, spec) > 0) spec = sel.spec;
    }
    if (!spec) return;
    const decl = decls[decls.length - 1];
    const candidate = { value: decl.value, important: decl.important, spec, order, rule };
    if (!best) best = candidate;
    else if (candidate.important !== best.important) {
      if (candidate.important) best = candidate;
    } else if (compareSpec(candidate.spec, best.spec) > 0) best = candidate;
    else if (compareSpec(candidate.spec, best.spec) === 0 && candidate.order > best.order) {
      best = candidate;
    }
  });
  const inline = chain[index]?.inline?.[prop];
  if (inline !== undefined && !pseudoElement && !(best && best.important)) {
    return {
      value: String(inline),
      important: false,
      spec: [1, 0, 0, 0],
      rule: { selectorText: 'style=""' },
    };
  }
  return best;
}

/** Remplace chaque `var(--x, repli)` par sa valeur calculée (héritage compris). */
function resolveVars(value, rules, chain, env, index = chain.length - 1, depth = 0) {
  if (depth > 20) throw new Error(`Cycle de custom properties : ${value}`);
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, at);
    const [inner, end] = readParens(value, at + 3);
    const [name, ...rest] = splitTopLevel(inner, ',');
    const fallback = rest.length ? rest.join(',').trim() : null;
    let resolved = null;
    for (let j = index; j >= 0 && resolved === null; j -= 1) {
      const decl = cascadedDeclaration(rules, chain, name.trim(), env, { index: j });
      if (decl) resolved = resolveVars(decl.value, rules, chain, env, j, depth + 1);
    }
    if (resolved === null && fallback !== null) {
      resolved = resolveVars(fallback, rules, chain, env, index, depth + 1);
    }
    out += resolved === null ? 'unset' : resolved;
    i = end;
  }
  return out.trim();
}

/** Valeur calculée (variables résolues) de `prop`, ou `null` si aucune règle ne la pose. */
function computedValue(rules, chain, prop, env, options = {}) {
  const decl = cascadedDeclaration(rules, chain, prop, env, options);
  if (!decl) return null;
  return {
    value: resolveVars(decl.value, rules, chain, env, options.index ?? chain.length - 1),
    source: `${decl.rule.file || ''} « ${decl.rule.selectorText} »${decl.important ? ' !important' : ''}`,
  };
}

// ── Couleurs ────────────────────────────────────────────────────────────────

const NAMED_COLORS = { white: [255, 255, 255], black: [0, 0, 0] };

/** Couleur CSS (hex, `white`/`black`, `rgb()`, `color-mix(in srgb, …)`) → [r, g, b] 0-255. */
function parseColor(value) {
  const v = String(value).trim().toLowerCase();
  if (NAMED_COLORS[v]) return NAMED_COLORS[v].slice();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = v.match(/^color-mix\(\s*in\s+srgb\s*,([\s\S]*)\)$/);
  if (m) {
    const [a, b] = splitTopLevel(m[1], ',').map((part) => {
      const pm = part.trim().match(/^([\s\S]*?)(?:\s+([\d.]+)%)?$/);
      return { color: parseColor(pm[1]), pct: pm[2] === undefined ? null : Number(pm[2]) / 100 };
    });
    let pa = a.pct;
    let pb = b.pct;
    if (pa === null && pb === null) pa = pb = 0.5;
    else if (pa === null) pa = 1 - pb;
    else if (pb === null) pb = 1 - pa;
    const sum = pa + pb;
    return a.color.map((x, k) => (x * pa + b.color[k] * pb) / sum);
  }
  throw new Error(`Couleur non évaluable : « ${value} »`);
}

const toHex = (rgb) => `#${rgb.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;

/** Luminance relative WCAG 2.x. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((x) => {
    const c = x / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.x entre deux couleurs [r, g, b]. */
function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

module.exports = {
  computedValue,
  contrastRatio,
  loadSheet,
  mediaMatches,
  parseColor,
  toHex,
  toPx,
};
