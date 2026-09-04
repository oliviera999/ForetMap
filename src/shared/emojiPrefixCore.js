/**
 * Emoji en tête d'un libellé de lieu — noyau partagé.
 *
 * Extrait de `src/constants/emojis.js` (comportement inchangé) pour que les produits sans
 * dépendance à ForetMap — le Plan Lyautey, notamment — puissent séparer l'emoji du nom sans
 * importer le catalogue d'emojis de l'application (`docs/AUDIT_CONVERGENCE_APPS_2026-09.md`,
 * « dépendances inversées vers du code produit »).
 *
 * Les noms de lieux saisis en production portent presque tous leur emoji en préfixe
 * (« 📚 CDI »), alors que la colonne `emoji` existe aussi : sans séparation, l'emoji est
 * dessiné deux fois (`docs/AUDIT_PLAN_AFFICHAGE_2026-09.md` B3).
 */
import { repairSupplementaryPlaneEmojiMojibake } from './emojiMojibakeCore.js';

function sortEmojisByLengthDesc(emojis) {
  return [...(emojis || [])].sort((a, b) => String(b).length - String(a).length);
}

/**
 * Extrait un préfixe emoji en tête (séquence + fin de chaîne ou espace puis suite).
 * Utilise `Intl.Segmenter` lorsqu'il est disponible.
 * @param {string} str
 * @returns {string|null}
 */
export function extractLeadingEmojiPrefix(str) {
  const raw = String(str || '').trimStart();
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
  const first = m[0];
  if (hasValidBoundary(first.length)) return first;
  return null;
}

/**
 * Emoji en tête d'un libellé : liste connue d'abord (ordre longueur décroissante), puis
 * détection d'un emoji libre.
 * @param {string} value
 * @param {string[]} [emojis] liste d'emojis reconnus en priorité (vide = détection libre seule).
 * @returns {string|null}
 */
export function detectLeadingEmojiPrefix(value, emojis = []) {
  const raw = repairSupplementaryPlaneEmojiMojibake(String(value || '')).trim();
  const sorted = sortEmojisByLengthDesc(emojis);
  const fromList = sorted.find((emoji) => raw === emoji || raw.startsWith(`${emoji} `));
  if (fromList) return fromList;
  return extractLeadingEmojiPrefix(raw);
}

/**
 * Libellé privé de son emoji de tête (chaîne vide si le libellé n'était **que** l'emoji).
 * @param {string} value
 * @param {string[]} [emojis] liste d'emojis reconnus en priorité.
 * @returns {string}
 */
export function stripLeadingEmojiPrefix(value, emojis = []) {
  const raw = repairSupplementaryPlaneEmojiMojibake(String(value || '')).trim();
  const sorted = sortEmojisByLengthDesc(emojis);
  for (const emoji of sorted) {
    if (raw === emoji) return '';
    if (raw.startsWith(`${emoji} `)) return raw.slice(emoji.length).trimStart();
  }
  const ext = extractLeadingEmojiPrefix(raw);
  if (ext && (raw === ext || raw.startsWith(`${ext} `))) {
    return raw === ext ? '' : raw.slice(ext.length).trimStart();
  }
  return raw;
}
