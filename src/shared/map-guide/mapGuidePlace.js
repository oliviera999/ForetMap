/**
 * Logique pure du **guidage « Y aller »** (direction et distance à vol d'oiseau vers un lieu),
 * partagée par le Plan Lyautey et la Visite ForetMap.
 *
 * Ce n'est volontairement pas un itinéraire : aucune des cartes du dépôt ne connaît le graphe
 * des chemins, et une direction honnête vaut mieux qu'un trajet inventé
 * (`docs/AUDIT_PLAN_NAVIGATION_2026-09-16-bis.md`).
 */
import { detectLeadingEmojiPrefix, stripLeadingEmojiPrefix } from '../emojiPrefixCore.js';

/**
 * Clé d'identité d'un lieu, `kind:id`. Les zones et les repères ont des identifiants
 * numériques **indépendants** : sans le type, viser la zone 3 viserait aussi le repère 3.
 * @param {object} place
 * @returns {string} chaîne vide si le lieu n'a pas d'identifiant exploitable
 */
export function mapPlaceKey(place) {
  const id = place?.id;
  if (id == null || String(id).trim() === '') return '';
  const kind = place?.kind === 'marker' ? 'marker' : 'zone';
  return `${kind}:${id}`;
}

/**
 * Emoji et nom **à afficher** pour un lieu : la colonne `emoji` prime, sinon le préfixe du
 * nom (les noms saisis portent presque tous leur emoji en tête, « 📚 CDI », et la colonne le
 * répète), sinon l'emoji par défaut du type de lieu.
 * @param {object} place
 * @returns {{ emoji: string, name: string }}
 */
export function mapPlaceDisplayParts(place) {
  const raw = String(place?.name || place?.label || '');
  const emojiInName = detectLeadingEmojiPrefix(raw) || '';
  const name = stripLeadingEmojiPrefix(raw);
  return {
    emoji:
      String(place?.emoji || '').trim() || emojiInName || (place?.kind === 'zone' ? '🗺️' : '📍'),
    name: name || raw.trim(),
  };
}
