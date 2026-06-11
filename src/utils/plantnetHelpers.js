/**
 * Helpers purs pour l'identification Pl@ntNet — extraits de `foretmap-views.jsx` (O6).
 *
 * Génération de slots d'identification (aucune dépendance React/DOM) et sélection
 * heuristique du nom vernaculaire français à partir de la liste des commonNames retournés
 * par l'API Pl@ntNet v2. Logique non triviale (heuristique linguistique FR) isolée ici
 * pour être testée.
 */

/** Organes Pl@ntNet pour `POST /api/plants/plantnet-identify` (alignés sur l'API v2). */
export const PLANTNET_IDENTIFY_ORGAN_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'leaf', label: 'Feuille' },
  { id: 'flower', label: 'Fleur' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'bark', label: 'Écorce' },
  { id: 'habit', label: 'Port / habitude' },
  { id: 'branch', label: 'Branche' },
  { id: 'seed', label: 'Graine' },
  { id: 'bud', label: 'Bourgeon' },
  { id: 'scan', label: 'Scan' },
  { id: 'sheet', label: 'Planche' },
  { id: 'other', label: 'Autre' },
  { id: 'drawing', label: 'Dessin' },
  { id: 'anatomy', label: 'Anatomie' },
  { id: 'aerial', label: 'Vue aérienne' },
];

/**
 * Crée un slot d'identification Pl@ntNet vide avec une clé unique.
 * Retourne `{ key, organ, imageData, fileName }`.
 */
export function newPlantnetIdentifySlot() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    organ: 'auto',
    imageData: '',
    fileName: '',
  };
}

/**
 * Sélectionne le meilleur nom vernaculaire français dans la liste `commonNames`
 * retournée par Pl@ntNet.
 *
 * Heuristique :
 * - Les noms contenant des caractères ou articles typiquement français obtiennent
 *   un score +2.
 * - Parmi les noms avec le meilleur score, on prend le premier.
 * - Si aucun indice FR, on prend simplement le premier de la liste.
 *
 * @param {unknown} commonNames - Valeur brute de `result.commonNames` (tableau ou autre).
 * @returns {string} Nom vernaculaire retenu, ou '' si la liste est vide.
 */
export function pickPlantnetVernacularName(commonNames) {
  const list = Array.isArray(commonNames)
    ? commonNames.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (!list.length) return '';
  const frHint = (s) =>
    /[àâäéèêëïîôùûüçœæ]/i.test(s) ||
    /\b(l'|d'|de la |des |le |la |les |du |au )\b/i.test(` ${s} `);
  const scored = list.map((s) => ({ s, score: frHint(s) ? 2 : 0 }));
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score > 0) return scored[0].s;
  return list[0];
}
