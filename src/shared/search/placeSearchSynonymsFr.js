/**
 * Vocabulaire du visiteur → vocabulaire de l'établissement (recherche de lieux).
 *
 * Un plan d'établissement nomme ses lieux comme l'administration les nomme : « Sanitaires »,
 * « Cafétéria et restauration scolaire », « CDI ». Le visiteur, lui, tape « wc », « cantine »,
 * « bibliothèque ». Mesuré en production le 16 septembre 2026 : ces trois saisies — et
 * « toilettes », « gymnase », « parking » — ne renvoyaient **aucun** résultat, alors que les
 * lieux existent (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N8).
 *
 * Les alias par lieu (`search_aliases`) restent le bon outil pour les surnoms **locaux**
 * (« le bâtiment jaune ») ; ce fichier couvre le vocabulaire **générique** d'un établissement
 * scolaire français, donc valable pour tous les plans sans saisie.
 *
 * Chaque groupe est une liste de termes interchangeables : taper l'un d'eux retrouve un lieu
 * nommé avec n'importe quel autre. Les termes sont écrits sans accent ni majuscule — ils sont
 * de toute façon normalisés (`normalizeSearchText`) au chargement.
 */

/** @type {ReadonlyArray<ReadonlyArray<string>>} */
export const FR_PLACE_SYNONYM_GROUPS = Object.freeze(
  [
    ['wc', 'toilettes', 'sanitaires', 'sanitaire', 'waters', 'latrines'],
    [
      'cantine',
      'self',
      'restauration',
      'cafeteria',
      'refectoire',
      'repas',
      'manger',
      'demi pension',
    ],
    ['bibliotheque', 'cdi', 'mediatheque', 'documentation', 'bibli', 'livres'],
    ['infirmerie', 'infirmier', 'infirmiere', 'soins', 'medical', 'secours', 'urgence'],
    ['defibrillateur', 'dae'],
    ['gymnase', 'sport', 'eps', 'stade', 'gymnastique'],
    ['parking', 'stationnement', 'garage', 'voiture'],
    ['entree', 'porte', 'acces', 'portail', 'loge'],
    ['accueil', 'reception', 'standard'],
    ['secretariat', 'secretaire', 'administration', 'scolarite'],
    ['vie scolaire', 'surveillant', 'cpe', 'absences'],
    ['direction', 'proviseur', 'principal', 'chef etablissement'],
    ['intendance', 'gestionnaire', 'comptabilite', 'agence comptable', 'caisse', 'paiement'],
    ['reprographie', 'photocopie', 'photocopieuse', 'impression', 'imprimante'],
    ['fontaine', 'eau', 'boire', 'point eau'],
    ['permanence', 'etude', 'foyer'],
    ['orientation', 'cio', 'psychologue'],
    ['laboratoire', 'labo', 'sciences', 'svt', 'physique', 'chimie'],
    ['informatique', 'ordinateur', 'ordinateurs', 'snt', 'nsi', 'numerique'],
    ['theatre', 'spectacle', 'auditorium', 'scene'],
    ['radio', 'webradio', 'studio'],
    ['cinema', 'audiovisuel', 'cav', 'montage', 'video'],
    ['jardin', 'potager', 'verdure', 'foret', 'plantes'],
    ['ping pong', 'pingpong', 'tennis de table'],
    ['echecs', 'echiquier'],
    ['telephone', 'portable'],
  ].map((group) => Object.freeze(group)),
);

/**
 * Index `terme → variantes` (le terme lui-même exclu). Un terme présent dans plusieurs
 * groupes cumule leurs variantes.
 *
 * @param {ReadonlyArray<ReadonlyArray<string>>} groups
 * @param {(value: unknown) => string} normalize normalisation partagée du moteur de recherche.
 * @returns {Map<string, string[]>}
 */
export function buildSynonymIndex(groups, normalize) {
  const index = new Map();
  for (const group of groups || []) {
    const terms = [...new Set((group || []).map((term) => normalize(term)).filter(Boolean))];
    for (const term of terms) {
      const others = terms.filter((other) => other !== term);
      if (others.length === 0) continue;
      const previous = index.get(term) || [];
      index.set(term, [...new Set([...previous, ...others])]);
    }
  }
  return index;
}
