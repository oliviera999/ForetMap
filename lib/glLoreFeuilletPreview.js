'use strict';

/**
 * Aperçu verrouillé d'un feuillet de lore.
 *
 * Par défaut, un joueur ne peut PAS lire un feuillet : il n'en voit que la liste
 * (titre + métadonnées de rangement) tant qu'il ne l'a pas TROUVÉ sur la carte
 * (traversée de zone…). Ce module centralise :
 *  - la liste blanche des champs de contenu qu'un admin peut choisir de révéler
 *    en aperçu (réglage plateforme `gameplay.lore_feuillet_preview_fields`),
 *  - le masquage effectif appliqué à une ligne déjà formatée (`formatFeuilletRow`).
 *
 * Le `titre` et les champs structurels (liasse, ordres, biome, plateau…) restent
 * toujours visibles : ils servent à afficher et ranger la liste, sans divulguer le récit.
 */

/** Champs de contenu qu'un admin peut autoriser en aperçu (feuillet verrouillé). */
const FEUILLET_PREVIEW_ALLOWED_FIELDS = Object.freeze([
  'incipit',
  'ideeCle',
  'imageUrl',
  'ancrageScientifique',
]);
const FEUILLET_PREVIEW_ALLOWED_SET = new Set(FEUILLET_PREVIEW_ALLOWED_FIELDS);

/** Ensemble d'aperçu par défaut (titre toujours visible en plus). */
const DEFAULT_FEUILLET_PREVIEW_FIELDS = Object.freeze(['incipit']);

/**
 * Champs narratifs masqués quand le feuillet est verrouillé, SAUF s'ils sont
 * explicitement autorisés en aperçu. `texte` (version MJ intégrale) n'y figure pas :
 * il est de toute façon `undefined` hors MJ dans `formatFeuilletRow`.
 */
const FEUILLET_CONTENT_FIELDS = Object.freeze([
  'incipit',
  'ideeCle',
  'contexte',
  'signature',
  'usageNote',
  'texteAccessible',
  'displayText',
  'ancrageScientifique',
  'referencesScientifiques',
  'imageUrl',
  'imageCoupeUrl',
]);

/** Normalise une valeur de réglage en liste de champs d'aperçu valides (dédupliquée). */
function normalizeFeuilletPreviewFields(value) {
  if (!Array.isArray(value)) return [...DEFAULT_FEUILLET_PREVIEW_FIELDS];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const field = String(raw || '').trim();
    if (FEUILLET_PREVIEW_ALLOWED_SET.has(field) && !seen.has(field)) {
      seen.add(field);
      out.push(field);
    }
  }
  return out;
}

/**
 * Applique l'aperçu verrouillé à un feuillet déjà formaté (`formatFeuilletRow`).
 * Masque tout champ de contenu non autorisé par `previewFields`. Renvoie une copie
 * (n'altère pas l'objet source).
 * @param {object} formatted sortie de formatFeuilletRow
 * @param {string[]} previewFields champs de contenu autorisés en aperçu
 */
function maskLockedFeuillet(formatted, previewFields) {
  if (!formatted) return formatted;
  const allowed = new Set(normalizeFeuilletPreviewFields(previewFields));
  const out = { ...formatted };
  for (const field of FEUILLET_CONTENT_FIELDS) {
    if (!allowed.has(field)) out[field] = null;
  }
  out.texte = undefined; // jamais exposé hors MJ
  out.effacementPct = 0; // pas d'effacement affiché sur un feuillet non lu
  return out;
}

module.exports = {
  FEUILLET_PREVIEW_ALLOWED_FIELDS,
  DEFAULT_FEUILLET_PREVIEW_FIELDS,
  FEUILLET_CONTENT_FIELDS,
  normalizeFeuilletPreviewFields,
  maskLockedFeuillet,
};
