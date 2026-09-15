/**
 * Ligne de métadonnées allégée pour l’éditeur d’article (élève / joueur).
 * Une date principale ; compteur caractères seulement près de la limite.
 */

import { formatDateTime } from '../utils/formatDateTime.js';

/**
 * @param {object} params
 * @param {string|null} [params.updatedAt]
 * @param {string|null} [params.createdAt]
 * @param {number} [params.maxChars=0]
 * @param {number} [params.charCount=0]
 * @param {string|null} [params.zoneName] affiché seulement hors select zone (lecture)
 * @param {boolean} [params.includeZone=false]
 * @returns {string[]}
 */
export function buildEditorMetaParts({
  updatedAt = null,
  createdAt = null,
  maxChars = 0,
  charCount = 0,
  zoneName = null,
  includeZone = false,
}) {
  const parts = [];
  const primary = updatedAt || createdAt;
  if (primary) parts.push(formatDateTime(primary));
  if (includeZone && zoneName) parts.push(String(zoneName));
  if (maxChars > 0) {
    const near = charCount >= Math.floor(maxChars * 0.85);
    if (near || charCount > maxChars) {
      parts.push(`${charCount} / ${maxChars} caractères`);
    }
  }
  return parts;
}
