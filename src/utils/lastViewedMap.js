/**
 * Dernier plan consulté, mémorisé sur l'appareil.
 *
 * Une seule clé de stockage pour **toutes les surfaces** (carte de travail et Visite) :
 * à la reconnexion, l'utilisateur retrouve le plan qu'il regardait, qu'il l'ait choisi
 * depuis la carte ou depuis la visite.
 *
 * Règle centrale : **seul un choix explicite est mémorisé**. Les résolutions
 * automatiques (carte par défaut des réglages, repli sur le premier plan visible quand
 * le plan demandé a disparu, réconciliation d'affiliation) ne doivent jamais écrire
 * ici — sinon un plan que personne n'a choisi se fige sur l'appareil et le réglage
 * « plan ouvert par défaut » ne s'applique plus jamais.
 */
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../shared/platform/browserStorage.js';

/** Clé historique (conservée : les appareils déjà en service gardent leur mémoire). */
export const LAST_VIEWED_MAP_STORAGE_KEY = 'foretmap_active_map';

/** Identifiant du dernier plan consulté, ou `''` si l'appareil n'en mémorise aucun. */
export function readLastViewedMapId() {
  return String(safeLocalStorageGetItem(LAST_VIEWED_MAP_STORAGE_KEY, '') || '').trim();
}

/**
 * Mémorise un plan **choisi par l'utilisateur**. Une valeur vide est ignorée : elle
 * effacerait la mémoire au premier rendu, avant toute résolution de plan.
 *
 * @param {string} mapId identifiant du plan choisi.
 * @returns {boolean} vrai si la mémoire a été écrite.
 */
export function rememberLastViewedMapId(mapId) {
  const next = String(mapId || '').trim();
  if (!next) return false;
  return safeLocalStorageSetItem(LAST_VIEWED_MAP_STORAGE_KEY, next);
}
