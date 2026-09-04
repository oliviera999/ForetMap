'use strict';

const { asTrimmedString } = require('./stringHelpers');

/**
 * Normalisation et matching glossaire communs (audit §4.2, paire 1.5).
 *
 * `normalizeMatchKey`, `tokenizeCsvLike`, la construction de la map de lookup
 * et le matching par mots-clés étaient recopiés à l'identique dans
 * `lib/glossaryMatch.js` (glossaire SVT, code `glossary_code`) et
 * `lib/glLoreGlossaryMatch.js` (glossaire lore, code `lore_code`) — seul le
 * champ code (et les champs projetés) changeait. Les fonctions paramétrées
 * par champ code vivent ici ; les deux modules restent les points d'entrée
 * publics avec leurs exports historiques.
 *
 * NB : `buildTermToCodeMap` n'est PAS mutualisé — les deux variantes divergent
 * subtilement (la variante lore tokenise aussi le `terme` sur les séparateurs
 * CSV, pas la variante SVT) ; chacune reste dans son module.
 */

/** Clé de matching : minuscules, sans accents, alphanumérique + espaces. */
function normalizeMatchKey(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Découpe une valeur CSV-like (`,`, `;`, `|`, retours ligne) en clés normalisées. */
function tokenizeCsvLike(value) {
  const raw = asTrimmedString(value);
  if (!raw) return [];
  return raw
    .split(/[,;|\n]+/)
    .map((part) => normalizeMatchKey(part))
    .filter(Boolean);
}

/**
 * Construit une Map clé normalisée → entrée glossaire (terme + variantes
 * tokenisées). Première entrée gagnante en cas de collision de clé.
 * @param {object[]} glossaryRows — lignes avec `terme` et `variantes`.
 */
function buildLookupMap(glossaryRows) {
  const map = new Map();
  for (const row of glossaryRows || []) {
    const keys = new Set([normalizeMatchKey(row.terme), ...tokenizeCsvLike(row.variantes)]);
    for (const key of keys) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, row);
    }
  }
  return map;
}

/**
 * Matche des mots-clés CSV contre la map de lookup, dédoublonne par champ
 * code et trie par terme (fr).
 * @param {string} motsCles
 * @param {Map<string, object>} glossaryByKey — issue de `buildLookupMap`.
 * @param {object} options
 * @param {string} options.codeField — champ code de l'entrée
 *   (`glossary_code` ou `lore_code`), utilisé pour le dédoublonnage.
 * @param {(entry: object) => object} options.toItem — projection d'une entrée
 *   vers l'objet retourné (les deux glossaires n'exposent pas les mêmes champs).
 * @returns {object[]}
 */
function matchTermsForKeywords(motsCles, glossaryByKey, { codeField, toItem }) {
  const tokens = tokenizeCsvLike(motsCles);
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    const entry = glossaryByKey.get(token);
    if (!entry || seen.has(entry[codeField])) continue;
    seen.add(entry[codeField]);
    out.push(toItem(entry));
  }
  return out.sort((a, b) => String(a.terme).localeCompare(String(b.terme), 'fr'));
}

module.exports = {
  normalizeMatchKey,
  tokenizeCsvLike,
  buildLookupMap,
  matchTermsForKeywords,
};
