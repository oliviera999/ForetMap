'use strict';

// Emoji de zone (colonne dédiée `zones.emoji`, audit UI 2026-09 — C4).
// Sépare un éventuel préfixe emoji du nom saisi, côté serveur, pour alimenter la
// colonne quand le client ne fournit pas `emoji` explicitement (anciens clients,
// imports). Miroir CJS de la logique front `extractLeadingEmojiPrefix`
// (src/constants/emojis.js), réparation mojibake incluse.
const { repairSupplementaryPlaneEmojiMojibake } = require('./shared/emojiMojibakeCore');
const { normalizeMarkerEmoji } = require('./markerEmoji');

/**
 * Extrait un préfixe emoji en tête (séquence pictographique + fin de chaîne ou espace).
 * @param {string} raw chaîne déjà trimStart-ée
 * @returns {string|null}
 */
function extractLeadingEmojiPrefix(raw) {
  if (!raw) return null;
  const hasValidBoundary = (prefixLen) => raw.length === prefixLen || raw[prefixLen] === ' ';
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });
    let acc = '';
    let seenPictographic = false;
    for (const { segment } of seg.segment(raw)) {
      if (segment === ' ') {
        if (seenPictographic && acc.length > 0 && hasValidBoundary(acc.length)) return acc;
        return null;
      }
      const isZWJ = segment === '\u200D';
      const isVS = segment === '\uFE0F';
      const isSkin = /^[\u{1F3FB}-\u{1F3FF}]$/u.test(segment);
      const isPic = /\p{Extended_Pictographic}/u.test(segment);
      if (isPic || (seenPictographic && (isZWJ || isVS || isSkin))) {
        acc += segment;
        if (isPic) seenPictographic = true;
        continue;
      }
      break;
    }
    if (acc && seenPictographic && hasValidBoundary(acc.length)) return acc;
    return null;
  }
  const m = raw.match(/^\p{Extended_Pictographic}/u);
  if (!m) return null;
  return hasValidBoundary(m[0].length) ? m[0] : null;
}

/**
 * Sépare un nom de zone en { emoji, name } : emoji de tête (réparé, normalisé, borné
 * VARCHAR(16)) et reste du nom. Sans préfixe détectable : emoji '' et nom réparé tel quel.
 * @param {unknown} rawName
 * @returns {{ emoji: string, name: string }}
 */
function splitLeadingZoneEmoji(rawName) {
  const repaired = repairSupplementaryPlaneEmojiMojibake(rawName == null ? '' : String(rawName));
  const trimmed = repaired.trim();
  if (!trimmed) return { emoji: '', name: '' };
  const prefix = extractLeadingEmojiPrefix(trimmed);
  if (!prefix) return { emoji: '', name: trimmed };
  const rest = trimmed.slice(prefix.length).trimStart();
  return {
    emoji: normalizeMarkerEmoji(prefix, { allowEmpty: true }),
    name: rest,
  };
}

/**
 * Résout la valeur à stocker dans `zones.emoji` pour une écriture (POST/PUT).
 * @param {unknown} bodyEmoji `emoji` du corps — undefined = non fourni (dériver),
 *   chaîne vide = effacer explicitement.
 * @param {string} name nom soumis (peut porter un préfixe emoji)
 * @param {string} [fallback] valeur existante à conserver quand rien n'est dérivable
 * @returns {string}
 */
function resolveZoneEmojiForWrite(bodyEmoji, name, fallback = '') {
  if (bodyEmoji !== undefined) {
    return normalizeMarkerEmoji(bodyEmoji, { allowEmpty: true });
  }
  const derived = splitLeadingZoneEmoji(name).emoji;
  return derived || normalizeMarkerEmoji(fallback, { allowEmpty: true });
}

module.exports = {
  splitLeadingZoneEmoji,
  resolveZoneEmojiForWrite,
};
