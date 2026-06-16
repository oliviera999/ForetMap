import React from 'react';

/**
 * Compteurs d'observations (présentation) extraits de
 * `PlantSpeciesDiscoveryAcknowledge` (O6). Affiche le nombre d'observations de
 * l'utilisateur et celui de tout le site. DOM/classes/textes inchangés.
 *
 * @param {object} props
 * @param {number} props.my nombre d'observations de l'utilisateur
 * @param {number} props.site nombre d'observations sur tout le site
 */
export function PlantDiscoveryObservedCounts({ my, site }) {
  return (
    <span className="plant-discovery-observed-counts" aria-live="polite">
      <span className="plant-discovery-observed-counts__mine">Mes observations : {my}</span>
      <span className="plant-discovery-observed-counts__sep" aria-hidden="true">
        {' '}
        ·{' '}
      </span>
      <span className="plant-discovery-observed-counts__site">Tout le site : {site}</span>
    </span>
  );
}
